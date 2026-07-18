#!/usr/bin/env node
/**
 * Verifies dark theme is applied at boot (before React mount).
 * Simulates the main.tsx snippet with theme=dark in localStorage.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const mainPath = join(root, 'apps/online-order-web/src/main.tsx');
const mainSrc = readFileSync(mainPath, 'utf8');

if (
  !mainSrc.includes("localStorage.getItem('theme') === 'dark'") ||
  !mainSrc.includes('document.documentElement.dataset.theme')
) {
  console.error('FAIL: boot theme apply missing from main.tsx');
  process.exit(1);
}

const store = { theme: 'dark' };
const localStorage = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
};
const document = { documentElement: { dataset: {} } };

try {
  document.documentElement.dataset.theme =
    localStorage.getItem('theme') === 'dark' ? 'dark' : '';
} catch {
  /* private mode */
}

const theme = document.documentElement.dataset.theme || '';
console.log(`data-theme: ${theme || '(empty)'}`);
if (theme !== 'dark') {
  console.error('FAIL: expected data-theme dark');
  process.exit(1);
}
