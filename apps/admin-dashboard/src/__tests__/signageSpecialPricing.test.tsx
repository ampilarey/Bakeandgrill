import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  SlideCanvas,
  parityConfig,
  type MenuItemLite,
  type SignageSlide,
  type SignageTheme,
} from '@shared/signage';
import '@shared/signage/signage.css';

const THEME: SignageTheme = { primary: '#D4813A', text: '#FFF8F0', muted: '#C4B5A5' };

const DISCOUNTED: MenuItemLite = {
  id: 1,
  name: 'Chicken Wrap',
  base_price: 45,
  category_id: 1,
  image_url: '/wrap.jpg',
  short_description: 'Grilled, wrapped, gone in minutes',
  special: { effective_price: 32, original_price: 45, discount_pct: 29 },
};

const PLAIN: MenuItemLite = { id: 2, name: 'Beef Burger', base_price: 55, category_id: 1 };

function slideWith(type: string, style: Record<string, unknown> = {}, itemId = 1): SignageSlide {
  return {
    id: 'test-slide',
    elements: [
      {
        id: 'el-1',
        type,
        x: 10, y: 10, w: 80, h: 80,
        binding: { type: 'item', item_id: itemId },
        style,
      },
    ],
  };
}

function renderSlide(slide: SignageSlide, items: MenuItemLite[]) {
  return render(
    <SlideCanvas
      slide={slide}
      theme={THEME}
      variables={{}}
      items={items}
      config={parityConfig('landscape')}
      preview
    />,
  );
}

describe('signage special pricing', () => {
  it('item_card leads with the discounted price, not the base price', () => {
    renderSlide(slideWith('item_card'), [DISCOUNTED]);

    // The original still appears, but struck through — the live price is 32.
    expect(screen.getByText('32.00/-')).toBeTruthy();
    const was = screen.getByTestId('signage-was-price');
    expect(was.textContent).toBe('45.00/-');
    expect(was.style.textDecoration).toContain('line-through');
  });

  it('item_card strikes through the original price alongside the discount', () => {
    renderSlide(slideWith('item_card', { showBadge: true }), [DISCOUNTED]);

    expect(screen.getByTestId('signage-was-price').textContent).toBe('45.00/-');
    expect(screen.getByTestId('signage-special-badge').textContent).toBe('29% OFF');
  });

  it('item_card omits the badge and strike when there is no special', () => {
    renderSlide(slideWith('item_card', { showBadge: true }, 2), [PLAIN]);

    expect(screen.getByText('55.00/-')).toBeTruthy();
    expect(screen.queryByTestId('signage-was-price')).toBeNull();
    expect(screen.queryByTestId('signage-special-badge')).toBeNull();
  });

  it('item_card shows the description only when asked', () => {
    const { unmount } = renderSlide(slideWith('item_card'), [DISCOUNTED]);
    expect(screen.queryByText(DISCOUNTED.short_description!)).toBeNull();
    unmount();

    renderSlide(slideWith('item_card', { showDescription: true }), [DISCOUNTED]);
    expect(screen.getByText(DISCOUNTED.short_description!)).toBeTruthy();
  });

  it('price_row shows the discounted price, not the base price', () => {
    renderSlide(slideWith('price_row'), [DISCOUNTED]);

    expect(screen.getByText('32.00/-')).toBeTruthy();
    expect(screen.queryByText('45.00/-')).toBeNull();
  });

  it('menu_list renders row thumbnails only when enabled', () => {
    const list = (style: Record<string, unknown>): SignageSlide => ({
      id: 'list-slide',
      elements: [{
        id: 'el-list', type: 'menu_list', x: 0, y: 0, w: 100, h: 100,
        binding: { type: 'ids', item_ids: [1], limit: 1 },
        style,
      }],
    });

    const { unmount } = renderSlide(list({}), [DISCOUNTED]);
    expect(screen.queryByTestId('signage-row-thumb')).toBeNull();
    unmount();

    renderSlide(list({ showThumbs: true }), [DISCOUNTED]);
    expect(screen.getByTestId('signage-row-thumb')).toBeTruthy();
  });

  it('menu_list falls back to the full image when there is no thumb', () => {
    const slide: SignageSlide = {
      id: 'list-slide',
      elements: [{
        id: 'el-list', type: 'menu_list', x: 0, y: 0, w: 100, h: 100,
        binding: { type: 'ids', item_ids: [1], limit: 1 },
        style: { showThumbs: true },
      }],
    };
    renderSlide(slide, [DISCOUNTED]);

    expect(screen.getByTestId('signage-row-thumb').getAttribute('src')).toBe('/wrap.jpg');
  });
});
