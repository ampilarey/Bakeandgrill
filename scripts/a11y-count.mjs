#!/usr/bin/env node
/**
 * Count accessibility violations per rule, across every app.
 *
 * The app eslint configs enforce the jsx-a11y rules that are already at zero
 * and warn on one family that is not; two labelling rules are switched off
 * there because their counts are in the hundreds. That decision is only
 * defensible while the numbers behind it are checkable, so this runs the
 * plugin's *entire* rule set — enforced, warned, switched off and deprecated
 * alike — and prints the tally.
 *
 *   node scripts/a11y-count.mjs
 *   node scripts/a11y-count.mjs pos-web        # one app
 *
 * Deprecated rules are marked. They are not worth acting on: label-has-for was
 * replaced by label-has-associated-control, and no-onchange and
 * accessible-emoji describe browser behaviour that has since changed.
 */
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const a11y = (await import(path.join(root, 'node_modules/eslint-plugin-jsx-a11y/lib/index.js'))).default;

const ALL_APPS = ['admin-dashboard', 'pos-web', 'online-order-web', 'kds-web'];
const apps = process.argv.slice(2).length ? process.argv.slice(2) : ALL_APPS;

const recommended = new Set(
  Object.entries(a11y.flatConfigs.recommended.rules)
    .filter(([, level]) => (Array.isArray(level) ? level[0] : level) !== 'off')
    .map(([id]) => id),
);
const deprecated = new Set(
  Object.entries(a11y.rules)
    .filter(([, rule]) => rule.meta?.deprecated)
    .map(([name]) => `jsx-a11y/${name}`),
);

const perApp = {};
const total = {};

for (const app of apps) {
  const dir = path.join(root, 'apps', app);
  if (!fs.existsSync(path.join(dir, 'src'))) {
    console.error(`skipping ${app}: no src directory`);
    continue;
  }
  const eslint = new ESLint({
    cwd: dir,
    overrideConfigFile: true, // ignore the app's own config; measure in isolation
    overrideConfig: [
      {
        files: ['**/*.{ts,tsx,js,jsx}'],
        languageOptions: {
          parser: (await import(path.join(root, 'node_modules/@typescript-eslint/parser/dist/index.js'))).default,
          parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module', ecmaVersion: 'latest' },
        },
        plugins: { 'jsx-a11y': a11y },
        rules: Object.fromEntries(Object.keys(a11y.rules).map((r) => [`jsx-a11y/${r}`, 'warn'])),
      },
    ],
  });

  perApp[app] = {};
  for (const file of await eslint.lintFiles([path.join(dir, 'src')])) {
    for (const msg of file.messages) {
      // A rule the isolated config does not define shows up here when a source
      // file carries an eslint-disable for it. Not a violation.
      if (!msg.ruleId || !msg.ruleId.startsWith('jsx-a11y/')) continue;
      if (msg.message.startsWith('Definition for rule')) continue;
      perApp[app][msg.ruleId] = (perApp[app][msg.ruleId] ?? 0) + 1;
      total[msg.ruleId] = (total[msg.ruleId] ?? 0) + 1;
    }
  }
}

const rules = Object.keys(total).sort((a, b) => total[b] - total[a]);
const width = Math.max(...rules.map((r) => r.length), 20);
const col = (app) => Math.max(app.length, 6);

const header = `${'rule'.padEnd(width)}  ${apps.map((a) => a.padStart(col(a))).join('  ')}  ${'total'.padStart(7)}`;
console.log('');
console.log(header);
console.log('-'.repeat(header.length));
for (const rule of rules) {
  const tag = deprecated.has(rule) ? '  (deprecated)' : recommended.has(rule) ? '' : '  (off in the plugin\'s own recommended set)';
  console.log(
    `${rule.padEnd(width)}  ${apps.map((a) => String(perApp[a]?.[rule] ?? 0).padStart(col(a))).join('  ')}  ${String(total[rule]).padStart(7)}${tag}`,
  );
}
console.log('');
console.log(`${rules.length} rules with at least one violation; ${Object.values(total).reduce((s, n) => s + n, 0)} in total.`);
console.log(`${Object.keys(a11y.rules).length - rules.length} of the plugin's rules are clean everywhere.`);
console.log('');
