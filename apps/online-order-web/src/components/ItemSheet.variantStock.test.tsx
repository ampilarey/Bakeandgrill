import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ItemSheet } from './ItemSheet';
import type { Item } from '../api';

vi.mock('../context/CartContext', () => ({
  useCart: () => ({ addItem: vi.fn() }),
}));

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => (key === 'menu.out_of_stock' ? 'Sold out' : key),
    lang: 'en',
  }),
}));

vi.mock('../context/SiteSettingsContext', () => ({
  useSiteSettingsContext: () => ({
    settings: { logo: '/logo.png' },
    text: (_k: string, d: string) => d,
  }),
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
  MenuImageSlider: () => <div data-testid="slider" />,
}));

/**
 * Sizes of one dish share one pool of ingredients and draw on it at different
 * rates, so they sell out at different moments. Owner, 2026-09-01: "Offer full
 * until the last possible piece" — the full is never withdrawn early to keep
 * halves in reserve; it goes only once less than a whole piece is left.
 */
const leaf: Item = {
  id: 21,
  name: 'Beetle leaf',
  description: null,
  base_price: 20,
  category_id: 1,
  is_available: true,
  has_variants: true,
  variants: [
    { id: 10, name: 'Full', price: 20, is_active: true, sort_order: 0, is_available: false, available_stock: 0 },
    { id: 11, name: 'Half', price: 12, is_active: true, sort_order: 1, is_available: true, available_stock: 1 },
  ],
};

/** The sizes only — "Full" also matches chrome elsewhere in the sheet. */
function sizes() {
  return within(screen.getByTestId('item-sheet-variants'));
}

function renderSheet(item: Item) {
  return render(
    <ItemSheet
      open
      item={item}
      qty={1}
      selectedModifiers={[]}
      onToggleModifier={() => {}}
      onAddToCart={() => {}}
      onClose={() => {}}
    />,
  );
}

describe('ItemSheet variant stock', () => {
  it('marks a size the ingredient pool can no longer cover as sold out', () => {
    renderSheet(leaf);

    const full = sizes().getByRole('button', { name: /Full/ });
    expect(full).toBeDisabled();
    expect(full).toHaveTextContent('Sold out');
    expect(sizes().getByRole('button', { name: /Half/ })).toBeEnabled();
  });

  it('does not select a sold-out size when tapped', async () => {
    renderSheet(leaf);

    await userEvent.click(sizes().getByRole('button', { name: /Full/ }));

    expect(sizes().getByRole('button', { name: /Full/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('selects the size that is still makeable', async () => {
    renderSheet(leaf);

    await userEvent.click(sizes().getByRole('button', { name: /Half/ }));

    expect(sizes().getByRole('button', { name: /Half/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('leaves sizes alone when the pool does not cap this dish', () => {
    renderSheet({
      ...leaf,
      variants: [
        { id: 10, name: 'Full', price: 20, is_active: true, sort_order: 0 },
        { id: 11, name: 'Half', price: 12, is_active: true, sort_order: 1 },
      ],
    });

    expect(sizes().getByRole('button', { name: /Full/ })).toBeEnabled();
    expect(sizes().queryByText('Sold out')).toBeNull();
  });
});
