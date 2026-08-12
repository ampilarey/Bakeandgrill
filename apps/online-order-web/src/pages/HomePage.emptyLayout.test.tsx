import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from './HomePage';
import { PageBlocksProvider } from '../context/PageBlocksContext';

/**
 * Stage F: page_blocks is the only home layout source. An empty layout (or a
 * failed request) must never blank the page — the blocks the owner cannot
 * remove, the mode cards and the brand footer, still render, and nothing else
 * from the retired legacy list comes back.
 */

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
  GreetingHeader: () => <div data-testid="greeting" />,
}));
vi.mock('../components/home/HomePhoneHeader', () => ({
  HomePhoneHeader: () => <div data-testid="home-phone-header" />,
}));
vi.mock('../components/home/StatChipsRow', () => ({ StatChipsRow: () => null }));
vi.mock('../components/home/ModeEntryCards', () => ({
  ModeEntryCards: () => <div data-testid="mode-cards" />,
}));
vi.mock('../components/home/TrustStrip', () => ({ TrustStrip: () => null }));
vi.mock('../components/home/CategoryShortcuts', () => ({
  CategoryShortcuts: () => <div data-testid="categories" />,
}));
vi.mock('../components/home/SpecialsCarousel', () => ({ SpecialsCarousel: () => null }));
vi.mock('../components/home/ReorderStrip', () => ({ ReorderStrip: () => null }));
vi.mock('../components/home/BrandFooter', () => ({
  BrandFooter: () => <div data-testid="brand-footer" />,
}));
vi.mock('../components/PrayerBar', () => ({
  PrayerBar: () => <div data-testid="prayer-bar" />,
}));
vi.mock('../components/OpeningStatusBadge', () => ({ OpeningStatusBadge: () => null }));
vi.mock('../components/TomorrowOrderingBadge', () => ({ TomorrowOrderingBadge: () => null }));

async function expectRequiredChromeOnly() {
  render(
    <MemoryRouter>
      <PageBlocksProvider>
        <HomePage />
      </PageBlocksProvider>
    </MemoryRouter>,
  );

  await waitFor(() => expect(screen.getByTestId('mode-cards')).toBeTruthy());
  expect(screen.getByTestId('brand-footer')).toBeTruthy();
  expect(screen.queryByTestId('promo-hero')).toBeNull();
  expect(screen.queryByTestId('greeting')).toBeNull();
  expect(screen.queryByTestId('prayer-bar')).toBeNull();
  expect(screen.queryByTestId('categories')).toBeNull();
}

describe('HomePage with no page_blocks', () => {
  beforeEach(() => {
    fetchPageBlocksMock.mockReset();
  });

  it('renders the non-removable blocks only when the layout is empty', async () => {
    fetchPageBlocksMock.mockResolvedValue({ app: 'order_app', page: 'home', blocks: [] });
    await expectRequiredChromeOnly();
  });

  it('renders the non-removable blocks only when the layout request fails', async () => {
    fetchPageBlocksMock.mockRejectedValue(new Error('offline'));
    await expectRequiredChromeOnly();
  });
});
