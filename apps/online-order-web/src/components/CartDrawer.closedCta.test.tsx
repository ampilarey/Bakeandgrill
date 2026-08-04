import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { CartDrawer } from './CartDrawer';
import type { Item } from '../api';

const sampleItem: Item = {
  id: 1,
  name: 'Burger',
  description: null,
  base_price: 40,
  category_id: 1,
  is_available: true,
  has_variants: false,
  variants: [],
};

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'cart.title': 'Your Cart',
        'cart.empty': 'empty',
        'cart.checkout': 'Proceed to Checkout',
        'cart.closed_cta': 'Online ordering is off',
        'cart.closed_cta_short': 'Ordering is closed',
        'cart.opens_at_cta': 'Ordering opens at {time}',
        'cart.add_items_cta': 'Add items to continue',
        'cart.subtotal': 'Subtotal',
        'cart.subtotal_excl': '',
        'cart.blocks_tomorrow': 'Not available for tomorrow',
        'cart.remove_blockers_one': 'Remove 1 item to order for tomorrow.',
        'cart.remove_blockers_many': 'Remove {n} items to order for tomorrow.',
      };
      return map[key] ?? key;
    },
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
      quantity: 1,
      modifiers: [],
      variantId: null,
      variantName: null,
      variantPrice: null,
    }],
    cartTotal: 40,
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

describe('CartDrawer closed CTA', () => {
  it('disables checkout CTA and shows short tomorrow tip while cart has items', () => {
    render(
      <MemoryRouter>
        <CartDrawer isOpen={false} closedMessage="Ordering opens at 10:00 AM" />
      </MemoryRouter>,
    );

    const btn = screen.getByRole('button', { name: /Ordering is closed/i });
    expect(btn).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Proceed to Checkout/i })).toBeNull();
    expect(screen.getByText('Burger')).toBeInTheDocument();
    expect(screen.getByTestId('cart-closed-tomorrow-tip')).toHaveTextContent(
      /Remove 1 item to order for tomorrow/i,
    );
    expect(screen.queryByText(/Ordering opens at 10:00 AM/i)).toBeNull();
  });

  it('falls back to short closed CTA when no closedMessage is passed', () => {
    render(
      <MemoryRouter>
        <CartDrawer isOpen={false} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /Ordering is closed/i })).toBeDisabled();
  });
});
