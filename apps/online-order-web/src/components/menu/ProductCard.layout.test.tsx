import { render, screen } from '@testing-library/react';
import { ProductCard } from './ProductCard';
import type { Item } from '../../api';

vi.mock('../../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    lang: 'en',
  }),
}));

vi.mock('../../context/SiteSettingsContext', () => ({
  useSiteSettingsContext: () => ({
    settings: { logo: '/logo.png' },
    text: (_k: string, d: string) => d,
  }),
}));

vi.mock('../../utils/itemMedia', () => ({
  buildItemSlides: () => [],
}));

vi.mock('./MenuImageSlider', () => ({
  MenuImageSlider: ({ logoSrc }: { logoSrc?: string }) => (
    <div data-testid="slider" data-logo={logoSrc || ''} />
  ),
}));

const baseItem: Item = {
  id: 1,
  name: 'Very Long Burger Name That Should Clamp Across Two Lines Only',
  description: 'A delicious grilled burger with cheese and special sauce that goes on forever.',
  base_price: 100,
  image_url: null,
  category_id: 1,
  is_available: true,
  has_variants: false,
  variants: [],
};

describe('ProductCard layout polish', () => {
  it('renders branded slider placeholder path (no photo) and clamps name/desc', () => {
    const { container } = render(
      <ProductCard
        item={baseItem}
        onSelectItem={() => {}}
        onAddToCart={() => {}}
        onToggleFavourite={() => {}}
      />,
    );

    expect(screen.getByTestId('slider')).toBeInTheDocument();
    expect(container.textContent).not.toContain('🍽️');

    const name = container.querySelector('.menu-card-name') as HTMLElement;
    expect(name).toBeTruthy();
    expect(name.style.webkitLineClamp || name.getAttribute('style')).toMatch(/line-clamp|2/);

    const desc = container.querySelector('.menu-card-desc') as HTMLElement;
    expect(desc).toBeTruthy();

    expect(container.querySelector('.menu-card-price-row')).toBeTruthy();

    const fav = container.querySelector('.menu-card-fav-btn') as HTMLElement;
    expect(fav).toBeTruthy();
    expect(fav.style.minWidth).toBe('44px');
    expect(fav.style.minHeight).toBe('44px');

    const add = container.querySelector('.card-add-btn') as HTMLElement;
    expect(add).toBeTruthy();
    expect(add.style.minHeight).toBe('44px');
  });
});
