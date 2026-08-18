import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuPage } from './MenuPage';

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    fetchCategories: vi.fn().mockResolvedValue({
      data: [
        { id: 1, name: 'Grill', is_active: true, parent_id: null, sort_order: 0 },
        { id: 2, name: 'Chicken', is_active: true, parent_id: 1, sort_order: 0 },
        { id: 3, name: 'Beef', is_active: true, parent_id: 1, sort_order: 1 },
      ],
    }),
    fetchItems: vi.fn().mockResolvedValue({
      data: [
        {
          id: 10,
          name: 'House Salad',
          description: 'Parent direct',
          base_price: 40,
          category_id: 1,
          is_available: true,
          has_variants: false,
          variants: [],
        },
        {
          id: 11,
          name: 'Chicken Skewer',
          description: 'Sub item',
          base_price: 55,
          category_id: 2,
          is_available: true,
          has_variants: false,
          variants: [],
        },
        {
          id: 12,
          name: 'Beef Grill',
          description: 'Sub item 2',
          base_price: 70,
          category_id: 3,
          is_available: true,
          has_variants: false,
          variants: [],
        },
      ],
      channelUsed: 'delivery',
      deliveryFallback: false,
    }),
    fetchOnlineOrderingStatus: vi.fn().mockResolvedValue({
      open: true,
      delivery_available: true,
      message: null,
    }),
    fetchOrderingEligibility: vi.fn().mockResolvedValue({
      delivery: { accepting: true, reason: null, message: null },
      active_menu_groups: [],
    }),
    fetchOffers: vi.fn().mockResolvedValue({ offers: [], subtext: null }),
    getMyFavourites: vi.fn().mockResolvedValue([]),
    getWaitTimeEstimate: vi.fn().mockResolvedValue(null),
  };
});

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({ t: (k: string) => k, lang: 'en' }),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: false, user: null }),
}));

vi.mock('../context/CartContext', () => ({
  useCart: () => ({
    cart: [],
    addItem: vi.fn(),
    cartTotal: 0,
    cartCount: 0,
    pruneCartToAllowedItemIds: vi.fn(),
    refreshPricesFromMenu: vi.fn(),
  }),
}));

vi.mock('../context/ShellNavContext', () => ({
  useShellNav: () => ({ openCartSheet: vi.fn() }),
  useShellNavOptional: () => null,
}));

vi.mock('../context/SiteSettingsContext', () => ({
  useSiteSettingsContext: () => ({
    text: (_k: string, d: string) => d,
    settings: { logo: '/logo.png' },
  }),
}));

vi.mock('../context/ServiceStatusContext', () => ({
  useServiceStatusContext: () => ({
    get: () => null,
    isAvailable: () => true,
  }),
}));

vi.mock('../context/OrderModeContext', () => ({
  useOrderMode: () => ({
    mode: 'delivery',
    setMode: vi.fn(),
    modeConfirmed: true,
    channel: 'delivery',
  }),
}));

vi.mock('../context/OrderDayContext', () => ({
  useOrderDay: () => ({ day: 'today', setDay: vi.fn() }),
}));

vi.mock('../components/OrderModeSheet', () => ({ OrderModeSheet: () => null }));

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));

vi.mock('../components/menu/ProductCard', () => ({
  ProductCard: ({ item }: { item: { name: string } }) => (
    <div data-testid="product-card-stub">{item.name}</div>
  ),
}));

vi.mock('../components/menu/CategoryRail', () => ({
  CategoryRail: () => <div data-testid="category-rail" />,
}));

vi.mock('../components/menu/FilterChipsRow', () => ({ FilterChipsRow: () => null }));
vi.mock('../components/home/OffersRail', () => ({ OffersRail: () => null }));
vi.mock('../components/ItemSheet', () => ({ ItemSheet: () => null }));
vi.mock('../components/SearchOverlay', () => ({ SearchOverlay: () => null }));

describe('MenuPage subcategory sub-headers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders smaller sub-headers under the parent section for each subcategory', async () => {
    render(
      <MemoryRouter>
        <MenuPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByText('House Salad').length).toBeGreaterThan(0);
    });

    const subBlocks = screen.getAllByTestId('menu-subcategory');
    expect(subBlocks).toHaveLength(2);
    expect(subBlocks[0]).toHaveAttribute('data-parent-category-id', '1');
    expect(subBlocks[1]).toHaveAttribute('data-parent-category-id', '1');

    const titles = screen.getAllByTestId('menu-subcat-title');
    expect(titles.map((t) => t.textContent)).toEqual(['Chicken', 'Beef']);

    // Sub-title is lighter than the parent's banner title (class contract)
    expect(titles[0].className).toContain('menu-subcat-title');
    expect(titles[0].className).not.toContain('section-accent');
    expect(document.querySelector('.menu-cat-promo__title')).toBeTruthy();

    // The parent is named once, on its banner — not again above its items.
    expect(screen.getAllByText('Grill')).toHaveLength(1);
  });
});
