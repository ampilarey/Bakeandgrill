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

describe('AppShell', () => {
  it('renders 5-tab bottom nav with t() labels', async () => {
    wrap();
    expect(screen.getByText('home-body')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeTruthy();
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Menu')).toBeTruthy();
    expect(screen.getByText('Orders')).toBeTruthy();
    expect(screen.getByText('Rewards')).toBeTruthy();
    expect(screen.getByText('Account')).toBeTruthy();
  });

  it('does not mount legacy prayer-strip portal', () => {
    wrap();
    expect(document.getElementById('prayer-strip-root')).toBeNull();
  });
});
