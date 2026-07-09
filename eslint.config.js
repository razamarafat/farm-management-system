// Flat ESLint v9 config. Focus: enforce React's Rules-of-Hooks across src/.
// Background: the project previously had no ESLint; the official
// `eslint-plugin-react-hooks` with the `rules-of-hooks` rule catches every
// conditional hook call (e.g. `useMemo` after an early-return) before it
// reaches production. This config deliberately keeps the rule surface
// narrow so the lint output stays focused on the audit.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  // Base recommended JS rules.
  js.configs.recommended,
  // TypeScript parsing — knobs (parse) only, not strict type-checking
  // (which would output unrelated noise). tsc handles deep type-checks.
  ...tseslint.configs.recommended,
  // Manually wire `eslint-plugin-react-hooks` as a flat-config object.
  // (We can't spread `reactHooks.configs.recommended` because that
  // exports a legacy-format config with `plugins: [...]` as an array,
  // which v9 flat-config rejects.)
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: { ...globals.browser },
    },
    rules: {
      // ENFORCE — any violation is a deterministic production crash
      // (React's «Rendered more hooks than during the previous render.»
      // error surfaces only at runtime).
      'react-hooks/rules-of-hooks': 'error',
      // Lower-severity warning (catches missing/incorrect dep arrays).
      'react-hooks/exhaustive-deps': 'warn',
      // Quieten noisy default findings so the audit output stays focused
      // on hooks violations.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'service*/**',
      '.vite/**',
      'scripts/check-conflicts.mjs',
      'scripts/check-env.mjs',
      'scripts/check-secrets.mjs',
      'scripts/check-legacy-admin.mjs',
    ],
  },
];
