import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  SlideCanvas,
  parityConfig,
  tidyInterpolated,
  type MenuItemLite,
  type SignageElement,
  type SignageSlide,
} from '@shared/signage';
import { cardBadge, fitListFontSize } from '@shared/signage/SlideCanvas';

/*
 * Board layout pass, 2026-09-23: rows fill their box, bestsellers are
 * numbered, offers show what they were, the showcase card puts the photo
 * beside the words with a pill saying why it is there, and a line whose
 * variables came out empty does not leave "Wi‑Fi: ·" on the screen.
 */

const config = parityConfig('landscape');
const theme = { primary: '#D4813A', background: '#1C1408', text: '#FFF8F0', muted: '#C4B5A5' };

function item(id: number, over: Partial<MenuItemLite> = {}): MenuItemLite {
  return { id, name: `Item ${id}`, base_price: 10 + id, category_id: 1, ...over };
}

function slideWith(el: Record<string, unknown>): SignageSlide {
  return { id: 'layout', elements: [{ id: 'e1', type: 'menu_list', x: 4, y: 20, w: 92, h: 76, ...el } as SignageElement] };
}

const mount = (slide: SignageSlide, items: MenuItemLite[], logoUrl?: string) => render(
  <SlideCanvas slide={slide} theme={theme} variables={{}} items={items} config={config} logoUrl={logoUrl} />,
);

describe('fitListFontSize', () => {
  it('gives a short list bigger type than a long one, within bounds', () => {
    const eight = fitListFontSize(76, 8, 2);
    const twentyEight = fitListFontSize(76, 28, 2);
    expect(eight).toBeGreaterThan(twentyEight);
    expect(eight).toBeLessThanOrEqual(4.6);
    expect(twentyEight).toBeGreaterThanOrEqual(2);
  });

  it('never grows past what the designer asked for', () => {
    expect(fitListFontSize(76, 2, 2, 2.8)).toBe(2.8);
  });
});

describe('menu_list rows', () => {
  it('numbers the bestsellers', () => {
    render(
      <SlideCanvas
        slide={slideWith({ binding: { type: 'smart', smart_type: 'bestsellers', limit: 3 } })}
        theme={theme}
        variables={{}}
        items={[]}
        config={{ ...config, bestsellers: [{ id: 1, name: 'Wrap', base_price: 40 }, { id: 2, name: 'Burger', base_price: 55 }] }}
      />,
    );
    const ranks = Array.from(document.querySelectorAll('.signage-row-rank')).map((n) => n.textContent);
    expect(ranks).toEqual(['1', '2']);
  });

  it('does not number an ordinary category list', () => {
    mount(slideWith({ binding: { type: 'ids', item_ids: [1, 2], limit: 2 } }), [item(1), item(2)]);
    expect(document.querySelector('.signage-row-rank')).toBeNull();
  });

  it('shows the old price struck through on an offer row', () => {
    mount(
      slideWith({ binding: { type: 'ids', item_ids: [1], limit: 1 } }),
      [item(1, { special: { effective_price: 8, original_price: 12, discount_pct: 33 } })],
    );
    expect(screen.getByTestId('signage-row-was').textContent).toBe('12.00/-');
    expect(screen.getByText('8.00/-')).toBeTruthy();
  });

  it('sizes the type from the row count', () => {
    mount(slideWith({ binding: { type: 'ids', item_ids: [1, 2], limit: 2 } }), [item(1), item(2)]);
    const list = document.querySelector('.signage-menu-list') as HTMLElement;
    expect(list.getAttribute('data-rows')).toBe('2');
    expect(list.style.fontSize).toMatch(/vmin$/);
    expect(parseFloat(list.style.fontSize)).toBeGreaterThan(2.8);
  });
});

describe('item_card', () => {
  const card = (style: Record<string, unknown>): SignageSlide => ({
    id: 'card',
    elements: [{ id: 'c', type: 'item_card', x: 5, y: 7, w: 90, h: 82, binding: { type: 'item', item_id: 1 }, style }],
  });

  it('puts the photo beside the words in the split layout, with the category as eyebrow', () => {
    mount(card({ layout: 'split', eyebrow: 'Shorteats', showBadge: true }), [item(1, { image_url: '/a.jpg', is_featured: true })]);
    expect(document.querySelector('.signage-card--split')).toBeTruthy();
    expect(document.querySelector('.signage-card-eyebrow')?.textContent).toBe('Shorteats');
    expect(screen.getByTestId('signage-special-badge').textContent).toBe("CHEF'S PICK");
  });

  it('falls back to the stacked layout when there is no photo', () => {
    mount(card({ layout: 'split', showBadge: true }), [item(1, { is_signage_promoted: true })]);
    expect(document.querySelector('.signage-card--split')).toBeNull();
    expect(document.querySelector('.signage-card--stack')).toBeTruthy();
    expect(screen.getByTestId('signage-special-badge').textContent).toBe('FEATURED');
  });

  it('keeps hand-designed cards stacked as before', () => {
    mount(card({ showBadge: true }), [item(1, { image_url: '/a.jpg' })]);
    expect(document.querySelector('.signage-card--stack')).toBeTruthy();
    expect(screen.queryByTestId('signage-special-badge')).toBeNull();
  });
});

describe('cardBadge', () => {
  it('leads with the saving, then the owner flags, then newness', () => {
    expect(cardBadge(item(1, { special: { effective_price: 8, discount_pct: 20 }, is_featured: true }), config)).toBe('20% OFF');
    expect(cardBadge(item(1, { special: { effective_price: 8 } }), config)).toBe('SPECIAL');
    expect(cardBadge(item(1, { is_signage_promoted: true, is_featured: true }), config)).toBe('FEATURED');
    expect(cardBadge(item(1, { is_featured: true }), config)).toBe("CHEF'S PICK");
    expect(cardBadge(item(1, { created_at: new Date().toISOString() }), { ...config, menu_new_days: 30 })).toBe('NEW');
    expect(cardBadge(item(1), config)).toBeNull();
  });
});

describe('tidyInterpolated', () => {
  it('drops the empty pieces of a dotted line', () => {
    expect(tidyInterpolated('Wi‑Fi:  · ')).toBe('');
    expect(tidyInterpolated('Wi‑Fi: BG-Guest · ')).toBe('Wi‑Fi: BG-Guest');
    expect(tidyInterpolated('Wi‑Fi: BG-Guest · secret')).toBe('Wi‑Fi: BG-Guest · secret');
    expect(tidyInterpolated('Fresh · Daily')).toBe('Fresh · Daily');
    expect(tidyInterpolated('No dots here')).toBe('No dots here');
  });
});
