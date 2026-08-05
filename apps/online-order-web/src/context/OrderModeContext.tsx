import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getSalesChannel, setSalesChannel, type SalesChannel } from '../api/menu';

/** Customer-facing order mode (maps to sales channel online_pickup | delivery | dine_in). */
export type OrderMode = 'pickup' | 'delivery' | 'dine_in';

type OrderModeContextValue = {
  mode: OrderMode;
  setMode: (mode: OrderMode) => void;
  /** Sales channel for menu API calls. */
  channel: SalesChannel;
};

const OrderModeContext = createContext<OrderModeContextValue | null>(null);

export function channelToMode(channel: SalesChannel): OrderMode {
  if (channel === 'delivery') return 'delivery';
  if (channel === 'dine_in') return 'dine_in';
  return 'pickup';
}

export function modeToChannel(mode: OrderMode): SalesChannel {
  if (mode === 'delivery') return 'delivery';
  if (mode === 'dine_in') return 'dine_in';
  return 'online_pickup';
}

export function OrderModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<OrderMode>(() => channelToMode(getSalesChannel()));

  const setMode = useCallback((next: OrderMode) => {
    const nextChannel = modeToChannel(next);
    // Avoid re-emitting when already on this channel (prevents snap-back loops
    // with fetchItems delivery→pickup fallback).
    if (getSalesChannel() === nextChannel) {
      setModeState(next);
      return;
    }
    setModeState(next);
    setSalesChannel(nextChannel);
  }, []);

  useEffect(() => {
    const syncFromStorage = () => {
      setModeState(channelToMode(getSalesChannel()));
    };
    window.addEventListener('sales_channel_change', syncFromStorage);
    return () => window.removeEventListener('sales_channel_change', syncFromStorage);
  }, []);

  const value = useMemo<OrderModeContextValue>(
    () => ({
      mode,
      setMode,
      channel: modeToChannel(mode),
    }),
    [mode, setMode],
  );

  return (
    <OrderModeContext.Provider value={value}>
      {children}
    </OrderModeContext.Provider>
  );
}

export function useOrderMode(): OrderModeContextValue {
  const ctx = useContext(OrderModeContext);
  if (!ctx) {
    throw new Error('useOrderMode must be used within OrderModeProvider');
  }
  return ctx;
}
