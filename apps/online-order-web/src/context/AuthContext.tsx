import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { syncBladeSession, checkSession } from '../api';

interface AuthState {
  token: string | null;
  customerName: string | null;
  /** true once the initial cookie/localStorage check has resolved */
  authReady: boolean;
  setAuth: (token: string, name: string) => void;
  clearAuth: () => void;
}

const AuthContext = createContext<AuthState>({
  token: null,
  customerName: null,
  authReady: false,
  setAuth: () => {},
  clearAuth: () => {},
});

const COOKIE_DOMAIN = (() => {
  if (typeof window === 'undefined') return '';
  const h = window.location.hostname;
  return h.includes('.') ? '.' + h.split('.').slice(-2).join('.') : h;
})();

function getCookie(name: string): string | null {
  const m = document.cookie.split('; ').find((r) => r.startsWith(name + '='));
  return m ? decodeURIComponent(m.split('=').slice(1).join('=')) : null;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; Max-Age=0; path=/; domain=${COOKIE_DOMAIN}`;
}

/**
 * Read and immediately delete the _cauth handoff cookies set by Blade login.
 * Returns {token, name} if found, null otherwise.
 */
function consumeHandoffCookies(): { token: string; name: string } | null {
  const token = getCookie('_cauth');
  if (!token) return null;
  const name = getCookie('_cauth_name') ?? '';
  deleteCookie('_cauth');
  deleteCookie('_cauth_name');
  return { token, name };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken]               = useState<string | null>(() => localStorage.getItem('online_token'));
  const [customerName, setCustomerName] = useState<string | null>(() => localStorage.getItem('online_customer_name'));
  const [authReady, setAuthReady]       = useState<boolean>(() => !!localStorage.getItem('online_token'));

  // Track whether we need to sync the Blade session on mount
  const bladeSyncedRef = useRef(false);

  // ── On mount ────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Check for Blade logout signal first — this covers the case where the
    // user logged out on the main website and then navigated to the order app.
    const revoked = getCookie('_cauth_revoked');
    if (revoked) {
      deleteCookie('_cauth_revoked');
      localStorage.removeItem('online_token');
      localStorage.removeItem('online_customer_name');
      setToken(null);
      setCustomerName(null);
      setAuthReady(true);
      return;
    }

    const existingToken = localStorage.getItem('online_token');

    if (existingToken) {
      // Sync Blade session in case it expired (fire-and-forget)
      if (!bladeSyncedRef.current) {
        bladeSyncedRef.current = true;
        syncBladeSession(existingToken).catch(() => {});
      }
      setAuthReady(true);
      return;
    }

    // Check for handoff cookie from a Blade login
    const handoff = consumeHandoffCookies();
    if (handoff) {
      localStorage.setItem('online_token', handoff.token);
      if (handoff.name) localStorage.setItem('online_customer_name', handoff.name);
      setToken(handoff.token);
      setCustomerName(handoff.name || null);
      bladeSyncedRef.current = true;
      window.dispatchEvent(new Event('auth_change'));
      setAuthReady(true);
      return;
    }

    // Fallback: try to recover session from Blade cookie (e.g. after BML payment redirect
    // cleared localStorage on mobile Safari). If the customer logged in via React OTP and
    // syncBladeSession was called, the session cookie survives cross-origin navigation.
    checkSession()
      .then((res) => {
        if (res.authenticated && res.token) {
          const name = res.customer?.name ?? res.customer?.phone ?? '';
          localStorage.setItem('online_token', res.token);
          if (name) localStorage.setItem('online_customer_name', name);
          setToken(res.token);
          setCustomerName(name || null);
          bladeSyncedRef.current = true;
          window.dispatchEvent(new Event('auth_change'));
        }
      })
      .catch(() => { /* no session — user is a guest */ })
      .finally(() => setAuthReady(true));
  }, []);

  // ── Sync with localStorage changes (other tabs / auth_change events) ────────
  useEffect(() => {
    const sync = () => {
      setToken(localStorage.getItem('online_token'));
      setCustomerName(localStorage.getItem('online_customer_name'));
    };
    window.addEventListener('storage', sync);
    window.addEventListener('auth_change', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('auth_change', sync);
    };
  }, []);

  // ── On window focus / tab becomes visible ───────────────────────────────────
  // 1. _cauth_revoked: Blade logout → clear React session
  // 2. _cauth: Blade login (in another tab) → absorb the handoff token
  useEffect(() => {
    const check = () => {
      // Blade logout signal
      const revoked = getCookie('_cauth_revoked');
      if (revoked) {
        deleteCookie('_cauth_revoked');
        if (localStorage.getItem('online_token')) {
          localStorage.removeItem('online_token');
          localStorage.removeItem('online_customer_name');
          setToken(null);
          setCustomerName(null);
          window.dispatchEvent(new Event('auth_change'));
        }
        return;
      }

      // Blade login signal (user logged in on main site in another tab)
      if (!localStorage.getItem('online_token')) {
        const handoff = consumeHandoffCookies();
        if (handoff) {
          localStorage.setItem('online_token', handoff.token);
          if (handoff.name) localStorage.setItem('online_customer_name', handoff.name);
          setToken(handoff.token);
          setCustomerName(handoff.name || null);
          bladeSyncedRef.current = true;
          window.dispatchEvent(new Event('auth_change'));
        }
      }
    };

    const onVisibility = () => { if (!document.hidden) check(); };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // ── setAuth — called after any React login ──────────────────────────────────
  const setAuth = (tok: string, name: string) => {
    localStorage.setItem('online_token', tok);
    if (name) localStorage.setItem('online_customer_name', name);
    setToken(tok);
    setCustomerName(name || null);
    setAuthReady(true);
    bladeSyncedRef.current = true;
    window.dispatchEvent(new Event('auth_change'));
    // Sync Blade session so main website header shows logged-in state
    syncBladeSession(tok).catch(() => {});
  };

  // ── clearAuth — called after any React logout ───────────────────────────────
  const clearAuth = () => {
    localStorage.removeItem('online_token');
    localStorage.removeItem('online_customer_name');
    bladeSyncedRef.current = false;
    setToken(null);
    setCustomerName(null);
  };

  return (
    <AuthContext.Provider value={{ token, customerName, authReady, setAuth, clearAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
