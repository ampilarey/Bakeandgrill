import { render, screen } from '@testing-library/react';
import { ProductCard } from './ProductCard';
import type { Item } from '../../api';

vi.mock('../../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    lang: 'en',
  }),
}));

const settingsRef = { default_item_image: '' as string };

vi.mock('../../context/SiteSettingsContext', () => ({
  useSiteSettingsContext: () => ({
    settings: {
      logo: '/logo.png',
      default_item_image: settingsRef.default_item_image || undefined,
    },
    text: (_k: string, d: string) => d,
  }),
}));

vi.mock('./MenuImageSlider', () => ({
  MenuImageSlider: ({
    slides,
    logoSrc,
  }: {
    slides: Array<{ url?: string; type?: string }>;
    logoSrc?: string;
  }) => (
    <div
      data-testid="slider"
      data-has-media={slides.length > 0 ? '1' : '0'}
      data-slide-url={slides[0]?.url || ''}
      data-logo={logoSrc || ''}
    />
  ),
}));

const baseItem: Item = {
  id: 1,
  name: 'No Photo Wrap',
  description: 'Tasty',
  base_price: 40,
  image_url: null,
  category_id: 1,
  is_available: true,
  has_variants: false,
  variants: [],
  photos: [],
};

describe('ProductCard default item image', () => {
  beforeEach(() => {
    settingsRef.default_item_image = '';
  });

  it('falls back to logo/monogram when no default is set', () => {
    render(
      <ProductCard
        item={baseItem}
        onSelectItem={() => {}}
        onAddToCart={() => {}}
      />,
    );
    const slider = screen.getByTestId('slider');
    expect(slider.getAttribute('data-has-media')).toBe('0');
    expect(slider.getAttribute('data-logo')).toBe('/logo.png');
  });

  it('renders default_item_image as cover slide for image-less items', () => {
    settingsRef.default_item_image = '/storage/site/default_item.jpg';
    render(
      <ProductCard
        item={baseItem}
        onSelectItem={() => {}}
        onAddToCart={() => {}}
      />,
    );
    const slider = screen.getByTestId('slider');
    expect(slider.getAttribute('data-has-media')).toBe('1');
    expect(slider.getAttribute('data-slide-url')).toContain('/storage/site/default_item.jpg');
  });
});
