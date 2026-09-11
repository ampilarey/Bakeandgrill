#!/usr/bin/env node
/**
 * The KDS stylesheet has to stand on its own.
 *
 * It used to open with three `@tailwind` directives. Tailwind had moved to v4
 * in this workspace, and v4 does not process them, so not one utility was
 * generated: `lg:grid-cols-3` produced no columns, `p-4` no padding,
 * `rounded-xl` no corners. Every className in the app was inert and nothing
 * anywhere failed — the build was green, the tests passed, and the kitchen
 * got one unpadded stack three screens tall.
 *
 * Tailwind is out of this app's pipeline now (see src/index.css, and
 * apps/pos-web for the precedent). This is what keeps it out: a directive for
 * a framework that is not installed is the exact shape of that failure, and
 * it is invisible to tsc, to ESLint and to the browser.
 *
 * Runs as part of `npm run lint`, the same way the admin app checks hex
 * literals in its CSS.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cssPath = resolve(appDir, 'src/index.css');
const css = readFileSync(cssPath, 'utf8');
const pkg = JSON.parse(readFileSync(resolve(appDir, 'package.json'), 'utf8'));

const problems = [];

const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
const hasTailwind = 'tailwindcss' in deps || '@tailwindcss/postcss' in deps;

// Anchored to the start of a line: the file explains this history in prose,
// and a comment naming the directive is not the directive.
if (/^\s*@tailwind\b/m.test(css)) {
  problems.push(
    'src/index.css uses the `@tailwind` directive. That is Tailwind v3 syntax; '
    + (hasTailwind
      ? 'this workspace is on v4, which ignores it and silently generates nothing.'
      : 'Tailwind is not installed in this app at all, so it does nothing.'),
  );
}

if (/^\s*@import\s+["']tailwindcss["']/m.test(css) && !hasTailwind) {
  problems.push('src/index.css imports tailwindcss, but this app does not depend on it.');
}

// The board is built from these. Without them the markup has no layout, which
// is exactly the state this check exists to prevent.
const required = ['.kds-shell', '.kds-board', '.kds-lane', '.kds-lane-body', '.kds-ticket', '.kds-qty', '.kds-dish'];
const missing = required.filter((cls) => !css.includes(cls));
if (missing.length > 0) {
  problems.push(`src/index.css is missing the classes the board renders with: ${missing.join(', ')}.`);
}

if (problems.length > 0) {
  console.error('\nKDS stylesheet check failed:\n');
  for (const p of problems) console.error(`  • ${p}`);
  console.error('');
  process.exit(1);
}
