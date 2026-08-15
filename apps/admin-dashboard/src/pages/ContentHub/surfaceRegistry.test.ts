import { describe, expect, it } from 'vitest';
import {
  ORDER_HOME_FIXED_MODULES,
  WEBSITE_HOME_FIXED_MODULES,
  blockRenderedOnApp,
  blockSurfaceFor,
  heroPromoConflict,
} from './surfaceRegistry';
import { CONTENT_TASK_CLUSTERS } from './taskLandingConfig';
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

describe('Content task surface map IA', () => {
  it('exposes Menu and status banners under Order App Home/Menu', () => {
    const order = CONTENT_TASK_CLUSTERS.find((c) => c.id === 'order_app')!;
    expect(order.tasks.some((t) => t.id === 'order_menu' && t.group === 'Menu')).toBe(true);
    expect(order.tasks.some((t) => t.id === 'status_banners' && t.group === 'Home')).toBe(true);
  });

  it('brand_profile now covers only the language switcher, not the business profile', () => {
    // Logo, colours and site name moved to Business Details (2026-08-14), so the
    // card must not advertise them — see taskLandingConfig.movedKeys.test.ts.
    const global = CONTENT_TASK_CLUSTERS.find((c) => c.id === 'global')!;
    const card = global.tasks.find((t) => t.id === 'brand_profile')!;
    expect(card).toBeTruthy();
    expect(/language/i.test(card.title)).toBe(true);
    expect(/moved to Business Details/i.test(card.description)).toBe(true);
    expect(CONTENT_TASK_CLUSTERS.flatMap((c) => c.tasks).some((t) => /Technical content/i.test(t.title))).toBe(false);
  });

  it('puts About under Order App ownership', () => {
    const order = CONTENT_TASK_CLUSTERS.find((c) => c.id === 'order_app')!;
    expect(order.tasks.some((t) => t.id === 'order_about' && t.group === 'About')).toBe(true);
  });

  it('lists Tools cluster for history / schedule / import', () => {
    const tools = CONTENT_TASK_CLUSTERS.find((c) => c.id === 'tools')!;
    expect(tools.tasks.map((t) => t.id).sort()).toEqual(['history', 'import_export', 'schedule']);
  });
});
