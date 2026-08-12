import { describe, expect, it } from 'vitest';
import { HOME_COMPONENT_LIBRARY, instanceStatus, placementLabels } from './homeComponentLibrary';

describe('homeComponentLibrary', () => {
  it('includes the full dual-app library including prayer', () => {
    const types = HOME_COMPONENT_LIBRARY.map((c) => c.type);
    for (const required of [
      'greeting', 'prayer_bar', 'hero', 'announcement', 'service_availability',
      'opening_status', 'stat_chips', 'mode_cards', 'specials', 'featured',
      'categories', 'trust_strip', 'proof', 'reviews', 'reorder_strip', 'cta',
      'location', 'events_band', 'office_orders', 'brand_footer', 'site_footer',
      'bottom_nav', 'rich_text',
      'image', 'image_text', 'video', 'button_band', 'faq_list', 'divider',
    ]) {
      expect(types).toContain(required);
    }
    expect(types).not.toContain('promo_carousel');
  });

  it('instance status distinguishes added / hidden / not added', () => {
    expect(instanceStatus(undefined)).toBe('Not added');
    expect(instanceStatus({ is_enabled: true })).toBe('Added');
    expect(instanceStatus({ is_enabled: false })).toBe('Hidden');
  });

  it('placement labels cover desktop and mobile including footer and bottom nav', () => {
    expect(placementLabels({
      show_desktop: true,
      placement_desktop: 'header',
      show_mobile: false,
    })).toEqual(['Desktop · header', 'Mobile · off']);

    expect(placementLabels({
      show_desktop: true,
      placement_desktop: 'footer',
      show_mobile: true,
      placement_mobile: 'bottom_navigation',
    })).toEqual(['Desktop · footer', 'Mobile · bottom nav']);
  });
});
