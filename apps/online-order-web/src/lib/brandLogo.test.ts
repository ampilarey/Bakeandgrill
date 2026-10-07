import { describe, expect, it } from 'vitest';
import { brandLogoSrc, isStandardItemTile, isStandardLogo } from './brandLogo';

describe('brandLogoSrc', () => {
  it('uses logo_dark in dark mode and falls back to logo', () => {
    expect(brandLogoSrc({ logo: '/light.png', logo_dark: '/dark.png' }, true)).toBe('/dark.png');
    expect(brandLogoSrc({ logo: '/light.png', logo_dark: '/dark.png' }, false)).toBe('/light.png');
    expect(brandLogoSrc({ logo: '/light.png', logo_dark: '' }, true)).toBe('/light.png');
    expect(brandLogoSrc({ logo: '/light.png' }, true)).toBe('/light.png');
    expect(brandLogoSrc({}, false)).toBe('/logo.png');
  });
});

describe('isStandardLogo', () => {
  it('is true only while Admin keeps the standard logo', () => {
    expect(isStandardLogo({})).toBe(true);
    expect(isStandardLogo({ logo: '/brand/logo-light.png', logo_dark: '/brand/logo-dark.png' })).toBe(true);
    expect(isStandardLogo({ logo: 'https://bakeandgrill.mv/brand/logo-light.png?v=2' })).toBe(true);
    expect(isStandardLogo({ logo: '/logo.png', logo_dark: '' })).toBe(true);
    expect(isStandardLogo({ logo: '/storage/media/our-new-logo.png' })).toBe(false);
    expect(isStandardLogo({ logo: '/brand/logo-light.png', logo_dark: '/storage/media/dark.png' })).toBe(false);
  });
});

describe('isStandardItemTile', () => {
  it('is true only for the shipped no-photo tile', () => {
    expect(isStandardItemTile('/brand/default-item-image.png')).toBe(true);
    expect(isStandardItemTile('https://bakeandgrill.mv/brand/default-item-image.png?v=3')).toBe(true);
    expect(isStandardItemTile('/storage/site/our-tile.png')).toBe(false);
    expect(isStandardItemTile('')).toBe(false);
    expect(isStandardItemTile(null)).toBe(false);
  });
});
