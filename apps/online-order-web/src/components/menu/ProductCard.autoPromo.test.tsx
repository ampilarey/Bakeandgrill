import { render, screen } from '@testing-library/react';
import { ProductCard } from './ProductCard';
import type { Item } from '../../api';

vi.mock('../../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    lang: 'en',
  }),
}));

vi.mock('../../utils/itemMedia', () => ({
  buildItemSlides: () => [],
}));

vi.mock('./MenuImageSlider', () => ({
  MenuImageSlider: () => <div data-testid="slider" />,
}));

const baseItem: Item = {
  id: 1,
  name: 'Burger',
  description: null,
  base_price: 100,
  image_url: null,
  category_id: 1,
  is_available: true,
  has_variants: false,
  variants: [],
  special: {
    id: 42,
    badge_label: '15% OFF',
    discount_pct: 15,
    original_price: 100,
    effective_price: 85,
  },
};

describe('ProductCard auto-promo badge', () => {
  it('shows discounted price and sale badge from special block (auto-promo)', () => {
    render(
      <ProductCard
        item={baseItem}
        onSelectItem={() => {}}
        onAddToCart={() => {}}
      />,
    );

    expect(screen.getByText('15% OFF')).toBeInTheDocument();
    expect(screen.getByText(/85/)).toBeInTheDocument();
  });
});
