#!/usr/bin/env node
/**
 * Fail when a src/ CSS comment opens another comment before it closes, or
 * never closes at all.
 *
 * CSS comments do not nest: when a comment loses its closer it runs on to
 * the next comment's closer, and every rule in between silently disappears.
 * The build does not warn. That is how the website editor's Desktop / Mobile
 * switch and "View live site" link lost their styles until 2026-10-08.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { relativeToCwd, walkCssFiles } from './hex-in-css-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');

/**
 * Offsets of comments that swallow code. Quoted strings are skipped, so a
 * glob such as '../**' + '/*.tsx' is not mistaken for a comment.
 * @param {string} css
 * @returns {number[]}
 */
function swallowingComments(css) {
  /** @type {number[]} */
  const found = [];
  let quote = null;
  let i = 0;
  while (i < css.length) {
    const c = css[i];
    if (quote) {
      if (c === '\\') i += 1;
      else if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      i += 1;
      continue;
    }
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end === -1 || css.slice(i + 2, end).includes('/*')) found.push(i);
      i = end === -1 ? css.length : end + 2;
      continue;
    }
    i += 1;
  }
  return found;
}

let failed = false;
for (const file of walkCssFiles(appRoot)) {
  const css = fs.readFileSync(file, 'utf8');
  for (const offset of swallowingComments(css)) {
    failed = true;
    const line = css.slice(0, offset).split('\n').length;
    console.error(
      `${relativeToCwd(appRoot, file)}:${line}: this comment is not closed before the next one opens, so the rules between them are ignored`,
    );
  }
}

if (failed) {
  process.exit(1);
}
