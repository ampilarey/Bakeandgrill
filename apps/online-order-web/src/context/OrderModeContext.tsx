import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  confirmSalesChannel,
  getSalesChannel,
  isSalesChannelConfirmed,
  setSalesChannel,
  type SalesChannel,
} from '../api/menu';

/** Customer-facing order mode (maps to sales channel online_pickup | delivery). */
export type OrderMode = 'pickup' | 'delivery';

export type SetModeOptions = {
  /**
   * When true (default), marks the mode as an explicit customer choice.
   * Pass false for automatic flips (blocked delivery, empty-menu fallback).
   */
  explicit?: boolean;
};

type OrderModeContextValue = {
  mode: OrderMode;
  setMode: (mode: OrderMode, opts?: SetModeOptions) => void;
  /** True once the customer has explicitly chosen pickup or delivery. */
  modeConfirmed: boolean;
  /** Sales channel for menu API calls. */
  channel: SalesChannel;
};

const OrderModeContext = createContext<OrderModeContextValue | null>(null);

export function channelToMode(channel: SalesChannel): OrderMode {
  return channel === 'delivery' ? 'delivery' : 'pickup';
}

export function modeToChannel(mode: OrderMode): SalesChannel {
  return mode === 'delivery' ? 'delivery' : 'online_pickup';
}

export function OrderModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<OrderMode>(() => channelToMode(getSalesChannel()));
  const [modeConfirmed, setModeConfirmed] = useState(() => isSalesChannelConfirmed());

  const setMode = useCallback((next: OrderMode, opts?: SetModeOptions) => {
    const explicit = opts?.explicit !== false;
    const nextChannel = modeToChannel(next);

    if (explicit) {
      confirmSalesChannel();
      setModeConfirmed(true);
    }

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
      // Automatic fallbacks call setSalesChannel without confirmSalesChannel —
      // re-read so modeConfirmed stays false across those paths.
      setModeConfirmed(isSalesChannelConfirmed());
    };
    window.addEventListener('sales_channel_change', syncFromStorage);
    return () => window.removeEventListener('sales_channel_change', syncFromStorage);
  }, []);

  const value = useMemo<OrderModeContextValue>(
    () => ({
      mode,
      setMode,
      modeConfirmed,
      channel: modeToChannel(mode),
    }),
    [mode, setMode, modeConfirmed],
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
