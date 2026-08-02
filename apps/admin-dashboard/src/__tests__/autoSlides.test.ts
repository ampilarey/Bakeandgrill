import { describe, expect, it } from 'vitest';

import {
  AUTO_MENU_ORIGIN,
  expandAutoSlides,
  expandPlaylist,
  qualifiesForShowcase,
  rotateWindow,
} from '@shared/signage';
import type { MenuItemLite, SignageCategoryLite, SignageSlide } from '@shared/signage';

const CATEGORIES: SignageCategoryLite[] = [
  { id: 1, name: 'Wraps' },
  { id: 2, name: 'Grill' },
];

function autoSlide(binding: Record<string, unknown> = {}): SignageSlide {
  return {
    id: 'auto-1',
    name: 'Full menu',
    seconds: 10,
    template_origin: AUTO_MENU_ORIGIN,
    elements: [
      { id: 'e1', type: 'text', x: 0, y: 0, w: 100, h: 10, text: 'Our menu', binding },
    ],
  };
}

function item(id: number, over: Partial<MenuItemLite> = {}): MenuItemLite {
  return { id, name: `Item ${id}`, base_price: 10 + id, category_id: 1, ...over };
}

const showcaseIds = (slides: SignageSlide[]) => slides
  .filter((s) => s.template_origin === `${AUTO_MENU_ORIGIN}:showcase`)
  .map((s) => s.id);

const listedIds = (slides: SignageSlide[]) => slides
  .filter((s) => s.template_origin === `${AUTO_MENU_ORIGIN}:category`)
  .flatMap((s) => (s.elements ?? [])
    .filter((e) => e.type === 'menu_list')
    .flatMap((e) => (e.binding?.item_ids as number[]) ?? []));

describe('qualifiesForShowcase', () => {
  it('qualifies on a photo, a special, or the promoted flag', () => {
    expect(qualifiesForShowcase(item(1, { image_url: '/a.jpg' }))).toBe(true);
    expect(qualifiesForShowcase(item(2, { special: { effective_price: 8 } }))).toBe(true);
    expect(qualifiesForShowcase(item(3, { is_signage_promoted: true }))).toBe(true);
  });

  it('does not qualify a plain item', () => {
    expect(qualifiesForShowcase(item(4))).toBe(false);
  });
});

describe('expandAutoSlides', () => {
  it('leaves non-auto slides untouched', () => {
    const slide: SignageSlide = { id: 'hero-1', template_origin: 'hero', elements: [] };
    const out = expandAutoSlides(slide, [item(1, { image_url: '/a.jpg' })], CATEGORIES);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(slide);
  });

  it('splits items into showcase slides and category rows', () => {
    const items = [
      item(1, { image_url: '/a.jpg' }),
      item(2, { special: { effective_price: 8, original_price: 12, discount_pct: 33 } }),
      item(3),
      item(4, { category_id: 2 }),
    ];
    const out = expandAutoSlides(autoSlide(), items, CATEGORIES);

    expect(showcaseIds(out)).toEqual(['auto-sc-2', 'auto-sc-1']); // special sorts first
    expect(listedIds(out).sort()).toEqual([3, 4]);
  });

  it('excludes items flagged off the board', () => {
    const items = [
      item(1, { image_url: '/a.jpg', show_on_signage: false }),
      item(2, { show_on_signage: false }),
      item(3),
    ];
    const out = expandAutoSlides(autoSlide(), items, CATEGORIES);

    expect(showcaseIds(out)).toEqual([]);
    expect(listedIds(out)).toEqual([3]);
  });

  it('treats an undefined flag as visible', () => {
    const out = expandAutoSlides(autoSlide(), [item(1)], CATEGORIES);
    expect(listedIds(out)).toEqual([1]);
  });

  it('caps the showcase window and rotates it across loops', () => {
    const items = Array.from({ length: 30 }, (_, i) => item(i + 1, { image_url: `/${i}.jpg` }));
    const cap = 12;

    const loop0 = showcaseIds(expandAutoSlides(autoSlide({ showcase_cap: cap }), items, CATEGORIES, 0));
    const loop1 = showcaseIds(expandAutoSlides(autoSlide({ showcase_cap: cap }), items, CATEGORIES, 1));

    expect(loop0).toHaveLength(cap);
    expect(loop1).toHaveLength(cap);
    expect(loop1).not.toEqual(loop0);

    // Every item features within ceil(30/12) = 3 loops.
    const seen = new Set([0, 1, 2].flatMap((l) => showcaseIds(
      expandAutoSlides(autoSlide({ showcase_cap: cap }), items, CATEGORIES, l),
    )));
    expect(seen.size).toBe(30);
  });

  it('keeps the expanded slide count stable across loops', () => {
    const items = [
      ...Array.from({ length: 20 }, (_, i) => item(i + 1, { image_url: `/${i}.jpg` })),
      ...Array.from({ length: 20 }, (_, i) => item(i + 100)),
    ];
    const lengths = [0, 1, 2, 3].map(
      (l) => expandAutoSlides(autoSlide(), items, CATEGORIES, l).length,
    );
    expect(new Set(lengths).size).toBe(1);
  });

  it('is deterministic for a given loop index', () => {
    const items = Array.from({ length: 25 }, (_, i) => item(i + 1, { image_url: `/${i}.jpg` }));
    const a = expandAutoSlides(autoSlide(), items, CATEGORIES, 7);
    const b = expandAutoSlides(autoSlide(), items, CATEGORIES, 7);
    expect(showcaseIds(a)).toEqual(showcaseIds(b));
  });

  it('paginates a large category rather than overflowing one slide', () => {
    const items = Array.from({ length: 31 }, (_, i) => item(i + 1));
    const out = expandAutoSlides(autoSlide({ rows_per_slide: 14 }), items, CATEGORIES);
    const catSlides = out.filter((s) => s.template_origin === `${AUTO_MENU_ORIGIN}:category`);

    expect(catSlides).toHaveLength(3); // 14 + 14 + 3
    expect(catSlides[0].name).toBe('Wraps (1/3)');
    expect(listedIds(out)).toHaveLength(31);
  });

  it('groups items with an unknown category under a catch-all slide', () => {
    const out = expandAutoSlides(autoSlide(), [item(1, { category_id: 99 })], CATEGORIES);
    const catSlides = out.filter((s) => s.template_origin === `${AUTO_MENU_ORIGIN}:category`);
    expect(catSlides).toHaveLength(1);
    expect(catSlides[0].name).toBe('More on the menu');
  });

  it('keeps a 60-item menu with 10 photos to a short loop', () => {
    const items = [
      ...Array.from({ length: 10 }, (_, i) => item(i + 1, { image_url: `/${i}.jpg` })),
      ...Array.from({ length: 25 }, (_, i) => item(i + 20)),
      ...Array.from({ length: 25 }, (_, i) => item(i + 60, { category_id: 2 })),
    ];
    const out = expandAutoSlides(autoSlide(), items, CATEGORIES);

    expect(items).toHaveLength(60);
    expect(out.length).toBeLessThanOrEqual(15);
  });

  it('falls back to the placeholder when nothing is on the board', () => {
    const slide = autoSlide();
    expect(expandAutoSlides(slide, [], CATEGORIES)).toEqual([slide]);
  });

  it('binds category rows by explicit ids so pages do not overlap', () => {
    const items = Array.from({ length: 20 }, (_, i) => item(i + 1));
    const out = expandAutoSlides(autoSlide({ rows_per_slide: 14 }), items, CATEGORIES);
    const ids = listedIds(out);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('expandPlaylist', () => {
  it('expands auto entries and preserves the others in order', () => {
    const hero: SignageSlide = { id: 'hero-1', template_origin: 'hero', elements: [] };
    const qr: SignageSlide = { id: 'qr-1', template_origin: 'qr', elements: [] };
    const out = expandPlaylist(
      [hero, autoSlide(), qr],
      [item(1, { image_url: '/a.jpg' }), item(2)],
      CATEGORIES,
    );

    expect(out[0]).toBe(hero);
    expect(out[out.length - 1]).toBe(qr);
    expect(out.length).toBeGreaterThan(3);
  });
});

describe('rotateWindow', () => {
  it('returns the whole list when it fits', () => {
    expect(rotateWindow([1, 2, 3], 5, 3)).toEqual([1, 2, 3]);
  });

  it('wraps around the end of the list', () => {
    expect(rotateWindow([1, 2, 3, 4, 5], 3, 1)).toEqual([4, 5, 1]);
  });

  it('handles a negative loop index', () => {
    expect(rotateWindow([1, 2, 3, 4, 5], 3, -1)).toHaveLength(3);
  });

  it('returns nothing for an empty list', () => {
    expect(rotateWindow([], 3, 0)).toEqual([]);
  });
});
