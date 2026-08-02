#!/usr/bin/env node
/**
 * Walk src/ CSS files and count hex colour literals in rule bodies outside
 * `:root` / `[data-theme="…"]` token blocks.
 * Writes eslint-baselines/no-hex-in-css.json (path → count).
 *
 * Re-run after CSS migrations to prune the baseline as counts drop.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { countViolations, relativeToCwd, walkCssFiles } from './hex-in-css-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const outFile = path.join(appRoot, 'eslint-baselines/no-hex-in-css.json');

const baseline = {};
let total = 0;
for (const file of walkCssFiles(appRoot)) {
  const n = countViolations(fs.readFileSync(file, 'utf8'));
  if (n <= 0) continue;
  const rel = relativeToCwd(appRoot, file);
  baseline[rel] = n;
  total += n;
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(baseline, null, 2)}\n`);
console.log(`Wrote ${outFile}`);
console.log(`Files: ${Object.keys(baseline).length}; hex-in-css violations: ${total}`);
