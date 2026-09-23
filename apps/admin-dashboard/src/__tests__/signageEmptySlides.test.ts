import { describe, expect, it } from 'vitest';
import {
  parityConfig,
  pruneEmptySlides,
  slideHasContent,
  type MenuItemLite,
  type SignageSlide,
} from '@shared/signage';

/*
 * Signage audit, 2026-09-23: "Today's offers" is a list bound to items on
 * special. With nothing on special it still took its full dwell every loop,
 * as a title over an empty dark screen. Bound slides with nothing to show
 * are dropped from the rotation.
 */

const config = parityConfig('landscape');

function item(id: number, over: Partial<MenuItemLite> = {}): MenuItemLite {
  return { id, name: `Item ${id}`, base_price: 10 + id, category_id: 1, ...over };
}

function listSlide(id: string, smart: string): SignageSlide {
  return {
    id,
    name: id,
    seconds: 14,
    weight: 1,
    elements: [
      { id: `${id}-title`, type: 'text', x: 4, y: 4, w: 70, h: 8, text: id },
      { id: `${id}-list`, type: 'menu_list', x: 4, y: 14, w: 92, h: 78, binding: { type: 'smart', smart_type: smart, limit: 8 } },
    ],
  };
}

const hero: SignageSlide = {
  id: 'hero',
  elements: [{ id: 'h1', type: 'text', x: 0, y: 0, w: 100, h: 20, text: 'Hello' }],
};

describe('slideHasContent', () => {
  it('always keeps a slide with no menu-bound element', () => {
    expect(slideHasContent(hero, [], config)).toBe(true);
    expect(slideHasContent({ id: 'blank', elements: [] }, [], config)).toBe(true);
  });

  it('drops an offers list when nothing is on special', () => {
    const offers = listSlide('offers', 'offers');
    expect(slideHasContent(offers, [item(1), item(2)], config)).toBe(false);
    expect(slideHasContent(offers, [item(1, { special: { effective_price: 8 } })], config)).toBe(true);
  });

  it('drops a new-items list when nothing is new', () => {
    const fresh = listSlide('new', 'new');
    const old = new Date(Date.now() - 400 * 86400000).toISOString();
    expect(slideHasContent(fresh, [item(1, { created_at: old })], config)).toBe(false);
    expect(slideHasContent(fresh, [item(1, { created_at: new Date().toISOString() })], config)).toBe(true);
  });

  it('keeps a bestsellers list fed by the server figures even with no items', () => {
    const best = listSlide('best', 'bestsellers');
    expect(slideHasContent(best, [], { ...config, bestsellers: [{ id: 9, name: 'Wrap', base_price: 40 }] })).toBe(true);
    expect(slideHasContent(best, [], { ...config, bestsellers: [] })).toBe(false);
  });

  it('keeps an item card whose item exists and drops one whose item is gone', () => {
    const card: SignageSlide = {
      id: 'card',
      elements: [{ id: 'c1', type: 'item_card', x: 0, y: 0, w: 50, h: 50, binding: { type: 'item', item_id: 7 } }],
    };
    expect(slideHasContent(card, [item(7)], config)).toBe(true);
    expect(slideHasContent(card, [item(8)], config)).toBe(false);
  });

  it('ignores a hidden bound element', () => {
    const slide: SignageSlide = {
      id: 's',
      elements: [
        { id: 't', type: 'text', x: 0, y: 0, w: 50, h: 10, text: 'Note' },
        { id: 'l', type: 'menu_list', x: 0, y: 10, w: 50, h: 50, hidden: true, binding: { type: 'smart', smart_type: 'offers' } },
      ],
    };
    expect(slideHasContent(slide, [], config)).toBe(true);
  });
});

describe('pruneEmptySlides', () => {
  it('keeps order and drops only the empty bound slides', () => {
    const slides = [hero, listSlide('offers', 'offers'), listSlide('best', 'bestsellers'), listSlide('new', 'new')];
    const items = [item(1, { sales_30d: 5 })];
    expect(pruneEmptySlides(slides, items, { ...config, bestsellers: [] }).map((s) => s.id)).toEqual(['hero', 'best']);
  });
});
