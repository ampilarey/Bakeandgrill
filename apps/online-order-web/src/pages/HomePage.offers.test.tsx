import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from './HomePage';
import { PageBlocksProvider } from '../context/PageBlocksContext';

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  // page_blocks is the only layout source, so the carousel needs a layout that
  // actually contains the specials block.
  const layoutBlocks = ['hero', 'specials', 'brand_footer'].map((type, position) => ({
    id: position + 1,
    app: 'order_app' as const,
    page: 'home' as const,
    block_type: type,
    position,
    is_enabled: true,
    content_mode: 'own' as const,
    settings: {},
  }));
  const offers = [
    {
      id: 'special-1',
      kind: 'special' as const,
      title: 'Wrap',
      badge: '20% OFF',
      effective_price: 80,
      original_price: 100,
      image_url: null,
      link: '/menu?item=1',
    },
    {
      id: 'special-1',
      kind: 'special' as const,
      title: 'Wrap Dup',
      badge: '20% OFF',
      effective_price: 80,
      original_price: 100,
      image_url: null,
      link: '/menu?item=1',
    },
    {
      id: 'promo-9',
      kind: 'promo' as const,
      title: 'Happy Hour',
      badge: '10% OFF',
      link: '/menu',
    },
  ];
  return {
    ...actual,
    fetchOnlineOrderingStatus: vi.fn().mockResolvedValue({ open: true }),
    fetchOffers: vi.fn().mockResolvedValue({ offers }),
    fetchFeaturedReviews: vi.fn().mockResolvedValue({ reviews: [] }),
    fetchCustomerOrders: vi.fn().mockResolvedValue({ data: [] }),
    fetchItems: vi.fn().mockResolvedValue({ data: [] }),
    fetchPageBlocks: vi.fn().mockResolvedValue({ app: 'order_app', page: 'home', blocks: layoutBlocks }),
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
  useLanguage: () => ({
    t: (k: string) => k,
    lang: 'en',
  }),
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
  PromoCarousel: () => <div data-testid="promo-hero">Hero</div>,
}));

vi.mock('../components/home/HomePhoneHeader', () => ({
  HomePhoneHeader: () => null,
}));
vi.mock('../components/home/GreetingHeader', () => ({
  GreetingHeader: () => null,
}));
vi.mock('../components/home/StatChipsRow', () => ({
  StatChipsRow: () => null,
}));
vi.mock('../components/home/ModeEntryCards', () => ({
  ModeEntryCards: () => null,
}));
vi.mock('../components/home/TrustStrip', () => ({
  TrustStrip: () => null,
}));
vi.mock('../components/home/CategoryShortcuts', () => ({
  CategoryShortcuts: () => null,
}));
vi.mock('../components/home/ReorderStrip', () => ({
  ReorderStrip: () => null,
}));
vi.mock('../components/home/BrandFooter', () => ({
  BrandFooter: () => null,
}));
vi.mock('../components/PrayerBar', () => ({
  PrayerBar: () => null,
}));
vi.mock('../components/OpeningStatusBadge', () => ({
  OpeningStatusBadge: () => null,
}));

vi.mock('../components/menu/MenuImageSlider', () => ({
  MenuImageSlider: () => (
    <div data-testid="menu-image-slider" data-has-media="0" data-logo="/logo.png" />
  ),
}));

describe('HomePage offers carousel', () => {
  it('shows one consolidated offers carousel without duplicate offer ids', async () => {
    render(
      <MemoryRouter>
        <PageBlocksProvider>
          <HomePage />
        </PageBlocksProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('home-offers-carousel')).toBeTruthy();
    });
    expect(screen.getByTestId('promo-hero')).toBeTruthy();

    const cards = screen.getAllByTestId('specials-carousel-card');
    expect(cards.length).toBe(2);
    const titles = cards.map((c) => c.textContent ?? '');
    expect(titles.filter((t) => t.includes('Wrap')).length).toBe(1);
    expect(titles.some((t) => t.includes('Happy Hour'))).toBe(true);
  });
});
