import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  AUTO_MENU_ORIGIN,
  SOLD_OUT_BADGE_MINUTES,
  SlideCanvas,
  dropExpired,
  expandAutoSlides,
  isExpired,
  parityConfig,
  trackSoldOut,
  type MenuItemLite,
  type SignageSlide,
} from '@shared/signage';

/*
 * Owner's shortlist, 2026-09-23: a dish that runs out keeps its row with a
 * SOLD OUT pill for a while, then goes; notices drop themselves on time.
 */

function item(id: number, over: Partial<MenuItemLite> = {}): MenuItemLite {
  return { id, name: `Item ${id}`, base_price: 10 + id, category_id: 1, ...over };
}
const soldOut = (id: number) => item(id, { unavailable_reason: 'out_of_stock', available_now: false });

describe('trackSoldOut', () => {
  it('badges a newly sold-out item, drops it after the grace, remembers when it started', () => {
    const t0 = 1_000_000;
    const first = trackSoldOut([item(1), soldOut(2)], {}, t0);
    expect(first.items.map((i) => [i.id, i.sold_out_badge ?? false])).toEqual([[1, false], [2, true]]);
    expect(first.since).toEqual({ '2': t0 });

    const later = trackSoldOut([item(1), soldOut(2)], first.since, t0 + (SOLD_OUT_BADGE_MINUTES - 1) * 60_000);
    expect(later.items.some((i) => i.id === 2)).toBe(true);

    const past = trackSoldOut([item(1), soldOut(2)], later.since, t0 + (SOLD_OUT_BADGE_MINUTES + 1) * 60_000);
    expect(past.items.some((i) => i.id === 2)).toBe(false);
    // Still remembered, so a reload does not bring it back.
    expect(past.since).toEqual({ '2': t0 });
  });

  it('forgets an item once it is back in stock, and honours the configured minutes', () => {
    const t0 = 5_000;
    const a = trackSoldOut([soldOut(3)], {}, t0, 5);
    expect(a.items[0].sold_out_badge).toBe(true);
    expect(trackSoldOut([soldOut(3)], a.since, t0 + 6 * 60_000, 5).items).toEqual([]);
    expect(trackSoldOut([item(3)], a.since, t0 + 7 * 60_000, 5)).toEqual({ items: [item(3)], since: {} });
    // 0 minutes: no grace at all.
    expect(trackSoldOut([soldOut(4)], {}, t0, 0).items).toEqual([]);
  });
});

describe('expansion with a badged item', () => {
  const auto: SignageSlide = { id: 'auto', template_origin: AUTO_MENU_ORIGIN, elements: [{ id: 'a', type: 'text', x: 0, y: 0, w: 100, h: 10 }] };

  it('lists it, never showcases it', () => {
    const items = [item(1, { image_url: '/1.jpg' }), { ...soldOut(2), sold_out_badge: true, image_url: '/2.jpg', is_featured: true }];
    const out = expandAutoSlides(auto, items, [{ id: 1, name: 'Shorteats' }]);
    const list = out.find((s) => s.id === 'auto-cat-1-0');
    expect(list?.elements?.find((e) => e.type === 'menu_list')?.binding?.item_ids).toEqual([1, 2]);
    expect(out.map((s) => s.id)).not.toContain('auto-sc-2');
  });

  it('drops a sold-out item that has no badge', () => {
    const out = expandAutoSlides(auto, [item(1), soldOut(2)], [{ id: 1, name: 'Shorteats' }]);
    expect(out.find((s) => s.id === 'auto-cat-1-0')?.elements?.find((e) => e.type === 'menu_list')?.binding?.item_ids).toEqual([1]);
  });
});

describe('renderer', () => {
  const theme = { primary: '#D4813A', background: '#1C1408', text: '#FFF8F0', muted: '#C4B5A5' };

  it('shows the pill on a row and on a tile', () => {
    const items = [{ ...soldOut(2), sold_out_badge: true, image_url: '/2.jpg' }];
    const list: SignageSlide = { id: 'l', elements: [{ id: 'e', type: 'menu_list', x: 0, y: 0, w: 100, h: 100, binding: { type: 'ids', item_ids: [2], limit: 1 } }] };
    const { unmount } = render(<SlideCanvas slide={list} theme={theme} variables={{}} items={items} config={parityConfig('landscape')} />);
    expect(screen.getByTestId('signage-sold-out').textContent).toBe('Sold out');
    unmount();

    const tiles: SignageSlide = { id: 't', elements: [{ id: 'e', type: 'menu_tiles', x: 0, y: 0, w: 100, h: 100, binding: { type: 'ids', item_ids: [2], limit: 1 } }] };
    render(<SlideCanvas slide={tiles} theme={theme} variables={{}} items={items} config={parityConfig('landscape')} />);
    expect(screen.getByTestId('signage-sold-out')).toBeTruthy();
  });
});

describe('expiry', () => {
  it('drops what has expired and keeps the rest', () => {
    const now = Date.parse('2026-09-23T10:00:00Z');
    const list = [
      { id: 'a', expires_at: '2026-09-23T09:59:00Z' },
      { id: 'b', expires_at: '2026-09-23T10:01:00Z' },
      { id: 'c', expires_at: null },
      { id: 'd' },
    ];
    expect(dropExpired(list, now).map((x) => x.id)).toEqual(['b', 'c', 'd']);
    expect(isExpired('garbage', now)).toBe(false);
  });
});
