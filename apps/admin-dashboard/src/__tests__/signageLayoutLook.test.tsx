import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  AUTO_MENU_ORIGIN,
  LAYOUT_PRESETS,
  SlideCanvas,
  applyLayoutToSlides,
  expandAutoSlides,
  parityConfig,
  resolveLayout,
  type MenuItemLite,
  type SignageSlide,
} from '@shared/signage';

/*
 * Owner, 2026-09-23: "setting different layout for the tv in admin app".
 * A look per screen: preset defaults, group knobs, screen knobs.
 */

function item(id: number, over: Partial<MenuItemLite> = {}): MenuItemLite {
  return { id, name: `Item ${id}`, base_price: 10 + id, category_id: 1, image_url: `/${id}.jpg`, ...over };
}

const CATS = [
  { id: 10, name: 'Food' },
  { id: 1, name: 'Shorteats', parent_id: 10 },
  { id: 2, name: 'Hot Drinks', parent_id: 20 },
  { id: 20, name: 'Drinks' },
];

const auto: SignageSlide = {
  id: 'auto',
  template_origin: AUTO_MENU_ORIGIN,
  elements: [{ id: 'a', type: 'text', x: 0, y: 0, w: 100, h: 10, binding: { showcase_cap: 12, rows_per_slide: 14, show_thumbs: true } }],
};

describe('resolveLayout', () => {
  it('starts from the preset defaults and layers group then screen', () => {
    const out = resolveLayout({ preset: 'classic', columns: 3 }, { show_thumbs: false });
    expect(out.preset).toBe('classic');
    expect(out.columns).toBe(3);
    expect(out.show_thumbs).toBe(false);
    expect(out.rows_per_slide).toBe(LAYOUT_PRESETS.classic.defaults.rows_per_slide);
  });

  it('drops the group knobs when the screen picks another preset', () => {
    const out = resolveLayout({ preset: 'price_board', columns: 3, rows_per_slide: 27 }, { preset: 'photo_grid' });
    expect(out.preset).toBe('photo_grid');
    expect(out.columns).toBe(LAYOUT_PRESETS.photo_grid.defaults.columns);
    expect(out.rows_per_slide).toBe(LAYOUT_PRESETS.photo_grid.defaults.rows_per_slide);
  });

  it('clamps and cleans the numbers and ids', () => {
    const out = resolveLayout({ columns: 99, showcase_cap: -3, category_ids: [8, 0, NaN, 9] });
    expect(out.columns).toBe(4);
    expect(out.showcase_cap).toBe(0);
    expect(out.category_ids).toEqual([8, 9]);
  });

  it('is classic with nothing set', () => {
    expect(resolveLayout(null, undefined).preset).toBe('classic');
  });
});

describe('applyLayoutToSlides', () => {
  it('puts the look on the auto-menu entry and on smart lists, leaving the rest', () => {
    const hero: SignageSlide = { id: 'h', template_origin: 'hero', elements: [{ id: 't', type: 'text', x: 0, y: 0, w: 10, h: 10 }] };
    const smart: SignageSlide = {
      id: 'best',
      template_origin: 'smart:bestsellers',
      elements: [{ id: 'l', type: 'menu_list', x: 0, y: 0, w: 100, h: 100, style: { columns: 2, fontSize: 2.8 }, binding: { type: 'smart', smart_type: 'bestsellers' } }],
    };
    const out = applyLayoutToSlides([hero, auto, smart], resolveLayout({ preset: 'price_board' }));
    expect(out[0]).toBe(hero);
    expect(out[1].elements?.[0].binding).toMatchObject({ preset: 'price_board', columns: 3, show_thumbs: false, showcase_cap: 0, rows_per_slide: 27 });
    expect(out[2].elements?.[0].style).toMatchObject({ columns: 3, showThumbs: false, fontSize: 2.8 });
  });

  it('does nothing without a layout', () => {
    expect(applyLayoutToSlides([auto], null)[0]).toBe(auto);
  });
});

describe('expansion under a look', () => {
  const items = [item(1), item(2, { category_id: 2 }), item(3), item(4, { special: { effective_price: 5 } })];

  it('price board: three columns, no thumbnails, no showcases at all', () => {
    const [slide] = applyLayoutToSlides([auto], resolveLayout({ preset: 'price_board' }));
    const out = expandAutoSlides(slide, items, CATS);
    const lists = out.filter((s) => s.template_origin === `${AUTO_MENU_ORIGIN}:category`);
    expect(lists.length).toBe(2);
    expect(lists[0].elements?.find((e) => e.type === 'menu_list')?.style).toMatchObject({ columns: 3, showThumbs: false });
    // Cap 0 switches showcases off, special or not — the counter screen is a price list.
    expect(out.filter((s) => s.template_origin === `${AUTO_MENU_ORIGIN}:showcase`).map((s) => s.id)).toEqual([]);
  });

  it('photo grid: tiles instead of a list', () => {
    const [slide] = applyLayoutToSlides([auto], resolveLayout({ preset: 'photo_grid' }));
    const out = expandAutoSlides(slide, items, CATS);
    const cat = out.find((s) => s.id === 'auto-cat-1-0');
    expect(cat?.elements?.some((e) => e.type === 'menu_tiles')).toBe(true);
    expect(cat?.elements?.some((e) => e.type === 'menu_list')).toBe(false);
  });

  it('magazine: a large photo beside a single column', () => {
    const [slide] = applyLayoutToSlides([auto], resolveLayout({ preset: 'magazine' }));
    const out = expandAutoSlides(slide, items, CATS);
    const cat = out.find((s) => s.id === 'auto-cat-1-0');
    const hero = cat?.elements?.find((e) => e.type === 'image');
    expect(hero?.binding?.url).toBe('/1.jpg');
    expect(cat?.elements?.find((e) => e.type === 'menu_list')?.style).toMatchObject({ columns: 1 });
  });

  it('shows only the chosen categories, children of a chosen parent included', () => {
    const [slide] = applyLayoutToSlides([auto], resolveLayout({ category_ids: [20] }));
    const out = expandAutoSlides(slide, items, CATS);
    const lists = out.filter((s) => s.template_origin === `${AUTO_MENU_ORIGIN}:category`).map((s) => s.name);
    expect(lists).toEqual(['Hot Drinks']);
  });

  it('portrait: stacked showcase cards', () => {
    const [slide] = applyLayoutToSlides([auto], resolveLayout({ preset: 'portrait' }));
    const out = expandAutoSlides(slide, items, CATS);
    const card = out.find((s) => s.id === 'auto-sc-4');
    expect(card?.elements?.[0].style?.layout).toBe('stack');
  });
});

describe('renderer', () => {
  const theme = { primary: '#D4813A', background: '#1C1408', text: '#FFF8F0', muted: '#C4B5A5' };

  it('draws photo tiles with name and price', () => {
    const slide: SignageSlide = {
      id: 'tiles',
      elements: [{ id: 't', type: 'menu_tiles', x: 0, y: 0, w: 100, h: 100, style: { columns: 3 }, binding: { type: 'ids', item_ids: [1, 2], limit: 2 } }],
    };
    render(<SlideCanvas slide={slide} theme={theme} variables={{}} items={[item(1), item(2)]} config={parityConfig('landscape')} />);
    expect(screen.getByTestId('signage-tiles').getAttribute('data-rows')).toBe('2');
    expect(document.querySelectorAll('.signage-tile').length).toBe(2);
    expect(screen.getByText('11.00/-')).toBeTruthy();
  });

  it('puts Dhivehi first when the look says so', () => {
    const slide: SignageSlide = {
      id: 'list',
      elements: [{ id: 'l', type: 'menu_list', x: 0, y: 0, w: 100, h: 100, binding: { type: 'ids', item_ids: [1], limit: 1 } }],
    };
    const dv = item(1, { name_dv: 'ބަޖިޔާ' });
    const { unmount } = render(<SlideCanvas slide={slide} theme={theme} variables={{}} items={[dv]} config={{ ...parityConfig('landscape'), layout: { dhivehi_first: true } }} />);
    expect(screen.getByTestId('signage-name-dv-first').textContent).toBe('ބަޖިޔާ');
    unmount();

    render(<SlideCanvas slide={slide} theme={theme} variables={{}} items={[dv]} config={parityConfig('landscape')} />);
    expect(screen.queryByTestId('signage-name-dv-first')).toBeNull();
    expect(document.querySelector('.signage-row-name-en')?.textContent).toBe('Item 1');
  });
});
