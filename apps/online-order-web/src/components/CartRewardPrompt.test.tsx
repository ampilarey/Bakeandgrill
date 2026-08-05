import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { CartRewardPrompt } from './CartRewardPrompt';
import type { CartEntry } from '../context/CartContext';

const meal = {
  id: 1,
  name: 'Meal',
  base_price: 80,
  is_available: true,
  is_active: true,
  category_id: 1,
  has_variants: false,
  modifiers: [],
};

const drink = {
  id: 2,
  name: 'Cola',
  base_price: 15,
  is_available: true,
  is_active: true,
  category_id: 2,
  has_variants: false,
  modifiers: [],
};

let cart: CartEntry[] = [];
const addItem = vi.fn();
const removeRewardClaims = vi.fn();

vi.mock('../context/CartContext', () => ({
  useCart: () => ({
    cart,
    addItem,
    removeRewardClaims,
  }),
}));

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (k: string) => k,
  }),
}));

const fetchCartRewards = vi.fn();
vi.mock('../api/promotions', () => ({
  fetchCartRewards: (...args: unknown[]) => fetchCartRewards(...args),
}));

describe('CartRewardPrompt', () => {
  beforeEach(() => {
    cart = [];
    addItem.mockReset();
    removeRewardClaims.mockReset();
    fetchCartRewards.mockReset();
  });

  it('shows the prompt when the basket qualifies and not when it does not', async () => {
    cart = [{ item: meal as never, quantity: 1, modifiers: [] }];
    fetchCartRewards.mockResolvedValue({
      rewards: [{
        promotion_id: 9,
        promotion_name: 'Free drink',
        message: "You've earned a free drink — choose one.",
        reward_items: [{ id: 2, name: 'Cola', base_price: 15, image_url: null }],
      }],
    });

    const { rerender } = render(<CartRewardPrompt />);
    await waitFor(() => {
      expect(screen.getByTestId('cart-reward-prompt')).toBeInTheDocument();
    });
    expect(screen.getByText(/earned a free drink/i)).toBeInTheDocument();

    cart = [{ item: drink as never, quantity: 1, modifiers: [] }];
    fetchCartRewards.mockResolvedValue({ rewards: [] });
    rerender(<CartRewardPrompt />);
    await waitFor(() => {
      expect(screen.queryByTestId('cart-reward-prompt')).not.toBeInTheDocument();
    });
  });

  it('declining leaves the order unchanged and does not block', async () => {
    cart = [{ item: meal as never, quantity: 1, modifiers: [] }];
    fetchCartRewards.mockResolvedValue({
      rewards: [{
        promotion_id: 9,
        promotion_name: 'Free drink',
        message: "You've earned a free drink — choose one.",
        reward_items: [{ id: 2, name: 'Cola', base_price: 15, image_url: null }],
      }],
    });

    render(<CartRewardPrompt />);
    await waitFor(() => expect(screen.getByTestId('cart-reward-prompt')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('cart-reward-decline-9'));
    expect(addItem).not.toHaveBeenCalled();
    expect(screen.queryByTestId('cart-reward-prompt')).not.toBeInTheDocument();
  });

  it('removing the trigger withdraws the free line and shows a message', async () => {
    cart = [
      { item: meal as never, quantity: 1, modifiers: [] },
      { item: drink as never, quantity: 1, modifiers: [], rewardPromotionId: 9 },
    ];
    fetchCartRewards.mockResolvedValue({ rewards: [] });

    render(<CartRewardPrompt />);
    await waitFor(() => {
      expect(removeRewardClaims).toHaveBeenCalledWith([9]);
      expect(screen.getByTestId('cart-reward-withdrawn')).toBeInTheDocument();
    });
  });
});
