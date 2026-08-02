import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import local from './eslint-plugin-local/index.js';

/**
 * Admin theming guard (docs/ADMIN_THEMING_MOBILE_PLAN.md).
 * Hex literals in style={{…}} under src/pages and src/components are
 * warn-level; existing counts are baselined so only regressions / new
 * violations surface.
 */
export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'eslint-plugin-local/**', 'scripts/**'],
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
    linterOptions: {
      // Many files already carry react-hooks disable comments; Stage 1 only
      // introduces the hex-in-style guard and must not fail the build.
      reportUnusedDisableDirectives: 'off',
    },
    plugins: {
      // Registered so existing eslint-disable react-hooks/* comments resolve.
      // Rules stay off — Stage 1 does not expand hooks linting.
      'react-hooks': reactHooks,
    },
    rules: {
      // Preserved from the previous .eslintrc.json
      'no-console': 'warn',
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
  {
    files: ['src/pages/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    plugins: { local },
    rules: {
      'local/no-hex-in-inline-style': ['warn', {
        baselineFile: './eslint-baselines/no-hex-in-inline-style.json',
      }],
    },
  },
];

