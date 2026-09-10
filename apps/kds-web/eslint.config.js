import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import { a11yPlugin, a11yRules } from '../eslint-a11y.mjs';

/**
 * Kitchen display lint (2026-09-10), the same shape as apps/pos-web and
 * apps/online-order-web. It was the one app with no linting at all, which
 * showed up while measuring accessibility across the four: rules the other
 * three enforce were simply unchecked on the screen the kitchen reads.
 *
 *   error — rules-of-hooks, no-debugger, no-var, the jsx-a11y set
 *   warn  — exhaustive-deps, no-console, prefer-const, no-explicit-any
 *
 * Errors fail CI; warnings are reported. Suppress a warning only with a
 * comment saying why.
 */
export default [
  {
    ignores: ['dist/**', 'dev-dist/**', 'node_modules/**', 'scripts/**', 'public/**', '*.config.*'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
        ecmaVersion: 'latest',
      },
    },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    plugins: { '@typescript-eslint': tsPlugin, 'react-hooks': reactHooks, 'jsx-a11y': a11yPlugin },
    rules: {
      // See apps/eslint-a11y.mjs for what is enforced and what is not.
      ...a11yRules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-debugger': 'error',
      'no-var': 'error',
      'prefer-const': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['src/**/*.test.{ts,tsx}', 'src/test/**/*.{ts,tsx}'],
    rules: { 'no-console': 'off', '@typescript-eslint/no-explicit-any': 'off' },
  },
];
