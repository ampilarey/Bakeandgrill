import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  isAuthenticated: true,
  customerName: '7123456' as string | null,
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: authState.isAuthenticated,
    customerName: authState.customerName,
    authReady: true,
    setAuth: () => undefined,
    clearAuth: () => undefined,
  }),
}));

vi.mock('../../context/ShellNavContext', () => ({
  useShellNav: () => ({ hideNav: false }),
}));

vi.mock('../../context/SiteSettingsContext', () => ({
  useSiteSettingsContext: () => ({
    settings: { site_name: 'Bake & Grill', logo: '/logo.png' },
  }),
}));

vi.mock('../../hooks/useActiveOrder', () => ({
  useActiveOrder: () => ({ hasActiveOrder: false }),
}));

vi.mock('../PrayerBar', () => ({
  PrayerBar: () => null,
}));

import { TopNav } from './TopNav';
import { LanguageProvider } from '../../context/LanguageContext';

function mount() {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <TopNav />
      </LanguageProvider>
    </MemoryRouter>,
  );
}

describe('TopNav account chip', () => {
  it('shows local phone + person control, not Account/name', () => {
    authState.isAuthenticated = true;
    authState.customerName = '7123456';
    mount();

    expect(screen.getByText('7123456')).toBeTruthy();
    expect(screen.queryByText('Account')).toBeNull();
    const link = screen.getByRole('link', { name: /My account|Account 7123456/i });
    expect(link.getAttribute('href')).toBe('/account');
  });

  it('signed-out shows Sign in, not a phone chip', () => {
    authState.isAuthenticated = false;
    authState.customerName = null;
    mount();

    expect(screen.getByRole('link', { name: /Sign in/i })).toBeTruthy();
    expect(screen.queryByText('7123456')).toBeNull();
  });
});
