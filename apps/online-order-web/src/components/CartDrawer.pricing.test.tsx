import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CartDrawer } from './CartDrawer';
import type { Item } from '../api';

const sampleItem: Item = {
  id: 1,
  name: 'Burger',
  description: null,
  base_price: 100,
  category_id: 1,
  is_available: true,
  has_variants: false,
  variants: [],
};

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    lang: 'en',
  }),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: false }),
}));

vi.mock('../context/SiteSettingsContext', () => ({
  useSiteSettings: () => ({ delivery_free_threshold: '200' }),
  useSiteSettingsContext: () => ({
    settings: { delivery_free_threshold: '200' },
    text: (_k: string, d: string) => d,
  }),
}));

vi.mock('../context/CartContext', () => ({
  useCart: () => ({
    cart: [{
      item: sampleItem,
      quantity: 2,
      modifiers: [],
      variantId: null,
      variantName: null,
      variantPrice: 80,
      originalPrice: 100,
    }],
    cartTotal: 160,
    updateQuantity: vi.fn(),
    addItem: vi.fn(),
    updateEntry: vi.fn(),
  }),
}));

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    fetchItems: vi.fn().mockResolvedValue([]),
    fetchCartRecommendations: vi.fn().mockResolvedValue([]),
    getLoyaltyAccount: vi.fn().mockResolvedValue(null),
    getMyFavourites: vi.fn().mockResolvedValue([]),
    getWaitTimeEstimate: vi.fn().mockResolvedValue(null),
  };
});

describe('CartDrawer pricing display', () => {
  it('shows N/- line prices and a savings badge when discounted', () => {
    render(
      <MemoryRouter>
        <CartDrawer />
      </MemoryRouter>,
    );

    const line = screen.getByTestId('cart-line-price');
    expect(line.textContent).toMatch(/160\.00\/-/);
    expect(line.textContent).toMatch(/200\.00\/-/);
    expect(line.textContent).not.toMatch(/MVR/i);
    expect(screen.getByTestId('cart-line-savings').textContent).toMatch(/% OFF|Save /);
  });
});
