import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Order app lint (2026-09-03), the same shape as apps/pos-web. Type errors
 * and unused code are tsc's job (noUnusedLocals is on); this is about React
 * correctness and a few habits:
 *
 *   error — rules-of-hooks, no-debugger, no-var
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
    plugins: { '@typescript-eslint': tsPlugin, 'react-hooks': reactHooks },
    rules: {
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
