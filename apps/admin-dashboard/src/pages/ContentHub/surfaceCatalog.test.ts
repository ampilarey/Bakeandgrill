import { describe, expect, it } from 'vitest';
import {
  allSurfaces,
  countBlocksOnSurface,
  parseSurfaceId,
  slotsFor,
  typesForSlot,
} from './surfaceCatalog';

describe('surfaceCatalog', () => {
  it('lists all customer surfaces with mobile-only bottom navigation', () => {
    const surfaces = allSurfaces();
    expect(surfaces.some((s) => s.id === 'website.mobile.bottom_navigation')).toBe(true);
    expect(surfaces.some((s) => s.id === 'website.desktop.bottom_navigation')).toBe(false);
    expect(slotsFor('website', 'desktop')).toEqual(['header', 'home', 'footer']);
    expect(slotsFor('order_app', 'mobile')).toEqual(['header', 'home', 'footer', 'bottom_navigation']);
  });

  it('parses surface ids', () => {
    expect(parseSurfaceId('website.mobile.header')).toEqual({
      app: 'website',
      device: 'mobile',
      slot: 'header',
    });
    expect(parseSurfaceId('bad')).toBeNull();
    expect(parseSurfaceId('website.desktop.bottom_navigation')).toBeNull();
  });

  it('typesForSlot includes prayer_bar on header and home', () => {
    expect(typesForSlot('header')).toContain('prayer_bar');
    expect(typesForSlot('home')).toContain('prayer_bar');
    expect(typesForSlot('footer')).toContain('site_footer');
    expect(typesForSlot('bottom_navigation')).toEqual(['bottom_nav']);
  });

  it('countBlocksOnSurface respects placement settings', () => {
    const blocks = [
      {
        block_type: 'prayer_bar',
        is_enabled: true,
        settings: { placement_mobile: 'header', show_mobile: true, show_desktop: false },
      },
      {
        block_type: 'hero',
        is_enabled: true,
        settings: { placement_mobile: 'home', show_mobile: true },
      },
    ];
    expect(countBlocksOnSurface(blocks, 'mobile', 'header')).toBe(1);
    expect(countBlocksOnSurface(blocks, 'mobile', 'home')).toBe(1);
  });
});
