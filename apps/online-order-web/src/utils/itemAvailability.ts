import type { MenuItem } from '@shared/types';

/** Prefer computed available_now; fall back to raw is_available for un-annotated payloads. */
export function isItemAvailableNow(item: Pick<MenuItem, 'available_now' | 'is_available'>): boolean {
  if (typeof item.available_now === 'boolean') return item.available_now;
  return item.is_available !== false;
}

/**
 * Orderability for the app-wide day choice. Tomorrow orders are made fresh,
 * so today's stock / 86 / ordering-window state does not apply — the owner's
 * allow_pre_order flag is the only gate (mirrors the backend, which skips the
 * stock check and reservation whenever fulfil_date is set).
 */
export function isItemOrderableForDay(
  item: Pick<MenuItem, 'available_now' | 'is_available' | 'allow_pre_order'>,
  day: 'today' | 'tomorrow',
): boolean {
  if (day === 'tomorrow') return Boolean(item.allow_pre_order);
  return isItemAvailableNow(item);
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
