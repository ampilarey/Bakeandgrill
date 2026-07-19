import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { fetchCustomerOrders } from '../api';
import type { Order } from '../api';
import { isGiftCardOrder } from '../utils/giftCardOrder';

const ACTIVE = new Set(['payment_pending', 'pending', 'paid', 'preparing', 'ready']);

function isActiveFoodOrder(o: Order): boolean {
  return ACTIVE.has(o.status) && !isGiftCardOrder(o);
}

function findActiveFoodOrder(orders: Order[]): Order | null {
  return orders.find(isActiveFoodOrder) ?? null;
}

function countActiveFoodOrders(orders: Order[]): number {
  return orders.reduce((n, o) => n + (isActiveFoodOrder(o) ? 1 : 0), 0);
}

function isOrder(v: unknown): v is Order {
  return typeof v === 'object' && v !== null && 'id' in v && 'status' in v;
}

function normalizeOrders(res: unknown): Order[] {
  const toOrders = (arr: unknown): Order[] =>
    Array.isArray(arr) ? arr.filter(isOrder) : [];

  if (Array.isArray(res)) return toOrders(res);
  if (!res || typeof res !== 'object') return [];
  const o = res as Record<string, unknown>;
  if (Array.isArray(o.data)) return toOrders(o.data);
  if (o.data && typeof o.data === 'object') {
    const inner = (o.data as Record<string, unknown>).data;
    if (Array.isArray(inner)) return toOrders(inner);
  }
  if (Array.isArray(o.orders)) return toOrders(o.orders);
  return [];
}

export function isActiveOrderStatus(status: string): boolean {
  return ACTIVE.has(status);
}

/** Keep state identity stable when id+status unchanged (avoids effect loops). */
export function sameActiveOrder(
  prev: Order | null | undefined,
  next: Order | null,
): boolean {
  if (prev === undefined) return false;
  if (prev === null && next === null) return true;
  if (prev === null || next === null) return false;
  return prev.id === next.id && prev.status === next.status;
}

type ActiveOrderContextValue = {
  order: Order | null | undefined;
  activeOrder: Order | null;
  hasActiveOrder: boolean;
  /** Count of active food orders (for bottom-nav badge). */
  activeOrderCount: number;
  loading: boolean;
};

const ActiveOrderContext = createContext<ActiveOrderContextValue | null>(null);

export function ActiveOrderProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, authReady } = useAuth();
  const location = useLocation();
  const [order, setOrder] = useState<Order | null | undefined>(undefined);
  const [activeOrderCount, setActiveOrderCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** True after the first successful/failed resolve (not undefined). */
  const loadedRef = useRef(false);

  const skip =
    !isAuthenticated ||
    !authReady ||
    location.pathname.startsWith('/checkout') ||
    location.pathname.startsWith('/orders/');

  const applyOrders = useCallback((orders: Order[]) => {
    loadedRef.current = true;
    const next = findActiveFoodOrder(orders);
    const count = countActiveFoodOrders(orders);
    setOrder((prev) => (sameActiveOrder(prev, next) ? prev : next));
    setActiveOrderCount((prev) => (prev === count ? prev : count));
  }, []);

  const clearActive = useCallback(() => {
    loadedRef.current = true;
    setOrder(null);
    setActiveOrderCount(0);
  }, []);

  useEffect(() => {
    if (skip) {
      clearActive();
      return;
    }

    const controller = new AbortController();

    const load = () => {
      fetchCustomerOrders(controller.signal)
        .then((res) => {
          applyOrders(normalizeOrders(res));
        })
        .catch((err) => {
          if (err.name !== 'AbortError') clearActive();
        });
    };

    load();
    timerRef.current = setInterval(load, 30_000);

    return () => {
      controller.abort();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isAuthenticated, authReady, skip, applyOrders, clearActive]);

  // Reload once per navigation — do NOT depend on `order` (new object identity
  // every response would self-trigger a fetch loop).
  useEffect(() => {
    if (skip || !loadedRef.current) return;
    const controller = new AbortController();
    fetchCustomerOrders(controller.signal)
      .then((res) => {
        applyOrders(normalizeOrders(res));
      })
      .catch((err) => {
        if (err.name !== 'AbortError') clearActive();
      });
    return () => controller.abort();
  }, [location.pathname, skip, applyOrders, clearActive]);

  const activeOrder =
    order && isActiveOrderStatus(order.status) && !isGiftCardOrder(order) ? order : null;

  const value = useMemo<ActiveOrderContextValue>(
    () => ({
      order,
      activeOrder,
      hasActiveOrder: activeOrder != null,
      activeOrderCount: activeOrder != null ? Math.max(activeOrderCount, 1) : 0,
      loading: order === undefined,
    }),
    [order, activeOrder, activeOrderCount],
  );

  return (
    <ActiveOrderContext.Provider value={value}>
      {children}
    </ActiveOrderContext.Provider>
  );
}

export function useActiveOrder(): ActiveOrderContextValue {
  const ctx = useContext(ActiveOrderContext);
  if (!ctx) {
    throw new Error('useActiveOrder must be used within ActiveOrderProvider');
  }
  return ctx;
}
