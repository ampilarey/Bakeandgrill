import { req } from './client';

export type KitchenHandoverSettings = {
  kitchen_require_pos_receiving_before_ready: boolean;
  kitchen_receive_updates_prepared_stock: boolean;
  kitchen_manager_verification_for_prepared_stock: boolean;
  kitchen_allow_staff_prepared_stock_batches: boolean;
  kitchen_photo_required_for_reject_waste: boolean;
  kitchen_production_consumes_recipe_stock: boolean;
};

export type KitchenProductionBatch = {
  id: number;
  batch_no: string;
  production_type: string;
  status: string;
  station?: string | null;
  order?: { id: number; order_number: string; type?: string } | null;
  producer?: { id: number; name: string } | null;
  submitted_at?: string | null;
  notes?: string | null;
  items: Array<{
    id: number;
    name: string;
    produced_qty: number;
    expected_receive_qty: number;
    unit: string;
    status: string;
  }>;
  created_at?: string;
};

export type KitchenVariance = {
  id: number;
  batch_id: number;
  batch_no?: string;
  variance_type: string;
  qty: number;
  unit?: string;
  reason?: string;
  notes?: string;
  recorded_by?: { id: number; name: string } | null;
  reviewed_at?: string | null;
  created_at?: string;
};

export async function fetchKitchenHandoverSettings(): Promise<{ settings: KitchenHandoverSettings }> {
  return req(`/kitchen-handover/settings`);
}

export async function updateKitchenHandoverSettings(
  data: Partial<KitchenHandoverSettings>,
): Promise<{ settings: KitchenHandoverSettings }> {
  return req('/kitchen-handover/settings', { method: 'PUT', body: JSON.stringify(data) });
}

export async function fetchKitchenProductionBatches(params?: {
  status?: string;
  production_type?: string;
  page?: number;
}): Promise<{ data: KitchenProductionBatch[]; meta: { current_page: number; last_page: number; total: number } }> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.production_type) qs.set('production_type', params.production_type);
  if (params?.page) qs.set('page', String(params.page));
  const q = qs.toString();
  return req(`/kitchen-production${q ? `?${q}` : ''}`);
}

export async function fetchKitchenReceivingPending(): Promise<{ data: KitchenProductionBatch[] }> {
  return req('/kitchen-receiving/pending');
}

export async function fetchKitchenVariances(reviewed?: boolean): Promise<{
  data: KitchenVariance[];
  meta: { current_page: number; last_page: number; total: number };
}> {
  const qs = reviewed === undefined ? '' : `?reviewed=${reviewed ? '1' : '0'}`;
  return req(`/kitchen-variance${qs}`);
}

export async function reviewKitchenVariance(id: number, notes?: string): Promise<{ variance: KitchenVariance }> {
  return req(`/kitchen-variance/${id}/review`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  });
}

export async function fetchKitchenProductionSummary(from?: string, to?: string): Promise<{
  summary: Record<string, number>;
  from: string;
  to: string;
}> {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const q = qs.toString();
  return req(`/kitchen-reports/summary${q ? `?${q}` : ''}`);
}

export async function fetchKitchenHandoverReport(): Promise<{ data: Array<Record<string, unknown>> }> {
  return req('/kitchen-reports/handover');
}

export async function fetchKitchenWasteReport(): Promise<{ data: Array<Record<string, unknown>> }> {
  return req('/kitchen-reports/waste');
}

export async function fetchKitchenStaffOutputReport(): Promise<{ data: Array<{ name: string; batch_count: number }> }> {
  return req('/kitchen-reports/staff-output');
}

export async function fetchKitchenPosReceivingReport(): Promise<{ data: Array<Record<string, unknown>> }> {
  return req('/kitchen-reports/pos-receiving');
}

export async function receiveKitchenBatchAll(
  productionBatchId: number,
  data?: { receive_location?: string; notes?: string },
): Promise<{ batch: KitchenProductionBatch }> {
  return req(`/kitchen-receiving/${productionBatchId}/receive-all`, {
    method: 'POST',
    body: JSON.stringify(data ?? {}),
  });
}

export async function submitKitchenProductionBatch(id: number): Promise<{ batch: KitchenProductionBatch }> {
  return req(`/kitchen-production/${id}/submit`, { method: 'POST' });
}

export async function cancelKitchenProductionBatch(id: number): Promise<{ batch: KitchenProductionBatch }> {
  return req(`/kitchen-production/${id}/cancel`, { method: 'POST' });
}
