#!/usr/bin/env node
/**
 * Lightweight grid check for MenuPage §15 (2 columns at 390px).
 * Asserts all MenuPage product grids use minmax(130px, …).
 * Optional: if Playwright is installed and ORDER_AUDIT_URL is set, capture
 * a 390px menu screenshot under scripts/ui-audit/out/.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const menuPath = join(root, 'apps/online-order-web/src/pages/MenuPage.tsx');
const menuSrc = readFileSync(menuPath, 'utf8');

const bad = (menuSrc.match(/minmax\(190px/g) || []).length;
const good = (menuSrc.match(/minmax\(130px/g) || []).length;

if (bad > 0) {
  console.error(`FAIL: MenuPage still has minmax(190px) (${bad} hits)`);
  process.exit(1);
}
if (good < 4) {
  console.error(`FAIL: expected ≥4 minmax(130px) grids, found ${good}`);
  process.exit(1);
}
console.log(`grid: ok (${good}× minmax(130px) — 2 columns at ~390px with 90px rail)`);

const url = process.env.ORDER_AUDIT_URL;
if (!url) {
  console.log('screenshot: skipped (set ORDER_AUDIT_URL to capture)');
  process.exit(0);
}

let playwright;
try {
  playwright = await import('playwright');
} catch {
  console.log('screenshot: skipped (playwright not installed)');
  process.exit(0);
}

const outDir = join(root, 'scripts/ui-audit/out');
mkdirSync(outDir, { recursive: true });
const browser = await playwright.chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(`${url.replace(/\/$/, '')}/menu`, { waitUntil: 'networkidle', timeout: 60_000 });
const out = join(outDir, 'menu-390.png');
await page.screenshot({ path: out, fullPage: false });
await browser.close();
writeFileSync(join(outDir, 'menu-390.txt'), `Wrote ${out}\n`);
console.log(`screenshot: ${out}`);
