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
]);
