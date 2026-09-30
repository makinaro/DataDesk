import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs dev-tooling module without type declarations
import { gitReadonly, privatePaths, testsOnly } from '../../.claude/hooks/policies.mjs';

type Policy = (tool: string, input: Record<string, unknown>, dir?: string) => string | null;
const privatePathsP = privatePaths as Policy;
const gitReadonlyP = gitReadonly as Policy;
const testsOnlyP = testsOnly as Policy;

const ROOT = resolve('.');

describe('private-paths policy', () => {
  it.each([
    ['Bash', { command: 'cat .env' }],
    ['Bash', { command: 'type .env.local' }],
    ['PowerShell', { command: 'Get-Content ./config/.env.production' }],
    ['Grep', { pattern: 'KEY', path: '.env' }],
    ['Glob', { pattern: 'test-data/private/**' }],
    ['Read', { file_path: 'C:\\repo\\test-data\\private\\people.csv' }],
    ['Bash', { command: 'ls test-data/private' }],
    // Review regressions: input redirect and PowerShell comma lists are direct reads.
    ['Bash', { command: 'cat <.env' }],
    ['PowerShell', { command: 'Get-Content x.txt,.env' }],
  ])('blocks %s %j', (tool, input) => {
    expect(privatePathsP(tool, input)).toMatch(/Blocked/);
  });

  it.each([
    ['Bash', { command: 'npm run check' }],
    ['Read', { file_path: '.env.example' }],
    ['Read', { file_path: 'src/main/environment.ts' }],
    ['Grep', { pattern: 'process.env', path: 'src' }],
    // Grep's pattern is a content regex, not a path.
    ['Grep', { pattern: 'process\\.env', path: 'src' }],
    ['Read', { file_path: 'test-data/public/penguins.csv' }],
  ])('allows %s %j', (tool, input) => {
    expect(privatePathsP(tool, input)).toBeNull();
  });
});

describe('git-readonly policy (code-reviewer)', () => {
  it.each(['git diff main...HEAD', 'git log --oneline -20', 'git show HEAD~1', 'git status'])(
    'allows %s',
    (command) => {
      expect(gitReadonlyP('Bash', { command })).toBeNull();
    },
  );

  it.each([
    'git commit -m x',
    'git push',
    'git diff > out.txt',
    'git log; rm -rf src',
    'git status && npm install evil',
    'npm run check',
    'git diff $(cat .env)',
    // Review regressions: newline chaining, and read-only subcommands that write or execute.
    'git status\nrm -rf src',
    'git status\r\nnpm install evil',
    'git diff --output=src/main/index.ts',
    'git log -p --ext-diff',
    'git show --textconv HEAD',
    'git statusx',
  ])('blocks %s', (command) => {
    expect(gitReadonlyP('Bash', { command })).toMatch(/Blocked/);
  });

  it('ignores non-shell tools', () => {
    expect(gitReadonlyP('Read', { file_path: 'src/main/index.ts' })).toBeNull();
  });
});

describe('tests-only policy (test-writer)', () => {
  it.each(['tests/main/foo.test.ts', 'test-data/public/sample.csv', `${ROOT}/tests/x.test.ts`])(
    'allows writing %s',
    (file_path) => {
      expect(testsOnlyP('Write', { file_path }, ROOT)).toBeNull();
    },
  );

  it.each(['src/main/index.ts', 'tests/../src/main/index.ts', 'package.json', 'CLAUDE.md'])(
    'blocks writing %s',
    (file_path) => {
      expect(testsOnlyP('Edit', { file_path }, ROOT)).toMatch(/Blocked/);
    },
  );

  it('allows test commands and blocks others', () => {
    expect(testsOnlyP('Bash', { command: 'npx vitest run tests/main' }, ROOT)).toBeNull();
    expect(testsOnlyP('Bash', { command: 'npm run typecheck' }, ROOT)).toBeNull();
    expect(testsOnlyP('Bash', { command: 'echo x > src/main/index.ts' }, ROOT)).toMatch(/Blocked/);
    expect(testsOnlyP('Bash', { command: 'npm install left-pad' }, ROOT)).toMatch(/Blocked/);
  });

  // Review regressions: commands that look like test/lint but rewrite files or chain.
  it.each([
    'npm run lint:fix',
    'npm run lint -- --fix',
    'npm run format',
    'npx vitest run -u',
    'npx vitest --update',
    'npm run test:e2e',
    'npm test\nnode -e "require(`fs`).writeFileSync(`src/x.ts`, ``)"',
  ])('blocks file-modifying or chained command: %s', (command) => {
    expect(testsOnlyP('Bash', { command }, ROOT)).toMatch(/Blocked/);
  });
});

describe('agent-guards.mjs entry point', () => {
  const run = (policy: string, payload: unknown) =>
    spawnSync(process.execPath, ['.claude/hooks/agent-guards.mjs', policy], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
    });

  it('exits 2 with a reason when a policy blocks', () => {
    const result = run('private-paths', { tool_name: 'Bash', tool_input: { command: 'cat .env' } });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/Blocked/);
  });

  it('exits 0 when allowed', () => {
    const result = run('git-readonly', {
      tool_name: 'Bash',
      tool_input: { command: 'git status' },
    });
    expect(result.status).toBe(0);
  });

  it('fails closed on unknown policies and bad input', () => {
    expect(run('nope', {}).status).toBe(2);
    const bad = spawnSync(process.execPath, ['.claude/hooks/agent-guards.mjs', 'git-readonly'], {
      input: 'not json',
      encoding: 'utf8',
    });
    expect(bad.status).toBe(2);
  });
});
