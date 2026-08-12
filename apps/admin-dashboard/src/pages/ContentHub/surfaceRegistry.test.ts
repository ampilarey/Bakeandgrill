import { describe, expect, it } from 'vitest';
import {
  ORDER_HOME_FIXED_MODULES,
  WEBSITE_HOME_FIXED_MODULES,
  blockRenderedOnApp,
  blockSurfaceFor,
  heroPromoConflict,
} from './surfaceRegistry';
import { CONTENT_TASK_CLUSTERS } from './taskLandingConfig';

describe('surfaceRegistry', () => {
  it('marks website brand_footer as managed elsewhere', () => {
    const surface = blockSurfaceFor('brand_footer', 'website');
    expect(surface.kind).toBe('managed_elsewhere');
    expect(surface.statusHint).toBe('Managed elsewhere');
    expect(surface.placements).toContain('Website footer');
  });

  it('keeps order brand_footer editable on Order App', () => {
    const surface = blockSurfaceFor('brand_footer', 'order_app');
    expect(surface.placements).toContain('Order App footer');
    expect(surface.kind).toBe('fixed_editable');
  });

  it('documents prayer placement split', () => {
    expect(WEBSITE_HOME_FIXED_MODULES.some((m) => m.id === 'website_prayer_header')).toBe(true);
    expect(ORDER_HOME_FIXED_MODULES.some((m) => m.id === 'order_prayer_desktop')).toBe(true);
    expect(ORDER_HOME_FIXED_MODULES.some((m) => m.id === 'order_prayer_phone')).toBe(true);
    const phone = ORDER_HOME_FIXED_MODULES.find((m) => m.id === 'order_prayer_phone')!;
    expect(phone.placements).toEqual(['Order App phone home']);
    expect(phone.note).toMatch(/header-owned/i);
  });

  it('detects hero + promo carousel conflict', () => {
    expect(heroPromoConflict(['hero', 'promo_carousel'])).toBe(true);
    expect(heroPromoConflict(['hero'])).toBe(false);
  });

  it('website ignores order-only blocks and website ignores brand_footer render', () => {
    expect(blockRenderedOnApp('prayer_bar', 'website')).toBe(false);
    expect(blockRenderedOnApp('brand_footer', 'website')).toBe(false);
    expect(blockRenderedOnApp('featured', 'order_app')).toBe(false);
    expect(blockRenderedOnApp('hero', 'website')).toBe(true);
    expect(blockRenderedOnApp('prayer_bar', 'order_app')).toBe(true);
  });
});

describe('Content task surface map IA', () => {
  it('exposes Menu and Status banners on Order App landing (desktop + mobile)', () => {
    const order = CONTENT_TASK_CLUSTERS.find((c) => c.id === 'order_app')!;
    expect(order.tasks.some((t) => t.id === 'order_menu' && t.group === 'Menu')).toBe(true);
    expect(order.tasks.some((t) => t.id === 'status_banners' && t.group === 'Status banners')).toBe(true);
  });

  it('renames technical details to Brand profile & language under Global', () => {
    const global = CONTENT_TASK_CLUSTERS.find((c) => c.id === 'global')!;
    expect(global.tasks.some((t) => t.id === 'brand_profile')).toBe(true);
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
