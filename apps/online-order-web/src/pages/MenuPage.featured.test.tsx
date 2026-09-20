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
      ],
    }),
    // The catering listing is asked for too; nothing here belongs to it.
    fetchItems: vi.fn().mockImplementation((channel?: string) => Promise.resolve(channel === 'catering' ? {
      data: [{ id: 20, name: 'Buffet for 20', description: 'Event dish', base_price: 900, category_id: null, is_available: true, has_variants: false, variants: [], is_catering: true }],
      channelUsed: 'catering', deliveryFallback: false,
    } : {
      data: [
        {
          id: 10,
          name: 'House Salad',
          description: 'In a category',
          base_price: 40,
          category_id: 1,
          is_featured: true,
          is_available: true,
          has_variants: false,
          variants: [],
        },
        {
          id: 11,
          name: 'Mystery Bun',
          description: 'No category at all',
          base_price: 5,
          category_id: null,
          is_available: true,
          has_variants: false,
          variants: [],
        },
        {
          id: 12,
          name: 'Orphan Roll',
          description: 'Category retired',
          base_price: 6,
          category_id: 99,
          is_available: true,
          has_variants: false,
          variants: [],
        },
      ],
      channelUsed: 'delivery',
      deliveryFallback: false,
    })),
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
    settings: { logo: '/logo.png', menu_other_banner_image: '/media/other-banner.jpg', menu_events_banner_image: '/media/events-banner.jpg' },
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
  CategoryRail: (props: { showFeaturedPill?: boolean; featuredLabel?: string; onFeaturedClick?: () => void }) => (
    <div data-testid="category-rail">
      {props.showFeaturedPill && (
        <button type="button" role="tab" data-testid="cat-rail-featured" onClick={props.onFeaturedClick}>
          {props.featuredLabel}
        </button>
      )}
    </div>
  ),
}));

vi.mock('../components/menu/FilterChipsRow', () => ({ FilterChipsRow: () => null }));
vi.mock('../components/home/OffersRail', () => ({ OffersRail: () => null }));
vi.mock('../components/ItemSheet', () => ({ ItemSheet: () => null }));

/**
 * Owner, 2026-09-21: "Is there any specific category to show at the top of
 * the menu and order app?" A dish ticked Featured leads the menu under the
 * owner's heading, with a rail entry, and stays in its own category.
 */
describe('MenuPage — featured dishes lead the menu', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows the ticked dish first under the heading, keeps it in its category, and offers it on the rail', async () => {
    render(
      <MemoryRouter>
        <MenuPage />
      </MemoryRouter>,
    );

    const strip = await screen.findByTestId('menu-section-featured');
    expect(screen.getByTestId('menu-featured-title')).toHaveTextContent("Chef's picks");
    expect(within(strip).getByText('House Salad')).toBeInTheDocument();
    expect(within(strip).queryByText('Mystery Bun')).toBeNull();
    // Same card twice: the strip and the Grill section.
    expect(screen.getAllByText('House Salad')).toHaveLength(2);
    // The strip comes before the first category.
    const grill = document.getElementById('menu-section-1') as HTMLElement;
    expect(strip.compareDocumentPosition(grill) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const tab = screen.getByTestId('cat-rail-featured');
    expect(tab).toHaveTextContent("Chef's picks");
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    tab.click();
    await waitFor(() => expect(scrollTo).toHaveBeenCalled(), { timeout: 4000 });
    scrollTo.mockRestore();
  });
});
