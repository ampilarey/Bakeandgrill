/** Browser-persisted Restock Plan calculation defaults (Forecasts page). */

export type RestockPlanDefaults = {
  lookback_days: number;
  buy_lookback_days: number;
  lead_days: number;
  cover_days: number;
};

export const RESTOCK_DEFAULTS_KEY = 'restock_plan_defaults';

export const DEFAULT_RESTOCK_PARAMS: RestockPlanDefaults = {
  lookback_days: 30,
  buy_lookback_days: 90,
  lead_days: 3,
  cover_days: 14,
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function readRestockDefaults(): RestockPlanDefaults {
  try {
    const raw = localStorage.getItem(RESTOCK_DEFAULTS_KEY);
    if (!raw) return { ...DEFAULT_RESTOCK_PARAMS };
    const parsed = JSON.parse(raw) as Partial<RestockPlanDefaults>;
    return {
      lookback_days: clampInt(parsed.lookback_days, 7, 180, DEFAULT_RESTOCK_PARAMS.lookback_days),
      buy_lookback_days: clampInt(parsed.buy_lookback_days, 30, 365, DEFAULT_RESTOCK_PARAMS.buy_lookback_days),
      lead_days: clampInt(parsed.lead_days, 1, 60, DEFAULT_RESTOCK_PARAMS.lead_days),
      cover_days: clampInt(parsed.cover_days, 3, 90, DEFAULT_RESTOCK_PARAMS.cover_days),
    };
  } catch {
    return { ...DEFAULT_RESTOCK_PARAMS };
  }
}

export function writeRestockDefaults(params: RestockPlanDefaults): void {
  const next: RestockPlanDefaults = {
    lookback_days: clampInt(params.lookback_days, 7, 180, DEFAULT_RESTOCK_PARAMS.lookback_days),
    buy_lookback_days: clampInt(params.buy_lookback_days, 30, 365, DEFAULT_RESTOCK_PARAMS.buy_lookback_days),
    lead_days: clampInt(params.lead_days, 1, 60, DEFAULT_RESTOCK_PARAMS.lead_days),
    cover_days: clampInt(params.cover_days, 3, 90, DEFAULT_RESTOCK_PARAMS.cover_days),
  };
  localStorage.setItem(RESTOCK_DEFAULTS_KEY, JSON.stringify(next));
}
