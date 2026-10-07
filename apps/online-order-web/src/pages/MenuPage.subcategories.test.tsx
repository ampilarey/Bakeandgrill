import { render, screen, waitFor, within } from '@testing-library/react';
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
        {
          id: 13,
          name: 'Mixed Skewer',
          description: 'Home under Chicken, also shown under Beef',
          base_price: 60,
          category_id: 2,
          extra_category_ids: [3],
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

    // The parent's own dishes first, under its name, then each sub-category.
    const subBlocks = screen.getAllByTestId('menu-subcategory');
    expect(subBlocks).toHaveLength(3);
    expect(subBlocks[0].id).toBe('menu-section-1-items');
    expect(subBlocks[1]).toHaveAttribute('data-parent-category-id', '1');
    expect(subBlocks[2]).toHaveAttribute('data-parent-category-id', '1');

    // A thin label each, with its count; a sub-category has its own Share.
    const titles = screen.getAllByTestId('menu-subcat-title');
    expect(titles.map((t) => t.firstChild?.textContent)).toEqual(['Grill', 'Chicken', 'Beef']);
    expect(titles[1].querySelector('.menu-subcat-count')?.textContent).toMatch(/^\d+ items?$/);
    expect(within(subBlocks[1]).getByRole('button', { name: 'Share Chicken' })).toBeInTheDocument();
    expect(within(subBlocks[0]).queryByRole('button', { name: /Share/ })).toBeNull();

    // Under the pinned banner, the same three as buttons (owner, 2026-10-07:
    // "sub category below the banner").
    const chips = Array.from(document.querySelectorAll('.mh-chip')).map((c) => c.firstChild?.textContent);
    expect(chips).toEqual(['Grill', 'Chicken', 'Beef']);
    // The rail lists the category, not its sub-categories.
    expect(document.querySelector('.cat-rail__sub')).toBeNull();
  });

  /** Owner, 2026-09-03: "can an item be in 2 categories?" — home plus "also show in". */
  it('lists an item under its home sub-category and under every "also show in" category', async () => {
    render(
      <MemoryRouter>
        <MenuPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getAllByText('Mixed Skewer').length).toBeGreaterThan(0);
    });

    // Once under Chicken (home), once under Beef (also shown in) — the same
    // card in each block, rendered exactly as its neighbours are.
    const subBlocks = screen.getAllByTestId('menu-subcategory');
    const inBlock = (i: number, name: string) => within(subBlocks[i]).queryAllByText(name).length;
    // Block 0 is the parent's own dishes; Chicken is 1, Beef is 2.
    expect(inBlock(1, 'Mixed Skewer')).toBeGreaterThan(0);
    expect(inBlock(1, 'Mixed Skewer')).toBe(inBlock(1, 'Chicken Skewer'));
    expect(inBlock(2, 'Mixed Skewer')).toBe(inBlock(2, 'Beef Grill'));
    // A home-only item stays in its own block.
    expect(inBlock(2, 'Chicken Skewer')).toBe(0);
    expect(inBlock(1, 'Beef Grill')).toBe(0);
  });
});
