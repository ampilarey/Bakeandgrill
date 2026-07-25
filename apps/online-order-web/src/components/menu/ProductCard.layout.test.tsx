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
    aspectRatio,
  }: {
    logoSrc?: string;
    posterOnly?: boolean;
    className?: string;
    aspectRatio?: string;
  }) => (
    <div
      data-testid="slider"
      data-logo={logoSrc || ''}
      data-poster-only={posterOnly ? '1' : '0'}
      data-aspect={aspectRatio || ''}
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

  it('floats without card chrome; media frame is square 1/1; price uses /- without MVR', async () => {
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

    const card = screen.getByTestId('product-card');
    expect(card.className).toContain('menu-card-article--zus');
    // Floating card: no inline chrome (surface comes from transparent CSS class)
    expect(card.getAttribute('style') || '').not.toMatch(/background|border|box-shadow/i);

    const frame = screen.getByTestId('menu-card-media-frame');
    expect(frame.className).toContain('menu-card-media-circle__frame');
    // Square → circle: aspect-ratio 1/1 on slider; frame size is CSS aspect-ratio 1/1
    expect(screen.getByTestId('slider')).toHaveAttribute('data-aspect', '1 / 1');

    expect(screen.getByTestId('menu-card-price-row').textContent).toMatch(/100\.00\/-/);
    expect(container.textContent).not.toMatch(/MVR/);

    expect(container.querySelector('.card-add-btn')).toBeNull();
    await user.click(card);
    expect(onSelectItem).toHaveBeenCalledWith(baseItem, 1);
  });

  it('renders From N/- for variant items and struck was price as N/-', () => {
    const { container } = render(
      <ProductCard
        item={{
          ...baseItem,
          has_variants: true,
          variants: [
            { id: 1, name: 'S', price: 13.2, is_active: true },
            { id: 2, name: 'L', price: 18, is_active: true },
          ],
          special: {
            id: 9,
            badge_label: '15% OFF',
            discount_pct: 15,
            original_price: 13.2,
            effective_price: 11.22,
          },
        }}
        onSelectItem={() => {}}
        onAddToCart={() => {}}
      />,
    );

    expect(container.textContent).toMatch(/From\s+13\.20\/-/);
    expect(container.textContent).not.toMatch(/MVR/);
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
    expect(screen.getByTestId('menu-card-price-row').textContent).toMatch(/from\s+100\.00\/-/i);
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
