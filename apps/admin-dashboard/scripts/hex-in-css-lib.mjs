/**
 * Count hex colour literals in CSS rule bodies outside token-definition blocks.
 *
 * LEGAL: hexes inside `:root { … }` and `[data-theme="…"] { … }` (including
 * nested rules within those blocks — those ARE the variable definitions).
 * VIOLATION: any other hex in a rule body (depth ≥ 1).
 *
 * Block detection uses brace-depth tracking. A line-regex on `[data-theme]`
 * would either leak into sibling rules (`[data-theme="dark"] body { … }`) or
 * exempt the whole file when the dark block contains nested rules.
 */
import fs from 'node:fs';
import path from 'node:path';

const HEX = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

/** @param {string} s */
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/** @param {string} sel */
function isTokenSelector(sel) {
  const t = sel.replace(/\s+/g, ' ').trim();
  if (t === ':root') return true;
  return /^\[data-theme\s*=\s*["'][^"']+["']\]$/.test(t);
}

/**
 * @param {string} css
 * @returns {{ line: number, hex: string, legal: boolean }[]}
 */
export function findHexInCss(css) {
  const src = stripComments(css);
  const n = src.length;
  let depth = 0;
  let inString = null;
  /** @type {boolean[]} index = depth → whether that block is inside a token def */
  const exemptStack = [false];
  /** @type {string[]} */
  let selChars = [];
  /** @type {{ line: number, hex: string, legal: boolean }[]} */
  const found = [];
  let i = 0;

  while (i < n) {
    const c = src[i];

    if (inString) {
      if (c === inString && src[i - 1] !== '\\') inString = null;
      selChars.push(c);
      i += 1;
      continue;
    }

    if (c === '"' || c === "'") {
      inString = c;
      selChars.push(c);
      i += 1;
      continue;
    }

    if (c === '{') {
      let sel = selChars.join('').trim();
      if (sel.includes(';')) sel = sel.split(';').pop().trim();
      while (exemptStack.length <= depth) exemptStack.push(false);
      const parentExempt = exemptStack[depth];
      const token = isTokenSelector(sel);
      depth += 1;
      while (exemptStack.length <= depth) exemptStack.push(false);
      exemptStack[depth] = parentExempt || token;
      selChars = [];
      i += 1;
      continue;
    }

    if (c === '}') {
      depth = Math.max(0, depth - 1);
      selChars = [];
      i += 1;
      continue;
    }

    // End of a declaration — next chars may be a nested selector.
    if (c === ';' && depth > 0) {
      selChars = [];
      i += 1;
      continue;
    }

    if (c === '#') {
      HEX.lastIndex = i;
      const m = HEX.exec(src);
      if (m && m.index === i) {
        if (depth >= 1) {
          found.push({
            line: src.slice(0, i).split('\n').length,
            hex: m[0],
            legal: Boolean(exemptStack[depth]),
          });
        }
        i = m.index + m[0].length;
        continue;
      }
    }

    selChars.push(c);
    i += 1;
  }

  return found;
}

/** @param {string} css */
export function countViolations(css) {
  return findHexInCss(css).filter((h) => !h.legal).length;
}

/**
 * @param {string} rootDir absolute path to app root (apps/admin-dashboard)
 * @returns {string[]} absolute paths
 */
export function walkCssFiles(rootDir) {
  const srcDir = path.join(rootDir, 'src');
  /** @type {string[]} */
  const files = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.css')) files.push(full);
    }
  }
  walk(srcDir);
  return files.sort();
}

/** @param {string} cwd @param {string} filename */
export function relativeToCwd(cwd, filename) {
  return path.relative(cwd, filename).replace(/\\/g, '/');
}

export { HEX };
