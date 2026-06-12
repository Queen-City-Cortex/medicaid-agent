import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist/**', 'coverage/**', '.mastra/**']),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Underscore prefix is this repo's convention for intentionally unused
      // bindings (e.g. interface-conformance params).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // Message/step payload shapes vary across Mastra + AI SDK versions, so the
    // processor plumbing and the CLI runner intentionally treat parts as `any`
    // at the boundary. Scoped here so the rest of src stays strict; burn down
    // rather than add to this list.
    files: ['src/processors/**', 'src/index.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    // Tests stub partial doubles for heavyweight Mastra types; `as any` on
    // fixtures is accepted there.
    files: ['tests/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
]);
