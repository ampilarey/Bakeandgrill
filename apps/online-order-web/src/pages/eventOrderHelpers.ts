/**
 * Pure helpers for the event-order wizard (Vitest-friendly).
 */

export type EventDraftLine =
  | {
      key: string;
      kind: 'catalog';
      item_id: number;
      variant_id?: number | null;
      name: string;
      quantity: number;
      unit_price: number | null;
      notes?: string;
      is_catering?: boolean;
    }
  | {
      key: string;
      kind: 'custom';
      custom_name: string;
      name: string;
      quantity: number;
      unit_price: null;
      notes?: string;
    };

export type ItemPickerTab = 'catering' | 'regular' | 'custom';

export const DEFAULT_ITEM_TAB: ItemPickerTab = 'catering';

export function isCateringItem(item: { is_catering?: boolean }): boolean {
  return item.is_catering === true;
}

export function filterItemsForTab<T extends { is_catering?: boolean; name: string }>(
  items: T[],
  tab: ItemPickerTab,
  search: string,
): T[] {
  if (tab === 'custom') return [];
  const q = search.trim().toLowerCase();
  return items.filter((i) => {
    const catering = isCateringItem(i);
    if (tab === 'catering' && !catering) return false;
    if (tab === 'regular' && catering) return false;
    if (!q) return true;
    return i.name.toLowerCase().includes(q);
  });
}

export function parseAddItemId(searchParams: URLSearchParams | { get: (k: string) => string | null }): number | null {
  const raw = searchParams.get('add');
  if (raw == null || raw === '') return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Preselect only when the id matches a catering-flagged item. */
export function resolvePreselectLine(
  itemId: number | null,
  items: Array<{ id: number; name: string; base_price: number | string; is_catering?: boolean; has_variants?: boolean; variants?: Array<{ id: number; name: string; price: number | string; effective_price?: number | string | null; is_active?: boolean }> }>,
): EventDraftLine | null {
  if (itemId == null) return null;
  const item = items.find((i) => i.id === itemId);
  if (!item || !isCateringItem(item)) return null;
  if (item.has_variants) {
    const active = (item.variants ?? []).filter((v) => v.is_active !== false);
    if (active.length === 0) return null;
    const v = active[0];
    const price = Number(v.effective_price ?? v.price);
    return {
      key: `c-${item.id}-${v.id}`,
      kind: 'catalog',
      item_id: item.id,
      variant_id: v.id,
      name: `${item.name} — ${v.name}`,
      quantity: 1,
      unit_price: Number.isFinite(price) ? price : Number(v.price),
      is_catering: true,
    };
  }
  const price = Number(item.base_price);
  return {
    key: `c-${item.id}`,
    kind: 'catalog',
    item_id: item.id,
    variant_id: null,
    name: item.name,
    quantity: 1,
    unit_price: Number.isFinite(price) ? price : 0,
    is_catering: true,
  };
}

export function cartHasCateringItem(cart: Array<{ item: { is_catering?: boolean } }>): boolean {
  return cart.some((e) => e.item.is_catering === true);
}

export function addCustomLine(
  lines: EventDraftLine[],
  input: { name: string; quantity: number; notes?: string },
): EventDraftLine[] {
  const name = input.name.trim();
  if (!name || input.quantity < 1) return lines;
  const key = `x-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return [
    ...lines,
    {
      key,
      kind: 'custom',
      custom_name: name,
      name,
      quantity: input.quantity,
      unit_price: null,
      notes: input.notes?.trim() || undefined,
    },
  ];
}

export function removeLine(lines: EventDraftLine[], key: string): EventDraftLine[] {
  return lines.filter((l) => l.key !== key);
}

export function upsertCatalogLine(
  lines: EventDraftLine[],
  line: Extract<EventDraftLine, { kind: 'catalog' }>,
  deltaQty: number,
): EventDraftLine[] {
  const idx = lines.findIndex(
    (l) => l.kind === 'catalog' && l.item_id === line.item_id && (l.variant_id ?? null) === (line.variant_id ?? null),
  );
  if (idx < 0) {
    if (deltaQty <= 0) return lines;
    return [...lines, { ...line, quantity: deltaQty }];
  }
  const next = [...lines];
  const cur = next[idx] as Extract<EventDraftLine, { kind: 'catalog' }>;
  const qty = cur.quantity + deltaQty;
  if (qty <= 0) {
    next.splice(idx, 1);
    return next;
  }
  next[idx] = { ...cur, quantity: qty };
  return next;
}

export function minEventDateInput(leadHours: number, now = new Date()): string {
  const d = new Date(now.getTime() + Math.max(0, leadHours) * 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export type WizardStep = 'items' | 'details' | 'confirm' | 'done';

export function nextStep(step: WizardStep): WizardStep | null {
  const order: WizardStep[] = ['items', 'details', 'confirm', 'done'];
  const i = order.indexOf(step);
  return i >= 0 && i < order.length - 1 ? order[i + 1] : null;
}

export function prevStep(step: WizardStep): WizardStep | null {
  const order: WizardStep[] = ['items', 'details', 'confirm', 'done'];
  const i = order.indexOf(step);
  return i > 0 ? order[i - 1] : null;
}
