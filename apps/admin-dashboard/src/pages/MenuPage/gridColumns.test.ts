import { beforeEach, describe, expect, it } from 'vitest';
import type { MenuCategory, MenuItem } from '../../api';
import {
  GRID_COLUMNS,
  categoryOptions,
  defaultVisibleColumns,
  loadVisibleColumns,
  marginPct,
  saveVisibleColumns,
  visibleColumns,
} from './gridColumns';

beforeEach(() => localStorage.clear());

describe('column set', () => {
  it('has a unique key per column', () => {
    const keys = GRID_COLUMNS.map((c) => c.key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every editable column a field to write', () => {
    // A column that renders an input but has no field would silently discard
    // whatever was typed into it.
    const editable = GRID_COLUMNS.filter((c) => !['margin', 'consumption_factor'].includes(c.key));

    for (const column of editable) {
      expect(column.field, `${column.key} needs a field`).toBeTruthy();
    }
  });

  it('marks cost columns owner-only', () => {
    expect(GRID_COLUMNS.find((c) => c.key === 'cost')?.costOnly).toBe(true);
    expect(GRID_COLUMNS.find((c) => c.key === 'margin')?.costOnly).toBe(true);
  });
});

describe('visible columns', () => {
  it('keeps cost out of the default set for anyone without recipes.manage', () => {
    expect(defaultVisibleColumns(false)).not.toContain('cost');
    expect(defaultVisibleColumns(true)).toContain('cost');
  });

  it('remembers a choice across sessions', () => {
    saveVisibleColumns(['name', 'price']);

    expect(loadVisibleColumns(true)).toEqual(['name', 'price']);
  });

  it('drops a stored cost column for a viewer who may not see it', () => {
    // Two people share a browser: an owner's stored choice must not resurface
    // cost for a menu manager.
    saveVisibleColumns(['name', 'cost', 'price']);

    expect(loadVisibleColumns(false)).toEqual(['name', 'price']);
  });

  it('falls back to the default rather than leaving an empty table', () => {
    saveVisibleColumns(['cost']);
    expect(loadVisibleColumns(false)).toEqual(defaultVisibleColumns(false));

    localStorage.setItem('menu-quick-edit-columns', 'not json');
    expect(loadVisibleColumns(true)).toEqual(defaultVisibleColumns(true));
  });

  it('returns chosen columns in the canonical order, not the click order', () => {
    const keys = visibleColumns(['sort', 'name', 'price'], true).map((c) => c.key);

    expect(keys).toEqual(['name', 'price', 'sort']);
  });

  it('never returns a cost column to someone without the permission', () => {
    expect(visibleColumns(['name', 'cost', 'margin'], false).map((c) => c.key)).toEqual(['name']);
  });
});

describe('categoryOptions', () => {
  const categories: MenuCategory[] = [
    { id: 1, name: 'Food', is_active: true },
    { id: 2, name: 'Grill', is_active: true, parent_id: 1 },
    { id: 3, name: 'Drinks', is_active: true },
  ];

  it('indents children under their parent', () => {
    expect(categoryOptions(categories).map((o) => o.label)).toEqual(['Food', '↳ Grill', 'Drinks']);
  });

  it('still lists a category whose parent is missing', () => {
    const orphan = [{ id: 9, name: 'Stray', is_active: true, parent_id: 404 }] as MenuCategory[];

    expect(categoryOptions(orphan).map((o) => o.value)).toEqual(['9']);
  });
});

describe('marginPct', () => {
  const item = (over: Partial<MenuItem>) => ({ id: 1, name: 'x', ...over }) as MenuItem;

  it('is the profit as a share of price', () => {
    expect(marginPct(item({ base_price: 100, cost: 40 }))).toBeCloseTo(60, 5);
  });

  it('prefers the recipe roll-up over the manual cost', () => {
    expect(marginPct(item({ base_price: 100, cost: 40, effective_cost: 25 }))).toBeCloseTo(75, 5);
  });

  it('goes negative when an item sells below cost', () => {
    expect(marginPct(item({ base_price: 10, cost: 15 }))).toBeCloseTo(-50, 5);
  });

  it('is unknown without a price or a cost', () => {
    expect(marginPct(item({ base_price: 0, cost: 5 }))).toBeNull();
    expect(marginPct(item({ base_price: 10 }))).toBeNull();
  });
});
