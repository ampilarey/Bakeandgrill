import { describe, expect, it } from 'vitest';
import { brandLogoSrc } from './brandLogo';

describe('brandLogoSrc', () => {
  it('uses logo_dark in dark mode and falls back to logo', () => {
    expect(brandLogoSrc({ logo: '/light.png', logo_dark: '/dark.png' }, true)).toBe('/dark.png');
    expect(brandLogoSrc({ logo: '/light.png', logo_dark: '/dark.png' }, false)).toBe('/light.png');
    expect(brandLogoSrc({ logo: '/light.png', logo_dark: '' }, true)).toBe('/light.png');
    expect(brandLogoSrc({ logo: '/light.png' }, true)).toBe('/light.png');
    expect(brandLogoSrc({}, false)).toBe('/logo.png');
  });
});
