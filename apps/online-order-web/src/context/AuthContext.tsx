import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { checkSession, logoutCustomerSession, logoutCustomerWebSession } from '../api';

interface AuthState {
  isAuthenticated: boolean;
  customerName: string | null;
  /** true once the initial session check has resolved */
  authReady: boolean;
  setAuth: (name: string) => void;
  clearAuth: () => void;
}

const AuthContext = createContext<AuthState>({
  isAuthenticated: false,
  customerName: null,
  authReady: false,
  setAuth: () => {},
  clearAuth: () => {},
});

/** Derive a short display name: phone without +960 prefix, else first name. */
function toDisplayName(name?: string | null, phone?: string | null): string {
  const stripped = (phone ?? '').replace(/^\+?960/, '').replace(/\D/g, '');
  if (stripped.length === 7) return stripped;
  if (name) return name.split(' ')[0];
  return '';
}

function getCookie(name: string): string | null {
  const m = document.cookie.split('; ').find((r) => r.startsWith(name + '='));
  return m ? decodeURIComponent(m.split('=').slice(1).join('=')) : null;
}

/**
 * Clear a cookie that may have been set with Domain=.parent.tld and/or Secure.
 * Modern browsers require matching Secure when deleting a Secure cookie.
 */
function deleteCookie(name: string) {
  const h = window.location.hostname;
  const parentDomain =
    h.includes('.') && !h.startsWith('127.') ? '.' + h.split('.').slice(-2).join('.') : '';
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  const base = `${name}=; Max-Age=0; path=/; SameSite=Lax${secure}`;
  document.cookie = base;
  if (parentDomain) {
    document.cookie = `${base}; domain=${parentDomain}`;
  }
}

async function probeSession(
  apply: (name: string | null) => void,
  reset: () => void,
): Promise<void> {
  try {
    const res = await checkSession({ anonymous: true });
    if (res.authenticated && res.customer) {
      const name = toDisplayName(res.customer.name, res.customer.phone);
      apply(name || null);
      return;
    }
    reset();
  } catch {
    reset();
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const applyCustomer = (name: string | null) => {
    setIsAuthenticated(true);
    setCustomerName(name);
    window.dispatchEvent(new Event('auth_change'));
  };

  const resetAuth = () => {
    setIsAuthenticated(false);
    setCustomerName(null);
    window.dispatchEvent(new Event('auth_change'));
  };

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      // _cauth_revoked is a short-lived logout signal from the Blade site.
      // Clear it, but ALWAYS probe the live session — the customer may have
      // logged in again while this cookie was still present (up to 10 minutes).
      if (getCookie('_cauth_revoked')) {
        deleteCookie('_cauth_revoked');
      }
      await probeSession(applyCustomer, resetAuth);
      if (!cancelled) setAuthReady(true);
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleExpired = () => resetAuth();
    const onFocus = () => {
      if (!getCookie('_cauth_revoked')) return;
      deleteCookie('_cauth_revoked');
      // Blade (or another tab) logged out — confirm against the server rather
      // than blindly trusting the signal if a new session was established.
      void probeSession(applyCustomer, resetAuth);
    };

    window.addEventListener('auth_expired', handleExpired);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('auth_expired', handleExpired);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  const setAuth = (name: string) => {
    applyCustomer(name || null);
    setAuthReady(true);
  };

  const clearAuth = () => {
    void logoutCustomerSession().catch(() => {});
    void logoutCustomerWebSession().catch(() => {});
    resetAuth();
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, customerName, authReady, setAuth, clearAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
