import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuPage } from './MenuPage';

/**
 * Two items in one category both reach the grid, and an open menu refreshes.
 *
 * Owner, 2026-09-05: the website menu showed Bondibai and Valhomas
 * (Hanakuri) under "Bondibai"; the order app showed only Bondibai. The rows
 * below are the real production payload for items 53 and 54 — identical in
 * every field the menu reads (same category, same menu group, both active and
 * available, both sizeful, both `sort_order: 0`) — so if the grid can drop one
 * of them, this is where it shows.
 */

const calls = vi.hoisted(() => ({ n: 0 }));

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  const realItem = (id: number, name: string, small: number, medium: number) => ({
    id,
    name,
    description: null,
    base_price: 0,
    category_id: 9,
    category: { id: 9, name: 'Bondibai' },
    extra_category_ids: [],
    menu_group_id: 1,
    sort_order: 0,
    is_active: true,
    is_available: true,
    available_now: true,
    unavailable_reason: null,
    is_catering: false,
    is_new: id === 54,
    is_combo: false,
    allow_pre_order: false,
    tomorrow_remaining: null,
    has_variants: true,
    dietary_tags: [],
    variants: [
      { id: id * 10, name: 'Small', price: small, is_active: true },
      { id: id * 10 + 1, name: 'Medium', price: medium, is_active: true },
    ],
  });
  return {
    ...actual,
    fetchCategories: vi.fn().mockResolvedValue({
      data: [
        { id: 9, name: 'Bondibai', is_active: true, parent_id: null, sort_order: 0 },
        { id: 10, name: 'Drinks', is_active: true, parent_id: null, sort_order: 1 },
      ],
    }),
    // First load has only Bondibai — the menu as it stood before 15:51.
    // Every later load has both, as the API has all along.
    fetchItems: vi.fn().mockImplementation((channel?: string) => {
      if (channel === 'catering') {
        return Promise.resolve({ data: [], channelUsed: 'catering', deliveryFallback: false });
      }
      calls.n += 1;
      const data = calls.n === 1
        ? [realItem(53, 'Bondibai', 20, 40)]
        : [realItem(53, 'Bondibai', 20, 40), realItem(54, 'Valhomas (Hanakuri)', 25, 50)];
      return Promise.resolve({ data, channelUsed: 'online_pickup', deliveryFallback: false });
    }),
    fetchOnlineOrderingStatus: vi.fn().mockResolvedValue({
      open: true, delivery_available: true, message: null,
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
  ProductCard: ({ item, isNew }: { item: { name: string }; isNew?: boolean }) => (
    <div data-testid="product-card-stub" data-is-new={isNew ? 'true' : 'false'}>{item.name}</div>
  ),
}));

vi.mock('../components/menu/CategoryRail', () => ({
  CategoryRail: () => <div data-testid="category-rail" />,
}));

vi.mock('../components/menu/FilterChipsRow', () => ({ FilterChipsRow: () => null }));
vi.mock('../components/home/OffersRail', () => ({ OffersRail: () => null }));
vi.mock('../components/ItemSheet', () => ({ ItemSheet: () => null }));
vi.mock('../components/SearchOverlay', () => ({ SearchOverlay: () => null }));


beforeEach(() => {
  localStorage.clear();
  calls.n = 0;
  vi.useRealTimers();
});

function renderedNames(): string[] {
  return [...new Set(screen.getAllByTestId('product-card-stub').map((n) => n.textContent ?? ''))];
}

describe('two items in one category', () => {
  it('renders both cards when the payload has both', async () => {
    calls.n = 1; // skip the first-load payload; assert the steady state
    render(<MemoryRouter><MenuPage /></MemoryRouter>);

    await waitFor(() => expect(screen.getAllByTestId('product-card-stub').length).toBeGreaterThan(0));

    expect(renderedNames().sort()).toEqual(['Bondibai', 'Valhomas (Hanakuri)']);
  });
});

describe('an open menu does not go stale', () => {
  it('refetches when the tab comes back into view', async () => {
    // The owner's case: a page opened before the item existed still showed the
    // old menu hours later, because the menu was fetched once and never again.
    render(<MemoryRouter><MenuPage /></MemoryRouter>);
    await waitFor(() => expect(renderedNames()).toEqual(['Bondibai']));

    // Come back to the tab after longer than the menu's allowed age.
    vi.setSystemTime(new Date(Date.now() + 5 * 60 * 1000));
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => expect(renderedNames().sort()).toEqual(['Bondibai', 'Valhomas (Hanakuri)']));
  });

  it('does not refetch on every glance at the tab', async () => {
    // Flicking between apps must not be a request per tap.
    render(<MemoryRouter><MenuPage /></MemoryRouter>);
    await waitFor(() => expect(renderedNames()).toEqual(['Bondibai']));
    const after = calls.n;

    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));

    await new Promise((r) => setTimeout(r, 20));
    expect(calls.n).toBe(after);
  });

  it('refetches when the phone restores the page from the back/forward cache', async () => {
    // The case that actually bit: iOS resumes the page instead of loading it,
    // so no reload happens and the freshness clock is meaningless — the data
    // is from whenever the page was frozen.
    render(<MemoryRouter><MenuPage /></MemoryRouter>);
    await waitFor(() => expect(renderedNames()).toEqual(['Bondibai']));

    const restore = new Event('pageshow') as Event & { persisted?: boolean };
    Object.defineProperty(restore, 'persisted', { value: true });
    window.dispatchEvent(restore);

    await waitFor(() => expect(renderedNames().sort()).toEqual(['Bondibai', 'Valhomas (Hanakuri)']));
  });

  it('does not refetch on a normal page load', async () => {
    // pageshow also fires on an ordinary load, moments after the first fetch.
    render(<MemoryRouter><MenuPage /></MemoryRouter>);
    await waitFor(() => expect(renderedNames()).toEqual(['Bondibai']));
    const after = calls.n;

    window.dispatchEvent(new Event('pageshow'));

    await new Promise((r) => setTimeout(r, 20));
    expect(calls.n).toBe(after);
  });

  it('keeps the grid on screen while it refreshes', async () => {
    // A background refresh that blanks the list to a spinner would throw away
    // the customer's place in it.
    render(<MemoryRouter><MenuPage /></MemoryRouter>);
    await waitFor(() => expect(renderedNames()).toEqual(['Bondibai']));

    vi.setSystemTime(new Date(Date.now() + 5 * 60 * 1000));
    document.dispatchEvent(new Event('visibilitychange'));

    expect(screen.getAllByTestId('product-card-stub').length).toBeGreaterThan(0);
    await waitFor(() => expect(renderedNames().sort()).toEqual(['Bondibai', 'Valhomas (Hanakuri)']));
  });
});

describe('new dishes are marked', () => {
  it('passes the server\u2019s verdict to the card', async () => {
    // Owner, 2026-09-05: "In blade menu new items are marked. But on order
    // app its not showing." The card has always had the badge; nothing passed
    // it, so every dish rendered as if it were old.
    calls.n = 1;
    render(<MemoryRouter><MenuPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByTestId('product-card-stub').length).toBeGreaterThan(1));

    const marks = Object.fromEntries(
      screen.getAllByTestId('product-card-stub').map((n) => [n.textContent, n.getAttribute('data-is-new')]),
    );
    expect(marks['Valhomas (Hanakuri)']).toBe('true');
    expect(marks['Bondibai']).toBe('false');
  });
});
