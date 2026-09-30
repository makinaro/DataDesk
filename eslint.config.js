import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['out/', 'dist/', 'release/', 'coverage/', 'test-results/', 'playwright-report/']),

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Plain JS config files and .claude hook scripts are not part of a tsconfig.
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  {
    files: ['src/renderer/**/*.{ts,tsx}', 'tests/renderer/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest']],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'tests/**/*.ts', '*.config.ts'],
    languageOptions: { globals: globals.node },
  },

  // The sandboxed preload bundles its dependencies (externalizeDeps: false), so a value import
  // of zod or the contract would silently ship a validator into it. Types are fine.
  {
    files: ['src/preload/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['zod', '**/shared/ipc/contract'],
              allowTypeImports: true,
              message: 'Preload may only import types from the contract; validation lives in main.',
            },
          ],
        },
      ],
    },
  },

  // src/shared is imported by every process, so it must stay free of Electron, Node, and React.
  {
    files: ['src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['electron', 'node:*'], message: 'src/shared must be process-agnostic.' },
            { group: ['react', 'react-dom'], message: 'src/shared must not depend on React.' },
          ],
        },
      ],
    },
  },

  prettier,
);
