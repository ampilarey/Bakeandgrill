import type { BulkItemChange, BulkItemFields, MenuItem } from '../../api';

/**
 * Pure logic behind the quick-edit grid and the bulk-apply bar.
 *
 * Kept out of the components because this is where the arithmetic that moves
 * real prices lives — rounding a 10% rise, deciding whether a cell was really
 * touched — and that deserves tests that do not need a rendered table.
 */

/** A cell the user typed into, before it is known to differ from what is stored. */
export type DraftFields = BulkItemFields;

/** item id → the cells edited on that row. */
export type Drafts = Record<number, DraftFields>;

export type PriceMode = 'set' | 'increase_pct' | 'decrease_pct' | 'increase_amount' | 'decrease_amount';

export type BulkAction =
  | { kind: 'price'; mode: PriceMode; value: number; round: RoundMode }
  | { kind: 'cost'; mode: PriceMode; value: number; round: RoundMode }
  /** Price computed backwards from cost to hit a target margin. */
  | { kind: 'margin'; marginPct: number; round: RoundMode }
  | { kind: 'category'; categoryId: number | null }
  | { kind: 'menu_group'; menuGroupId: number | null }
  | { kind: 'tax_code'; taxCode: string }
  | { kind: 'field'; field: string; value: unknown; label: string; format?: (v: unknown) => string }
  /** Renumber the selection 10, 20, 30… in the order shown. */
  | { kind: 'renumber'; step: number };

export type RoundMode = 'none' | 'whole' | 'half' | 'five';

/** Two money values are the same if they agree to the laari. */
export function sameMoney(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

/**
 * Apply a rounding style to a price.
 *
 * A percentage rise leaves prices like 46.20, which nobody wants on a menu
 * board, so the bar offers to land on something sayable.
 */
export function roundPrice(value: number, mode: RoundMode): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = (() => {
    switch (mode) {
      case 'whole': return Math.round(value);
      case 'half': return Math.round(value * 2) / 2;
      case 'five': return Math.round(value / 5) * 5;
      default: return value;
    }
  })();

  // Never let a rounding rule push a paid item to free.
  return Math.max(0, Math.round(rounded * 100) / 100);
}

/** What a price action would make this item's price. */
export function nextPrice(current: number, action: Extract<BulkAction, { kind: 'price' }>): number {
  const base = Number.isFinite(current) ? current : 0;
  const raw = (() => {
    switch (action.mode) {
      case 'set': return action.value;
      case 'increase_pct': return base * (1 + action.value / 100);
      case 'decrease_pct': return base * (1 - action.value / 100);
      case 'increase_amount': return base + action.value;
      case 'decrease_amount': return base - action.value;
    }
  })();

  return roundPrice(Math.max(0, raw), action.round);
}

/**
 * Turn one action plus a selection into the fields each row would get.
 *
 * Rows the action would not move are still returned, with empty fields, so the
 * preview can show "no change" rather than quietly dropping them — a selection
 * that silently shrinks is how people lose track of what they just did.
 */
/**
 * Price that yields a target margin on a known cost.
 *
 * margin = (price - cost) / price, so price = cost / (1 - margin). A margin of
 * 100% or more has no finite answer, and an item with no cost recorded has
 * nothing to compute from — both leave the row alone rather than inventing a
 * number for something the owner prices by hand.
 */
export function priceForMargin(cost: number, marginPct: number): number | null {
  if (!Number.isFinite(cost) || cost <= 0) return null;
  if (!Number.isFinite(marginPct) || marginPct >= 100) return null;

  return cost / (1 - marginPct / 100);
}

export function previewAction(items: MenuItem[], action: BulkAction): Array<{
  item: MenuItem;
  fields: BulkItemFields;
  before: string;
  after: string;
}> {
  return items.map((item, index) => {
    switch (action.kind) {
      case 'price': {
        const current = Number(item.base_price) || 0;
        const next = nextPrice(current, action);
        return {
          item,
          fields: sameMoney(current, next) ? {} : { base_price: next },
          before: current.toFixed(2),
          after: next.toFixed(2),
        };
      }
      case 'category': {
        const same = (item.category_id ?? null) === action.categoryId;
        return {
          item,
          fields: same ? {} : { category_id: action.categoryId },
          before: item.category?.name ?? '—',
          after: '',
        };
      }
      case 'menu_group': {
        const same = (item.menu_group_id ?? null) === action.menuGroupId;
        return {
          item,
          fields: same ? {} : { menu_group_id: action.menuGroupId },
          before: item.menu_group?.name ?? '—',
          after: '',
        };
      }
      case 'tax_code': {
        const same = (item.tax_code ?? 'standard_8') === action.taxCode;
        return {
          item,
          fields: same ? {} : { tax_code: action.taxCode },
          before: item.tax_code ?? 'standard_8',
          after: action.taxCode,
        };
      }
      case 'cost': {
        const raw = item.cost;
        if (raw === null || raw === undefined || (raw as unknown) === '') {
          return { item, fields: {}, before: '—', after: 'no cost' };
        }
        const current = Number(raw) || 0;
        const next = nextPrice(current, { ...action, kind: 'price' });
        return {
          item,
          fields: sameMoney(current, next) ? {} : { cost: next },
          before: current.toFixed(2),
          after: next.toFixed(2),
        };
      }
      case 'margin': {
        const cost = Number(item.effective_cost ?? item.cost);
        const target = priceForMargin(cost, action.marginPct);
        const current = Number(item.base_price) || 0;
        if (target === null) {
          return { item, fields: {}, before: current.toFixed(2), after: 'no cost' };
        }
        const next = roundPrice(target, action.round);
        return {
          item,
          fields: sameMoney(current, next) ? {} : { base_price: next },
          before: current.toFixed(2),
          after: next.toFixed(2),
        };
      }
      case 'field': {
        const current = (item as unknown as Record<string, unknown>)[action.field];
        const changed = fieldChanged(item as unknown as EditableRecord, action.field, action.value);
        const show = action.format
          ?? ((v: unknown) => (typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v ?? '—')));
        return {
          item,
          fields: changed ? ({ [action.field]: action.value } as BulkItemFields) : {},
          before: show(current),
          after: show(action.value),
        };
      }
      case 'renumber': {
        const next = (index + 1) * action.step;
        const current = Number(item.sort_order ?? 0);
        return {
          item,
          fields: current === next ? {} : ({ sort_order: next } as BulkItemFields),
          before: String(current),
          after: String(next),
        };
      }
    }
  });
}

/** Anything the grid can edit a row of — an item or one of its sizes. */
export type EditableRecord = { id?: number } & Record<string, unknown>;

/** Does this draft cell actually differ from what the record already holds? */
export function fieldChanged(item: EditableRecord, field: string, value: unknown): boolean {
  const current = (item as unknown as Record<string, unknown>)[field];

  if (typeof value === 'boolean' || typeof current === 'boolean') {
    return !!current !== !!value;
  }
  if (value === null || current === null || value === undefined || current === undefined) {
    return (current ?? null) !== (value ?? null);
  }
  const bothNumeric = current !== '' && value !== ''
    && !Number.isNaN(Number(current)) && !Number.isNaN(Number(value));
  if (bothNumeric) {
    return !sameMoney(Number(current), Number(value));
  }

  return String(current) !== String(value);
}

/**
 * Collapse drafts into the sparse payload the server wants.
 *
 * Cells typed back to their original value are dropped, so re-typing "10" over
 * a 10 does not count as a pending change and the Save button honestly
 * reflects what would be written.
 */
export function draftsToChanges(items: EditableRecord[], drafts: Drafts): BulkItemChange[] {
  const byId = new Map(items.filter((i) => i.id != null).map((i) => [i.id as number, i]));
  const changes: BulkItemChange[] = [];

  for (const [rawId, fields] of Object.entries(drafts)) {
    const id = Number(rawId);
    const item = byId.get(id);
    if (!item) continue;

    const dirty: BulkItemFields = {};
    for (const [field, value] of Object.entries(fields)) {
      if (fieldChanged(item, field, value)) {
        (dirty as Record<string, unknown>)[field] = value;
      }
    }
    if (Object.keys(dirty).length > 0) changes.push({ id, fields: dirty });
  }

  return changes;
}

/** How many cells across the grid are pending. Drives the Save button. */
export function countDirtyCells(items: EditableRecord[], drafts: Drafts): number {
  return draftsToChanges(items, drafts).reduce((n, c) => n + Object.keys(c.fields).length, 0);
}

/** Every size on the page, flattened — the grid edits them as their own rows. */
export function allVariants(items: MenuItem[]): EditableRecord[] {
  return items.flatMap((i) => (i.variants ?? []) as unknown as EditableRecord[])
    .filter((v) => v.id != null);
}
