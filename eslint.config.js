import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'coverage', 'playwright-report', 'test-results',
              'supabase/functions/_shared/domain'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Raw console calls are the thing src/lib/logger.ts exists to replace.
      'no-console': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-syntax': [
        'error',
        {
          // Catches a service-role key accidentally reaching the browser.
          selector: "MemberExpression[property.name='VITE_SUPABASE_SERVICE_ROLE_KEY']",
          message: 'The service-role key must never be read from client code.',
        },
      ],
    },
  },
  {
    // The logger is the one place a console call is correct.
    files: ['src/lib/logger.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // The Service Worker runs in a worker global scope, not a window.
    files: ['public/sw.js'],
    languageOptions: {
      globals: { ...globals.serviceworker, ...globals.browser },
      sourceType: 'script',
    },
    rules: { 'no-console': 'off' },
  },
  {
    files: ['scripts/**/*.mjs', 'supabase/functions/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off', '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    files: ['src/test/**/*.{ts,tsx}', 'e2e/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off', 'no-console': 'off' },
  },
);
