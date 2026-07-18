#!/usr/bin/env node
/**
 * Grid check for MenuPage §15 (2 columns at phone widths).
 * Asserts MenuPage uses .menu-grid (not inline minmax) and CSS is deterministic:
 *   <768px → repeat(2, 1fr); ≥768px → auto-fill minmax(190px).
 * Optional: if Playwright is installed and ORDER_AUDIT_URL is set, capture
 * 390px + 320px screenshots and assert 2 columns / no horizontal scroll.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const menuPath = join(root, 'apps/online-order-web/src/pages/MenuPage.tsx');
const cssPath = join(root, 'apps/online-order-web/src/index.css');
const menuSrc = readFileSync(menuPath, 'utf8');
const cssSrc = readFileSync(cssPath, 'utf8');

const classHits = (menuSrc.match(/className="menu-grid"/g) || []).length;
const inlineMinmax = (menuSrc.match(/gridTemplateColumns[\s\S]{0,80}minmax\(/g) || []).length;
const hasTwoFr = /\.menu-grid\s*\{[^}]*repeat\(2,\s*1fr\)/s.test(cssSrc);
const hasDesktopAutoFill = /@media\s*\(min-width:\s*768px\)\s*\{[^}]*\.menu-grid[^}]*minmax\(190px/s.test(cssSrc);

if (inlineMinmax > 0) {
  console.error(`FAIL: MenuPage still has inline minmax gridTemplateColumns (${inlineMinmax})`);
  process.exit(1);
}
if (classHits < 4) {
  console.error(`FAIL: expected ≥4 className="menu-grid", found ${classHits}`);
  process.exit(1);
}
if (!hasTwoFr || !hasDesktopAutoFill) {
  console.error('FAIL: index.css .menu-grid rules missing (need repeat(2,1fr) + 768px auto-fill 190px)');
  process.exit(1);
}
console.log(`grid: ok (${classHits}× .menu-grid — repeat(2,1fr) <768px, auto-fill≥768px)`);

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
const base = url.replace(/\/$/, '');
const browser = await playwright.chromium.launch();

async function checkViewport(width, height, label) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`${base}/menu`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.menu-grid > *', { timeout: 30_000 });
  // Prefer a grid that has real product cards (not only skeletons)
  await page.waitForFunction(() => {
    const grids = [...document.querySelectorAll('.menu-grid')];
    return grids.some((g) => g.querySelector('article, a, button'));
  }, { timeout: 15_000 }).catch(() => {});
  const metrics = await page.evaluate(() => {
    const grids = [...document.querySelectorAll('.menu-grid')];
    const grid =
      grids.find((g) => g.querySelector('article, a, button')) ||
      grids.find((g) => g.children.length >= 2);
    if (!grid) return { error: 'no .menu-grid' };
    const style = getComputedStyle(grid);
    const cols = style.gridTemplateColumns;
    const tracks = cols.split(/\s+/).filter((t) => t && t !== 'none');
    const children = [...grid.children];
    const firstTop = children[0]?.getBoundingClientRect().top;
    const firstRowCount = children.filter(
      (c) => Math.abs(c.getBoundingClientRect().top - firstTop) < 2,
    ).length;
    const hscroll = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    return { cols, trackCount: tracks.length, firstRowCount, hscroll };
  });
  const out = join(outDir, `menu-${label}.png`);
  await page.screenshot({ path: out, fullPage: false });
  await page.close();
  writeFileSync(join(outDir, `menu-${label}.txt`), `${JSON.stringify(metrics, null, 2)}\n`);
  console.log(`screenshot ${label}: ${out}`);
  console.log(`  metrics: ${JSON.stringify(metrics)}`);
  if (metrics.error) {
    console.error(`FAIL ${label}: ${metrics.error}`);
    return false;
  }
  if (metrics.firstRowCount < 2 || metrics.trackCount < 2) {
    console.error(`FAIL ${label}: expected 2 columns, got firstRowCount=${metrics.firstRowCount} tracks=${metrics.trackCount}`);
    return false;
  }
  if (metrics.hscroll) {
    console.error(`FAIL ${label}: horizontal scroll detected`);
    return false;
  }
  return true;
}

const ok390 = await checkViewport(390, 844, '390');
const ok320 = await checkViewport(320, 568, '320');
await browser.close();

if (!ok390 || !ok320) process.exit(1);
console.log('screenshot: ok (2 cols at 390px & 320px, no hscroll)');
