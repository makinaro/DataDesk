import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs dev-tooling module without type declarations
import { lintMessage, lintPrTitle } from '../../scripts/gitConventions.mjs';
// @ts-expect-error -- plain .mjs dev-tooling module without type declarations
import { DOC_VERSION, SCOPES, TYPES } from '../../scripts/gitConventionsData.mjs';

type Lint = (input: string) => Promise<{ valid: boolean; errors: string[]; warnings: string[] }>;
const lintMessageP = lintMessage as Lint;
const lintPrTitleP = lintPrTitle as Lint;

const ROOT = resolve('.');
const read = (path: string): string => readFileSync(resolve(path), 'utf8');
const DOC = read('docs/conventions/git-conventions.md');
const INDEX = read('docs/conventions/README.md');

const BODY_LINE = 'x'.repeat(73);
const TRAILER = 'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>';

// Built explicitly, never a spread of process.env (CLAUDE.md security rule 5).
const childEnv = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  PATH: process.env.PATH ?? '',
  SystemRoot: process.env.SystemRoot ?? '',
  TEMP: process.env.TEMP ?? tmpdir(),
  ...extra,
});

// The first lint pays for loading commitlint and its preset, which can exceed the default 5 s
// test timeout on a cold Windows runner.
beforeAll(async () => {
  await lintMessageP('feat(ui): warm up');
}, 60_000);

describe('the tooling is installed for every clone', () => {
  const pkg = JSON.parse(read('package.json')) as {
    scripts: Record<string, string>;
    devDependencies: Record<string, string>;
  };

  it.each([
    '@commitlint/cli',
    '@commitlint/config-conventional',
    '@commitlint/load',
    '@commitlint/lint',
    'husky',
  ])('declares %s as an exact devDependency', (name) => {
    expect(pkg.devDependencies[name]).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('installs the hook through the prepare script', () => {
    expect(pkg.scripts.prepare).toBe('husky');
  });

  it('has a commit-msg hook that runs commitlint without downloading it', () => {
    expect(read('.husky/commit-msg')).toContain('npx --no -- commitlint --edit "$1"');
  });

  it('lints the PR commits in CI', () => {
    const ci = read('.github/workflows/ci.yml');
    expect(ci).toMatch(/^ {2}commit-lint:$/m);
    expect(ci).toContain('commitlint --from "$BASE_SHA" --to "$HEAD_SHA"');
  });
});

describe('commit messages', () => {
  it.each([
    'feat(ui): add a theme picker',
    'fix(mcp): load DuckDB from a short path',
    'docs(docs): add the phase 9 learning log and summary',
    'test(test): cover the theme picker',
    `feat(ui): add a theme picker\n\nWhy this matters.\n\n${TRAILER}`,
    'feat(ui): add a theme picker\n\nBREAKING CHANGE: the old picker is gone',
    'feat(ui)!: drop the old layout',
    `feat(ui): add a theme picker\n\nSee https://example.com/${'p'.repeat(80)}`,
    'feat(ui): add a theme picker\r\n\r\nWhy this matters.\r\n',
    // Comment lines are stripped, as `commitlint --edit` does.
    `feat(ui): add a theme picker\n\n# ${'c'.repeat(90)}`,
    // Exempt by their first line only.
    'Merge pull request #12 from makinaro/plan/planning\n\nPlan (docs): add things',
    "Merge branch 'main' into phase-10-analysis",
    "Merge remote-tracking branch 'origin/main' into phase-10-analysis",
    'Revert "feat(ui): add a theme picker"\n\nThis reverts commit 0033574.',
  ])('accepts %j', async (message) => {
    const result = await lintMessageP(message);
    expect(result.errors).toEqual([]);
  });

  it.each([
    ['fix: add a thing', 'scope-empty'],
    ['feat(ui,ipc): add a thing', 'single-scope'],
    ['feat(ui/ipc): add a thing', 'single-scope'],
    ['feat(nope): add a thing', 'scope-enum'],
    ['Plan(docs): add a thing', 'type-enum'],
    ['style(ui): add a thing', 'type-enum'],
    ['feat(ui): Add a thing', 'subject-case'],
    ['feat(ui): add a thing.', 'subject-full-stop'],
    [`feat(ui): ${'a'.repeat(70)}`, 'header-max-length'],
    [`feat(ui): add a thing\n\n${BODY_LINE}`, 'body-max-line-length'],
    // A "Token: value" line turns the rest into footer, which keeps the same 72 limit.
    [`feat(ui): add a thing\n\nContext: ${'y'.repeat(70)}`, 'footer-max-line-length'],
    // commitlint's default ignores would skip all of these.
    ['garbage subject\n\nMerge branch main', 'type-empty'],
    ['garbage subject\n\nMerge pull request #1 from a/b', 'type-empty'],
    ['fixup! feat(ui): add a theme picker', 'type-empty'],
    ['revert all my mistakes', 'type-empty'],
    ['chore: 1.2.3', 'scope-empty'],
  ])('rejects %j (%s)', async (message, rule) => {
    const result = await lintMessageP(message);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain(rule);
  });
});

describe('the commit-msg hook path (commitlint --edit)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'datadesk-commitlint-'));
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const edit = (message: string) => {
    const file = join(dir, 'COMMIT_EDITMSG');
    writeFileSync(file, message);
    return spawnSync(process.execPath, ['node_modules/@commitlint/cli/cli.js', '--edit', file], {
      cwd: ROOT,
      encoding: 'utf8',
      env: childEnv(),
    });
  };

  it('accepts a valid message', () => {
    expect(edit('feat(ui): add a theme picker\n').status).toBe(0);
  });

  it('rejects an invalid one with the same config', () => {
    expect(edit('garbage subject\n\nMerge branch main\n').status).toBe(1);
  });
});

describe('PR titles', () => {
  it.each([
    'feat(ui): polish the UI and themes (phase 9)',
    'feat(ui): set up the app shell (phase 0)',
    'fix(ci): lint the full PR range',
    'fix(ui): keep the banner (phased rollout)',
    'Revert "feat(ui): add a theme picker"',
    // The suffix does not count toward the 72-character header limit.
    `feat(ui): ${'a'.repeat(55)} (phase 10)`,
  ])('accepts %j', async (title) => {
    expect((await lintPrTitleP(title)).errors).toEqual([]);
  });

  it.each([
    'Phase 9: UI polish',
    'feat(ui): polish the UI (Phase 9)',
    'feat(ui): polish the UI (phase 9.5)',
    'feat(ui): polish the UI (phase 09)',
    'feat(ui): polish the UI (phase)',
    'feat(ui): polish the UI (phase 9) (phase 9)',
    'feat: polish the UI (phase 9)',
    `feat(ui): ${'a'.repeat(70)} (phase 9)`,
    // A title is never a merge commit, so the merge exemptions don't apply.
    'Merge pull request #1 from makinaro/fix-x',
    'fixup! feat(ui): polish the UI',
    '',
    '   ',
  ])('rejects %j', async (title) => {
    expect((await lintPrTitleP(title)).valid).toBe(false);
  });
});

describe('the pr-title command CI runs', () => {
  const run = (args: string[], env: Record<string, string>) =>
    spawnSync(process.execPath, ['scripts/gitConventions.mjs', ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      env: childEnv(env),
    });

  it('exits 0 for a valid title', () => {
    expect(run(['pr-title'], { PR_TITLE: 'fix(ci): lint the full PR range' }).status).toBe(0);
  });

  it('exits 1 for an invalid title, which CI turns into a warning', () => {
    const result = run(['pr-title'], { PR_TITLE: 'Phase 9: UI polish' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('does not follow');
  });

  it('exits 2 when misused, which CI fails on instead of warning', () => {
    expect(run([], { PR_TITLE: 'fix(ci): lint the full PR range' }).status).toBe(2);
    expect(run(['pr-title'], {}).status).toBe(2);
  });
});

describe('the dev tooling that writes commits and PRs follows the rules', () => {
  const skill = read('.claude/skills/finish-phase/SKILL.md');

  it('has /finish-phase commit a valid message', async () => {
    const subject = /Commit `([^`]+)`/.exec(skill)?.[1];
    expect(subject).toBeDefined();
    expect((await lintMessageP((subject ?? '').replaceAll('N', '10'))).errors).toEqual([]);
  });

  it('has /finish-phase use a valid PR title shape', async () => {
    const example = /e\.g\. `([^`]+)`/.exec(skill)?.[1];
    expect(example).toBeDefined();
    expect((await lintPrTitleP(example ?? '')).errors).toEqual([]);
    expect(skill).not.toContain('"Phase N:');
  });

  it('has CLAUDE.md point at the conventions page instead of its own lists', () => {
    const claude = read('CLAUDE.md');
    expect(claude).toContain('docs/conventions/git-conventions.md');
    expect(claude).not.toMatch(/^- Scopes:/m);
  });
});

describe('git-conventions.md agrees with the tooling', () => {
  const section = (heading: string): string => {
    const start = DOC.indexOf(`## ${heading}\n`);
    expect(start, `missing section "${heading}"`).toBeGreaterThanOrEqual(0);
    const next = DOC.indexOf('\n## ', start + 1);
    return DOC.slice(start, next === -1 ? undefined : next);
  };
  const firstColumn = (text: string): string[] =>
    [...text.matchAll(/^\| `([a-z0-9]+)`/gm)].map((m) => m[1] ?? '');

  it('lists exactly the configured types', () => {
    expect(firstColumn(section('Types'))).toEqual(TYPES);
  });

  it('lists exactly the configured scopes', () => {
    expect(firstColumn(section('Scopes'))).toEqual(SCOPES);
  });

  it('has the same version in the header, the changelog, the index and the module', () => {
    const header = /^Version: (\d+\.\d+\.\d+)$/m.exec(DOC)?.[1];
    // The first data row of the Changelog table is the newest; Prettier pads cells.
    const changelogRow = /^\| (\d+\.\d+\.\d+)\s+\|/m.exec(section('Changelog'))?.[1];
    const indexRow = /\[git-conventions\.md\]\(git-conventions\.md\) \| (\d+\.\d+\.\d+)/.exec(
      INDEX,
    )?.[1];
    expect(header).toBe(DOC_VERSION);
    expect(changelogRow).toBe(DOC_VERSION);
    expect(indexRow).toBe(DOC_VERSION);
  });

  // The examples in the doc are executable: every ✅ passes and every ❌ fails.
  const examples = (mark: string): string[] =>
    [...DOC.matchAll(new RegExp(`^- ${mark} \`([^\`]+)\``, 'gm'))].map((m) => m[1] ?? '');

  it('has commit and title examples that are actually accepted', async () => {
    const good = examples('✅');
    expect(good.length).toBeGreaterThan(0);
    for (const example of good) {
      expect((await lintPrTitleP(example)).errors, example).toEqual([]);
    }
  });

  it('has commit and title examples that are actually rejected', async () => {
    const bad = examples('❌');
    expect(bad.length).toBeGreaterThan(0);
    for (const example of bad) {
      expect((await lintPrTitleP(example)).valid, example).toBe(false);
    }
  });
});
