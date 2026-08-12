import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from './HomePage';
import type { PageBlockRow } from '../api';

/**
 * Opening-status block always follows its own placement — never forced into Hero.
 */

const fetchPageBlocksMock = vi.fn();

function block(type: string, position: number): PageBlockRow {
  return {
    id: position + 1,
    app: 'order_app',
    page: 'home',
    block_type: type,
    position,
    is_enabled: true,
    content_mode: 'own',
    settings: {},
  };
}

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    fetchOnlineOrderingStatus: vi.fn().mockResolvedValue({ open: true }),
    fetchOffers: vi.fn().mockResolvedValue({ offers: [] }),
    fetchFeaturedReviews: vi.fn().mockResolvedValue({ reviews: [] }),
    fetchCustomerOrders: vi.fn().mockResolvedValue({ data: [] }),
    fetchItems: vi.fn().mockResolvedValue({ data: [] }),
    fetchPageBlocks: (...args: unknown[]) => fetchPageBlocksMock(...args),
    API_ORIGIN: 'https://example.test',
  };
});

vi.mock('../api/promotions', () => ({
  getLoyaltyAccount: vi.fn().mockResolvedValue(null),
}));

vi.mock('../context/CartContext', () => ({
  useCart: () => ({ addItem: vi.fn(), clearCart: vi.fn() }),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    authReady: true,
    customer: null,
    customerName: null,
  }),
}));

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({ t: (k: string) => k, lang: 'en' }),
}));

vi.mock('../context/SiteSettingsContext', () => ({
  useSiteSettingsContext: () => ({
    text: (_k: string, d: string) => d,
    settings: {
      logo: '/logo.png',
      site_name: 'Bake & Grill',
      business_whatsapp: '',
      business_viber: '',
      office_orders_enabled: '0',
    },
    heroSlides: [],
    trustItems: [],
    homepageCategories: [],
  }),
}));

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));

vi.mock('../components/home/PromoCarousel', () => ({
  PromoCarousel: ({ statusSlot }: { statusSlot?: React.ReactNode }) => (
    <div data-testid="promo-hero">{statusSlot}</div>
  ),
}));

vi.mock('../components/home/GreetingHeader', () => ({ GreetingHeader: () => null }));
vi.mock('../components/home/StatChipsRow', () => ({ StatChipsRow: () => null }));
vi.mock('../components/home/ModeEntryCards', () => ({ ModeEntryCards: () => null }));
vi.mock('../components/home/TrustStrip', () => ({ TrustStrip: () => null }));
vi.mock('../components/home/CategoryShortcuts', () => ({ CategoryShortcuts: () => null }));
vi.mock('../components/home/SpecialsCarousel', () => ({ SpecialsCarousel: () => null }));
vi.mock('../components/home/ReorderStrip', () => ({ ReorderStrip: () => null }));
vi.mock('../components/home/BrandFooter', () => ({ BrandFooter: () => null }));
vi.mock('../components/PrayerBar', () => ({ PrayerBar: () => null }));
vi.mock('../components/ServiceBanner', () => ({ ServiceBanner: () => null }));
vi.mock('../components/OpeningStatusBadge', () => ({
  OpeningStatusBadge: () => <span data-testid="opening-status-badge" />,
}));
vi.mock('../components/TomorrowOrderingBadge', () => ({
  TomorrowOrderingBadge: () => null,
}));

function renderHome(blocks: PageBlockRow[]) {
  fetchPageBlocksMock.mockResolvedValue({ blocks });
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

describe('HomePage opening status block', () => {
  beforeEach(() => {
    fetchPageBlocksMock.mockReset();
  });

  it('hero on + opening_status on: badge is standalone, not inside hero', async () => {
    renderHome([
      block('hero', 0),
      block('opening_status', 1),
      block('mode_cards', 2),
      block('brand_footer', 3),
    ]);

    await waitFor(() => {
      expect(screen.getByTestId('promo-hero')).toBeTruthy();
      expect(screen.getByTestId('home-standalone-status')).toBeTruthy();
    });
    expect(screen.getByTestId('promo-hero').querySelector('[data-testid="home-ordering-status-stack"]')).toBeNull();
    expect(screen.getAllByTestId('home-ordering-status-stack').length).toBe(1);
  });

  it('hero off + opening_status on: standalone badge', async () => {
    renderHome([
      block('opening_status', 0),
      block('mode_cards', 1),
      block('brand_footer', 2),
    ]);

    await waitFor(() => {
      expect(screen.getByTestId('home-standalone-status')).toBeTruthy();
    });
    expect(screen.getAllByTestId('home-ordering-status-stack').length).toBe(1);
    expect(screen.queryByTestId('promo-hero')).toBeNull();
  });

  it('opening_status off: no badge', async () => {
    renderHome([
      block('mode_cards', 0),
      block('brand_footer', 1),
    ]);

    await waitFor(() => {
      expect(fetchPageBlocksMock).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.queryByTestId('home-ordering-status-stack')).toBeNull();
    });
    expect(screen.queryByTestId('home-standalone-status')).toBeNull();
  });
});
