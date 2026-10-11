import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import load from '@commitlint/load';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs dev-tooling module without type declarations
import { lintMessage, lintPrTitle } from '../../scripts/gitConventions.mjs';
// @ts-expect-error -- plain .mjs dev-tooling module without type declarations
import { DOC_VERSION, SCOPES, TYPES } from '../../scripts/gitConventionsData.mjs';

type Lint = (input: string) => Promise<{ valid: boolean; errors: string[]; warnings: string[] }>;
const lintMessageP = lintMessage as Lint;
const lintPrTitleP = lintPrTitle as Lint;

const ROOT = resolve('.');
const CLI = resolve('scripts/gitConventionsCli.mjs');
const read = (path: string): string => readFileSync(resolve(path), 'utf8');
const DOC = read('docs/conventions/git-conventions.md');
const INDEX = read('docs/conventions/README.md');

const TRAILER = 'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>';
// "feat(ui): " is 10 characters, so these headers are exactly 72 and 73.
const HEADER_72 = `feat(ui): ${'a'.repeat(62)}`;
const HEADER_73 = `feat(ui): ${'a'.repeat(63)}`;

// Each subprocess cold-starts Node (and the CLI tests load commitlint), which can exceed the
// default 5 s on a cold Windows runner.
const SPAWN_TIMEOUT = 30_000;
const slow = { timeout: SPAWN_TIMEOUT + 5_000 };

// Built explicitly, never a spread of process.env (CLAUDE.md security rule 5).
const childEnv = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  PATH: process.env.PATH ?? '',
  SystemRoot: process.env.SystemRoot ?? '',
  TEMP: process.env.TEMP ?? tmpdir(),
  ...extra,
});

const cli = (
  args: string[],
  { env = {}, input, cwd = ROOT }: { env?: Record<string, string>; input?: string; cwd?: string },
) =>
  spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: childEnv(env),
    timeout: SPAWN_TIMEOUT,
    ...(input === undefined ? {} : { input }),
  });

// The text of one step of a workflow file, from its "- name:" line to the next step.
const workflowStep = (workflow: string, name: string): string => {
  const start = workflow.indexOf(`- name: ${name}\n`);
  expect(start, `missing step "${name}"`).toBeGreaterThanOrEqual(0);
  const next = workflow.indexOf('\n      - ', start + 1);
  return workflow.slice(start, next === -1 ? undefined : next);
};

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

  it('has a commit-msg hook that guards blank messages, then runs commitlint offline', () => {
    expect(read('.husky/commit-msg').split(/\r?\n/).filter(Boolean)).toEqual([
      'node scripts/gitConventionsCli.mjs commit-msg "$1"',
      'npx --no -- commitlint --edit "$1"',
    ]);
  });

  it('asks a maintainer to review changes to the rules CI lints with', () => {
    const owners = read('.github/CODEOWNERS');
    for (const path of [
      '/commitlint.config.js',
      '/scripts/gitConventions*.mjs',
      '/.husky/',
      '/.github/workflows/ci.yml',
      '/.github/workflows/pr-title.yml',
      '/.github/CODEOWNERS',
    ]) {
      expect(owners).toMatch(new RegExp(`^${path.replace(/[.*]/g, '\\$&')} @\\S+$`, 'm'));
    }
  });
});

describe('the CI workflows', () => {
  const ci = read('.github/workflows/ci.yml');
  const prTitle = read('.github/workflows/pr-title.yml');

  it('lints the PR commits from the merge base and fails on an empty range', () => {
    expect(ci).toMatch(/^ {2}commit-lint:$/m);
    const step = workflowStep(ci, "Lint the PR's commits");
    expect(step).toContain('shell: bash');
    expect(step).toContain('from=$(git merge-base "$BASE_SHA" "$HEAD_SHA")');
    expect(step).toContain('[ "$n" -gt 0 ] ||');
    expect(step).toContain('commitlint --from "$from" --to "$HEAD_SHA"');
    expect(step).toContain(
      'git log --no-merges --format=%s "$from..$HEAD_SHA" | node scripts/gitConventionsCli.mjs merge-headers',
    );
  });

  it('fails the title job on any non-zero exit, with the title passed only through env', () => {
    const step = workflowStep(prTitle, 'Check the PR title');
    expect(step).toContain('PR_TITLE: ${{ github.event.pull_request.title }}');
    const run = /^\s+run: (.*)$/m.exec(step)?.[1];
    // A bare command: no `|| ...` or exit-code mapping that could turn a crash into a pass.
    expect(run).toBe('node scripts/gitConventionsCli.mjs pr-title');
    expect(prTitle).not.toContain('continue-on-error');
  });

  // Every `run:` script, one-line or `|` block, so an expression can't slip into shell text.
  const runScripts = (workflow: string): string[] => {
    const lines = workflow.split(/\r?\n/);
    return lines.flatMap((line, i) => {
      const match = /^(\s*)run: (.*)$/.exec(line);
      if (!match) return [];
      if (match[2] !== '|') return [match[2] ?? ''];
      const indent = (match[1] ?? '').length;
      const end = lines.findIndex(
        (next, j) => j > i && next.trim() !== '' && next.search(/\S/) <= indent,
      );
      return [lines.slice(i + 1, end === -1 ? undefined : end).join('\n')];
    });
  };

  it('never interpolates an expression into a run script', () => {
    for (const workflow of [ci, prTitle]) {
      const runs = runScripts(workflow);
      expect(runs.length).toBeGreaterThan(0);
      for (const run of runs) expect(run).not.toContain('${{');
    }
  });

  it('checks out without keeping a token in the lint jobs', () => {
    expect(prTitle).toContain('persist-credentials: false');
    const job = ci.slice(ci.indexOf('  commit-lint:'));
    expect(job).toContain('persist-credentials: false');
  });
});

describe('the commitlint config', () => {
  it('leaves no rule at warning level, since warnings never fail the hook or CI', async () => {
    const config = await load({}, { cwd: ROOT, file: 'commitlint.config.js' });
    const warnings = Object.entries(config.rules)
      .filter(([, rule]) => Number(rule?.[0]) === 1)
      .map(([name]) => name);
    expect(warnings).toEqual([]);
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
    // The 72 limits, at the boundary.
    HEADER_72,
    `feat(ui): add a thing\n\n${'x'.repeat(72)}`,
    `feat(ui): add a thing\n\nContext: ${'y'.repeat(63)}`,
    // Exempt by their first line only.
    'Merge pull request #12 from makinaro/plan/planning\n\nPlan (docs): add things',
    "Merge branch 'main' into phase-10-analysis",
    "Merge remote-tracking branch 'origin/main' into phase-10-analysis",
    'Revert "feat(ui): add a theme picker"\n\nThis reverts commit 0033574.',
    'Reapply "feat(ui): add a theme picker"\n\nThis reverts commit 1a2b3c4.',
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
    [HEADER_73, 'header-max-length'],
    [`feat(ui): add a thing\n\n${'x'.repeat(73)}`, 'body-max-line-length'],
    // A "Token: value" line turns the rest into footer, which keeps the same 72 limit.
    [`feat(ui): add a thing\n\nContext: ${'y'.repeat(64)}`, 'footer-max-line-length'],
    // The preset only warns on these two.
    ['feat(ui): add a thing\nWhy this matters.', 'body-leading-blank'],
    [`feat(ui): add a thing\n\nWhy this matters.\n${TRAILER}`, 'footer-leading-blank'],
    // `git commit -m "#42 ..."` keeps the line, but commitlint would strip it and pass.
    ['#42 fix everything', 'message-empty'],
    ['#', 'message-empty'],
    // commitlint's default ignores would skip all of these.
    ['garbage subject\n\nMerge branch main', 'type-empty'],
    ['garbage subject\n\nMerge pull request #1 from a/b', 'type-empty'],
    ['fixup! feat(ui): add a theme picker', 'type-empty'],
    ['revert all my mistakes', 'type-empty'],
    ['chore: 1.2.3', 'scope-empty'],
    // Near misses of the exempt headers: each anchor and quote matters.
    ['Merge pull request #1 from a/b and also a feature', 'type-empty'],
    ["Merge branch 'x' into y extra words", 'type-empty'],
    ["Merge remote-tracking branch 'origin/main' into x extra", 'type-empty'],
    ["Merge tag 'v1.0'", 'type-empty'],
    ["Merge branches 'a' and 'b'", 'type-empty'],
    ['Revert feat(ui): add a theme picker', 'type-empty'],
    ['Revert "feat(ui): add a theme picker" and more', 'type-empty'],
  ])('rejects %j (%s)', async (message, rule) => {
    const result = await lintMessageP(message);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain(rule);
  });
});

describe('the commit-msg hook path', slow, () => {
  const dir = mkdtempSync(join(tmpdir(), 'datadesk-commitlint-'));
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const write = (message: string): string => {
    const file = join(dir, `COMMIT_EDITMSG-${Math.random().toString(36).slice(2)}`);
    writeFileSync(file, message);
    return file;
  };
  const edit = (message: string) =>
    spawnSync(process.execPath, ['node_modules/@commitlint/cli/cli.js', '--edit', write(message)], {
      cwd: ROOT,
      encoding: 'utf8',
      env: childEnv(),
      timeout: SPAWN_TIMEOUT,
    });

  it('has commitlint --edit accept a valid message', () => {
    expect(edit('feat(ui): add a theme picker\n').status).toBe(0);
  });

  it('has commitlint --edit reject an invalid one with the same config', () => {
    expect(edit('garbage subject\n\nMerge branch main\n').status).toBe(1);
  });

  it('has the guard pass a message with content', () => {
    const file = write('feat(ui): add a theme picker\n# Please enter the commit message\n');
    expect(cli(['commit-msg', file], {}).status).toBe(0);
  });

  it('has the guard reject a message that is only "#" lines, which commitlint passes', () => {
    const file = write('#42 fix everything\n');
    const result = cli(['commit-msg', file], {});
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('empty once lines starting with "#" are removed');
    expect(edit('#42 fix everything\n').status).toBe(0);
  });
});

describe('PR titles', () => {
  it.each([
    'feat(ui): polish the UI and themes (phase 9)',
    'feat(ui): set up the app shell (phase 0)',
    'fix(ci): lint the full PR range',
    'fix(ui): keep the banner (phased rollout)',
    'Revert "feat(ui): add a theme picker"',
    'Reapply "feat(ui): add a theme picker"',
    // The suffix does not count toward the 72-character header limit.
    HEADER_72,
    `${HEADER_72} (phase 10)`,
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
    HEADER_73,
    `${HEADER_73} (phase 9)`,
    // A title has no comment lines, so a leading "#" must not strip it to an empty message.
    '#12 fix everything',
    '#',
    // A title is never a merge commit, so the merge exemptions don't apply.
    'Merge pull request #1 from makinaro/fix-x',
    'fixup! feat(ui): polish the UI',
    '',
    '   ',
  ])('rejects %j', async (title) => {
    expect((await lintPrTitleP(title)).valid).toBe(false);
  });
});

describe('the commands CI runs', slow, () => {
  it('exits 0 for a valid title', () => {
    const result = cli(['pr-title'], { env: { PR_TITLE: 'fix(ci): lint the full PR range' } });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PR title OK');
  });

  it('exits 1 for an invalid title', () => {
    const result = cli(['pr-title'], { env: { PR_TITLE: 'Phase 9: UI polish' } });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('does not follow');
  });

  it('exits 2 without a command', () => {
    expect(cli([], { env: { PR_TITLE: 'fix(ci): lint the full PR range' } }).status).toBe(2);
  });

  it('exits 2 without PR_TITLE', () => {
    expect(cli(['pr-title'], {}).status).toBe(2);
  });

  // A copy of the CLI with no lint modules next to it: the import fails at load time.
  it('exits 2, not 0, when the lint code fails to load', () => {
    const dir = mkdtempSync(join(tmpdir(), 'datadesk-cli-'));
    try {
      const copy = join(dir, 'gitConventionsCli.mjs');
      copyFileSync(CLI, copy);
      const result = spawnSync(process.execPath, [copy, 'pr-title'], {
        cwd: dir,
        encoding: 'utf8',
        env: childEnv({ PR_TITLE: 'fix(ci): lint the full PR range' }),
        timeout: SPAWN_TIMEOUT,
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('ERR_MODULE_NOT_FOUND');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes single-parent commits without a merge header', () => {
    const input = 'feat(ui): add a theme picker\nRevert "feat(ui): add a theme picker"\n';
    expect(cli(['merge-headers'], { input }).status).toBe(0);
  });

  it('rejects a single-parent commit with a merge header, which would skip linting', () => {
    const result = cli(['merge-headers'], { input: "feat(ui): add x\nMerge branch 'main'\n" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Merge branch 'main'");
  });
});

describe('the dev tooling that writes commits and PRs follows the rules', () => {
  const skill = read('.claude/skills/finish-phase/SKILL.md');

  it('has /finish-phase commit a valid message', async () => {
    const subject = /Commit `([^`]+)`/.exec(skill)?.[1];
    expect(subject).toBeDefined();
    expect((await lintMessageP((subject ?? '').replaceAll('N', '10'))).errors).toEqual([]);
  });

  it('has /finish-phase use a valid PR title shape and the real check command', async () => {
    const example = /e\.g\. `([^`]+)`/.exec(skill)?.[1];
    expect(example).toBeDefined();
    expect((await lintPrTitleP(example ?? '')).errors).toEqual([]);
    expect(skill).not.toContain('"Phase N:');
    expect(skill).toContain('node scripts/gitConventionsCli.mjs pr-title');
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
    // New rows go at the top of the Changelog table, so the first data row is the newest.
    const changelogRow = /^\| (\d+\.\d+\.\d+)\s+\|/m.exec(section('Changelog'))?.[1];
    const indexRow = /\[git-conventions\.md\]\(git-conventions\.md\) \| (\d+\.\d+\.\d+)/.exec(
      INDEX,
    )?.[1];
    expect(header).toBe(DOC_VERSION);
    expect(changelogRow).toBe(DOC_VERSION);
    expect(indexRow).toBe(DOC_VERSION);
  });

  // The examples in the doc are executable. Each ✅ passes, each ❌ fails on the rule it names,
  // and each "Write `...`" rewrite passes. Commit examples run through the commit linter and
  // title examples through the title linter, which is stricter.
  interface Example {
    text: string;
    rule: string | undefined;
    rewrite: string | undefined;
  }
  const examples = (text: string, mark: string): Example[] =>
    text
      .split(/^- /m)
      .filter((bullet) => bullet.startsWith(`${mark} `))
      .map((bullet) => ({
        text: /`([^`]+)`/.exec(bullet)?.[1] ?? '',
        rule: /\(`([a-z-]+)`\)/.exec(bullet)?.[1],
        rewrite: /Write\s+`([^`]+)`/.exec(bullet)?.[1],
      }));
  const COMMIT_EXAMPLES = section("Examples from this repo's history");
  const TITLE_EXAMPLES = section('Pull requests');

  it('has every example in one of the two tested sections', () => {
    const count = (text: string) => (text.match(/^- [✅❌] /gmu) ?? []).length;
    expect(count(COMMIT_EXAMPLES) + count(TITLE_EXAMPLES)).toBe(count(DOC));
  });

  it.each([
    ['commit', COMMIT_EXAMPLES, lintMessageP],
    ['title', TITLE_EXAMPLES, lintPrTitleP],
  ] as const)('has %s examples that are actually accepted', async (_, text, lintFn) => {
    const good = examples(text, '✅');
    expect(good.length).toBeGreaterThan(0);
    for (const { text: example } of good) {
      expect((await lintFn(example)).errors, example).toEqual([]);
    }
  });

  it.each([
    ['commit', COMMIT_EXAMPLES, lintMessageP],
    ['title', TITLE_EXAMPLES, lintPrTitleP],
  ] as const)('has %s examples rejected by the rule they name', async (_, text, lintFn) => {
    const bad = examples(text, '❌');
    expect(bad.length).toBeGreaterThan(0);
    for (const { text: example, rule } of bad) {
      expect(rule, `no (\`rule\`) for ${example}`).toBeDefined();
      const result = await lintFn(example);
      expect(result.valid, example).toBe(false);
      expect(
        result.errors.map((e) => e.split(':')[0]),
        example,
      ).toContain(rule);
    }
  });

  it('has commit rewrites that are actually accepted', async () => {
    const bad = examples(COMMIT_EXAMPLES, '❌');
    for (const { text: example, rewrite } of bad) {
      expect(rewrite, `no "Write \`...\`" for ${example}`).toBeDefined();
      expect((await lintMessageP(rewrite ?? '')).errors, rewrite).toEqual([]);
    }
  });
});
