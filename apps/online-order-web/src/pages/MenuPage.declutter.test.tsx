import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuPage } from './MenuPage';

const showToast = vi.fn();
const setMode = vi.fn();

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    fetchCategories: vi.fn().mockResolvedValue({
      data: [{ id: 1, name: 'Grill', is_active: true }],
    }),
    fetchItems: vi.fn().mockResolvedValue({
      data: [
        {
          id: 10,
          name: 'Burger',
          description: 'Tasty',
          base_price: 50,
          category_id: 1,
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
  useLanguage: () => ({
    t: (k: string) => k,
    lang: 'en',
  }),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ showToast }),
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
    isAvailable: (key: string) => key !== 'online_pickup',
  }),
}));

vi.mock('../context/OrderModeContext', () => ({
  useOrderMode: () => ({
    mode: 'pickup',
    setMode,
    modeConfirmed: false,
    channel: 'online_pickup',
  }),
}));

vi.mock('../context/OrderDayContext', () => ({
  useOrderDay: () => ({ day: 'today', setDay: vi.fn() }),
}));

vi.mock('../components/OrderModeSheet', () => ({
  OrderModeSheet: () => null,
}));

vi.mock('../hooks/usePageTitle', () => ({
  usePageTitle: () => {},
}));

vi.mock('../components/menu/ProductCard', () => ({
  ProductCard: () => <div data-testid="product-card-stub" />,
}));

vi.mock('../components/menu/CategoryRail', () => ({
  CategoryRail: () => <div data-testid="category-rail" />,
}));

vi.mock('../components/menu/FilterChipsRow', () => ({
  FilterChipsRow: () => null,
}));

vi.mock('../components/home/OffersRail', () => ({
  OffersRail: () => null,
}));

vi.mock('../components/ItemSheet', () => ({
  ItemSheet: () => null,
}));

vi.mock('../components/SearchOverlay', () => ({
  SearchOverlay: () => null,
}));

describe('MenuPage declutter + pickup toast', () => {
  beforeEach(() => {
    showToast.mockClear();
  });

  it('does not render Our Complete Menu heading or ordering-status-bar', async () => {
    render(
      <MemoryRouter>
        <MenuPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('product-card-stub').length).toBeGreaterThan(0);
    });

    expect(screen.queryByText(/Our Complete Menu/i)).toBeNull();
    expect(screen.queryByText(/Browse and add items to your cart/i)).toBeNull();
    expect(document.querySelector('.ordering-status-bar')).toBeNull();
  });

  it('toasts when tapping blocked Tomorrow (no pre-orderable items)', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MenuPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('order-day-tomorrow')).toBeInTheDocument();
    });

    expect(screen.getByTestId('order-day-tomorrow')).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByTestId('order-day-tomorrow'));
    expect(showToast).toHaveBeenCalled();
    expect(String(showToast.mock.calls[0][0])).toMatch(/day\.tomorrow_unavailable/);
    // Day did not switch.
    expect(screen.getByTestId('order-day-today')).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows all three mode names; unavailable ones are dimmed', async () => {
    render(
      <MemoryRouter>
        <MenuPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('mode-chip')).toBeInTheDocument();
    });
    expect(screen.getByTestId('mode-switch-pickup')).toBeInTheDocument();
    expect(screen.getByTestId('mode-switch-delivery')).toBeInTheDocument();
    expect(screen.getByTestId('mode-switch-dine_in')).toBeInTheDocument();
    // Pickup is the default highlight before an explicit choice.
    expect(screen.getByTestId('mode-switch-pickup')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('mode-switch-delivery')).toHaveAttribute('aria-pressed', 'false');
    // Mock marks online_pickup unavailable → pickup dimmed; eat here off until gate loads.
    expect(screen.getByTestId('mode-switch-pickup')).toHaveAttribute('data-blocked', 'true');
    expect(screen.getByTestId('mode-switch-dine_in')).toHaveAttribute('data-blocked', 'true');
  });

  /** Owner, 2026-09-03: a tap switches straight away; a dimmed option only explains itself in a toast. */
  it('switches mode on a tap with no sheet, and toasts why a dimmed option cannot be chosen', async () => {
    const user = userEvent.setup();
    setMode.mockClear();
    render(
      <MemoryRouter>
        <MenuPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('mode-chip')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('mode-switch-delivery'));
    expect(setMode).toHaveBeenCalledWith('delivery');
    expect(showToast).not.toHaveBeenCalled();
    expect(screen.queryByText(/modeSheet\.title/)).toBeNull();

    await user.click(screen.getByTestId('mode-switch-pickup'));
    expect(setMode).toHaveBeenCalledTimes(1);
    expect(String(showToast.mock.calls[0][0])).toMatch(/modeSheet\.pickup_unavailable/);

    await user.click(screen.getByTestId('mode-switch-dine_in'));
    expect(setMode).toHaveBeenCalledTimes(1);
    expect(String(showToast.mock.calls[1][0])).toMatch(/modeSheet\.eat_here_unavailable/);
  });

  /** Owner, 2026-09-03: "keep A–Z, price, up/down, grid, list etc. hidden … to keep more space for menu items." */
  it('folds sort, layout and search behind one button in the top row, and remembers the choice', async () => {
    const user = userEvent.setup();
    localStorage.removeItem('bg-menu-controls-open');
    render(
      <MemoryRouter>
        <MenuPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('menu-controls-toggle')).toBeInTheDocument();
    });

    // Closed by default: no sort/layout row taking space above the food.
    expect(screen.queryByTestId('menu-controls')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Grid' })).toBeNull();
    expect(screen.queryByTestId('menu-rail-side')).toBeNull();
    expect(screen.getByTestId('menu-controls-toggle')).toHaveAttribute('aria-expanded', 'false');
    // The day and mode controls stay — only the set-once ones fold.
    expect(screen.getByTestId('mode-switch-pickup')).toBeInTheDocument();

    await user.click(screen.getByTestId('menu-controls-toggle'));
    expect(screen.getByTestId('menu-controls')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grid' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'List' })).toBeInTheDocument();
    expect(screen.getByTestId('menu-open-search')).toBeInTheDocument();
    expect(screen.getByTestId('menu-rail-side')).toBeInTheDocument();
    expect(screen.getByTestId('menu-controls-toggle')).toHaveAttribute('aria-expanded', 'true');
    expect(localStorage.getItem('bg-menu-controls-open')).toBe('1');

    await user.click(screen.getByTestId('menu-controls-toggle'));
    expect(screen.queryByTestId('menu-controls')).toBeNull();
    expect(localStorage.getItem('bg-menu-controls-open')).toBe('0');
  });

  /** Owner, 2026-09-03: a button beside Grid/List moves the rail to the other edge, remembered per device. */
  it('moves the category rail to the right and back, and remembers the choice', async () => {
    const user = userEvent.setup();
    localStorage.removeItem('bg-menu-rail-side');
    localStorage.setItem('bg-menu-controls-open', '1');
    render(
      <MemoryRouter>
        <MenuPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('menu-rail-side')).toBeInTheDocument();
    });
    expect(screen.getByTestId('menu-columns')).not.toHaveClass('menu-columns--rail-right');

    await user.click(screen.getByTestId('menu-rail-side'));
    expect(screen.getByTestId('menu-columns')).toHaveClass('menu-columns--rail-right');
    expect(screen.getByTestId('menu-rail-side')).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('bg-menu-rail-side')).toBe('right');
    // The shell's cart button and back-to-top read this to swap sides too.
    expect(document.documentElement).toHaveClass('rail-right');

    await user.click(screen.getByTestId('menu-rail-side'));
    expect(screen.getByTestId('menu-columns')).not.toHaveClass('menu-columns--rail-right');
    expect(localStorage.getItem('bg-menu-rail-side')).toBe('left');
    expect(document.documentElement).not.toHaveClass('rail-right');
  });

  /** Off the menu there is no rail to clash with, so the corners go back to normal. */
  it('clears the rail-side mark from the page when the menu is left', async () => {
    localStorage.setItem('bg-menu-rail-side', 'right');
    const { unmount } = render(
      <MemoryRouter>
        <MenuPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(document.documentElement).toHaveClass('rail-right');
    });

    unmount();
    expect(document.documentElement).not.toHaveClass('rail-right');
  });
});
