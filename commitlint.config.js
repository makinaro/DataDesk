// Enforces docs/conventions/git-conventions.md. The type and scope lists live in
// scripts/gitConventionsData.mjs so the test can check them against the doc.
import { SCOPES, TYPES, isMergeCommit, isRevertCommit } from './scripts/gitConventionsData.mjs';

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
          'use exactly one scope; split a change that spans scopes into separate commits',
        ],
      },
    },
  ],
  rules: {
    'type-enum': [2, 'always', TYPES],
    'scope-enum': [2, 'always', SCOPES],
    'scope-empty': [2, 'never'],
    'single-scope': [2, 'always'],
    'header-max-length': [2, 'always', 72],
    'body-max-line-length': [2, 'always', 72],
    // The parser treats everything from the first "Token: value" line on as footer, so the body
    // limit alone would let later lines reach the preset's 100.
    'footer-max-line-length': [2, 'always', 72],
    // The preset already forbids a capitalised first letter (subject-case "never" sentence-case
    // and friends), which allows acronyms after the first word.
  },
};
