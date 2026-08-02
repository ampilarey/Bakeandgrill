#!/usr/bin/env node
/**
 * Walk src/pages/** and count hex colour literals inside style={{…}} objects.
 * Writes eslint-baselines/no-hex-in-inline-style.json (path → count).
 *
 * Re-run after Stage 2 migrations to prune the baseline as counts drop.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@typescript-eslint/parser';
import { collectHexNodes, relativeToCwd } from '../eslint-plugin-local/no-hex-in-inline-style.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const pagesRoot = path.join(appRoot, 'src/pages');
const outFile = path.join(appRoot, 'eslint-baselines/no-hex-in-inline-style.json');

function walk(dir) {
  /** @type {string[]} */
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function countInFile(filename) {
  const code = fs.readFileSync(filename, 'utf8');
  const ast = parse(code, {
    ecmaFeatures: { jsx: true },
    sourceType: 'module',
    ecmaVersion: 'latest',
    range: true,
  });

  let count = 0;

  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'JSXAttribute'
      && node.name?.type === 'JSXIdentifier'
      && node.name.name === 'style'
      && node.value?.type === 'JSXExpressionContainer'
      && node.value.expression?.type === 'ObjectExpression') {
      count += collectHexNodes(node.value.expression).length;
    }
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === 'object' && typeof child.type === 'string') visit(child);
    }
  }

  visit(ast);
  return count;
}

const baseline = {};
let total = 0;
for (const file of walk(pagesRoot).sort()) {
  const n = countInFile(file);
  if (n <= 0) continue;
  const rel = relativeToCwd(appRoot, file);
  baseline[rel] = n;
  total += n;
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(baseline, null, 2)}\n`);
console.log(`Wrote ${outFile}`);
console.log(`Files: ${Object.keys(baseline).length}; hex-in-style violations: ${total}`);
