#!/usr/bin/env node
/**
 * Mobile-first guard (owner, 2026-10-20: "I want change everything mobile 1st rule. Not
 * now. Slowly"). A desktop-first rule is an `@media` that narrows with `max-width` and has
 * no `min-width` (a band such as `(min-width: 768px) and (max-width: 1023px)` is fine, and so
 * is a short-screen band that also caps the height, such as the till's phone-landscape
 * `(max-width: 900px) and (max-height: 500px)`: no computer layout is squeezed by it).
 * Old files keep the count they had in `scripts/mobile-first-baseline.json`; a file may
 * only go down, and a new file has none. Rules and how to convert a page:
 * docs/MOBILE_FIRST.md.
 *
 *   node scripts/check-mobile-first.mjs            check (CI)
 *   node scripts/check-mobile-first.mjs --update   rewrite the baseline after converting
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const BASELINE = join(ROOT, 'scripts/mobile-first-baseline.json');
const DIRS = [
  'apps/admin-dashboard/src', 'apps/online-order-web/src', 'apps/pos-web/src',
  'apps/kds-web/src', 'apps/delivery-web/src', 'packages/shared/src',
  'backend/resources/views', 'backend/resources/css',
];
const EXT = /\.(css|tsx?|blade\.php)$/;
const SKIP = /(__tests__|\.test\.|\.spec\.|node_modules)/;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (SKIP.test(p)) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXT.test(name)) out.push(p);
  }
  return out;
}

function desktopFirst(text) {
  let n = 0;
  for (const m of text.matchAll(/@media\s+([^{]*)\{/g)) {
    const branches = m[1].split(',');
    if (branches.some((q) => /max-width/.test(q) && !/min-width/.test(q) && !/max-height/.test(q))) n++;
  }
  return n;
}

const counts = {};
for (const d of DIRS) {
  for (const f of walk(join(ROOT, d))) {
    const n = desktopFirst(readFileSync(f, 'utf8'));
    if (n > 0) counts[relative(ROOT, f)] = n;
  }
}
const total = Object.values(counts).reduce((a, b) => a + b, 0);

if (process.argv.includes('--update')) {
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE, JSON.stringify(sorted, null, 2) + '\n');
  console.log(`Mobile-first baseline written: ${total} desktop-first rules in ${Object.keys(counts).length} files.`);
  process.exit(0);
}

const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
const baseTotal = Object.values(base).reduce((a, b) => a + b, 0);
const worse = Object.entries(counts).filter(([f, n]) => n > (base[f] ?? 0));
if (worse.length) {
  console.error('Desktop-first @media (max-width without min-width) added. Write the phone layout first and widen with min-width (docs/MOBILE_FIRST.md):');
  for (const [f, n] of worse) console.error(`  ${f}: ${n} (allowed ${base[f] ?? 0})`);
  process.exit(1);
}
const better = Object.entries(base).filter(([f, n]) => (counts[f] ?? 0) < n);
console.log(`Mobile-first: ${total} desktop-first rules left (baseline ${baseTotal}).`);
if (better.length) console.log('Fewer than the baseline in ' + better.map(([f]) => f).join(', ') + '. Run with --update to lock it in.');
