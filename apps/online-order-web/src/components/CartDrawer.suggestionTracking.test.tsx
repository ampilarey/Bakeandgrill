/**
 * The upsell panel has to report what it did.
 *
 * Without shown/accepted the admin report can describe customers but not the
 * feature — there is no way to tell a suggestion that earns its slot from one
 * everybody scrolls past, and no way to tell whether a scoring change helped.
 *
 * Worth pinning here specifically because the call is deliberately
 * fire-and-forget: trackSuggestion swallows its own errors so a failed tally
 * can never block a customer, which also means a broken call would go
 * completely unnoticed in every other test.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CartDrawer } from './CartDrawer';
import type { Item } from '../api';

const cartItem: Item = {
  id: 1,
  name: 'Burger',
  description: null,
  base_price: 100,
  category_id: 1,
  is_available: true,
  has_variants: false,
  variants: [],
};

// vi.mock factories are hoisted above the file's own consts, so anything the
// factory touches has to be hoisted with it.
const { fries, coke, addItem, trackSuggestion } = vi.hoisted(() => ({
  fries: { id: 7, name: 'Fries', base_price: 25, is_available: true, has_variants: false, variants: [] },
  coke: { id: 8, name: 'Coke', base_price: 15, is_available: true, has_variants: false, variants: [] },
  addItem: vi.fn(),
  trackSuggestion: vi.fn(),
}));

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, lang: 'en' }),
}));

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: false }) }));

vi.mock('../context/SiteSettingsContext', () => ({
  useSiteSettings: () => ({ delivery_free_threshold: '200' }),
  useSiteSettingsContext: () => ({
    settings: { delivery_free_threshold: '200' },
    text: (_k: string, d: string) => d,
  }),
}));

vi.mock('../context/CartContext', () => ({
  useCart: () => ({
    cart: [{ item: cartItem, quantity: 1, modifiers: [], variantId: null, variantName: null }],
    cartTotal: 100,
    updateQuantity: vi.fn(),
    addItem,
    updateEntry: vi.fn(),
  }),
}));

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    fetchItems: vi.fn().mockResolvedValue({ data: [] }),
    fetchCartRecommendations: vi.fn().mockResolvedValue({ items: [fries, coke] }),
    trackSuggestion: (...args: unknown[]) => trackSuggestion(...args),
    getLoyaltyAccount: vi.fn().mockResolvedValue(null),
    getMyFavourites: vi.fn().mockResolvedValue([]),
    getWaitTimeEstimate: vi.fn().mockResolvedValue(null),
  };
});

describe('CartDrawer suggestion tracking', () => {
  beforeEach(() => {
    addItem.mockClear();
    trackSuggestion.mockClear();
  });

  const renderDrawer = () => render(<MemoryRouter><CartDrawer /></MemoryRouter>);

  it('reports every suggestion it put on screen, once', async () => {
    renderDrawer();

    await waitFor(() => {
      expect(trackSuggestion).toHaveBeenCalledWith('cart', 'shown', [fries.id, coke.id]);
    });

    const shown = trackSuggestion.mock.calls.filter((c) => c[1] === 'shown');
    expect(shown).toHaveLength(1);
  });

  it('reports the one the customer actually took, and adds it', async () => {
    const user = userEvent.setup();
    renderDrawer();

    const addFries = await screen.findByLabelText('Add Fries to cart');
    await user.click(addFries);

    expect(addItem).toHaveBeenCalled();
    expect(trackSuggestion).toHaveBeenCalledWith('cart', 'accepted', [fries.id]);

    // Only the tapped one — the other was shown, not taken, and counting it
    // would quietly inflate the take rate the report is built on.
    const accepted = trackSuggestion.mock.calls.filter((c) => c[1] === 'accepted');
    expect(accepted).toHaveLength(1);
    expect(accepted[0][2]).toEqual([fries.id]);
  });
});
