import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { checkSession } from '../api';

interface AuthState {
  token: string | null;
  customerName: string | null;
  /** true once the initial session check has resolved (success or failure) */
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken]               = useState<string | null>(() => localStorage.getItem('online_token'));
  const [customerName, setCustomerName] = useState<string | null>(() => localStorage.getItem('online_customer_name'));
  const [authReady, setAuthReady]       = useState<boolean>(() => !!localStorage.getItem('online_token'));

  // On mount: if no token, probe the Blade session cookie for a cross-app login
  useEffect(() => {
    let cancelled = false;

    if (!localStorage.getItem('online_token')) {
      checkSession()
        .then((r) => {
          if (cancelled) return;
          if (r.authenticated) {
            const n = r.customer.name ?? r.customer.phone ?? '';
            localStorage.setItem('online_token', r.token);
            if (n) localStorage.setItem('online_customer_name', n);
            setToken(r.token);
            setCustomerName(n || null);
            window.dispatchEvent(new Event('auth_change'));
          }
        })
        .catch(() => { /* not logged in — ignore */ })
        .finally(() => { if (!cancelled) setAuthReady(true); });
    }

    return () => { cancelled = true; };
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
