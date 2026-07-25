import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SpecialsCarousel } from './SpecialsCarousel';
import type { Offer } from '../../api/menu';

vi.mock('../../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => (key === 'home.see_all' ? 'See all' : key),
    lang: 'en',
  }),
}));

vi.mock('../../context/SiteSettingsContext', () => ({
  useSiteSettingsContext: () => ({
    text: (_key: string, fallback: string) => fallback,
    settings: { logo: '/logo.png' },
  }),
}));

vi.mock('../menu/MenuImageSlider', () => ({
  MenuImageSlider: ({
    slides,
    logoSrc,
  }: {
    slides: Array<{ url?: string }>;
    logoSrc?: string | null;
  }) => (
    <div
      data-testid="menu-image-slider"
      data-has-media={slides.length > 0 ? '1' : '0'}
      data-logo={logoSrc ?? ''}
    />
  ),
}));

const offers: Offer[] = [
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
    id: 'special-1',
    kind: 'special',
    title: 'Chicken Wrap duplicate',
    badge: '20% OFF',
    effective_price: 80,
    original_price: 100,
    image_url: null,
    link: '/menu?item=1',
  },
  {
    id: 'special-2',
    kind: 'special',
    title: 'Fish',
    badge: 'Special Offer',
    effective_price: 12.5,
    original_price: 15,
    image_url: '/media/fish.jpg',
    link: '/menu?item=2',
  },
];

describe('SpecialsCarousel', () => {
  it('renders N/- prices and circular 1:1 media frames', () => {
    render(
      <MemoryRouter>
        <SpecialsCarousel offers={offers} apiOrigin="https://example.test" />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('home-offers-carousel')).toBeTruthy();
    const frames = screen.getAllByTestId('specials-carousel-card-media-frame');
    expect(frames.length).toBe(2); // de-duped by id
    for (const frame of frames) {
      expect(frame.className).toContain('menu-card-media-circle__frame');
      expect(frame.style.aspectRatio.replace(/\s/g, '')).toMatch(/1\/1|1/);
    }

    const prices = screen.getAllByTestId('specials-carousel-card-price-row');
    expect(prices[0].textContent).toMatch(/80\.00\/-/);
    expect(prices[0].textContent).toMatch(/100\.00\/-/);
    expect(prices[0].textContent).not.toMatch(/MVR/i);
  });

  it('uses branded placeholder (via slider) when offer has no image', () => {
    render(
      <MemoryRouter>
        <SpecialsCarousel offers={[offers[0]]} apiOrigin="https://example.test" />
      </MemoryRouter>,
    );
    const slider = screen.getByTestId('menu-image-slider');
    expect(slider.getAttribute('data-has-media')).toBe('0');
    expect(slider.getAttribute('data-logo')).toBe('/logo.png');
  });
});
