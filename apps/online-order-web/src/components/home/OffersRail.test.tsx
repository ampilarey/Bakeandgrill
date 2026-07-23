import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OffersRail } from './OffersRail';
import type { Offer } from '../../api/menu';

vi.mock('../../context/SiteSettingsContext', () => ({
  useSiteSettingsContext: () => ({
    text: (_key: string, fallback: string) => fallback,
  }),
}));

vi.mock('../menu/MenuThumb', () => ({
  MenuThumb: ({ alt }: { alt: string }) => <div data-testid="thumb">{alt}</div>,
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

  it('renders offer cards with deep links', () => {
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

    const wrapLink = screen.getByRole('link', { name: /Chicken Wrap/i });
    expect(wrapLink.getAttribute('href')).toBe('/menu?item=1');
  });
});
