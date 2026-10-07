// Lints commit messages and PR titles with the repo's commitlint config. The test drives
// lintMessage/lintPrTitle, and CI runs the pr-title command below. The lists live in
// gitConventionsData.mjs; the rules and reasons in docs/conventions/git-conventions.md.
import { fileURLToPath, pathToFileURL } from 'node:url';
import load from '@commitlint/load';
import lint from '@commitlint/lint';
import { isRevertCommit } from './gitConventionsData.mjs';

export { DOC_VERSION, SCOPES, TYPES } from './gitConventionsData.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const PHASE_SUFFIX = / \(phase (0|[1-9][0-9]*)\)$/;
// Anything phase-like left at the end once a correct suffix is stripped: "(Phase 9)",
// "(phase 9.5)", "(phase 09)", "(phase)" or a second "(phase 9)". Not "(phased rollout)".
const MALFORMED_PHASE_SUFFIX = /\(\s*phase\b[^)]*\)\s*$/i;

/**
 * @param {string} message
 * @param {{ prTitle?: boolean }} [options]
 */
async function run(message, { prTitle = false } = {}) {
  const config = await load({}, { cwd: ROOT, file: 'commitlint.config.js' });
  const report = await lint(message, config.rules, {
    plugins: config.plugins,
    // Same comment handling as `commitlint --edit` in the commit-msg hook.
    parserOpts: { ...config.parserPreset?.parserOpts, commentChar: '#' },
    // A PR title is never a merge commit, so only the revert exemption applies to it.
    ignores: prTitle ? [isRevertCommit] : config.ignores,
    defaultIgnores: config.defaultIgnores,
  });
  return {
    valid: report.valid,
    errors: report.errors.map((e) => `${e.name}: ${e.message}`),
    warnings: report.warnings.map((w) => `${w.name}: ${w.message}`),
  };
}

/**
 * Lints a commit message the way the commit-msg hook does.
 * @param {string} message
 * @returns {Promise<{ valid: boolean, errors: string[], warnings: string[] }>}
 */
export function lintMessage(message) {
  return run(message);
}

/**
 * Lints a PR title: the commit header rules apply to the title without its optional
 * " (phase N)" suffix, and the suffix itself must be spelled exactly that way.
 * @param {string} title
 * @returns {Promise<{ valid: boolean, errors: string[], warnings: string[] }>}
 */
export async function lintPrTitle(title) {
  if (title.trim() === '') {
    return { valid: false, errors: ['title-empty: the PR title is empty'], warnings: [] };
  }
  const base = title.replace(PHASE_SUFFIX, '');
  if (MALFORMED_PHASE_SUFFIX.test(base)) {
    return {
      valid: false,
      errors: ['phase-suffix: end the title with exactly one " (phase N)" (lower-case, digits)'],
      warnings: [],
    };
  }
  return run(base, { prTitle: true });
}

// Exit codes: 0 valid, 1 invalid title, 2 misuse or crash. CI warns on 1 and fails on 2.
async function main() {
  const [command] = process.argv.slice(2);
  const title = process.env['PR_TITLE'];
  if (command !== 'pr-title' || title === undefined) {
    console.error('usage: PR_TITLE=<title> node scripts/gitConventions.mjs pr-title');
    process.exitCode = 2;
    return;
  }
  const result = await lintPrTitle(title);
  if (result.valid) {
    console.log(`PR title OK: ${title}`);
    return;
  }
  console.error(`PR title does not follow docs/conventions/git-conventions.md: ${title}`);
  for (const error of result.errors) console.error(`  - ${error}`);
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 2;
  });
}
