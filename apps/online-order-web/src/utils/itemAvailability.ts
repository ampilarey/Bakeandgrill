import type { MenuItem } from '@shared/types';

/** Prefer computed available_now; fall back to raw is_available for un-annotated payloads. */
export function isItemAvailableNow(item: Pick<MenuItem, 'available_now' | 'is_available'>): boolean {
  if (typeof item.available_now === 'boolean') return item.available_now;
  return item.is_available !== false;
}

/**
 * Orderability for the app-wide day choice. Tomorrow orders are made fresh,
 * so today's stock / 86 / ordering-window state does not apply — the owner's
 * allow_pre_order flag gates eligibility, and tomorrow_remaining (when set)
 * gates the daily kitchen make-limit.
 */
export function isItemOrderableForDay(
  item: Pick<MenuItem, 'available_now' | 'is_available' | 'allow_pre_order' | 'tomorrow_remaining' | 'lead_time_hours'>,
  day: 'today' | 'tomorrow',
  now: Date = new Date(),
): boolean {
  if (day === 'tomorrow') {
    if (!item.allow_pre_order) return false;
    // Explicit 0 = fully booked for tomorrow. null/undefined = unlimited.
    if (item.tomorrow_remaining === 0) return false;
    if (needsMoreNoticeThan(item, endOfTomorrow(now), now)) return false;
    return true;
  }
  return isItemAvailableNow(item);
}

/** Minimum units per order for this dish; 1 when the owner set none. */
export function itemMinOrderQty(item: Pick<MenuItem, 'min_order_qty'>): number {
  const n = Number(item.min_order_qty);
  return Number.isFinite(n) && n > 1 ? Math.floor(n) : 1;
}

/**
 * True when the dish's notice period runs past the moment it would be made.
 * The server enforces the same rule on the order; this only keeps the app
 * from offering what it would then refuse.
 */
export function needsMoreNoticeThan(
  item: Pick<MenuItem, 'lead_time_hours'>,
  madeBy: Date,
  now: Date = new Date(),
): boolean {
  const lead = Number(item.lead_time_hours);
  if (!Number.isFinite(lead) || lead <= 0) return false;
  return now.getTime() + lead * 60 * 60 * 1000 > madeBy.getTime();
}

export function endOfTomorrow(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** "Needs 48 hours' notice" — for the tomorrow badge, where the server's reason does not apply. */
export function itemNoticeLabel(item: Pick<MenuItem, 'lead_time_hours'>): string {
  return `Needs ${Number(item.lead_time_hours)} hours' notice`;
}

/** True when the item is allowed for tomorrow but the daily make-limit is full. */
export function isTomorrowFullyBooked(
  item: Pick<MenuItem, 'allow_pre_order' | 'tomorrow_remaining'>,
): boolean {
  return Boolean(item.allow_pre_order) && item.tomorrow_remaining === 0;
}

function formatAvailableFrom(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    // Gate may return a human window string rather than ISO.
    const trimmed = iso.trim();
    return trimmed || null;
  }
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export type TranslateFn = (key: string) => string;

/**
 * Short customer-facing label from unavailable_reason.
 * Appends unavailable_reason_note when set ("Unavailable · Back Thursday").
 */
export function itemUnavailableLabel(
  item: Pick<
    MenuItem,
    'unavailable_reason' | 'available_from' | 'unavailable_reason_note' | 'availability'
  >,
  t: TranslateFn,
): string {
  const reason = item.unavailable_reason ?? item.availability?.reason_code ?? null;
  let base: string;
  switch (reason) {
    case 'out_of_stock':
      base = t('menu.out_of_stock');
      break;
    case 'snoozed':
      base = t('menu.unavailable_today');
      break;
    case 'ordering_closed': {
      const when = formatAvailableFrom(item.available_from ?? item.availability?.available_from);
      base = when
        ? t('menu.opens_at').replace('{time}', when)
        : t('menu.unavailable');
      break;
    }
    case 'channel_unavailable':
      base = t('menu.channel_unavailable');
      break;
    case 'needs_notice':
      // The server words this one ("Needs 48 hours' notice").
      base = item.availability?.reason_message || t('menu.unavailable');
      break;
    case 'item_unavailable':
    case 'item_inactive':
    default:
      base = t('menu.unavailable');
      break;
  }

  const note = (item.unavailable_reason_note || '').trim();
  if (!note) return base;
  // Prefer a short "Unavailable · note" shape when the base is already a status word.
  if (reason === 'snoozed' || reason === 'item_unavailable' || reason === 'item_inactive' || !reason) {
    return `${t('menu.unavailable')} · ${note}`;
  }
  return `${base} · ${note}`;
}

/** Tracked stock qty for low-stock badges. Ignores untracked sentinel 9999. */
export function itemAvailableStock(
  item: Pick<MenuItem, 'availability'>,
): number | null {
  const stock = item.availability?.available_stock;
  if (stock == null || !Number.isFinite(Number(stock))) return null;
  const n = Number(stock);
  if (n >= 9999) return null;
  return n;
}

export function itemLowStockLabel(
  item: Pick<MenuItem, 'is_low_stock' | 'availability' | 'available_now' | 'is_available'>,
  t: TranslateFn,
): string | null {
  if (!isItemAvailableNow(item) || item.is_low_stock !== true) return null;
  const stock = itemAvailableStock(item);
  if (stock == null || stock <= 0) return null;
  if (stock <= 3) return t('menu.only_n_left').replace('{n}', String(stock));
  return t('menu.few_left');
}

/**
 * Low-but-not-full remaining for collect-tomorrow. Reuses the same "Only N left"
 * / "Few left" copy as today's stock badge — never shows the configured max.
 */
export function itemTomorrowLowLabel(
  item: Pick<MenuItem, 'allow_pre_order' | 'tomorrow_remaining'>,
  t: TranslateFn,
): string | null {
  if (!item.allow_pre_order) return null;
  const remaining = item.tomorrow_remaining;
  if (remaining == null || remaining <= 0) return null;
  if (remaining <= 3) return t('menu.only_n_left').replace('{n}', String(remaining));
  // Cap is set but not critically low — still tip the customer when ≤5.
  if (remaining <= 5) return t('menu.few_left');
  return null;
}
