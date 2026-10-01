import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProductCard } from './ProductCard';
import type { Item } from '../../api';

/* Owner, 2026-10-01, with the ZUS screenshots: the dish, background removed,
   floats over a circle the card draws. Only when the item has a cut-out. */

vi.mock('../../context/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, lang: 'en' }),
}));
vi.mock('../../context/SiteSettingsContext', () => ({
  useSiteSettingsContext: () => ({ settings: { logo: '/logo.png' }, text: (_k: string, d: string) => d }),
}));
vi.mock('../../utils/itemMedia', () => ({
  buildItemSlides: () => [],
  resolveMediaUrl: (u: string | null) => (u ? `https://api.test${u}` : null),
}));
vi.mock('./MenuImageSlider', () => ({
  MenuImageSlider: () => <div data-testid="slider" />,
}));

const baseItem: Item = {
  id: 1,
  name: 'Da Hong Pao',
  base_price: 45,
  image_url: '/storage/menu/cup.jpg',
  category_id: 1,
  is_available: true,
  has_variants: false,
  variants: [],
};

describe('ProductCard cut-out thumbnail', () => {
  it('draws the cut-out over the resolved circle instead of the photo slider', () => {
    render(
      <ProductCard
        item={{
          ...baseItem,
          cutout_url: '/storage/menu-cutouts/cup.png',
          cutout_webp_url: '/storage/menu-cutouts/cup.webp',
          cutout_backdrop: { color: '#FFEEDD', strength: 40, source: 'category' },
        }}
        onSelectItem={() => {}}
        onAddToCart={() => {}}
      />,
    );

    const frame = screen.getByTestId('menu-card-media-frame');
    expect(frame.className).toContain('menu-card-media-circle__frame--cutout');
    expect(frame.style.getPropertyValue('--cutout-color')).toBe('#FFEEDD');
    expect(frame.style.getPropertyValue('--cutout-alpha')).toBe('0.40');
    expect(screen.getByTestId('menu-card-cutout')).toHaveAttribute('src', 'https://api.test/storage/menu-cutouts/cup.png');
    expect(frame.querySelector('source')).toHaveAttribute('srcset', 'https://api.test/storage/menu-cutouts/cup.webp');
    expect(screen.queryByTestId('slider')).toBeNull();
  });

  it('keeps the photo slider when there is no cut-out', () => {
    render(<ProductCard item={baseItem} onSelectItem={() => {}} onAddToCart={() => {}} />);

    const frame = screen.getByTestId('menu-card-media-frame');
    expect(frame.className).not.toContain('--cutout');
    expect(screen.getByTestId('slider')).toBeInTheDocument();
    expect(screen.queryByTestId('menu-card-cutout')).toBeNull();
  });

  it('falls back to the menu default circle when the backdrop is missing', () => {
    render(
      <ProductCard
        item={{ ...baseItem, cutout_url: '/storage/menu-cutouts/cup.png', cutout_backdrop: null }}
        onSelectItem={() => {}}
        onAddToCart={() => {}}
      />,
    );

    const frame = screen.getByTestId('menu-card-media-frame');
    expect(frame.style.getPropertyValue('--cutout-color')).toBe('#F3EAE1');
    expect(frame.style.getPropertyValue('--cutout-alpha')).toBe('1.00');
  });
});
