import { downloadBlob } from '@shared/api';
import { req, requestBlob } from './client';

export type TradeSellThroughRow = {
  trade_account_id: number;
  shop_name: string;
  item_id: number;
  item_name: string;
  qty_sent: number;
  qty_sold: number;
  qty_returned_good: number;
  qty_wasted: number;
  qty_missing: number;
  sell_through_pct: number;
};

export type TradeSuggestedQtyRow = {
  trade_account_id: number;
  shop_name: string;
  item_id: number;
  item_name: string;
  deliveries_count: number;
  total_sold: number;
  average_sold: number;
  suggested_qty: number | null;
  status: 'ok' | 'not_enough_history';
  message: string;
};

export type TradeWasteRow = {
  trade_account_id: number;
  shop_name: string;
  item_id: number;
  item_name: string;
  qty_wasted: number;
  waste_cost_laar: number;
  waste_cost: number;
};

export type TradeMarginRow = {
  trade_account_id: number;
  shop_name: string;
  revenue_laar: number;
  cogs_laar: number;
  waste_cost_laar: number;
  margin_laar: number;
  revenue: number;
  cogs: number;
  waste_cost: number;
  margin: number;
};

export type TradeAgeingRow = {
  trade_account_id: number;
  shop_name: string;
  current_laar: number;
  days_1_30_laar: number;
  days_31_60_laar: number;
  days_60_plus_laar: number;
  outstanding_laar: number;
  credit_limit_laar: number;
  exposure_laar: number;
  current: number;
  days_1_30: number;
  days_31_60: number;
  days_60_plus: number;
  outstanding: number;
  credit_limit: number;
  exposure: number;
  as_of: string;
};

export type TradeExceptionLists = {
  unreconciled: {
    id: number;
    delivery_number: string;
    shop_name: string | null;
    trade_account_id: number;
    dispatched_at: string | null;
    days_outstanding: number | null;
  }[];
  mismatches: {
    id: number;
    delivery_number: string;
    shop_name: string | null;
    trade_account_id: number;
    reconciled_at: string | null;
    status: string;
  }[];
  older_than_days: number;
};

function rangeQs(from: string, to: string): string {
  const qs = new URLSearchParams({ from, to });
  return qs.toString();
}

export async function fetchTradeSellThrough(from: string, to: string): Promise<{ from: string; to: string; rows: TradeSellThroughRow[] }> {
  return req(`/admin/trade-reports/sell-through?${rangeQs(from, to)}`);
}

export async function fetchTradeSuggestedQuantities(): Promise<{ rows: TradeSuggestedQtyRow[] }> {
  return req('/admin/trade-reports/suggested-quantities');
}

export async function fetchTradeWaste(from: string, to: string): Promise<{ from: string; to: string; rows: TradeWasteRow[] }> {
  return req(`/admin/trade-reports/waste?${rangeQs(from, to)}`);
}

export async function fetchTradeMargins(from: string, to: string): Promise<{ from: string; to: string; rows: TradeMarginRow[] }> {
  return req(`/admin/trade-reports/margins?${rangeQs(from, to)}`);
}

export async function fetchTradeAgeing(): Promise<{ rows: TradeAgeingRow[] }> {
  return req('/admin/trade-reports/ageing');
}

export async function fetchTradeExceptions(olderThanDays = 3): Promise<TradeExceptionLists> {
  return req(`/admin/trade-reports/exceptions?older_than_days=${olderThanDays}`);
}

async function downloadTradeCsv(path: string, filename: string): Promise<void> {
  const blob = await requestBlob(path);
  downloadBlob(blob, filename);
}

export function downloadTradeSellThroughCsv(from: string, to: string): Promise<void> {
  return downloadTradeCsv(
    `/admin/trade-reports/sell-through/csv?${rangeQs(from, to)}`,
    `trade-sell-through-${from}-${to}.csv`,
  );
}

export function downloadTradeSuggestedQuantitiesCsv(): Promise<void> {
  return downloadTradeCsv('/admin/trade-reports/suggested-quantities/csv', 'trade-suggested-qty.csv');
}

export function downloadTradeWasteCsv(from: string, to: string): Promise<void> {
  return downloadTradeCsv(
    `/admin/trade-reports/waste/csv?${rangeQs(from, to)}`,
    `trade-waste-${from}-${to}.csv`,
  );
}

export function downloadTradeMarginsCsv(from: string, to: string): Promise<void> {
  return downloadTradeCsv(
    `/admin/trade-reports/margins/csv?${rangeQs(from, to)}`,
    `trade-margins-${from}-${to}.csv`,
  );
}

export function downloadTradeAgeingCsv(): Promise<void> {
  return downloadTradeCsv('/admin/trade-reports/ageing/csv', 'trade-ageing.csv');
}

export function downloadTradeExceptionsCsv(olderThanDays = 3): Promise<void> {
  return downloadTradeCsv(
    `/admin/trade-reports/exceptions/csv?older_than_days=${olderThanDays}`,
    'trade-exceptions.csv',
  );
}
