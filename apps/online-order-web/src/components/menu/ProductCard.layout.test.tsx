import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductCard } from './ProductCard';
import type { Item } from '../../api';

const langRef = { current: 'en' as 'en' | 'dv' };

vi.mock('../../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    lang: langRef.current,
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
  MenuImageSlider: ({
    logoSrc,
    posterOnly,
    className,
  }: {
    logoSrc?: string;
    posterOnly?: boolean;
    className?: string;
  }) => (
    <div
      data-testid="slider"
      data-logo={logoSrc || ''}
      data-poster-only={posterOnly ? '1' : '0'}
      className={className}
    />
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

describe('ProductCard ZUS compact layout', () => {
  beforeEach(() => {
    langRef.current = 'en';
  });

  it('renders circular media frame, 3 lines, no inline add, and opens detail on tap', async () => {
    const user = userEvent.setup();
    const onSelectItem = vi.fn();
    const { container } = render(
      <ProductCard
        item={baseItem}
        onSelectItem={onSelectItem}
        onAddToCart={() => {}}
        onToggleFavourite={() => {}}
      />,
    );

    expect(screen.getByTestId('slider')).toBeInTheDocument();
    expect(screen.getByTestId('slider')).toHaveAttribute('data-poster-only', '1');
    expect(container.querySelector('.menu-card-media-circle__frame')).toBeTruthy();
    expect(container.textContent).not.toContain('🍽️');

    expect(container.querySelector('.menu-card-name')).toBeTruthy();
    expect(container.querySelector('.menu-card-desc')).toBeTruthy();
    expect(container.querySelector('.menu-card-price-row')).toBeTruthy();

    const fav = container.querySelector('.menu-card-fav-btn') as HTMLElement;
    expect(fav).toBeTruthy();
    expect(fav.style.minWidth).toBe('44px');
    expect(fav.style.minHeight).toBe('44px');

    expect(container.querySelector('.card-add-btn')).toBeNull();
    expect(container.querySelector('.card-customise-btn')).toBeNull();

    await user.click(screen.getByTestId('product-card'));
    expect(onSelectItem).toHaveBeenCalledWith(baseItem, 1);
  });

  it('uses card_name / short_description / price_note when set', () => {
    const { container } = render(
      <ProductCard
        item={{
          ...baseItem,
          card_name: 'Short Burger',
          short_description: 'Smoky & juicy',
          price_note: 'from',
        }}
        onSelectItem={() => {}}
        onAddToCart={() => {}}
      />,
    );

    expect(container.querySelector('.menu-card-name')?.textContent).toBe('Short Burger');
    expect(container.querySelector('.menu-card-desc')?.textContent).toBe('Smoky & juicy');
    expect(container.querySelector('.menu-card-price-note')?.textContent).toMatch(/from/i);
    expect(container.textContent).not.toContain(baseItem.name);
  });

  it('falls back to name + truncated description when card fields empty', () => {
    const { container } = render(
      <ProductCard
        item={baseItem}
        onSelectItem={() => {}}
        onAddToCart={() => {}}
      />,
    );

    expect(container.querySelector('.menu-card-name')?.textContent).toBe(baseItem.name);
    expect(container.querySelector('.menu-card-desc')?.textContent).toMatch(/delicious grilled burger/i);
  });

  it('uses DV card fields when lang=dv', () => {
    langRef.current = 'dv';
    const { container } = render(
      <ProductCard
        item={{
          ...baseItem,
          name: 'English Name',
          name_dv: 'Dhivehi Name',
          card_name: 'EN Card',
          card_name_dv: 'DV Card',
          short_description: 'EN detail',
          short_description_dv: 'DV detail',
        }}
        onSelectItem={() => {}}
        onAddToCart={() => {}}
      />,
    );
    expect(container.querySelector('.menu-card-name')?.textContent).toBe('DV Card');
    expect(container.querySelector('.menu-card-desc')?.textContent).toBe('DV detail');
  });
});
