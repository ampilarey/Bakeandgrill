import { render, screen, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { FloatingCartBar } from './FloatingCartBar';
import { CartProvider, useCart } from '../../context/CartContext';
import { LanguageProvider } from '../../context/LanguageContext';
import { ShellNavProvider } from '../../context/ShellNavContext';
import { SiteSettingsProvider } from '../../context/SiteSettingsContext';
import type { Item } from '../../api';
import { useEffect } from 'react';

vi.mock('../../api', async () => {
  const actual = await vi.importActual<typeof import('../../api')>('../../api');
  return {
    ...actual,
    fetchOnlineOrderingStatus: vi.fn().mockResolvedValue({ open: true, message: null }),
  };
});

vi.mock('../../context/ServiceStatusContext', () => ({
  useServiceStatusContext: () => ({
    isAvailable: () => true,
    get: () => null,
  }),
}));

const sampleItem: Item = {
  id: 9,
  name: 'Test Item',
  description: null,
  base_price: 50,
  image_url: null,
  category_id: 1,
  is_available: true,
  has_variants: false,
  variants: [],
};

function SeedCart({ qty }: { qty: number }) {
  const { addItem, clearCart } = useCart();
  useEffect(() => {
    clearCart();
    if (qty > 0) addItem(sampleItem, qty);
  }, [qty, addItem, clearCart]);
  return null;
}

function wrap(qty: number) {
  return render(
    <SiteSettingsProvider>
      <LanguageProvider>
        <CartProvider>
          <ShellNavProvider>
            <MemoryRouter>
              <SeedCart qty={qty} />
              <FloatingCartBar />
            </MemoryRouter>
          </ShellNavProvider>
        </CartProvider>
      </LanguageProvider>
    </SiteSettingsProvider>,
  );
}

describe('FloatingCartBar regression', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows total when cart is non-empty', async () => {
    await act(async () => {
      wrap(2);
    });
    await waitFor(() => {
      expect(document.querySelector('.float-cart-fab')).toBeTruthy();
    });
    expect(screen.getByText('100/-')).toBeTruthy();
  });

  it('is hidden when cart is empty', async () => {
    await act(async () => {
      wrap(0);
    });
    expect(document.querySelector('.float-cart-fab')).toBeNull();
  });
});
