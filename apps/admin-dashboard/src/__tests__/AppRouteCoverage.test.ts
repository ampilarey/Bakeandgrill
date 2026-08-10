import { describe, it, expect } from 'vitest';
import { getAllNavItems, navItemPathname } from '../components/navConfig';

async function readAppTsx(): Promise<string> {
  const fs = await import('node:fs') as { readFileSync: (p: string, e: string) => string };
  const path = await import('node:path') as { dirname: (p: string) => string; join: (...p: string[]) => string };
  const url = await import('node:url') as { fileURLToPath: (u: string) => string };
  const dir = path.dirname(url.fileURLToPath(import.meta.url));
  return fs.readFileSync(path.join(dir, '../App.tsx'), 'utf8');
}

/** Extract path="..." route strings from App.tsx (admin SPA). */
function appRoutePaths(src: string): string[] {
  const paths: string[] = [];
  for (const m of src.matchAll(/path=["']([^"']+)["']/g)) {
    paths.push(m[1]);
  }
  return paths;
}

describe('App route coverage', () => {
  it('every App.tsx page route is in navConfig or an intentional redirect/alias', async () => {
    const src = await readAppTsx();
    const navPaths = new Set(
      getAllNavItems(true).map((i) => navItemPathname(i.to).replace(/^\//, '')),
    );
    const allowedOutsideNav = new Set([
      '/login',
      '/*',
      '*',
      'account',
      // Legacy content aliases → /content (tested below)
      'content/website',
      'content/order-app',
      'content-studio',
      // Nested under settings/* wildcard — path segments handled by SettingsPage
      'settings/*',
      // Nested catering detail (parent /catering is in nav)
      'catering/:id',
      // Nested wholesale account detail (parent /wholesale is in nav)
      'wholesale/:id',
      // Delivery tab of Ordering Control — aliased to /online-ordering in NAV_PATH_ALIASES
      'delivery-settings',
    ]);

    const routes = appRoutePaths(src);
    expect(routes.length).toBeGreaterThan(40);

    for (const path of routes) {
      if (allowedOutsideNav.has(path)) continue;
      if (path.includes(':')) continue;
      if (path.endsWith('/*')) {
        const base = path.replace(/\/\*$/, '');
        expect(
          navPaths.has(base) || [...navPaths].some((n) => n.startsWith(base + '/')),
          `${path} should be represented in nav`,
        ).toBe(true);
        continue;
      }
      expect(
        navPaths.has(path) || [...navPaths].some((n) => n === path || path.startsWith(n + '/')),
        `App route "${path}" missing from navConfig and not listed as intentional alias`,
      ).toBe(true);
    }
  });

  it('legacy content routes redirect to /content in App.tsx', async () => {
    const src = await readAppTsx();
    expect(src).toContain('path="content/website"');
    expect(src).toContain('path="content/order-app"');
    expect(src).toContain('path="content-studio"');
    expect(src).toMatch(/content\/website[^]*Navigate to="\/content"/);
    expect(src).toMatch(/content\/order-app[^]*Navigate to="\/content"/);
    expect(src).toMatch(/content-studio[^]*Navigate to="\/content"/);
  });
});
