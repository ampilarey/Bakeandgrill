import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CartProvider, cartLineKey, useCart } from './CartContext';
import type { Item, Modifier } from '../api';
import type { Variant } from '@shared/types';

function wrapper({ children }: { children: ReactNode }) {
  return <CartProvider>{children}</CartProvider>;
}

const baseItem = {
  id: 1,
  name: 'Chicken Grill',
  base_price: 95,
  has_variants: true,
  is_available: true,
} as Item;

const regular: Variant = {
  id: 10,
  name: 'Regular',
  price: 95,
  effective_price: 95,
  is_active: true,
} as Variant;

const large: Variant = {
  id: 11,
  name: 'Large',
  price: 120,
  effective_price: 120,
  is_active: true,
} as Variant;

const cheese: Modifier = { id: 100, name: 'Extra cheese', price: 10 } as Modifier;
const garlic: Modifier = { id: 101, name: 'Garlic sauce', price: 5 } as Modifier;

describe('cartLineKey', () => {
  it('is stable regardless of modifier order', () => {
    expect(cartLineKey(1, 10, [cheese, garlic])).toBe(cartLineKey(1, 10, [garlic, cheese]));
  });
});

describe('CartContext.updateEntry', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('preselect / in-place edit keeps the same line index when config unchanged', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => {
      result.current.addItem(baseItem, 2, [cheese], regular);
    });
    expect(result.current.cart).toHaveLength(1);

    act(() => {
      result.current.updateEntry(0, {
        quantity: 3,
        modifiers: [cheese],
        variant: regular,
      });
    });

    expect(result.current.cart).toHaveLength(1);
    expect(result.current.cart[0].quantity).toBe(3);
    expect(result.current.cart[0].variantId).toBe(10);
    expect(result.current.cart[0].modifiers.map((m) => m.id)).toEqual([100]);
  });

  it('variant switch updates the line in place', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => {
      result.current.addItem(baseItem, 1, [], regular);
    });

    act(() => {
      result.current.updateEntry(0, {
        quantity: 1,
        modifiers: [],
        variant: large,
      });
    });

    expect(result.current.cart).toHaveLength(1);
    expect(result.current.cart[0].variantId).toBe(11);
    expect(result.current.cart[0].variantName).toBe('Large');
    expect(result.current.cart[0].variantPrice).toBe(120);
  });

  it('merges into an identical existing line', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => {
      result.current.addItem(baseItem, 1, [cheese], regular);
      result.current.addItem(baseItem, 2, [garlic], large);
    });
    expect(result.current.cart).toHaveLength(2);

    // Edit line 1 (large+garlic) to match line 0 (regular+cheese) → merge into line 0
    act(() => {
      result.current.updateEntry(1, {
        quantity: 4,
        modifiers: [cheese],
        variant: regular,
      });
    });

    expect(result.current.cart).toHaveLength(1);
    expect(result.current.cart[0].quantity).toBe(1 + 4);
    expect(result.current.cart[0].variantId).toBe(10);
    expect(result.current.cart[0].modifiers.map((m) => m.id)).toEqual([100]);
  });
});
