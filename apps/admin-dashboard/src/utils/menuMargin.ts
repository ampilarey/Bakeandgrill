const MARGIN_WARN_PCT = 30;
const MARGIN_CRITICAL_PCT = 15;

export type MenuMarginLevel = 'ok' | 'warn' | 'critical' | 'unknown';

export function menuItemMarginPct(price: number, cost: number | null | undefined): number | null {
  if (cost == null || !Number.isFinite(cost) || price <= 0) return null;
  return ((price - cost) / price) * 100;
}

export function menuItemMarginLevel(price: number, cost: number | null | undefined): MenuMarginLevel {
  const pct = menuItemMarginPct(price, cost);
  if (pct == null) return 'unknown';
  if (pct < MARGIN_CRITICAL_PCT) return 'critical';
  if (pct < MARGIN_WARN_PCT) return 'warn';
  return 'ok';
}

export function menuItemMarginLabel(price: number, cost: number | null | undefined): string | null {
  const pct = menuItemMarginPct(price, cost);
  if (pct == null) return null;
  if (pct < 0) return 'Below cost';
  return `${pct.toFixed(0)}% margin`;
}

export const MENU_MARGIN_COLORS: Record<Exclude<MenuMarginLevel, 'unknown'>, { color: string; bg: string; border: string }> = {
  ok: { color: 'var(--color-success-strong)', bg: 'var(--color-success-bg)', border: 'color-mix(in srgb, var(--color-success) 40%, transparent)' },
  warn: { color: 'var(--color-warning-strong)', bg: 'var(--color-warning-bg)', border: 'color-mix(in srgb, var(--color-warning) 45%, transparent)' },
  critical: { color: 'var(--color-danger-strong)', bg: 'var(--color-danger-bg)', border: 'color-mix(in srgb, var(--color-danger) 35%, transparent)' },
};
