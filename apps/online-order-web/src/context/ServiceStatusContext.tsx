import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useServiceStatus } from '../hooks/useServiceStatus';
import type { ServiceStatusEntry, ServiceKey } from '../api/serviceStatus';
import type { ServiceUnavailableError } from '../api/serviceUnavailable';

type Ctx = {
  data: ReturnType<typeof useServiceStatus>['data'];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  isAvailable: (key: ServiceKey | string) => boolean;
  get: (key: ServiceKey | string) => ServiceStatusEntry | null;
  /**
   * Currently-open service-unavailable modal target (from a 503 or an
   * explicit `openUnavailableModal` call). Null when no modal is open.
   */
  unavailableTarget: ServiceUnavailableTarget | null;
  openUnavailableModal: (target: ServiceUnavailableTarget) => void;
  closeUnavailableModal: () => void;
};

export type ServiceUnavailableTarget = {
  serviceKey: string;
  message: string;
  alternatives: string[];
  retryAt: string | null;
  notifyEnabled: boolean;
};

const ServiceStatusCtx = createContext<Ctx | null>(null);

/**
 * Provider so the banner + gating logic share a single fetch across the
 * order app. Read-only in Stage 2; Stage 5 layers in write-time gating +
 * the global 'service_unavailable' listener that mirrors any 503 into the
 * modal + a status refresh.
 */
export function ServiceStatusProvider({ children }: { children: ReactNode }) {
  const status = useServiceStatus();
  const [unavailableTarget, setUnavailableTarget] = useState<ServiceUnavailableTarget | null>(null);

  const openUnavailableModal = useCallback((target: ServiceUnavailableTarget) => {
    setUnavailableTarget(target);
  }, []);

  const closeUnavailableModal = useCallback(() => {
    setUnavailableTarget(null);
  }, []);

  useEffect(() => {
    const handler = (evt: Event) => {
      const detail = (evt as CustomEvent<ServiceUnavailableError>).detail;
      if (!detail) return;
      setUnavailableTarget({
        serviceKey: detail.serviceKey,
        message: detail.message,
        alternatives: detail.alternatives,
        retryAt: detail.retryAt,
        notifyEnabled: detail.notifyEnabled,
      });
      void status.refresh();
    };
    window.addEventListener('service_unavailable', handler);
    return () => window.removeEventListener('service_unavailable', handler);
  }, [status]);

  const value = useMemo<Ctx>(
    () => ({
      ...status,
      unavailableTarget,
      openUnavailableModal,
      closeUnavailableModal,
    }),
    [status, unavailableTarget, openUnavailableModal, closeUnavailableModal],
  );

  return <ServiceStatusCtx.Provider value={value}>{children}</ServiceStatusCtx.Provider>;
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
      unavailableTarget: null,
      openUnavailableModal: () => {},
      closeUnavailableModal: () => {},
    };
  }
  return ctx;
}
