import { describe, expect, it } from 'vitest';

describe('shared typography (fonts.css)', () => {
  it('declares absolute /fonts/ urls, scale vars, Dhivehi auto-rule, and synced public copy', async () => {
    const fs = await import('node:fs') as unknown as {
      readFileSync: (p: string, e: string) => string;
    };
    const path = await import('node:path') as unknown as {
      dirname: (p: string) => string;
      join: (...p: string[]) => string;
      resolve: (...p: string[]) => string;
    };
    const url = await import('node:url') as unknown as { fileURLToPath: (u: string | URL) => string };

    const dir = path.dirname(url.fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(dir, '../../../..');
    const fontsCss = fs.readFileSync(path.join(repoRoot, 'packages/shared/src/styles/fonts.css'), 'utf8');

    const urls = [...fontsCss.matchAll(/url\((['"]?)([^'")]+)\1\)/g)].map((m) => m[2]);
    expect(urls.length).toBeGreaterThan(0);
    for (const fontUrl of urls) {
      expect(fontUrl.startsWith('/fonts/'), `expected absolute /fonts/ path, got ${fontUrl}`).toBe(true);
      expect(fontUrl.includes('fonts.gstatic.com') || fontUrl.includes('fonts.googleapis.com')).toBe(false);
    }

    for (const key of ['--font-ui', '--font-display', '--font-dhivehi', '--font-mono']) {
      const match = fontsCss.match(new RegExp(`${key}:\\s*([^;]+);`));
      expect(match?.[1]?.trim().length, key).toBeGreaterThan(0);
    }

    expect(fontsCss).toMatch(/\[lang=["']dv["']\]/);
    expect(fontsCss).toMatch(/\[dir=["']rtl["']\]/);
    expect(fontsCss).toMatch(/font-family:\s*var\(--font-dhivehi\)/);
    expect(fontsCss).toContain("url('/fonts/a_faruma.woff2')");
    expect(fontsCss).toContain('unicode-range: U+0780-U+07BF');

    const publicCopy = fs.readFileSync(path.join(repoRoot, 'backend/public/css/fonts.css'), 'utf8');
    expect(publicCopy).toBe(fontsCss);

    // Source CSS files that previously hardcoded the stack — must use var(--font-ui).
    const cssFiles = [
      'apps/admin-dashboard/src/index.css',
      'apps/online-order-web/src/index.css',
      'apps/delivery-web/src/index.css',
      'apps/pos-web/src/index.css',
      'apps/kds-web/src/index.css',
    ];
    for (const rel of cssFiles) {
      const text = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
      expect(text.includes("'Plus Jakarta Sans'") || text.includes('"Plus Jakarta Sans"'), rel).toBe(false);
    }

    for (const rel of [
      'apps/admin-dashboard/index.html',
      'apps/online-order-web/index.html',
      'apps/delivery-web/index.html',
      'apps/pos-web/index.html',
      'apps/kds-web/index.html',
    ]) {
      const html = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
      expect(html.includes('fonts.googleapis.com'), rel).toBe(false);
      expect(html.includes('fonts.gstatic.com'), rel).toBe(false);
    }
  });
});
