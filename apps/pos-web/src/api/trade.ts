import { request } from './client';

export type PosTradeAccount = {
  id: number;
  shop_name: string;
  customer_id: number;
  is_active: boolean;
  customer?: {
    id: number;
    name: string | null;
    phone: string;
    credit_enabled: boolean;
    credit_limit_laar: number | null;
    credit_balance_laar: number | null;
  } | null;
};

export type PosTradeExposure = {
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

export type PosTradeDelivery = {
  id: number;
  delivery_number: string;
  status: string;
  shop_name?: string | null;
  has_mismatch: boolean;
  self_reconciled: boolean;
  stamped_value_laar: number | null;
  lines?: Array<{
    id: number;
    item_id: number;
    item_name?: string;
    qty_sent: number;
    unit_price_laar: number;
  }>;
};

export type PosResolvedPrice = {
  found: boolean;
  price_laar: number | null;
  price_mvr: string | null;
  source: string;
};

export async function posFetchTradeAccounts(): Promise<{ data: PosTradeAccount[] }> {
  return request('/admin/trade-accounts?active=1&per_page=100');
}

export async function posFetchTradeExposure(accountId: number): Promise<{ exposure: PosTradeExposure }> {
  return request(`/admin/trade-accounts/${accountId}/exposure`);
}

export async function posPreviewTradePrice(
  accountId: number,
  itemId: number,
): Promise<PosResolvedPrice> {
  return request(`/admin/trade-accounts/${accountId}/price-preview?item_id=${itemId}`);
}

export async function posDispatchTradeDelivery(body: {
  trade_account_id: number;
  idempotency_key: string;
  driver_name?: string;
  credit_override_reason?: string;
  lines: Array<{ item_id: number; qty: number }>;
}): Promise<{ delivery: PosTradeDelivery }> {
  return request('/trade/deliveries/dispatch', { method: 'POST', body: JSON.stringify(body) });
}

export async function posFetchDispatchedDeliveries(): Promise<{ data: PosTradeDelivery[] }> {
  return request('/trade/deliveries?status=dispatched&per_page=50');
}

export async function posFetchTradeDelivery(id: number): Promise<{ delivery: PosTradeDelivery }> {
  return request(`/trade/deliveries/${id}`);
}

export async function posReconcileTradeDelivery(
  id: number,
  lines: Array<{
    line_id: number;
    reported_sold_qty: number;
    counted_return_qty: number;
    qty_missing?: number;
    return_action?: string | null;
    return_condition?: string | null;
    return_idempotency_key: string;
  }>,
): Promise<{ delivery: PosTradeDelivery }> {
  return request(`/trade/deliveries/${id}/reconcile`, {
    method: 'POST',
    body: JSON.stringify({ lines }),
  });
}
