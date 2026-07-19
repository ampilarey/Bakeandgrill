import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';
import { AuthProvider } from '../../context/AuthContext';
import { CartProvider } from '../../context/CartContext';
import { LanguageProvider } from '../../context/LanguageContext';
import { SiteSettingsProvider } from '../../context/SiteSettingsContext';

vi.mock('../../api', async () => {
  const actual = await vi.importActual<typeof import('../../api')>('../../api');
  return {
    ...actual,
    fetchCustomerOrders: vi.fn().mockResolvedValue({ data: [] }),
    getCustomerMe: vi.fn().mockRejectedValue(new Error('unauth')),
  };
});

function wrap(initial = '/') {
  return render(
    <SiteSettingsProvider>
      <LanguageProvider>
        <CartProvider>
          <AuthProvider>
            <MemoryRouter initialEntries={[initial]}>
              <Routes>
                <Route element={<AppShell />}>
                  <Route index element={<div>home-body</div>} />
                  <Route path="menu" element={<div>menu-body</div>} />
                  <Route path="rewards" element={<div>rewards-body</div>} />
                </Route>
              </Routes>
            </MemoryRouter>
          </AuthProvider>
        </CartProvider>
      </LanguageProvider>
    </SiteSettingsProvider>,
  );
}

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

describe('AppShell', () => {
  it('renders 5-tab bottom nav with t() labels on phone', async () => {
    mockMatchMedia(false);
    wrap();
    expect(screen.getByText('home-body')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeTruthy();
    expect(document.querySelector('.bottom-nav')).toBeTruthy();
    expect(document.querySelector('.top-nav')).toBeNull();
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Menu')).toBeTruthy();
    expect(screen.getByText('Orders')).toBeTruthy();
    expect(screen.getByText('Rewards')).toBeTruthy();
    expect(screen.getByText('Gifts')).toBeTruthy();
    expect(screen.queryByText('Account')).toBeNull();
  });

  it('renders top nav instead of bottom nav on tablet/desktop', () => {
    mockMatchMedia(true);
    wrap();
    expect(document.querySelector('.top-nav')).toBeTruthy();
    expect(document.querySelector('.bottom-nav')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeTruthy();
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Menu')).toBeTruthy();
  });

  it('does not mount legacy prayer-strip portal', () => {
    mockMatchMedia(false);
    wrap();
    expect(document.getElementById('prayer-strip-root')).toBeNull();
  });
});
