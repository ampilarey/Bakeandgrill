#!/usr/bin/env node
/**
 * Fail when any src/ CSS file has more hex literals in non-token rule
 * bodies than its per-file baseline (eslint-baselines/no-hex-in-css.json).
 *
 * Same bulk-suppression behaviour as no-hex-in-inline-style: at or under
 * baseline → silent; over baseline → report every violation in that file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findHexInCss,
  relativeToCwd,
  walkCssFiles,
} from './hex-in-css-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const baselineFile = path.join(appRoot, 'eslint-baselines/no-hex-in-css.json');

let baseline = {};
try {
  baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
} catch {
  baseline = {};
}

let failed = false;
for (const file of walkCssFiles(appRoot)) {
  const rel = relativeToCwd(appRoot, file);
  const allowed = typeof baseline[rel] === 'number' ? baseline[rel] : 0;
  const all = findHexInCss(fs.readFileSync(file, 'utf8'));
  const violations = all.filter((h) => !h.legal);
  if (violations.length === 0) continue;
  if (violations.length <= allowed) continue;

  failed = true;
  console.error(
    `${rel}: ${violations.length} hex literal(s) in rule bodies (baseline ${allowed})`,
  );
  for (const v of violations) {
    console.error(`  ${rel}:${v.line}: ${v.hex}`);
  }
  console.error(
    `  Prefer CSS variables (see CLAUDE.md Admin colour tokens). Re-baseline with npm run lint:baseline:hex-css only after intentional reductions.`,
  );
}

if (failed) {
  process.exit(1);
}
