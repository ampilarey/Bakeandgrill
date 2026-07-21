// ── Typed 503 SERVICE_UNAVAILABLE handling ─────────────────────────────────
// Any gated write (checkout, delivery, payment, catering, registration) that
// hits a disabled service returns HTTP 503 with the JSON shape:
//   { code: 'SERVICE_UNAVAILABLE', service_key, message, alternatives, retry_at, notify_enabled }
// see docs/SERVICE_AVAILABILITY_MAINTENANCE_PLAN.md §12.
//
// This module normalises the ApiRequestError body into a typed error and
// broadcasts a window event so a global modal + status refresh can fire even
// when the caller is a stale/cached bundle.

import { ApiRequestError } from '@shared/api';

export type ServiceUnavailableBody = {
  code: 'SERVICE_UNAVAILABLE';
  service_key: string;
  message: string;
  alternatives?: string[];
  retry_at?: string | null;
  notify_enabled?: boolean;
};

export class ServiceUnavailableError extends Error {
  public readonly status = 503;
  public readonly serviceKey: string;
  public readonly alternatives: string[];
  public readonly retryAt: string | null;
  public readonly notifyEnabled: boolean;

  constructor(body: ServiceUnavailableBody) {
    super(body.message || 'Service is temporarily unavailable.');
    this.name = 'ServiceUnavailableError';
    this.serviceKey = body.service_key;
    this.alternatives = body.alternatives ?? [];
    this.retryAt = body.retry_at ?? null;
    this.notifyEnabled = Boolean(body.notify_enabled);
  }
}

/**
 * Returns a ServiceUnavailableError when the ApiRequestError is a 503 with
 * the canonical SERVICE_UNAVAILABLE code, otherwise `null`. Idempotent —
 * safe to call on every catch site.
 */
export function toServiceUnavailableError(err: unknown): ServiceUnavailableError | null {
  if (!(err instanceof ApiRequestError)) return null;
  if (err.status !== 503) return null;
  const body = err.body as Partial<ServiceUnavailableBody> | undefined;
  if (!body || body.code !== 'SERVICE_UNAVAILABLE' || !body.service_key) return null;
  return new ServiceUnavailableError({
    code: 'SERVICE_UNAVAILABLE',
    service_key: body.service_key,
    message: body.message ?? 'Service is temporarily unavailable.',
    alternatives: body.alternatives ?? [],
    retry_at: body.retry_at ?? null,
    notify_enabled: body.notify_enabled ?? false,
  });
}

/**
 * Fire a global 'service_unavailable' CustomEvent so any listener (usually
 * the ServiceStatusProvider) can open the modal + refresh the status feed.
 */
export function broadcastServiceUnavailable(err: ServiceUnavailableError): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ServiceUnavailableError>('service_unavailable', { detail: err }),
  );
}
