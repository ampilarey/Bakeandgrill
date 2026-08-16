import { describe, expect, it } from 'vitest';
import {
  ORDER_HOME_FIXED_MODULES,
  WEBSITE_HOME_FIXED_MODULES,
  blockRenderedOnApp,
  blockSurfaceFor,
  heroPromoConflict,
} from './surfaceRegistry';
import { HOME_COMPONENT_LIBRARY } from './homeComponentLibrary';

describe('surfaceRegistry', () => {
  it('treats brand_footer as a real Home component on both apps', () => {
    const website = blockSurfaceFor('brand_footer', 'website');
    const order = blockSurfaceFor('brand_footer', 'order_app');
    expect(website.kind).toBe('reorderable_block');
    expect(website.placements).toContain('Website home');
    expect(order.placements).toContain('Order App footer');
  });

  it('does not list injected Home modules', () => {
    expect(WEBSITE_HOME_FIXED_MODULES.some((m) => m.id === 'website_trust_strip')).toBe(false);
    expect(ORDER_HOME_FIXED_MODULES.some((m) => m.id === 'order_stat_chips')).toBe(false);
    expect(ORDER_HOME_FIXED_MODULES).toHaveLength(0);
  });

  it('prayer is a dual-app Home component with header placements', () => {
    const prayer = blockSurfaceFor('prayer_bar', 'website');
    expect(prayer.placements).toEqual(expect.arrayContaining([
      'Website header',
      'Website home',
      'Order App desktop header',
      'Order App phone home',
    ]));
  });

  it('detects hero + promo carousel conflict', () => {
    expect(heroPromoConflict(['hero', 'promo_carousel'])).toBe(true);
    expect(heroPromoConflict(['hero'])).toBe(false);
  });

  it('every Home component renders on both apps', () => {
    for (const comp of HOME_COMPONENT_LIBRARY) {
      expect(blockRenderedOnApp(comp.type, 'website')).toBe(true);
      expect(blockRenderedOnApp(comp.type, 'order_app')).toBe(true);
    }
    expect(blockRenderedOnApp('prayer_bar', 'website')).toBe(true);
    expect(blockRenderedOnApp('featured', 'order_app')).toBe(true);
  });
});

/**
 * The "Content task surface map IA" block was removed on 2026-08-16 with the
 * task cards it described. Both hubs open on their page tabs now; there is no
 * landing screen and no CONTENT_TASK_CLUSTERS to arrange.
 */
