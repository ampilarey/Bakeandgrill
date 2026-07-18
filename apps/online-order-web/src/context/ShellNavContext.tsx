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
  /** Global cart bottom sheet (ZUS-style expand from FloatingCartBar). */
  cartSheetOpen: boolean;
  openCartSheet: () => void;
  closeCartSheet: () => void;
};

const ShellNavContext = createContext<ShellNavContextValue | null>(null);

export function ShellNavProvider({ children }: { children: ReactNode }) {
  const [hideNav, setHideNavState] = useState(false);
  const [cartSheetOpen, setCartSheetOpen] = useState(false);

  const setHideNav = useCallback((hide: boolean) => {
    setHideNavState(hide);
  }, []);

  const openCartSheet = useCallback(() => setCartSheetOpen(true), []);
  const closeCartSheet = useCallback(() => setCartSheetOpen(false), []);

  const value = useMemo(
    () => ({
      hideNav,
      setHideNav,
      cartSheetOpen,
      openCartSheet,
      closeCartSheet,
    }),
    [hideNav, setHideNav, cartSheetOpen, openCartSheet, closeCartSheet],
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
