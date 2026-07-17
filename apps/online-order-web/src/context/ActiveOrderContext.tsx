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

const ACTIVE = new Set(['payment_pending', 'pending', 'paid', 'preparing', 'ready']);

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

type ActiveOrderContextValue = {
  order: Order | null | undefined;
  activeOrder: Order | null;
  hasActiveOrder: boolean;
  loading: boolean;
};

const ActiveOrderContext = createContext<ActiveOrderContextValue | null>(null);

export function ActiveOrderProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, authReady } = useAuth();
  const location = useLocation();
  const [order, setOrder] = useState<Order | null | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const skip =
    !isAuthenticated ||
    !authReady ||
    location.pathname.startsWith('/checkout') ||
    location.pathname.startsWith('/orders/');

  useEffect(() => {
    if (skip) {
      setOrder(null);
      return;
    }

    const controller = new AbortController();

    const load = () => {
      fetchCustomerOrders(controller.signal)
        .then((res) => {
          const orders = normalizeOrders(res);
          const active = orders.find((o) => ACTIVE.has(o.status));
          setOrder(active ?? null);
        })
        .catch((err) => {
          if (err.name !== 'AbortError') setOrder(null);
        });
    };

    load();
    timerRef.current = setInterval(load, 30_000);

    return () => {
      controller.abort();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isAuthenticated, authReady, skip]);

  const reloadOnNav = useCallback(() => {
    if (!isAuthenticated || !authReady) return undefined;
    const controller = new AbortController();
    fetchCustomerOrders(controller.signal)
      .then((res) => {
        const orders = normalizeOrders(res);
        const active = orders.find((o) => ACTIVE.has(o.status));
        setOrder(active ?? null);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setOrder(null);
      });
    return controller;
  }, [isAuthenticated, authReady]);

  useEffect(() => {
    if (skip || order === undefined) return;
    const controller = reloadOnNav();
    return () => controller?.abort();
  }, [location.pathname, skip, order, reloadOnNav]);

  const activeOrder =
    order && isActiveOrderStatus(order.status) ? order : null;

  const value = useMemo<ActiveOrderContextValue>(
    () => ({
      order,
      activeOrder,
      hasActiveOrder: activeOrder != null,
      loading: order === undefined,
    }),
    [order, activeOrder],
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
