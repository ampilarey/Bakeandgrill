import { fireEvent, render, screen } from '@testing-library/react';
import { ItemSheet } from './ItemSheet';
import type { Item } from '../api';

vi.mock('../context/CartContext', () => ({
  useCart: () => ({ addItem: vi.fn() }),
}));

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, lang: 'en' }),
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

const item: Item = {
  id: 11,
  name: 'Grill Plate',
  description: null,
  base_price: 100,
  category_id: 1,
  is_available: true,
  has_variants: false,
  variants: [],
};

const sheet = (props: Partial<React.ComponentProps<typeof ItemSheet>> = {}) => (
  <ItemSheet
    open
    item={item}
    qty={1}
    selectedModifiers={[]}
    onToggleModifier={() => {}}
    onAddToCart={() => {}}
    onClose={() => {}}
    {...props}
  />
);

/**
 * Getting out of the sheet, and the heart.
 *
 * The sheet used to close with a bare ×, which said nothing about where it
 * went. It now names the destination — but a label is only an improvement
 * while it is true, and this sheet opens from the cart as well as the menu.
 */
describe('ItemSheet — leaving the sheet', () => {
  it('offers a way back to the menu instead of a bare cross', () => {
    render(sheet());

    expect(screen.getByRole('button', { name: /Full menu/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it('says "Back to cart" when it was opened from the cart', () => {
    // The correctness point. Opened from the cart, closing returns to the
    // cart — a sheet labelled "Full menu" there would be lying.
    render(sheet({ backTo: 'cart' }));

    expect(screen.getByRole('button', { name: /Back to cart/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Full menu/ })).not.toBeInTheDocument();
  });

  it('still closes the sheet when pressed', () => {
    const onClose = vi.fn();
    render(sheet({ onClose }));

    fireEvent.click(screen.getByRole('button', { name: /Full menu/ }));

    expect(onClose).toHaveBeenCalled();
  });
});

describe('ItemSheet — favourites', () => {
  it('shows an empty heart that fills once the item is a favourite', () => {
    const { rerender } = render(sheet({ onToggleFavourite: () => {} }));

    const heart = screen.getByTestId('item-sheet-favourite');
    expect(heart).toHaveAttribute('aria-pressed', 'false');
    expect(heart.textContent).toBe('🤍');

    rerender(sheet({ onToggleFavourite: () => {}, isFavourite: true }));

    const filled = screen.getByTestId('item-sheet-favourite');
    expect(filled).toHaveAttribute('aria-pressed', 'true');
    expect(filled.textContent).toBe('❤️');
  });

  it('reports the item it belongs to, not just that it was pressed', () => {
    const onToggleFavourite = vi.fn();
    render(sheet({ onToggleFavourite }));

    fireEvent.click(screen.getByTestId('item-sheet-favourite'));

    expect(onToggleFavourite).toHaveBeenCalledWith(11);
  });

  it('leaves the heart out where nothing can handle it', () => {
    // A heart that silently does nothing is worse than no heart. The cart
    // opens this sheet without favourite plumbing.
    render(sheet());

    expect(screen.queryByTestId('item-sheet-favourite')).not.toBeInTheDocument();
  });

  it('does not let the heart double as the way out', () => {
    // Both controls sit on the hero. Tapping the heart must not dismiss the
    // sheet the customer is still reading.
    const onClose = vi.fn();
    render(sheet({ onClose, onToggleFavourite: () => {} }));

    fireEvent.click(screen.getByTestId('item-sheet-favourite'));

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('ItemSheet — share', () => {
  it('shares the public /menu/{id} URL, never an /order path', () => {
    render(sheet());

    const open = screen.getByTestId('share-open');
    expect(open).toBeInTheDocument();
    fireEvent.click(open);

    const popover = document.querySelector('[data-share-popover]');
    expect(popover?.getAttribute('data-share-url')).toMatch(/\/menu\/11$/);
    expect(popover?.getAttribute('data-share-url')).not.toContain('/order/');
  });

  it('does not dismiss the sheet when Share is pressed', () => {
    const onClose = vi.fn();
    render(sheet({ onClose }));

    fireEvent.click(screen.getByTestId('share-open'));

    expect(onClose).not.toHaveBeenCalled();
  });
});
