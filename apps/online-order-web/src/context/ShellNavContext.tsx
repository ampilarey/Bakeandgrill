import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type ShellNavContextValue = {
  /** When true, BottomNav (and float-cart offset) hide — sheets / search overlay. */
  hideNav: boolean;
  setHideNav: (hide: boolean) => void;
};

const ShellNavContext = createContext<ShellNavContextValue | null>(null);

export function ShellNavProvider({ children }: { children: ReactNode }) {
  const [hideNav, setHideNavState] = useState(false);
  const setHideNav = useCallback((hide: boolean) => {
    setHideNavState(hide);
  }, []);

  const value = useMemo(
    () => ({ hideNav, setHideNav }),
    [hideNav, setHideNav],
  );

  return (
    <ShellNavContext.Provider value={value}>
      {children}
    </ShellNavContext.Provider>
  );
}

export function useShellNav(): ShellNavContextValue {
  const ctx = useContext(ShellNavContext);
  if (!ctx) {
    throw new Error('useShellNav must be used within ShellNavProvider');
  }
  return ctx;
}

/** Safe outside AppShell (e.g. Checkout) — returns null. */
export function useShellNavOptional(): ShellNavContextValue | null {
  return useContext(ShellNavContext);
}
