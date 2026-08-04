import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProductCard } from './ProductCard';
import type { Item } from '../../api';

vi.mock('../../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'menu.out_of_stock': 'Sold out',
        'menu.unavailable_today': 'Unavailable today',
        'menu.unavailable': 'Unavailable',
        'menu.only_n_left': 'Only {n} left',
        'menu.few_left': 'Few left',
        'menu.view_item': 'View {name}',
        'menu.badge_tomorrow': 'Tomorrow',
      };
      return map[key] ?? key;
    },
    lang: 'en',
  }),
}));

vi.mock('../../context/SiteSettingsContext', () => ({
  useSiteSettingsContext: () => ({
    settings: { logo: '/logo.png' },
    text: (_k: string, d: string) => d,
  }),
}));

vi.mock('../../utils/itemMedia', () => ({
  buildItemSlides: () => [],
}));

vi.mock('./MenuImageSlider', () => ({
  MenuImageSlider: () => <div data-testid="slider" />,
}));

function item(over: Partial<Item> = {}): Item {
  return {
    id: 1,
    name: 'Fish Curry',
    description: 'Fresh',
    base_price: 80,
    category_id: 1,
    is_available: true,
    has_variants: false,
    variants: [],
    ...over,
  };
}

describe('ProductCard availability', () => {
  it('falls back to is_available when available_now is absent', async () => {
    const user = userEvent.setup();
    const onSelectItem = vi.fn();
    render(
      <ProductCard
        item={item({ is_available: false })}
        onSelectItem={onSelectItem}
        onAddToCart={() => {}}
      />,
    );
    expect(screen.getByTestId('product-card-unavail')).toHaveTextContent('Unavailable');
    await user.click(screen.getByTestId('product-card'));
    expect(onSelectItem).not.toHaveBeenCalled();
  });

  it('uses available_now and reason-specific copy for sold out / snoozed', () => {
    const { rerender } = render(
      <ProductCard
        item={item({
          available_now: false,
          unavailable_reason: 'out_of_stock',
          is_available: true,
        })}
        onSelectItem={() => {}}
        onAddToCart={() => {}}
      />,
    );
    expect(screen.getByTestId('product-card-unavail')).toHaveTextContent('Sold out');

    rerender(
      <ProductCard
        item={item({
          available_now: false,
          unavailable_reason: 'snoozed',
          unavailable_reason_note: 'Back Thursday',
        })}
        onSelectItem={() => {}}
        onAddToCart={() => {}}
      />,
    );
    expect(screen.getByTestId('product-card-unavail')).toHaveTextContent('Unavailable · Back Thursday');
  });

  it('shows Only N left / Few left from is_low_stock, never for 9999 stock', () => {
    const { rerender } = render(
      <ProductCard
        item={item({
          available_now: true,
          is_low_stock: true,
          availability: { available: true, available_stock: 2 },
        })}
        onSelectItem={() => {}}
        onAddToCart={() => {}}
      />,
    );
    expect(screen.getByTestId('product-card-low-stock')).toHaveTextContent('Only 2 left');

    rerender(
      <ProductCard
        item={item({
          available_now: true,
          is_low_stock: true,
          availability: { available: true, available_stock: 5 },
        })}
        onSelectItem={() => {}}
        onAddToCart={() => {}}
      />,
    );
    expect(screen.getByTestId('product-card-low-stock')).toHaveTextContent('Few left');

    rerender(
      <ProductCard
        item={item({
          available_now: true,
          is_low_stock: true,
          availability: { available: true, available_stock: 9999 },
        })}
        onSelectItem={() => {}}
        onAddToCart={() => {}}
      />,
    );
    expect(screen.queryByTestId('product-card-low-stock')).toBeNull();
  });

  it('shows Tomorrow badge when shop is closed and item allows pre-order', () => {
    render(
      <ProductCard
        shopClosed
        item={item({ allow_pre_order: true, available_now: true })}
        onSelectItem={() => {}}
        onAddToCart={() => {}}
      />,
    );
    expect(screen.getByTestId('product-card-tomorrow-badge')).toHaveTextContent('Tomorrow');
  });

  it('hides Tomorrow badge when shop is open or item is today-only', () => {
    const { rerender } = render(
      <ProductCard
        shopClosed={false}
        item={item({ allow_pre_order: true, available_now: true })}
        onSelectItem={() => {}}
        onAddToCart={() => {}}
      />,
    );
    expect(screen.queryByTestId('product-card-tomorrow-badge')).toBeNull();

    rerender(
      <ProductCard
        shopClosed
        item={item({ allow_pre_order: false, available_now: true })}
        onSelectItem={() => {}}
        onAddToCart={() => {}}
      />,
    );
    expect(screen.queryByTestId('product-card-tomorrow-badge')).toBeNull();
  });
});
