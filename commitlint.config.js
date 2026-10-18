// Enforces docs/conventions/git-conventions.md. The type and scope lists live in
// scripts/gitConventionsData.mjs so the test can check them against the doc.
import { SCOPES, TYPES, isMergeCommit, isRevertCommit } from './scripts/gitConventionsData.mjs';

const AI_ATTRIBUTION = [
  /^co-authored-by:.*(claude|anthropic)/im,
  /noreply@anthropic\.com/i,
  /generated with \[?claude code/i,
];

export default {
  extends: ['@commitlint/config-conventional'],
  defaultIgnores: false,
  ignores: [isMergeCommit, isRevertCommit],
  plugins: [
    {
      rules: {
        // scope-enum alone accepts "ui,ipc" or "ui/ipc" when each part is allowed.
        'single-scope': ({ scope }) => [
          !/[,/\\]/.test(scope ?? ''),
          'use exactly one scope: the primary area of the change',
        ],
        // D-047. CI lints only a PR's own commits, so old trailers on main never reach this.
        'no-ai-attribution': ({ raw }) => [
          !AI_ATTRIBUTION.some((re) => re.test(raw ?? '')),
          'remove the AI attribution (Co-Authored-By: Claude or "Generated with Claude Code")',
        ],
      },
    },
  ],
  rules: {
    'type-enum': [2, 'always', TYPES],
    'scope-enum': [2, 'always', SCOPES],
    'scope-empty': [2, 'never'],
    'single-scope': [2, 'always'],
    'no-ai-attribution': [2, 'always'],
    'header-max-length': [2, 'always', 72],
    'body-max-line-length': [2, 'always', 72],
    // The parser treats everything from the first "Token: value" line on as footer, so the body
    // limit alone would let later lines reach the preset's 100.
    'footer-max-line-length': [2, 'always', 72],
    // The preset only warns on these, and warnings don't fail the hook or CI. A test checks that
    // no rule is left at warning level.
    'body-leading-blank': [2, 'always'],
    'footer-leading-blank': [2, 'always'],
    // The preset already forbids a capitalised first letter (subject-case "never" sentence-case
    // and friends), which allows acronyms after the first word.
  },
};
