/**
 * Ban hex colour literals inside JSX style={{ … }} object expressions.
 *
 * Existing violations are baselined per file (count). When a file's live
 * count stays at or below its baseline, nothing is reported. When the count
 * exceeds the baseline, every hex literal in that file's style objects is
 * reported — matching ESLint bulk-suppression behaviour — so new violations
 * cannot hide among the old ones.
 */

import fs from 'node:fs';
import path from 'node:path';

const HEX_IN_STRING = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;

/** @type {Map<string, Record<string, number>>} */
const baselineCache = new Map();

function loadBaseline(cwd, baselineFile) {
  if (!baselineFile) return {};
  const abs = path.resolve(cwd, baselineFile);
  if (baselineCache.has(abs)) return baselineCache.get(abs);
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch {
    data = {};
  }
  baselineCache.set(abs, data);
  return data;
}

function relativeToCwd(cwd, filename) {
  const rel = path.relative(cwd, filename).replace(/\\/g, '/');
  return rel;
}

function collectHexNodes(objectExpression) {
  /** @type {import('estree').Node[]} */
  const nodes = [];

  function visit(node) {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'ObjectExpression') {
      for (const prop of node.properties) {
        if (prop.type === 'Property') visit(prop.value);
        else if (prop.type === 'SpreadElement') visit(prop.argument);
      }
      return;
    }

    if (node.type === 'ArrayExpression') {
      for (const el of node.elements) visit(el);
      return;
    }

    if (node.type === 'Literal' && typeof node.value === 'string' && HEX_IN_STRING.test(node.value)) {
      nodes.push(node);
      return;
    }

    if (node.type === 'TemplateLiteral') {
      const raw = node.quasis.map((q) => q.value.cooked ?? q.value.raw ?? '').join('');
      if (HEX_IN_STRING.test(raw)) nodes.push(node);
      return;
    }

    if (node.type === 'ConditionalExpression') {
      visit(node.consequent);
      visit(node.alternate);
      return;
    }

    if (node.type === 'LogicalExpression') {
      visit(node.left);
      visit(node.right);
    }
  }

  visit(objectExpression);
  return nodes;
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow hex colour literals inside JSX style={{…}} objects under pages',
    },
    schema: [
      {
        type: 'object',
        properties: {
          baselineFile: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      hexInStyle:
        'Avoid hex colour literals in style={{…}}; prefer CSS variables (see CLAUDE.md Admin colour tokens). Found: {{snippet}}',
    },
  },

  create(context) {
    const cwd = context.cwd ?? process.cwd();
    const filename = context.filename ?? context.getFilename();
    if (!filename || filename === '<input>') return {};

    const options = context.options[0] ?? {};
    const baseline = loadBaseline(cwd, options.baselineFile);
    const rel = relativeToCwd(cwd, filename);
    const allowed = typeof baseline[rel] === 'number' ? baseline[rel] : 0;

    /** @type {import('estree').Node[]} */
    const found = [];

    return {
      JSXAttribute(node) {
        if (node.name?.type !== 'JSXIdentifier' || node.name.name !== 'style') return;
        if (!node.value || node.value.type !== 'JSXExpressionContainer') return;
        const expr = node.value.expression;
        if (!expr || expr.type !== 'ObjectExpression') return;
        found.push(...collectHexNodes(expr));
      },

      'Program:exit'() {
        if (found.length === 0) return;
        // At or under baseline → fully suppressed.
        if (found.length <= allowed) return;
        // Over baseline → surface every occurrence (cannot hide new ones).
        for (const node of found) {
          let snippet = '';
          if (node.type === 'Literal' && typeof node.value === 'string') {
            snippet = node.value.length > 40 ? `${node.value.slice(0, 40)}…` : node.value;
          } else if (node.type === 'TemplateLiteral') {
            snippet = '(template literal)';
          }
          context.report({
            node,
            messageId: 'hexInStyle',
            data: { snippet },
          });
        }
      },
    };
  },
};

export default rule;
export { collectHexNodes, HEX_IN_STRING, relativeToCwd };
