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
    fetchItems: vi.fn().mockImplementation((channel?: string) => Promise.resolve(channel === 'catering' ? { data: [], channelUsed: 'catering', deliveryFallback: false } : {
      data: [
        {
          id: 10,
          name: 'House Salad',
          description: 'In a category',
          base_price: 40,
          category_id: 1,
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
  CategoryRail: (props: { showOtherPill?: boolean; otherCount?: number; otherActive?: boolean; onOtherClick?: () => void }) => (
    <div data-testid="category-rail">
      {props.showOtherPill && (
        <button type="button" role="tab" data-testid="cat-rail-other" aria-selected={props.otherActive} onClick={props.onOtherClick}>
          Other, {props.otherCount}
        </button>
      )}
    </div>
  ),
}));

vi.mock('../components/menu/FilterChipsRow', () => ({ FilterChipsRow: () => null }));
vi.mock('../components/home/OffersRail', () => ({ OffersRail: () => null }));
vi.mock('../components/ItemSheet', () => ({ ItemSheet: () => null }));

/**
 * Owner, 2026-09-21: "in order app, 'other' items that are not in category
 * does not show the tab in rail." The section was there; the rail was not.
 */
describe('MenuPage — the Other section has a rail entry', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('lists uncategorised dishes under Other and offers the section on the rail', async () => {
    render(
      <MemoryRouter>
        <MenuPage />
      </MemoryRouter>,
    );

    const header = await screen.findByTestId('menu-section-other-header');
    expect(header).toHaveTextContent('Other');
    // Spied like a category so the rail lights up when it is in view.
    expect(header.getAttribute('data-category-id')).toBe('-1');
    const section = header.closest('section') as HTMLElement;
    expect(within(section).getByText('Mystery Bun')).toBeInTheDocument();
    expect(within(section).getByText('Orphan Roll')).toBeInTheDocument();
    expect(within(section).queryByText('House Salad')).toBeNull();

    const tab = screen.getByTestId('cat-rail-other');
    expect(tab).toHaveTextContent('Other, 2');
    expect(tab.getAttribute('aria-selected')).toBe('false');

    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    tab.click();
    await waitFor(() => expect(screen.getByTestId('cat-rail-other').getAttribute('aria-selected')).toBe('true'));
    expect(scrollTo).toHaveBeenCalled();
    scrollTo.mockRestore();
  });
});
