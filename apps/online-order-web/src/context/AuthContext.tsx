import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface AuthState {
  token: string | null;
  customerName: string | null;
  /** true once the initial handoff-cookie check has resolved */
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

/** Read and immediately delete a short-lived handoff cookie set by the Blade login. */
function consumeHandoffCookies(): { token: string; name: string } | null {
  const get = (name: string) => {
    const match = document.cookie.split('; ').find((r) => r.startsWith(name + '='));
    return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
  };
  const token = get('_cauth');
  if (!token) return null;

  const name = get('_cauth_name') ?? '';

  // Consume immediately so the token isn't left in cookies any longer than needed
  const domain = window.location.hostname.includes('.')
    ? '.' + window.location.hostname.split('.').slice(-2).join('.')
    : window.location.hostname;
  const expire = '; Max-Age=0; path=/; domain=' + domain;
  document.cookie = '_cauth=' + expire;
  document.cookie = '_cauth_name=' + expire;

  return { token, name };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken]               = useState<string | null>(() => localStorage.getItem('online_token'));
  const [customerName, setCustomerName] = useState<string | null>(() => localStorage.getItem('online_customer_name'));
  const [authReady, setAuthReady]       = useState<boolean>(() => !!localStorage.getItem('online_token'));

  // On mount: check for a handoff cookie set by the Blade login controller.
  // This is how "log in on main site → order app knows you're logged in" works,
  // without touching the session cookie (which would corrupt the Blade session).
  useEffect(() => {
    if (localStorage.getItem('online_token')) {
      // Already have a token — nothing to do
      setAuthReady(true);
      return;
    }

    const handoff = consumeHandoffCookies();
    if (handoff) {
      localStorage.setItem('online_token', handoff.token);
      if (handoff.name) localStorage.setItem('online_customer_name', handoff.name);
      setToken(handoff.token);
      setCustomerName(handoff.name || null);
      window.dispatchEvent(new Event('auth_change'));
    }
    setAuthReady(true);
  }, []);

  // Sync with localStorage changes (other tabs, manual changes, auth_change events)
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

  const setAuth = (tok: string, name: string) => {
    localStorage.setItem('online_token', tok);
    if (name) localStorage.setItem('online_customer_name', name);
    setToken(tok);
    setCustomerName(name || null);
    setAuthReady(true);
    window.dispatchEvent(new Event('auth_change'));
  };

  const clearAuth = () => {
    localStorage.removeItem('online_token');
    localStorage.removeItem('online_customer_name');
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
