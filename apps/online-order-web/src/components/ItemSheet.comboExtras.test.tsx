import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ItemSheet } from './ItemSheet';
import type { Item } from '../api';

/**
 * Optional bundle components are a choice the customer makes.
 *
 * Owner's audit, 2026-09-06, F5: `is_optional` rendered as the word
 * "(optional)" beside a component nobody could take or decline, nothing
 * recorded whether they had it, and its stock never moved.
 */

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

const bundle: Item = {
  id: 44,
  name: 'Burger Deal',
  description: null,
  base_price: 90,
  category_id: 1,
  is_available: true,
  has_variants: false,
  variants: [],
  is_combo: true,
  combo_items: [
    { item_id: 1, item_name: 'Beef Burger', quantity: 1, is_optional: false },
    { item_id: 2, item_name: 'Masala Fries', quantity: 2, is_optional: false },
    { item_id: 3, item_name: 'Garlic Dip', quantity: 1, is_optional: true, surcharge: 15 },
    { item_id: 4, item_name: 'Napkin Pack', quantity: 1, is_optional: true, surcharge: 0 },
  ],
};

function renderSheet(onAddToCart = vi.fn()) {
  render(
    <ItemSheet
      open
      item={bundle}
      qty={1}
      selectedModifiers={[]}
      onToggleModifier={() => {}}
      onAddToCart={onAddToCart}
      onClose={() => {}}
    />,
  );
  return onAddToCart;
}

describe('ItemSheet optional bundle extras', () => {
  it('lists required components under Includes and leaves extras out of it', () => {
    renderSheet();

    const includes = screen.getByText('Includes').parentElement!;
    expect(includes.textContent).toContain('Beef Burger');
    expect(includes.textContent).toContain('2× Masala Fries');
    // The extras are a separate choice, not part of what comes with it.
    expect(includes.textContent).not.toContain('Garlic Dip');
  });

  it('offers each optional component with its price', () => {
    renderSheet();

    const extras = screen.getByTestId('combo-extras');
    expect(extras.textContent).toContain('Garlic Dip');
    expect(extras.textContent).toContain('Napkin Pack');
    // A priced extra says what it costs; a free one says it is free.
    expect(extras.textContent).toContain('Free');
    expect(screen.getByTestId('combo-extra-3')).not.toBeChecked();
  });

  it('adds the surcharge to the price once ticked', async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByTestId('combo-extra-3'));

    expect(screen.getByTestId('combo-extra-3')).toBeChecked();
    // 90 + 15.
    expect(screen.getByTestId('item-sheet-add')?.textContent ?? document.body.textContent)
      .toMatch(/105/);
  });

  it('sends only the extras the customer took', async () => {
    const user = userEvent.setup();
    const onAddToCart = renderSheet();

    await user.click(screen.getByTestId('combo-extra-3'));
    await user.click(screen.getByTestId('item-sheet-add'));

    const picks = onAddToCart.mock.calls[0]?.[2];
    expect(picks).toEqual([
      expect.objectContaining({ item_id: 3, quantity: 1, surcharge: 15 }),
    ]);
  });

  it('un-ticking removes it again', async () => {
    const user = userEvent.setup();
    const onAddToCart = renderSheet();

    await user.click(screen.getByTestId('combo-extra-3'));
    await user.click(screen.getByTestId('combo-extra-3'));
    await user.click(screen.getByTestId('item-sheet-add'));

    expect(onAddToCart.mock.calls[0]?.[2]).toEqual([]);
  });

  it('an ordinary dish shows no extras block', () => {
    render(
      <ItemSheet
        open
        item={{ ...bundle, is_combo: false, combo_items: undefined }}
        qty={1}
        selectedModifiers={[]}
        onToggleModifier={() => {}}
        onAddToCart={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.queryByTestId('combo-extras')).toBeNull();
  });
});
