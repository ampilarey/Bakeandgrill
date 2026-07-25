import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OffersRail } from './OffersRail';
import type { Offer } from '../../api/menu';

vi.mock('../../context/SiteSettingsContext', () => ({
  useSiteSettingsContext: () => ({
    text: (_key: string, fallback: string) => fallback,
    settings: { logo: '/logo.png' },
  }),
}));

vi.mock('../menu/MenuImageSlider', () => ({
  MenuImageSlider: ({
    slides,
    alt,
    logoSrc,
  }: {
    slides: Array<{ url?: string } | string>;
    alt: string;
    logoSrc?: string | null;
  }) => {
    const hasMedia = slides.length > 0;
    return (
      <div
        data-testid="menu-image-slider"
        data-has-media={hasMedia ? '1' : '0'}
        data-logo={logoSrc ?? ''}
        data-alt={alt}
      />
    );
  },
}));

const sampleOffers: Offer[] = [
  {
    id: 'special-1',
    kind: 'special',
    title: 'Chicken Wrap',
    badge: '20% OFF',
    effective_price: 80,
    original_price: 100,
    image_url: null,
    link: '/menu?item=1',
  },
  {
    id: 'promo-2',
    kind: 'promo',
    title: 'Happy Hour',
    badge: '10% OFF',
    effective_price: null,
    original_price: null,
    image_url: null,
    link: '/menu',
  },
  {
    id: 'special-img',
    kind: 'special',
    title: 'Grilled Fish',
    badge: 'Special Offer',
    effective_price: 120.5,
    original_price: 150,
    image_url: '/media/fish.jpg',
    link: '/menu?item=9',
  },
];

describe('OffersRail', () => {
  it('renders nothing when offers are empty', () => {
    const { container } = render(
      <MemoryRouter>
        <OffersRail offers={[]} apiOrigin="https://example.test" />
      </MemoryRouter>,
    );
    expect(container.querySelector('#offers')).toBeNull();
  });

  it('renders circular media frames with no card box chrome', () => {
    const { container } = render(
      <MemoryRouter>
        <OffersRail
          offers={sampleOffers}
          headline="Today's Offers"
          apiOrigin="https://example.test"
        />
      </MemoryRouter>,
    );

    const frames = screen.getAllByTestId('offers-rail-card-media-frame');
    expect(frames.length).toBe(3);
    for (const frame of frames) {
      expect(frame.className).toContain('menu-card-media-circle__frame');
      expect(frame.style.aspectRatio.replace(/\s/g, '')).toMatch(/1\/1|1/);
    }

    const cards = screen.getAllByTestId('offers-rail-card');
    for (const card of cards) {
      expect(card.className).toContain('menu-card-article--zus');
      expect(card.style.background).toBe('');
      expect(card.style.border).toBe('');
      expect(card.style.boxShadow).toBe('');
    }

    // No rectangular card chrome left in inline styles on the strip cards.
    expect(container.querySelector('.offers-rail-card[style*="border"]')).toBeNull();
  });

  it('shows N/- prices without MVR and branded placeholder when no image', () => {
    render(
      <MemoryRouter>
        <OffersRail offers={sampleOffers} apiOrigin="https://example.test" />
      </MemoryRouter>,
    );

    const priceRows = screen.getAllByTestId('offers-rail-card-price-row');
    expect(priceRows[0].textContent).toMatch(/80\.00\/-/);
    expect(priceRows[0].textContent).toMatch(/100\.00\/-/);
    expect(priceRows[0].textContent).not.toMatch(/MVR/i);
    expect(priceRows[1].textContent).toMatch(/120\.50\/-/);
    expect(priceRows[1].textContent).not.toMatch(/MVR/i);

    const sliders = screen.getAllByTestId('menu-image-slider');
    const emptyMedia = sliders.filter((el) => el.getAttribute('data-has-media') === '0');
    expect(emptyMedia.length).toBeGreaterThanOrEqual(1);
    expect(emptyMedia[0].getAttribute('data-logo')).toBe('/logo.png');
  });

  it('renders offer cards with deep links and sale badge', () => {
    render(
      <MemoryRouter>
        <OffersRail
          offers={sampleOffers}
          headline="Today's Offers"
          subtext="Grab them while they last"
          apiOrigin="https://example.test"
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Today's Offers")).toBeInTheDocument();
    expect(screen.getByText('Grab them while they last')).toBeInTheDocument();
    expect(screen.getAllByText('Chicken Wrap').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Happy Hour').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('20% OFF').length).toBeGreaterThanOrEqual(1);

    const wrapLink = screen.getByRole('link', { name: /Chicken Wrap/i });
    expect(wrapLink.getAttribute('href')).toBe('/menu?item=1');
  });
});

describe('offerUrgencyLabel', () => {
  it('shows countdown within 24h', async () => {
    const { offerUrgencyLabel } = await import('./OffersRail');
    const now = Date.parse('2026-07-23T12:00:00.000Z');
    expect(offerUrgencyLabel('2026-07-23T14:30:00.000Z', now)).toBe('Ends in 3h');
    expect(offerUrgencyLabel('2026-07-23T12:20:00.000Z', now)).toBe('Ends in 20m');
    expect(offerUrgencyLabel('2026-07-25T12:00:00.000Z', now)).toBeNull();
  });
});
