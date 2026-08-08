import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const checkSession = vi.fn();
const logoutCustomerSession = vi.fn().mockResolvedValue(undefined);
const logoutCustomerWebSession = vi.fn().mockResolvedValue(undefined);

vi.mock('../api', () => ({
  checkSession: (...args: unknown[]) => checkSession(...args),
  logoutCustomerSession: (...args: unknown[]) => logoutCustomerSession(...args),
  logoutCustomerWebSession: (...args: unknown[]) => logoutCustomerWebSession(...args),
}));

import { AuthProvider, useAuth } from './AuthContext';

function Probe() {
  const { isAuthenticated, authReady, customerName } = useAuth();
  return (
    <div>
      <span data-testid="ready">{authReady ? 'yes' : 'no'}</span>
      <span data-testid="auth">{isAuthenticated ? 'yes' : 'no'}</span>
      <span data-testid="name">{customerName ?? ''}</span>
    </div>
  );
}

describe('AuthContext cross-app session', () => {
  beforeEach(() => {
    checkSession.mockReset();
    logoutCustomerSession.mockClear();
    logoutCustomerWebSession.mockClear();
    document.cookie.split(';').forEach((c) => {
      const name = c.split('=')[0]?.trim();
      if (name) {
        document.cookie = `${name}=; Max-Age=0; path=/`;
      }
    });
  });

  it('probes the live session even when a stale _cauth_revoked cookie is present', async () => {
    // REAL CAUSE (SPA): after Blade logout sets _cauth_revoked, a later Blade
    // re-login leaves that cookie for up to 10 minutes. Skipping checkSession
    // makes "My orders" show the login screen despite a valid session cookie.
    document.cookie = '_cauth_revoked=1; path=/';
    checkSession.mockResolvedValue({
      authenticated: true,
      customer: { id: 1, name: 'Amina', phone: '+9607111222', is_profile_complete: true },
    });

    const { getByTestId } = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(getByTestId('ready').textContent).toBe('yes'));
    expect(checkSession).toHaveBeenCalled();
    expect(getByTestId('auth').textContent).toBe('yes');
    expect(document.cookie.includes('_cauth_revoked')).toBe(false);
  });

  it('uses anonymous session probe so a guest 401 does not hard-expire auth', async () => {
    checkSession.mockResolvedValue({ authenticated: false });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(checkSession).toHaveBeenCalled());
    expect(checkSession.mock.calls[0]?.[0]).toMatchObject({ anonymous: true });
  });

  it('re-probes session on focus when _cauth_revoked appears (logout from Blade)', async () => {
    checkSession
      .mockResolvedValueOnce({
        authenticated: true,
        customer: { id: 1, name: 'Amina', phone: '+9607111222', is_profile_complete: true },
      })
      .mockResolvedValueOnce({ authenticated: false });

    const { getByTestId } = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(getByTestId('auth').textContent).toBe('yes'));

    document.cookie = '_cauth_revoked=1; path=/';
    window.dispatchEvent(new Event('focus'));

    await waitFor(() => expect(getByTestId('auth').textContent).toBe('no'));
    expect(checkSession.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
