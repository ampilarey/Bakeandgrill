/**
 * Architectural guard: surface counts / configured lists / addable types must
 * come from canonicalCatalog.ts only. A second counter was the original bug.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HUB_DIR = path.dirname(fileURLToPath(import.meta.url));

const ALLOWED_OWN_LISTERS = new Set([
  'canonicalCatalog.ts',
  // Placement primitive only — must not reintroduce count/list helpers.
  'surfaceCatalog.ts',
]);

const FORBIDDEN_SYMBOLS = [
  'countBlocksOnSurface',
  'listBlocksOnSurface',
  'listComponentsOnSurface',
];

/** Patterns that look like a parallel surface filter/count. */
const FORBIDDEN_PATTERNS: RegExp[] = [
  /function\s+(count|list)\w*OnSurface\s*\(/,
  /\.filter\s*\(\s*\(?\s*b[^)]*\)?\s*=>\s*b\.is_enabled\s*&&\s*blockOnSurface/,
];

async function loadFs(): Promise<{
  readFileSync: (p: string, e: string) => string;
  readdirSync: (p: string) => string[];
  statSync: (p: string) => { isDirectory: () => boolean };
}> {
  const fs = await import('node:fs') as unknown as {
    readFileSync: (p: string, e: string) => string;
    readdirSync: (p: string) => string[];
    statSync: (p: string) => { isDirectory: () => boolean };
  };
  return fs;
}

async function walkTsFiles(dir: string): Promise<string[]> {
  const fs = await loadFs();
  const out: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      out.push(...await walkTsFiles(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(name)) continue;
    if (/\.test\.(ts|tsx)$/.test(name) || /\.spec\.(ts|tsx)$/.test(name)) continue;
    out.push(full);
  }
  return out;
}

describe('canonicalCatalog single source of truth', () => {
  it('ContentHubPage and HomeLayoutEditor import listConfiguredOnSurface / surfaceCountLabel from canonicalCatalog', async () => {
    const fs = await loadFs();
    const page = fs.readFileSync(path.join(HUB_DIR, 'ContentHubPage.tsx'), 'utf8');
    const editor = fs.readFileSync(path.join(HUB_DIR, 'HomeLayoutEditor.tsx'), 'utf8');

    expect(page).toMatch(/from ['"]\.\/canonicalCatalog['"]/);
    expect(page).toMatch(/surfaceCountLabel/);
    expect(page).not.toMatch(/countBlocksOnSurface/);
    expect(page).not.toMatch(/listBlocksOnSurface/);

    expect(editor).toMatch(/from ['"]\.\/canonicalCatalog['"]/);
    expect(editor).toMatch(/listConfiguredOnSurface/);
    expect(editor).not.toMatch(/countBlocksOnSurface/);
    expect(editor).not.toMatch(/listBlocksOnSurface/);
    // Editor must not rebuild the type library as the configured list when filtered.
    expect(editor).toMatch(/Surface mode: configured instances only/);
  });

  it('no ContentHub production module outside canonicalCatalog reimplements surface list/count', async () => {
    const fs = await loadFs();
    const offenders: string[] = [];
    for (const file of await walkTsFiles(HUB_DIR)) {
      const base = path.relative(HUB_DIR, file);
      if (ALLOWED_OWN_LISTERS.has(base.split('/').pop() ?? '')) continue;
      const src = fs.readFileSync(file, 'utf8');
      for (const sym of FORBIDDEN_SYMBOLS) {
        if (src.includes(sym)) {
          offenders.push(`${base}: forbidden symbol ${sym}`);
        }
      }
      for (const re of FORBIDDEN_PATTERNS) {
        if (re.test(src)) {
          offenders.push(`${base}: matches ${re}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('surfaceCatalog no longer exports parallel count/list helpers', async () => {
    const fs = await loadFs();
    const src = fs.readFileSync(path.join(HUB_DIR, 'surfaceCatalog.ts'), 'utf8');
    expect(src).not.toMatch(/export function countBlocksOnSurface/);
    expect(src).not.toMatch(/export function listBlocksOnSurface/);
  });
});
