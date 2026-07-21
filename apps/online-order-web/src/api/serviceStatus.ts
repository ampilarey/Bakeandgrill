// ── Service Availability (public read-only) ────────────────────────────────
// Backend: GET /api/service-status — see docs/SERVICE_AVAILABILITY_MAINTENANCE_PLAN.md §12
// The order app treats this as UX-only: the backend is authoritative and will
// reject disabled writes with HTTP 503 regardless of what this map says.

import { request } from './client';

export type ServiceKey =
  | 'online_ordering'
  | 'online_pickup'
  | 'online_delivery'
  | 'online_checkout'
  | 'online_payment'
  | 'catering_inquiry'
  | 'customer_registration'
  | 'marketing_site'
  | 'pos_sales'
  | 'kds_operations'
  | 'delivery_operations'
  | 'emergency_write_lock';

export type ServiceStatusEntry = {
  service_key: string;
  group: 'public' | 'internal';
  available: boolean;
  status: string;
  reason_type: string | null;
  public_message: string | null;
  alternatives: string[];
  retry_at: string | null;
  starts_at?: string | null;
  notify_enabled: boolean;
  incident_id: number | null;
};

export type ServiceStatusResponse = {
  services: Partial<Record<ServiceKey, ServiceStatusEntry>> & Record<string, ServiceStatusEntry>;
  generated_at: string;
};

export async function fetchServiceStatus(): Promise<ServiceStatusResponse> {
  return request<ServiceStatusResponse>('/service-status');
}
