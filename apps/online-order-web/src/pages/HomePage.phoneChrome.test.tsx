import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from './HomePage';

const fetchPageBlocksMock = vi.fn();

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
  PromoCarousel: () => <div data-testid="promo-hero" />,
}));
vi.mock('../components/home/GreetingHeader', () => ({
  GreetingHeader: ({ showCopy = true }: { showCopy?: boolean }) => (
    <div data-testid={showCopy ? 'greeting' : 'phone-chrome-fallback'} />
  ),
}));
vi.mock('../components/home/StatChipsRow', () => ({ StatChipsRow: () => null }));
vi.mock('../components/home/ModeEntryCards', () => ({
  ModeEntryCards: () => <div data-testid="mode-cards" />,
}));
vi.mock('../components/home/TrustStrip', () => ({ TrustStrip: () => null }));
vi.mock('../components/home/CategoryShortcuts', () => ({
  CategoryShortcuts: () => null,
}));
vi.mock('../components/home/SpecialsCarousel', () => ({ SpecialsCarousel: () => null }));
vi.mock('../components/home/ReorderStrip', () => ({ ReorderStrip: () => null }));
vi.mock('../components/home/BrandFooter', () => ({
  BrandFooter: () => <div data-testid="brand-footer" />,
}));
vi.mock('../components/PrayerBar', () => ({ PrayerBar: () => null }));
vi.mock('../components/OpeningStatusBadge', () => ({ OpeningStatusBadge: () => null }));
vi.mock('../components/TomorrowOrderingBadge', () => ({ TomorrowOrderingBadge: () => null }));

describe('HomePage phone chrome without greeting block', () => {
  beforeEach(() => {
    fetchPageBlocksMock.mockReset();
  });

  it('still shows logo/login chrome when greeting is missing from the layout', async () => {
    fetchPageBlocksMock.mockResolvedValue({
      blocks: [
        {
          id: 1,
          app: 'order_app',
          page: 'home',
          block_type: 'mode_cards',
          position: 0,
          is_enabled: true,
          content_mode: 'own',
          settings: {},
        },
        {
          id: 2,
          app: 'order_app',
          page: 'home',
          block_type: 'brand_footer',
          position: 1,
          is_enabled: true,
          content_mode: 'shared',
          settings: {},
        },
      ],
    });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId('mode-cards')).toBeTruthy());
    expect(screen.getByTestId('phone-chrome-fallback')).toBeTruthy();
    expect(screen.queryByTestId('greeting')).toBeNull();
    expect(screen.getByTestId('brand-footer')).toBeTruthy();
  });
});
