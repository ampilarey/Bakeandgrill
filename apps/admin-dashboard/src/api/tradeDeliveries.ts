import { req } from './client';

export type TradeDeliveryStatus = 'draft' | 'dispatched' | 'reconciled' | 'cancelled';

export type TradeDeliveryLine = {
  id: number;
  item_id: number;
  variant_id: number | null;
  item_name?: string;
  variant_name?: string | null;
  qty_sent: number;
  unit_price_laar: number;
  unit_cost_laar: number;
  qty_sold: number;
  qty_returned_good: number;
  qty_returned_waste: number;
  qty_missing: number;
  reported_sold_qty: number | null;
  counted_return_qty: number | null;
  return_condition: string | null;
  return_action: string | null;
  line_value_laar: number;
};

export type TradeDelivery = {
  id: number;
  trade_account_id: number;
  delivery_number: string;
  status: TradeDeliveryStatus;
  dispatched_at: string | null;
  dispatcher_name?: string | null;
  driver_name: string | null;
  expected_return_at: string | null;
  reconciled_at: string | null;
  reconciler_name?: string | null;
  notes: string | null;
  has_mismatch: boolean;
  self_reconciled: boolean;
  stamped_value_laar: number | null;
  shop_name?: string | null;
  lines_count?: number | null;
  lines?: TradeDeliveryLine[];
};

export type TradeExposure = {
  balance_owed_laar: number;
  holding_unbilled_laar: number;
  exposure_laar: number;
  credit_limit_laar: number;
  available_laar: number;
  credit_enabled: boolean;
  balance_owed_mvr: string;
  holding_unbilled_mvr: string;
  exposure_mvr: string;
  credit_limit_mvr: string;
};

export async function fetchTradeDeliveries(params?: {
  status?: string;
  search?: string;
  unreconciled_days?: number;
  page?: number;
}): Promise<{ data: TradeDelivery[]; meta: { current_page: number; last_page: number; total: number } }> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.search) qs.set('search', params.search);
  if (params?.unreconciled_days) qs.set('unreconciled_days', String(params.unreconciled_days));
  if (params?.page) qs.set('page', String(params.page));
  const suffix = qs.toString() ? `?${qs}` : '';
  return req(`/trade/deliveries${suffix}`);
}

export async function fetchTradeDelivery(id: number): Promise<{
  delivery: TradeDelivery;
  exposure: TradeExposure | null;
}> {
  return req(`/trade/deliveries/${id}`);
}

export async function fetchTradeExposure(accountId: number): Promise<{ exposure: TradeExposure }> {
  return req(`/admin/trade-accounts/${accountId}/exposure`);
}

export async function dispatchTradeDelivery(data: {
  trade_account_id: number;
  idempotency_key: string;
  driver_name?: string | null;
  notes?: string | null;
  expected_return_at?: string | null;
  credit_override_reason?: string | null;
  lines: Array<{ item_id: number; variant_id?: number | null; qty: number }>;
}): Promise<{ delivery: TradeDelivery }> {
  return req('/trade/deliveries/dispatch', { method: 'POST', body: JSON.stringify(data) });
}

export async function cancelTradeDelivery(id: number): Promise<{ delivery: TradeDelivery }> {
  return req(`/trade/deliveries/${id}/cancel`, { method: 'POST' });
}

export async function reconcileTradeDelivery(
  id: number,
  lines: Array<{
    line_id: number;
    reported_sold_qty: number;
    counted_return_qty: number;
    qty_missing?: number;
    return_condition?: string | null;
    return_action?: string | null;
    return_idempotency_key: string;
  }>,
): Promise<{ delivery: TradeDelivery }> {
  return req(`/trade/deliveries/${id}/reconcile`, {
    method: 'POST',
    body: JSON.stringify({ lines }),
  });
}
