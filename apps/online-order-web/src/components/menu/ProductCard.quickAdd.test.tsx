import { fireEvent, render, screen } from '@testing-library/react';
import { ProductCard } from './ProductCard';
import type { Item } from '../../api';

vi.mock('../../context/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, lang: 'en' }),
}));

const settings: { logo: string; default_item_image: string | null } = { logo: '/logo.png', default_item_image: '/brand/default-item-image.png' };
vi.mock('../../context/SiteSettingsContext', () => ({
  useSiteSettingsContext: () => ({ settings, text: (_k: string, d: string) => d }),
}));

vi.mock('./MenuImageSlider', () => ({
  MenuImageSlider: () => <div data-testid="slider" />,
}));

const dish: Item = {
  id: 7,
  name: 'Boiled Egg',
  description: '',
  base_price: 5,
  image_url: null,
  category_id: 1,
  is_available: true,
  has_variants: false,
  variants: [],
};

/** Owner, 2026-10-07: a "+" on each dish, like other food apps. */
describe('ProductCard quick add', () => {
  it('puts a dish with nothing to choose straight in, without opening it', () => {
    const onAdd = vi.fn();
    const onSelect = vi.fn();
    render(<ProductCard item={dish} onSelectItem={onSelect} onAddToCart={onAdd} />);
    fireEvent.click(screen.getByTestId('menu-card-add'));
    expect(onAdd).toHaveBeenCalledWith(dish, 1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('opens a dish with sizes instead, so the size is chosen first', () => {
    const onAdd = vi.fn();
    const onSelect = vi.fn();
    const sized = { ...dish, has_variants: true, variants: [{ id: 1, item_id: 7, name: 'Large', price: 9, is_active: true }] } as unknown as Item;
    render(<ProductCard item={sized} onSelectItem={onSelect} onAddToCart={onAdd} />);
    fireEvent.click(screen.getByTestId('menu-card-add'));
    expect(onSelect).toHaveBeenCalledWith(sized, 1);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('shows no "+" on a dish that cannot be ordered now', () => {
    render(<ProductCard item={{ ...dish, is_available: false }} onSelectItem={vi.fn()} onAddToCart={vi.fn()} />);
    expect(screen.queryByTestId('menu-card-add')).toBeNull();
  });
});

/** Owner, 2026-10-07: no wall of logos for dishes without a photo. */
describe('ProductCard without a photo', () => {
  it('shows the quiet flame tile for the standard stand-in', () => {
    settings.default_item_image = '/brand/default-item-image.png';
    render(<ProductCard item={dish} onSelectItem={vi.fn()} onAddToCart={vi.fn()} />);
    const tile = screen.getByTestId('menu-card-quiet');
    expect(tile).toHaveAttribute('aria-label', 'Boiled Egg');
    expect(tile.querySelector('img')?.getAttribute('src')).toContain('/brand/flame-mark.svg');
    expect(screen.queryByTestId('slider')).toBeNull();
  });

  it('keeps a stand-in the owner uploaded', () => {
    settings.default_item_image = '/storage/site/our-own.jpg';
    render(<ProductCard item={dish} onSelectItem={vi.fn()} onAddToCart={vi.fn()} />);
    expect(screen.queryByTestId('menu-card-quiet')).toBeNull();
    expect(screen.getByTestId('slider')).toBeInTheDocument();
  });
});
