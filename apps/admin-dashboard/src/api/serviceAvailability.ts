import { req } from './client';

export type ServiceGroup = 'public' | 'internal';

export type ServiceStatus =
  | 'available'
  | 'operational_pause'
  | 'scheduled_maintenance'
  | 'unavailable'
  | 'emergency_disabled';

export type ServiceReasonType =
  | 'technical_maintenance'
  | 'operational_pause'
  | 'payment_issue'
  | 'emergency'
  | 'scheduled';

export interface ServiceStateRow {
  service_key: string;
  group: ServiceGroup;
  status: ServiceStatus;
  reason_type: ServiceReasonType | null;
  public_message: string | null;
  internal_note: string | null;
  alternatives: string[];
  allow_existing_operations: boolean;
  allow_admin_bypass: boolean;
  starts_at: string | null;
  ends_at: string | null;
  notify_enabled: boolean;
  current_incident_id: number | null;
  changed_by: number | null;
  updated_at: string | null;
  resolved_available: boolean;
  resolved_source: string;
}

export interface ServiceStateUpdatePayload {
  status?: ServiceStatus;
  reason_type?: ServiceReasonType | null;
  public_message?: string | null;
  internal_note?: string | null;
  alternatives?: string[] | null;
  starts_at?: string | null;
  ends_at?: string | null;
  notify_enabled?: boolean;
  allow_existing_operations?: boolean;
  allow_admin_bypass?: boolean;
  confirmation?: string;
}

export async function listServiceStates(): Promise<{ data: ServiceStateRow[]; generated_at: string }> {
  return req('/admin/service-availability');
}

export async function updateServiceState(
  key: string,
  payload: ServiceStateUpdatePayload,
): Promise<{ data: ServiceStateRow }> {
  return req(`/admin/service-availability/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function restoreService(key: string): Promise<{ data: ServiceStateRow }> {
  return req(`/admin/service-availability/${encodeURIComponent(key)}/restore`, {
    method: 'POST',
  });
}

export interface PresetPreview {
  dry_run: true;
  preset: string;
  changes: Array<{ service_key: string; target_status: ServiceStatus }>;
}

export interface PresetApplied {
  preset: string;
  applied: number;
}

export async function previewPreset(preset: string): Promise<PresetPreview> {
  return req(`/admin/service-availability/preset/${encodeURIComponent(preset)}?dry_run=1`, {
    method: 'POST',
  });
}

export async function applyPreset(preset: string, reason?: string): Promise<PresetApplied> {
  return req(`/admin/service-availability/preset/${encodeURIComponent(preset)}`, {
    method: 'POST',
    body: JSON.stringify({ reason: reason ?? '' }),
  });
}

export interface ServiceHistoryResponse {
  service_key: string;
  incidents: Array<{
    id: number;
    service_key: string;
    incident_type: string;
    status: 'open' | 'restored';
    public_message: string | null;
    started_at: string;
    restored_at: string | null;
    notified_count: number;
  }>;
  audits: Array<{
    id: number;
    action: string;
    user_id: number | null;
    old_values: unknown;
    new_values: unknown;
    meta: unknown;
    created_at: string;
  }>;
}

export async function getServiceHistory(key: string): Promise<ServiceHistoryResponse> {
  return req(`/admin/service-availability/${encodeURIComponent(key)}/history`);
}
