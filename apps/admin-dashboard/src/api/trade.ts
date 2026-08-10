import { req } from './client';

export type TradeSettlementMode = 'sale_or_return' | 'firm_sale';
export type TradeBillingCycle = 'weekly' | 'fortnightly' | 'monthly' | 'per_delivery';
export type TradeMissingPolicy = 'charge' | 'write_off' | 'dispute';
export type TradePriceSource = 'account_list' | 'item_wholesale' | 'retail_discount' | 'none';

export type TradeAccountCustomer = {
  id: number;
  name: string | null;
  phone: string;
  credit_enabled: boolean;
  credit_status: string | null;
  credit_limit_laar: number | null;
  credit_balance_laar: number | null;
  credit_payment_terms_days?: number | null;
};

export type TradeAccount = {
  id: number;
  customer_id: number;
  shop_name: string;
  contact_name: string | null;
  contact_phone: string | null;
  settlement_mode: TradeSettlementMode;
  billing_cycle: TradeBillingCycle;
  payment_terms_days: number | null;
  resolved_payment_terms_days: number;
  missing_policy: TradeMissingPolicy;
  default_discount_bp: number | null;
  delivery_days: string[] | null;
  is_active: boolean;
  notes: string | null;
  credit_warning?: string | null;
  customer: TradeAccountCustomer | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type TradePriceEntry = {
  id: number;
  trade_account_id: number;
  item_id: number;
  variant_id: number | null;
  price_laar: number;
  price_mvr: string;
  is_active: boolean;
  source: TradePriceSource;
  item: { id: number; name: string; sku: string | null; wholesale_price_laar: number | null } | null;
  variant: { id: number; name: string } | null;
};

export type ResolvedTradePriceRow = {
  item_id: number;
  item_name: string;
  sku: string | null;
  variant_id: number | null;
  found: boolean;
  price_laar: number | null;
  price_mvr: string | null;
  source: TradePriceSource;
  has_account_entry: boolean;
  item_wholesale_price_laar: number | null;
};

export type TradeAccountPayload = {
  customer_id?: number;
  shop_name?: string;
  contact_name?: string | null;
  contact_phone?: string | null;
  settlement_mode?: TradeSettlementMode;
  billing_cycle?: TradeBillingCycle;
  payment_terms_days?: number | null;
  missing_policy?: TradeMissingPolicy;
  default_discount_bp?: number | null;
  delivery_days?: string[] | null;
  is_active?: boolean;
  notes?: string | null;
};

export async function fetchTradeAccounts(params?: {
  search?: string;
  active?: boolean;
  page?: number;
}): Promise<{ data: TradeAccount[]; meta: { current_page: number; last_page: number; total: number } }> {
  const qs = new URLSearchParams();
  if (params?.search) qs.set('search', params.search);
  if (params?.active !== undefined) qs.set('active', params.active ? '1' : '0');
  if (params?.page) qs.set('page', String(params.page));
  const suffix = qs.toString() ? `?${qs}` : '';
  return req(`/admin/trade-accounts${suffix}`);
}

export async function fetchTradeAccount(id: number): Promise<{ trade_account: TradeAccount }> {
  return req(`/admin/trade-accounts/${id}`);
}

export async function createTradeAccount(data: TradeAccountPayload): Promise<{ trade_account: TradeAccount }> {
  return req('/admin/trade-accounts', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateTradeAccount(
  id: number,
  data: TradeAccountPayload,
): Promise<{ trade_account: TradeAccount }> {
  return req(`/admin/trade-accounts/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deactivateTradeAccount(id: number): Promise<{ trade_account: TradeAccount }> {
  return req(`/admin/trade-accounts/${id}/deactivate`, { method: 'POST' });
}

export async function fetchTradePrices(accountId: number): Promise<{ data: TradePriceEntry[] }> {
  return req(`/admin/trade-accounts/${accountId}/prices`);
}

export async function fetchResolvedTradePrices(
  accountId: number,
): Promise<{ data: ResolvedTradePriceRow[] }> {
  return req(`/admin/trade-accounts/${accountId}/resolved-prices`);
}

export async function createTradePrice(
  accountId: number,
  data: { item_id: number; variant_id?: number | null; price_laar: number; is_active?: boolean },
): Promise<{ price_entry: TradePriceEntry }> {
  return req(`/admin/trade-accounts/${accountId}/prices`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateTradePrice(
  accountId: number,
  entryId: number,
  data: { price_laar?: number; is_active?: boolean },
): Promise<{ price_entry: TradePriceEntry }> {
  return req(`/admin/trade-accounts/${accountId}/prices/${entryId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteTradePrice(accountId: number, entryId: number): Promise<{ ok: boolean }> {
  return req(`/admin/trade-accounts/${accountId}/prices/${entryId}`, { method: 'DELETE' });
}

export async function previewTradePrice(
  accountId: number,
  itemId: number,
  variantId?: number | null,
): Promise<{
  found: boolean;
  price_laar: number | null;
  price_mvr: string | null;
  source: TradePriceSource;
}> {
  const qs = new URLSearchParams({ item_id: String(itemId) });
  if (variantId != null) qs.set('variant_id', String(variantId));
  return req(`/admin/trade-accounts/${accountId}/price-preview?${qs}`);
}
