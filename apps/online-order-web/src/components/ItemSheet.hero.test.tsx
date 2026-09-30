import { render, screen } from '@testing-library/react';
import { ItemSheet } from './ItemSheet';
import type { Item } from '../api';

vi.mock('../context/CartContext', () => ({ useCart: () => ({ addItem: vi.fn() }) }));
vi.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ t: (key: string) => key, lang: 'en' }) }));
vi.mock('../context/SiteSettingsContext', () => ({
  useSiteSettingsContext: () => ({ settings: { logo: '/logo.png' }, text: (_k: string, d: string) => d }),
}));
vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    fetchCartRecommendations: vi.fn().mockResolvedValue([]),
    getItemReviews: vi.fn().mockResolvedValue({ reviews: [], average_rating: null }),
    getItemPhotos: vi.fn().mockResolvedValue({ photos: [] }),
  };
});
vi.mock('./menu/MenuImageSlider', () => ({
  MenuImageSlider: ({ aspectRatio }: { aspectRatio: string }) => <div data-testid="slider" data-aspect={aspectRatio} />,
}));

const item: Item = {
  id: 11, name: 'Boakiba', description: null, base_price: 10, category_id: 1,
  is_available: true, has_variants: false, variants: [], image_url: '/storage/menu/a.jpg',
};

/*
 * Owner, 2026-09-30: "when clicked it doesn't shows full pic". Photos are
 * saved 4:3; the hero was 16/10 and cut the top and bottom off every one.
 */
describe('ItemSheet hero', () => {
  it('is the same shape as the saved photo, so all of it shows', () => {
    render(<ItemSheet open item={item} qty={1} selectedModifiers={[]} onToggleModifier={() => {}} onAddToCart={() => {}} onClose={() => {}} />);
    expect(screen.getByTestId('slider').getAttribute('data-aspect')).toBe('4 / 3');
  });
});
