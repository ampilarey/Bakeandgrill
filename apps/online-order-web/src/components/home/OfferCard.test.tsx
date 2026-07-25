import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OfferCard, uniqueOffersById } from './OfferCard';
import type { Offer } from '../../api/menu';

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

const offer: Offer = {
  id: 'special-x',
  kind: 'special',
  title: 'No Photo Special',
  badge: '10% OFF',
  effective_price: 9,
  original_price: 10,
  image_url: null,
  link: '/menu?item=3',
};

describe('OfferCard', () => {
  it('shows branded circle placeholder when offer has no image', () => {
    render(
      <MemoryRouter>
        <OfferCard offer={offer} apiOrigin="https://example.test" logoSrc="/logo.png" />
      </MemoryRouter>,
    );

    const slider = screen.getByTestId('menu-image-slider');
    expect(slider.getAttribute('data-has-media')).toBe('0');
    expect(slider.getAttribute('data-logo')).toBe('/logo.png');
    expect(screen.getByTestId('offer-card-media-frame').style.aspectRatio.replace(/\s/g, '')).toMatch(/1\/1|1/);
    expect(screen.getByTestId('offer-card-price-row').textContent).toMatch(/9\.00\/-/);
    expect(screen.getByTestId('offer-card-price-row').textContent).not.toMatch(/MVR/i);
  });

  it('uniqueOffersById drops duplicate ids', () => {
    const dup: Offer[] = [offer, { ...offer, title: 'Copy' }, { ...offer, id: 'other', title: 'Other' }];
    expect(uniqueOffersById(dup).map((o) => o.id)).toEqual(['special-x', 'other']);
  });
});
