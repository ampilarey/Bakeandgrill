import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getOrderDay, setOrderDay as persistOrderDay, type OrderDay } from '../api/menu';

export type { OrderDay };

type OrderDayContextValue = {
  /** App-wide "order for today / tomorrow" choice (persisted, midnight-safe). */
  day: OrderDay;
  setDay: (day: OrderDay) => void;
};

const OrderDayContext = createContext<OrderDayContextValue | null>(null);

export function OrderDayProvider({ children }: { children: ReactNode }) {
  const [day, setDayState] = useState<OrderDay>(() => getOrderDay());

  const setDay = useCallback((next: OrderDay) => {
    setDayState(next);
    if (getOrderDay() !== next) {
      persistOrderDay(next);
    }
  }, []);

  useEffect(() => {
    const syncFromStorage = () => setDayState(getOrderDay());
    window.addEventListener('order_day_change', syncFromStorage);
    return () => window.removeEventListener('order_day_change', syncFromStorage);
  }, []);

  const value = useMemo<OrderDayContextValue>(() => ({ day, setDay }), [day, setDay]);

  return <OrderDayContext.Provider value={value}>{children}</OrderDayContext.Provider>;
}

export function useOrderDay(): OrderDayContextValue {
  const ctx = useContext(OrderDayContext);
  if (!ctx) {
    throw new Error('useOrderDay must be used within OrderDayProvider');
  }
  return ctx;
}
