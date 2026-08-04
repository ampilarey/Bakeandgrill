import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * POS tender path: Math.round(n * 100).
 * Must stay in lockstep with App\Support\LaariConverter::toLaar via the
 * shared fixtures/mvr_to_laari_parity.json table — do not rewrite either side
 * from this test.
 */
function toLaari(n: number): number {
  return Math.round(Number(n) * 100);
}

const REPO_RELATIVE = 'fixtures/mvr_to_laari_parity.json';

function loadFixture(): {
  repo_relative_path: string;
  pairs: Array<{ input: number; expected_laari: number }>;
  known_divergences: Array<{
    input: number;
    js_laari: number;
    php_bcmath_laari: number;
    php_float_fallback_laari: number;
  }>;
} {
  const here = dirname(fileURLToPath(import.meta.url));
  // apps/pos-web/src/utils → repo root is 4 levels up
  const path = resolve(here, '../../../../', REPO_RELATIVE);
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw) as ReturnType<typeof loadFixture>;
}

describe('MVR→laari parity (shared fixture)', () => {
  it('reads the shared repo-root fixture file', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const path = resolve(here, '../../../../', REPO_RELATIVE);
    expect(path.replace(/\\/g, '/')).toMatch(new RegExp(`/${REPO_RELATIVE}$`));
    expect(readFileSync(path, 'utf8').length).toBeGreaterThan(0);
    const fixture = loadFixture();
    expect(fixture.repo_relative_path).toBe(REPO_RELATIVE);
  });

  it('Math.round(n*100) matches every agreeing pair in the shared table', () => {
    const fixture = loadFixture();
    expect(fixture.pairs.length).toBeGreaterThan(0);
    for (const pair of fixture.pairs) {
      expect(toLaari(pair.input), `JS toLaari(${pair.input})`).toBe(pair.expected_laari);
    }
  });

  it('documents the known 1.005 divergence without papering it over', () => {
    const fixture = loadFixture();
    const row = fixture.known_divergences.find((d) => d.input === 1.005);
    expect(row).toBeTruthy();
    expect(toLaari(1.005)).toBe(100);
    expect(row!.js_laari).toBe(100);
    expect(row!.php_bcmath_laari).toBe(101);
    // JS must NOT silently match the bcmath side — that would hide the gap.
    expect(toLaari(1.005)).not.toBe(row!.php_bcmath_laari);
  });

  it('fixture and vitest resolve to the same absolute path shape', () => {
    const fromUrl = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../', REPO_RELATIVE);
    const fromJoin = join(resolve(dirname(fileURLToPath(import.meta.url)), '../../../..'), REPO_RELATIVE);
    expect(resolve(fromUrl)).toBe(resolve(fromJoin));
  });
});
