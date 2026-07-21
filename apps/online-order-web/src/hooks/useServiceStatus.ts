import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchServiceStatus,
  type ServiceKey,
  type ServiceStatusEntry,
  type ServiceStatusResponse,
} from '../api/serviceStatus';

const REFETCH_INTERVAL_MS = 60_000;

type State = {
  data: ServiceStatusResponse | null;
  loading: boolean;
  error: string | null;
};

/**
 * Read-only public service status hook.
 *
 * Fetches once on mount, refetches on window focus and every 60s. Callers
 * can also call refresh() after any 503 SERVICE_UNAVAILABLE response so a
 * stale banner corrects itself immediately.
 *
 * Backend is authoritative — this hook is only used for banner + UX hints.
 */
export function useServiceStatus() {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null });
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetchServiceStatus();
      if (!mounted.current) return;
      setState({ data: res, loading: false, error: null });
    } catch (e) {
      if (!mounted.current) return;
      setState((s) => ({ ...s, loading: false, error: (e as Error).message ?? 'failed' }));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    const t = setInterval(() => {
      void load();
    }, REFETCH_INTERVAL_MS);
    const onFocus = () => {
      void load();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      mounted.current = false;
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  const get = useCallback(
    (key: ServiceKey | string): ServiceStatusEntry | null => state.data?.services[key] ?? null,
    [state.data]
  );

  const isAvailable = useCallback(
    (key: ServiceKey | string): boolean => {
      const entry = state.data?.services[key];
      // Treat "unknown" as available so the UX stays permissive; the backend
      // will 503 any disabled write regardless.
      return entry ? entry.available : true;
    },
    [state.data]
  );

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    refresh: load,
    isAvailable,
    get,
  };
}
