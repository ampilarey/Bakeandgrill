import { render, screen } from '@testing-library/react';
import { ItemSheet } from './ItemSheet';
import type { Item } from '../api';

vi.mock('../context/CartContext', () => ({
  useCart: () => ({ addItem: vi.fn() }),
}));

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    fetchCartRecommendations: vi.fn().mockResolvedValue([]),
    getItemReviews: vi.fn().mockResolvedValue({ reviews: [], average_rating: null }),
    getItemPhotos: vi.fn().mockResolvedValue({ photos: [] }),
  };
});

vi.mock('./menu/MenuImageSlider', () => ({
  MenuImageSlider: () => <div data-testid="slider" />,
}));

const saleItem: Item = {
  id: 11,
  name: 'Grill Plate',
  description: null,
  base_price: 100,
  category_id: 1,
  is_available: true,
  has_variants: false,
  variants: [],
  special: {
    id: 7,
    badge_label: 'Chef Deal',
    discount_pct: 20,
    original_price: 100,
    effective_price: 80,
  },
};

describe('ItemSheet pricing display', () => {
  it('shows N/- sale/was prices and a % OFF savings badge', () => {
    render(
      <ItemSheet
        open
        item={saleItem}
        qty={1}
        selectedModifiers={[]}
        onToggleModifier={() => {}}
        onAddToCart={() => {}}
        onClose={() => {}}
      />,
    );

    const price = screen.getByTestId('item-sheet-price');
    expect(price.textContent).toMatch(/80\.00\/-/);
    expect(price.textContent).toMatch(/100\.00\/-/);
    expect(price.textContent).not.toMatch(/MVR/i);
    expect(screen.getByTestId('item-sheet-savings').textContent).toMatch(/20%\s*OFF|Chef Deal|% OFF/);
  });
});
