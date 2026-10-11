// Lints commit messages and PR titles with the repo's commitlint config. No side effects on
// import: the test drives lintMessage/lintPrTitle, and gitConventionsCli.mjs is what CI and the
// hook run. The lists live in gitConventionsData.mjs; the rules and reasons in
// docs/conventions/git-conventions.md.
import { fileURLToPath } from 'node:url';
import load from '@commitlint/load';
import lint from '@commitlint/lint';
import { isBlankMessage, isRevertCommit } from './gitConventionsData.mjs';

export { DOC_VERSION, SCOPES, TYPES } from './gitConventionsData.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const PHASE_SUFFIX = / \(phase (0|[1-9][0-9]*)\)$/;
// Anything phase-like left at the end once a correct suffix is stripped: "(Phase 9)",
// "(phase 9.5)", "(phase 09)", "(phase)" or a second "(phase 9)". Not "(phased rollout)".
const MALFORMED_PHASE_SUFFIX = /\(\s*phase\b[^)]*\)\s*$/i;

/** @param {string} error */
const invalid = (error) => ({ valid: false, errors: [error], warnings: [] });

/**
 * @param {string} message
 * @param {{ prTitle?: boolean }} [options]
 */
async function run(message, { prTitle = false } = {}) {
  const config = await load({}, { cwd: ROOT, file: 'commitlint.config.js' });
  const report = await lint(message, config.rules, {
    plugins: config.plugins,
    // Commits get the same comment handling as `commitlint --edit` in the hook. A title has no
    // comment lines, and with '#' set, "#12 fix it" would be stripped to an empty, valid message.
    parserOpts: {
      ...config.parserPreset?.parserOpts,
      ...(prTitle ? {} : { commentChar: '#' }),
    },
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
 * Lints a commit message the way the commit-msg hook does: the blank-message guard in
 * gitConventionsCli.mjs, then `commitlint --edit`.
 * @param {string} message
 * @returns {Promise<{ valid: boolean, errors: string[], warnings: string[] }>}
 */
export async function lintMessage(message) {
  if (isBlankMessage(message)) {
    return invalid('message-empty: the message is empty once lines starting with "#" are removed');
  }
  return run(message);
}

/**
 * Lints a PR title: the commit header rules apply to the title without its optional
 * " (phase N)" suffix, and the suffix itself must be spelled exactly that way.
 * @param {string} title
 * @returns {Promise<{ valid: boolean, errors: string[], warnings: string[] }>}
 */
export async function lintPrTitle(title) {
  if (title.trim() === '') return invalid('title-empty: the PR title is empty');
  const base = title.replace(PHASE_SUFFIX, '');
  if (MALFORMED_PHASE_SUFFIX.test(base)) {
    return invalid(
      'phase-suffix: end the title with exactly one " (phase N)" (lower-case, digits)',
    );
  }
  return run(base, { prTitle: true });
}
