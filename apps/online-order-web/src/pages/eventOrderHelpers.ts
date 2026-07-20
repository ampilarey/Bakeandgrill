/**
 * Pure helpers for the event-order wizard (Vitest-friendly).
 */

export type EventDraftLine =
  | {
      key: string;
      kind: 'catalog';
      item_id: number;
      variant_id?: number | null;
      packaging_option_id?: number | null;
      packaging_option_name?: string | null;
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

type VariantLike = {
  id: number;
  name: string;
  price: number | string;
  effective_price?: number | string | null;
  is_active?: boolean;
};

type PackagingLike = {
  id: number;
  name: string;
  fee?: number | string;
  is_default?: boolean;
  is_active?: boolean;
};

export type CatalogItemLike = {
  id: number;
  name: string;
  base_price: number | string;
  is_catering?: boolean;
  has_variants?: boolean;
  variants?: VariantLike[];
  packaging_options?: PackagingLike[];
};

export function isCateringItem(item: { is_catering?: boolean }): boolean {
  return item.is_catering === true;
}

export function activeVariants(item: CatalogItemLike): VariantLike[] {
  return (item.variants ?? []).filter((v) => v.is_active !== false);
}

export function activePackagingOptions(item: CatalogItemLike): PackagingLike[] {
  return (item.packaging_options ?? []).filter((o) => o.is_active !== false);
}

/** Same rule as ItemSheet: show picker only when more than one active option. */
export function showPackagingPicker(item: CatalogItemLike): boolean {
  return activePackagingOptions(item).length > 1;
}

/** True when Add needs an explicit variant and/or packaging choice before inserting. */
export function needsSelection(item: CatalogItemLike): boolean {
  const variants = activeVariants(item);
  const needsVariant = Boolean(item.has_variants) && variants.length > 0;
  return needsVariant || showPackagingPicker(item);
}

export function defaultPackagingOptionId(item: CatalogItemLike): number | null {
  const opts = activePackagingOptions(item);
  if (opts.length === 0) return null;
  return opts.find((o) => o.is_default)?.id ?? opts[0]?.id ?? null;
}

export function packagingOptionName(item: CatalogItemLike, optionId: number | null): string | null {
  if (optionId == null) return null;
  return activePackagingOptions(item).find((o) => o.id === optionId)?.name ?? null;
}

export function variantUnitPrice(variant: VariantLike): number {
  const price = Number(variant.effective_price ?? variant.price);
  return Number.isFinite(price) ? price : Number(variant.price) || 0;
}

export function buildCatalogDraftLine(
  item: CatalogItemLike,
  variantId: number | null,
  packagingOptionId: number | null,
): Extract<EventDraftLine, { kind: 'catalog' }> | null {
  let name = item.name;
  let unitPrice = Number(item.base_price);
  let resolvedVariantId: number | null = null;

  if (item.has_variants) {
    const variants = activeVariants(item);
    const variant = variantId != null ? variants.find((v) => v.id === variantId) : undefined;
    if (!variant) return null;
    resolvedVariantId = variant.id;
    name = `${item.name} — ${variant.name}`;
    unitPrice = variantUnitPrice(variant);
  } else if (!Number.isFinite(unitPrice)) {
    unitPrice = 0;
  }

  const pkgId = packagingOptionId ?? defaultPackagingOptionId(item);
  const pkgName = packagingOptionName(item, pkgId);
  const keyParts = [`c-${item.id}`, resolvedVariantId ?? 'nv', pkgId ?? 'np'];

  return {
    key: keyParts.join('-'),
    kind: 'catalog',
    item_id: item.id,
    variant_id: resolvedVariantId,
    packaging_option_id: pkgId,
    packaging_option_name: pkgName,
    name,
    quantity: 1,
    unit_price: unitPrice,
    is_catering: item.is_catering,
  };
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
  items: CatalogItemLike[],
): EventDraftLine | null {
  if (itemId == null) return null;
  const item = items.find((i) => i.id === itemId);
  if (!item || !isCateringItem(item)) return null;
  if (needsSelection(item)) {
    // Prefill requires an explicit choice when variants / multi-packaging exist.
    const variants = activeVariants(item);
    if (item.has_variants && variants.length > 0) {
      return buildCatalogDraftLine(item, variants[0].id, defaultPackagingOptionId(item));
    }
  }
  return buildCatalogDraftLine(item, null, defaultPackagingOptionId(item));
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
    (l) =>
      l.kind === 'catalog'
      && l.item_id === line.item_id
      && (l.variant_id ?? null) === (line.variant_id ?? null)
      && (l.packaging_option_id ?? null) === (line.packaging_option_id ?? null),
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

/** items → details (pickup/delivery + date + OTP) → done. */
export type WizardStep = 'items' | 'details' | 'done';

export function nextStep(step: WizardStep): WizardStep | null {
  const order: WizardStep[] = ['items', 'details', 'done'];
  const i = order.indexOf(step);
  return i >= 0 && i < order.length - 1 ? order[i + 1] : null;
}

export function prevStep(step: WizardStep): WizardStep | null {
  const order: WizardStep[] = ['items', 'details', 'done'];
  const i = order.indexOf(step);
  return i > 0 ? order[i - 1] : null;
}
