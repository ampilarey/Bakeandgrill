import { createContext, useContext, type ReactNode } from 'react';
import { useServiceStatus } from '../hooks/useServiceStatus';
import type { ServiceStatusEntry, ServiceKey } from '../api/serviceStatus';

type Ctx = {
  data: ReturnType<typeof useServiceStatus>['data'];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  isAvailable: (key: ServiceKey | string) => boolean;
  get: (key: ServiceKey | string) => ServiceStatusEntry | null;
};

const ServiceStatusCtx = createContext<Ctx | null>(null);

/**
 * Provider so the banner + gating logic share a single fetch across the
 * order app. Read-only in Stage 2; Stage 5 layers in write-time gating.
 */
export function ServiceStatusProvider({ children }: { children: ReactNode }) {
  const status = useServiceStatus();
  return <ServiceStatusCtx.Provider value={status}>{children}</ServiceStatusCtx.Provider>;
}

export function useServiceStatusContext(): Ctx {
  const ctx = useContext(ServiceStatusCtx);
  if (!ctx) {
    // Non-fatal fallback so pages rendered outside the shell still work.
    return {
      data: null,
      loading: false,
      error: null,
      refresh: async () => {},
      isAvailable: () => true,
      get: () => null,
    };
  }
  return ctx;
}
