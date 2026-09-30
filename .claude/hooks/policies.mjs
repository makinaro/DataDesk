// Pure decision functions for the PreToolUse hooks in .claude/. Kept free of I/O so
// tests/tooling/policies.test.ts can exercise them directly.
// Each policy returns null (no objection) or a string reason (deny).

import path from 'node:path';

const PRIVATE_PATTERNS = [
  // .env, .env.local, config/.env.production, <.env … but not .env.example
  /(^|[\\/\s'"`=:(<,])\.env(?!\.example\b)(\.[\w.-]+)?(?=$|[\\/\s'"`;|&)*?,>])/i,
  /test-data[\\/]+private/i,
];

/**
 * The fields each tool can use to reach a file. Grep's `pattern` is a content regex, not a
 * path, so it isn't checked (otherwise searching for `process\.env` would be blocked).
 */
const PATH_FIELDS = {
  Bash: ['command'],
  PowerShell: ['command'],
  Read: ['file_path'],
  Edit: ['file_path'],
  Write: ['file_path'],
  Grep: ['path', 'glob'],
  Glob: ['path', 'pattern'],
};

/** Project-wide: block .env* and test-data/private from shell, search and file tools. */
export function privatePaths(toolName, toolInput) {
  const fields = PATH_FIELDS[toolName];
  if (!fields || !toolInput || typeof toolInput !== 'object') return null;
  for (const field of fields) {
    const value = toolInput[field];
    if (typeof value === 'string' && PRIVATE_PATTERNS.some((re) => re.test(value))) {
      return `Blocked by .claude/hooks: ${toolName} may not touch .env files or test-data/private/ (CLAUDE.md, Security rule 6).`;
    }
  }
  return null;
}

// Newlines count as chaining: Bash and PowerShell both run each line as a separate command.
const SHELL_CHAINING = /[;&|`<>\r\n]|\$\(/;

const GIT_READONLY =
  /^\s*git\s+(diff|log|show|status|rev-parse|merge-base|branch\s+--show-current|ls-files)(\s|$)/;
// Read-only git subcommands that can still write files or run external programs.
const GIT_UNSAFE_FLAGS = /(^|\s)--(output|ext-diff|textconv)\b/;

/** code-reviewer: shell access is limited to read-only git commands, no chaining or redirects. */
export function gitReadonly(toolName, toolInput) {
  if (toolName !== 'Bash' && toolName !== 'PowerShell') return null;
  const command = typeof toolInput?.command === 'string' ? toolInput.command : '';
  if (
    GIT_READONLY.test(command) &&
    !SHELL_CHAINING.test(command) &&
    !GIT_UNSAFE_FLAGS.test(command)
  ) {
    return null;
  }
  return 'Blocked by .claude/hooks: code-reviewer may only run read-only git commands (diff, log, show, status, rev-parse, merge-base, ls-files) without chaining, redirects, --output or --ext-diff.';
}

// Each alternative must end at whitespace or end-of-string, so `lint:fix`, `test:e2e` and
// `test:watch` don't slip through on a word boundary.
const TEST_COMMANDS =
  /^\s*(npx\s+vitest(\s+run)?|npm\s+(run\s+)?test|npm\s+run\s+(typecheck|lint|format:check)|git\s+(status|diff))(\s|$)/;

/**
 * test-writer: may only write under tests/ or test-data/public/, and may only run test,
 * typecheck and lint commands (none of which modify files).
 */
export function testsOnly(toolName, toolInput, projectDir) {
  if (['Edit', 'Write', 'NotebookEdit'].includes(toolName)) {
    const target = toolInput?.file_path ?? toolInput?.notebook_path;
    if (typeof target !== 'string') return 'Blocked by .claude/hooks: missing file path.';
    const rel = path
      .relative(projectDir, path.resolve(projectDir, target))
      .split(path.sep)
      .join('/');
    if (rel.startsWith('tests/') || rel.startsWith('test-data/public/')) return null;
    return `Blocked by .claude/hooks: test-writer may only edit files under tests/ or test-data/public/ (tried ${rel}).`;
  }
  if (toolName === 'Bash' || toolName === 'PowerShell') {
    const command = typeof toolInput?.command === 'string' ? toolInput.command : '';
    const fixes = /\s--(fix|write|update|u)\b|\s-u(\s|$)/.test(command);
    if (TEST_COMMANDS.test(command) && !SHELL_CHAINING.test(command) && !fixes) return null;
    return 'Blocked by .claude/hooks: test-writer may only run vitest, npm test, typecheck, lint, format:check, git status/diff (no --fix/--write/-u, no chaining).';
  }
  return null;
}

export const POLICIES = {
  'private-paths': privatePaths,
  'git-readonly': gitReadonly,
  'tests-only': testsOnly,
};
