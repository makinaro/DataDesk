// Pure decision functions for the PreToolUse hooks in .claude/. Kept free of I/O so
// tests/tooling/policies.test.ts can exercise them directly.
// Each policy returns null (no objection) or a string reason (deny).

import path from 'node:path';

const PRIVATE_PATTERNS = [
  // .env, .env.local, config/.env.production … but not .env.example
  /(^|[\\/\s'"`=:(])\.env(?!\.example\b)(\.[\w.-]+)?(?=$|[\\/\s'"`;|&)*?])/i,
  /test-data[\\/]+private/i,
];

/** Collects every string field a tool call could use to reach a file. */
function reachableStrings(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return [];
  return ['command', 'file_path', 'path', 'glob', 'pattern', 'notebook_path']
    .map((key) => toolInput[key])
    .filter((value) => typeof value === 'string');
}

/** Project-wide: block .env* and test-data/private from shell, search and file tools. */
export function privatePaths(toolName, toolInput) {
  if (!['Bash', 'PowerShell', 'Read', 'Grep', 'Glob', 'Edit', 'Write'].includes(toolName)) {
    return null;
  }
  for (const value of reachableStrings(toolInput)) {
    if (PRIVATE_PATTERNS.some((re) => re.test(value))) {
      return `Blocked by .claude/hooks: ${toolName} may not touch .env files or test-data/private/ (CLAUDE.md, Security rule 6).`;
    }
  }
  return null;
}

const GIT_READONLY =
  /^\s*git\s+(diff|log|show|status|rev-parse|merge-base|branch\s+--show-current|ls-files)\b/;
const SHELL_CHAINING = /[;&|`<>]|\$\(/;

/** code-reviewer: shell access is limited to read-only git commands, no chaining or redirects. */
export function gitReadonly(toolName, toolInput) {
  if (toolName !== 'Bash' && toolName !== 'PowerShell') return null;
  const command = typeof toolInput?.command === 'string' ? toolInput.command : '';
  if (GIT_READONLY.test(command) && !SHELL_CHAINING.test(command)) return null;
  return 'Blocked by .claude/hooks: code-reviewer may only run read-only git commands (diff, log, show, status, rev-parse, merge-base, ls-files) without chaining or redirects.';
}

const TEST_COMMANDS =
  /^\s*(npx\s+vitest\b|npm\s+(run\s+)?test\b|npm\s+run\s+(typecheck|lint|format:check)\b|git\s+(status|diff)\b)/;

/**
 * test-writer: may only write under tests/ or test-data/public/, and may only run test,
 * typecheck and lint commands.
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
    if (TEST_COMMANDS.test(command) && !SHELL_CHAINING.test(command)) return null;
    return 'Blocked by .claude/hooks: test-writer may only run vitest, npm test, typecheck, lint, format:check, git status/diff.';
  }
  return null;
}

export const POLICIES = {
  'private-paths': privatePaths,
  'git-readonly': gitReadonly,
  'tests-only': testsOnly,
};
