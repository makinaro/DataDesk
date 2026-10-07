// Pure data for the git conventions, with no imports, so commitlint.config.js and
// scripts/gitConventions.mjs can both import it without importing each other. Rules and reasons
// live in docs/conventions/git-conventions.md; keep DOC_VERSION in step with it.

export const DOC_VERSION = '1.0.0';

export const TYPES = ['feat', 'fix', 'test', 'docs', 'refactor', 'chore', 'build', 'ci', 'perf'];

export const SCOPES = [
  'main',
  'preload',
  'ipc',
  'ui',
  'secrets',
  'mcp',
  'agent',
  'skills',
  'claude',
  'deps',
  'planning',
  'ci',
  'e2e',
  'smoke',
  'test',
  'scripts',
  'lint',
  'build',
  'docs',
];

// Headers that skip linting, matched against the first line only. commitlint's default ignores
// are off because they match any line of the message ("Merge branch main" in a body would skip
// the whole commit) and also skip fixup!/squash!, semver-only and other headers.
export const MERGE_HEADERS = [
  /^Merge pull request #\d+ from \S+$/,
  /^Merge branch '[^']+'( of \S+)?( into \S+)?$/,
  /^Merge remote-tracking branch '[^']+'( into \S+)?$/,
];
export const REVERT_HEADER = /^Revert ".+"$/;

/** @param {string} message */
export const headerOf = (message) => (message.split(/\r?\n/)[0] ?? '').trimEnd();

/** @param {string} message */
export const isMergeCommit = (message) => MERGE_HEADERS.some((re) => re.test(headerOf(message)));

/** @param {string} message */
export const isRevertCommit = (message) => REVERT_HEADER.test(headerOf(message));
