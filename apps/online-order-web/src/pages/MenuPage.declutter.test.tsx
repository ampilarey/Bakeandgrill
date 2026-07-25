import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuPage } from './MenuPage';

const showToast = vi.fn();

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
  }),
}));

vi.mock('../context/ShellNavContext', () => ({
  useShellNav: () => ({ openCartSheet: vi.fn() }),
}));

vi.mock('../context/SiteSettingsContext', () => ({
  useSiteSettingsContext: () => ({
    text: (_k: string, d: string) => d,
    settings: { logo: '/logo.png' },
  }),
}));

vi.mock('../context/ServiceStatusContext', () => ({
  useServiceStatusContext: () => ({
    isAvailable: (key: string) => key !== 'online_pickup',
    get: () => null,
  }),
}));

vi.mock('../context/OrderModeContext', () => ({
  useOrderMode: () => ({
    mode: 'delivery',
    setMode: vi.fn(),
  }),
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

  it('toasts when tapping blocked Pickup', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MenuPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /pickup/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /pickup/i }));
    expect(showToast).toHaveBeenCalled();
    expect(String(showToast.mock.calls[0][0])).toMatch(/pickup/i);
  });
});
