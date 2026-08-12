import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuViewPage } from './MenuViewPage';

const setLang = vi.fn();

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  const recent = new Date().toISOString();
  const old = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  return {
    ...actual,
    API_ORIGIN: 'http://localhost',
    fetchCategories: vi.fn().mockResolvedValue({
      data: [
        { id: 1, name: 'Grill', is_active: true, parent_id: null, sort_order: 0 },
        { id: 2, name: 'Chicken', is_active: true, parent_id: 1, sort_order: 0 },
      ],
    }),
    fetchItems: vi.fn().mockResolvedValue({
      data: [
        {
          id: 10,
          name: 'House Salad',
          card_name: 'House Salad',
          card_name_dv: 'ސަލާޑް',
          description: 'Fresh greens',
          base_price: 40,
          category_id: 1,
          is_available: true,
          // Dine-in QR uses online_pickup; shop gate closed must not dim cards.
          available_now: true,
          unavailable_reason: null,
          has_variants: false,
          variants: [],
          created_at: old,
        },
        {
          id: 11,
          name: 'New Skewer',
          card_name: 'New Skewer',
          card_name_dv: 'New Skewer DV',
          description: 'Just landed',
          base_price: 55,
          category_id: 2,
          is_available: true,
          available_now: true,
          unavailable_reason: null,
          has_variants: false,
          variants: [],
          created_at: recent,
        },
      ],
      channelUsed: 'online_pickup',
      deliveryFallback: false,
    }),
    fetchOffers: vi.fn().mockResolvedValue({
      offers: [
        {
          id: 'special-1',
          kind: 'special',
          title: 'Lunch Deal',
          subtitle: 'Weekday special',
          badge: '20% OFF',
          image_url: null,
          link: '/menu?sale=1',
          effective_price: 40,
          original_price: 50,
          ends_at: null,
        },
      ],
      subtext: null,
    }),
    getItemReviews: vi.fn().mockResolvedValue({ reviews: [], average_rating: null, review_count: 0 }),
    getItemPhotos: vi.fn().mockResolvedValue({ photos: [] }),
    fetchCartRecommendations: vi.fn().mockResolvedValue({ items: [] }),
  };
});

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (k: string) => k,
    lang: 'en',
    setLang,
  }),
}));

vi.mock('../context/CartContext', () => ({
  useCart: () => ({
    cart: [],
    addItem: vi.fn(),
    cartTotal: 0,
    cartCount: 0,
  }),
}));

const { siteSettings } = vi.hoisted(() => ({
  siteSettings: {
    site_name: 'Bake & Grill',
    logo: '/logo.png',
    menu_new_days: '30',
    default_item_image: '',
    language_switcher_enabled: 'true',
  },
}));

vi.mock('../context/SiteSettingsContext', () => ({
  useSiteSettingsContext: () => ({
    text: (_k: string, d: string) => d,
    settings: siteSettings,
  }),
  useSiteSettings: () => siteSettings,
}));

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));

describe('MenuViewPage', () => {
  beforeEach(() => {
    setLang.mockClear();
    siteSettings.language_switcher_enabled = 'true';
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('renders categories, items, and offers without cart/login/nav chrome', async () => {
    render(<MenuViewPage />);

    expect(await screen.findByTestId('menu-view-page')).toBeTruthy();
    expect(await screen.findByTestId('menu-view-offers')).toBeTruthy();
    expect(screen.getByText('Lunch Deal')).toBeTruthy();
    expect(screen.getAllByText('House Salad').length).toBeGreaterThan(0);
    expect(screen.getAllByText('New Skewer').length).toBeGreaterThan(0);

    expect(screen.queryByText(/Proceed to Checkout/i)).toBeNull();
    expect(screen.queryByText(/Your Cart/i)).toBeNull();
    expect(screen.queryByRole('navigation', { name: /main navigation/i })).toBeNull();
    expect(screen.queryByText(/Sign in/i)).toBeNull();
    expect(screen.queryByText(/Pickup/i)).toBeNull();
  });

  it('opens view-only item detail without Add to cart', async () => {
    render(<MenuViewPage />);

    const cards = await screen.findAllByTestId('product-card');
    fireEvent.click(cards[0]);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy();
    });

    expect(screen.queryByTestId('item-sheet-add-bar')).toBeNull();
    expect(screen.queryByText(/Add to cart/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /add to cart/i })).toBeNull();
  });

  it('keeps dine-in cards browsable when available_now is true (gate closed does not dim)', async () => {
    render(<MenuViewPage />);
    const cards = await screen.findAllByTestId('product-card');
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card).toHaveAttribute('role', 'button');
      expect(card).toHaveAttribute('tabIndex', '0');
      expect(card.className).not.toMatch(/unavailable/);
    }
    fireEvent.click(cards[0]);
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy();
    });
  });

  it('shows recently created items under New items and excludes old ones', async () => {
    render(<MenuViewPage />);

    const newSection = await screen.findByTestId('menu-view-new');
    expect(within(newSection).getByText('New Skewer')).toBeTruthy();
    expect(within(newSection).queryByText('House Salad')).toBeNull();
  });

  it('language toggle calls setLang when admin switcher is on', async () => {
    siteSettings.language_switcher_enabled = 'true';
    render(<MenuViewPage />);

    await screen.findByTestId('menu-view-page');
    fireEvent.click(screen.getByTestId('menu-view-lang-dv'));
    expect(setLang).toHaveBeenCalledWith('dv');

    fireEvent.click(screen.getByTestId('menu-view-lang-en'));
    expect(setLang).toHaveBeenCalledWith('en');
  });

  it('hides language toggle when admin switcher is off', async () => {
    siteSettings.language_switcher_enabled = 'false';
    render(<MenuViewPage />);

    await screen.findByTestId('menu-view-page');
    expect(screen.queryByTestId('menu-view-lang-dv')).toBeNull();
    expect(screen.queryByTestId('menu-view-lang-en')).toBeNull();
  });
});
