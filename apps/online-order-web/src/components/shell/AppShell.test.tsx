import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';
import { AuthProvider } from '../../context/AuthContext';
import { CartProvider } from '../../context/CartContext';
import { LanguageProvider } from '../../context/LanguageContext';
import { SiteSettingsProvider } from '../../context/SiteSettingsContext';
import * as api from '../../api';

vi.mock('../../api', async () => {
  const actual = await vi.importActual<typeof import('../../api')>('../../api');
  return {
    ...actual,
    checkSession: vi.fn(),
    fetchCustomerOrders: vi.fn(),
    getCustomerMe: vi.fn().mockRejectedValue(new Error('unauth')),
  };
});

const checkSession = vi.mocked(api.checkSession);
const fetchCustomerOrders = vi.mocked(api.fetchCustomerOrders);

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
                  <Route path="order-history" element={<div>orders-body</div>} />
                  <Route path="events" element={<div>events-body</div>} />
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
  beforeEach(() => {
    checkSession.mockReset();
    fetchCustomerOrders.mockReset();
    checkSession.mockResolvedValue({ authenticated: false } as never);
    fetchCustomerOrders.mockResolvedValue({ data: [] } as never);
  });

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
    expect(screen.getByText('Pre-order')).toBeTruthy();
    expect(screen.getByText('Gifts')).toBeTruthy();
    expect(screen.queryByText('Rewards')).toBeNull();
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

  it('does not render the floating active-order capsule on desktop home or phone order-history', async () => {
    checkSession.mockResolvedValue({
      authenticated: true,
      customer: { id: 1, name: 'Amina', phone: '+9607111222', is_profile_complete: true },
    } as never);
    fetchCustomerOrders.mockResolvedValue({
      data: [{ id: 1042, status: 'preparing', order_number: '1042' }],
    } as never);

    mockMatchMedia(true);
    const desktop = wrap('/');
    await waitFor(() => expect(fetchCustomerOrders).toHaveBeenCalled());
    expect(desktop.container.querySelector('.active-order-capsule')).toBeNull();
    expect(desktop.container.querySelector('.top-nav__link-badge')).toBeTruthy();
    desktop.unmount();

    mockMatchMedia(false);
    const phone = wrap('/order-history');
    await waitFor(() => expect(phone.container.querySelector('.bottom-nav__count')).toBeTruthy());
    expect(phone.container.querySelector('.active-order-capsule')).toBeNull();
  });
});
