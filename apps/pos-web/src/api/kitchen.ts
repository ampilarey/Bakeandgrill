import { request } from "./client";

// ── Kitchen production & receiving ─────────────────────────────────────────

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
  order?: { id: number; order_number: string; type?: string } | null;
  producer?: { id: number; name: string } | null;
  submitted_at?: string | null;
  items: Array<{
    id: number;
    name: string;
    produced_qty: number;
    expected_receive_qty: number;
    unit: string;
    status: string;
  }>;
};

export async function fetchKitchenHandoverSettings(): Promise<{ settings: KitchenHandoverSettings }> {
  return request("/kitchen-handover/settings");
}

export async function fetchKitchenReceivingPending(orderId?: number): Promise<{ data: KitchenProductionBatch[] }> {
  const qs = orderId ? `?order_id=${orderId}` : "";
  return request(`/kitchen-receiving/pending${qs}`);
}

export async function receiveKitchenBatchAll(
  batchId: number,
  payload?: { receive_location?: string; notes?: string },
): Promise<{ batch: KitchenProductionBatch }> {
  return request(`/kitchen-receiving/${batchId}/receive-all`, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}
