import { describe, expect, it } from 'vitest';
import { applyBrandPalette, deriveBrandPalette } from './brandPalette';

// Mirror of backend BrandPaletteTest: the two must agree, or the website and
// the order app would show different accents for the same setting.
describe('deriveBrandPalette', () => {
  it('returns null for anything that is not a hex colour', () => {
    expect(deriveBrandPalette('')).toBeNull();
    expect(deriveBrandPalette('B74B0C')).toBeNull();
    expect(deriveBrandPalette('rust')).toBeNull();
  });

  it('gives the brand rust cream text and a lighter shade for dark surfaces', () => {
    const tokens = deriveBrandPalette('#b74b0c');
    expect(tokens).not.toBeNull();
    expect(tokens!.primary).toBe('#B74B0C');
    expect(tokens!.hover).toBe('#A1420B');
    expect(tokens!.light).toBe('#F9F1EC');
    expect(tokens!.contrast).toBe('#FFFDF9');
    expect(tokens!.darkPrimary).toBe('#C56F3D');
    expect(tokens!.onDark).toBe('#C56F3D');
    expect(tokens!.darkContrast).toBe('#1C1408');
  });

  it('leaves the old amber where it was', () => {
    // The colour the site used until 2026-09-30, spelled out so the swap
    // script that retired it does not rewrite this expectation.
    const oldAmber = '#' + ['D4', '81', '3A'].join('');
    const tokens = deriveBrandPalette(oldAmber);
    expect(tokens!.contrast).toBe('#1C1408');
    expect(tokens!.darkPrimary).toBe('#' + ['D8', '8E', '4E'].join(''));
  });
});

describe('applyBrandPalette', () => {
  it('lets dark mode replace the inline light accent (UI audit, 2026-10-10)', () => {
    const cleanup = applyBrandPalette(deriveBrandPalette('#b74b0c'));
    const css = document.head.querySelector('style[data-brand-palette]')?.textContent ?? '';

    // Inline :root styles beat stylesheet rules unless those are !important.
    expect(document.documentElement.style.getPropertyValue('--color-primary-light')).toBe('#F9F1EC');
    expect(css).toMatch(/--color-primary-light:rgba\([^)]*\) !important;/);
    expect(css).toMatch(/--color-primary:#C56F3D !important;/);

    cleanup();
    expect(document.head.querySelector('style[data-brand-palette]')).toBeNull();
  });
});
