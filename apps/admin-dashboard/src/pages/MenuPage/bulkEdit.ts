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
  | { kind: 'category'; categoryId: number | null }
  | { kind: 'menu_group'; menuGroupId: number | null }
  | { kind: 'tax_code'; taxCode: string }
  | { kind: 'is_available'; value: boolean }
  | { kind: 'is_active'; value: boolean };

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
export function previewAction(items: MenuItem[], action: BulkAction): Array<{
  item: MenuItem;
  fields: BulkItemFields;
  before: string;
  after: string;
}> {
  return items.map((item) => {
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
      case 'is_available': {
        const same = !!item.is_available === action.value;
        return {
          item,
          fields: same ? {} : { is_available: action.value },
          before: item.is_available ? 'Available' : 'Sold out',
          after: action.value ? 'Available' : 'Sold out',
        };
      }
      case 'is_active': {
        const same = !!item.is_active === action.value;
        return {
          item,
          fields: same ? {} : { is_active: action.value },
          before: item.is_active ? 'Active' : 'Hidden',
          after: action.value ? 'Active' : 'Hidden',
        };
      }
    }
  });
}

/** Does this draft cell actually differ from what the item already holds? */
export function fieldChanged(item: MenuItem, field: keyof BulkItemFields, value: unknown): boolean {
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
export function draftsToChanges(items: MenuItem[], drafts: Drafts): BulkItemChange[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const changes: BulkItemChange[] = [];

  for (const [rawId, fields] of Object.entries(drafts)) {
    const id = Number(rawId);
    const item = byId.get(id);
    if (!item) continue;

    const dirty: BulkItemFields = {};
    for (const [field, value] of Object.entries(fields)) {
      if (fieldChanged(item, field as keyof BulkItemFields, value)) {
        (dirty as Record<string, unknown>)[field] = value;
      }
    }
    if (Object.keys(dirty).length > 0) changes.push({ id, fields: dirty });
  }

  return changes;
}

/** How many cells across the grid are pending. Drives the Save button. */
export function countDirtyCells(items: MenuItem[], drafts: Drafts): number {
  return draftsToChanges(items, drafts).reduce((n, c) => n + Object.keys(c.fields).length, 0);
}
