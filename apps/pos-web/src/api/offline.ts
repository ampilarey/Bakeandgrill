// Offline sync API — kept separate from the main POS client so online
// endpoint modules never import offline-only paths by accident.

import { request } from './client';

export type PosOfflineSyncPayload = {
  orders: Array<{
    idempotency_key: string;
    local_order_id: string;
    local_order_number: string;
    device_identifier: string;
    shift_id: number;
    created_at_local: string;
    type: string;
    items: Array<{
      item_id: number;
      quantity: number;
      variant_id?: number;
      unit_price: number;
      modifiers?: Array<{ modifier_id: number; name?: string; price?: number }>;
      notes?: string;
    }>;
    totals: { subtotal: number; tax: number; total: number };
    payment: {
      method: 'cash' | 'card' | 'bank_transfer';
      amount: number;
      reference?: string;
    };
    discount_amount?: number;
    customer_id?: number;
    rewards?: {
      promo_code?: string | null;
      loyalty_points?: number;
      gift_card_code?: string | null;
    };
    ticket_name?: string;
    ticket_note?: string;
    restaurant_table_id?: number;
    prepared_locally?: boolean;
  }>;
};

export type PosOfflineSyncResponse = {
  results: Array<{
    local_order_id: string;
    status: 'synced' | 'conflict' | 'failed';
    server_order_id?: number;
    server_order_number?: string;
    inventory_conflict?: boolean;
    message?: string | null;
  }>;
};

export async function syncOfflineOrders(payload: PosOfflineSyncPayload): Promise<PosOfflineSyncResponse> {
  return request('/pos/offline-sync', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
