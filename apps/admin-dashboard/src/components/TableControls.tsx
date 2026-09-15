/**
 * Sort and filter from the headings, for any table.
 *
 * Owner, 2026-09-15: "In some places there is no sort and filter option.
 * For example suppliers in purchase. Check other places too."
 *
 * The stock list got this on 2026-09-13 and every other list in the admin
 * was still a fixed order with a search box at best. Rather than rebuild
 * it thirty times, this is the one control: a page names its columns —
 * what to call each, how to read its value off a row, whether it is text,
 * a number or a pick — and gets back the rows in order, narrowed, and a
 * `<thead>` whose headings sort and whose second row filters. Tap a
 * heading for one way, again for the other; the arrow says which. A box
 * under a heading narrows the list as you type; numbers take `<20`,
 * `>=5`, `10-50` or `none`, the same grammar the stock list uses.
 *
 * Everything is done on the rows the page already has. A page that shows
 * one server page at a time sorts and narrows that page, which is what
 * the eye expects when looking at a table of fifty rows.
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Btn, TH } from './SharedUI';
import { parseNumberFilter } from '../utils/inventoryFilter';

export type CellValue = string | number | boolean | Date | null | undefined;

export type ColumnKind = 'text' | 'number' | 'select' | 'none';

export interface Column<T> {
  key: string;
  label: ReactNode;
  /** The value the column sorts and filters on. Omit for a heading that does neither. */
  get?: (row: T) => CellValue;
  /** `text` matches anywhere; `number` takes an expression; `select` is a pick; `none` is a plain heading. */
  kind?: ColumnKind;
  /** For `select`: the choices. Defaults to the distinct values in the rows. */
  options?: { value: string; label: string }[];
  placeholder?: string;
  /** Extra styling for the heading cell. */
  th?: CSSProperties;
}

export type SortDir = 'asc' | 'desc';
export type SortState = { key: string; dir: SortDir } | null;

export interface SortFilter<T> {
  id: string;
  columns: Column<T>[];
  /** The rows to draw: narrowed by the boxes, then ordered by the sorted heading. */
  rows: T[];
  sort: SortState;
  setSort: (s: SortState) => void;
  filters: Record<string, string>;
  setFilter: (key: string, value: string) => void;
  clearFilters: () => void;
  /** How many boxes are doing something. */
  activeCount: number;
}

const kindOf = <T,>(c: Column<T>): ColumnKind => c.kind ?? (c.get ? 'text' : 'none');

function asText(v: CellValue): string {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function asNumber(v: CellValue): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.getTime();
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Blanks sink to the bottom whichever way the known values run. */
function compare(a: CellValue, b: CellValue, dir: SortDir): number {
  const an = a == null || a === '';
  const bn = b == null || b === '';
  if (an && bn) return 0;
  if (an) return 1;
  if (bn) return -1;
  const sign = dir === 'asc' ? 1 : -1;
  const na = asNumber(a);
  const nb = asNumber(b);
  if (typeof a !== 'string' && typeof b !== 'string' && na != null && nb != null) return (na - nb) * sign;
  // Numeric-looking strings ("12", "3.5") compare as numbers so "10" sorts after "9".
  if (typeof a === 'string' && typeof b === 'string' && na != null && nb != null && /^-?\d/.test(a) && /^-?\d/.test(b)) {
    return (na - nb) * sign;
  }
  return asText(a).localeCompare(asText(b), undefined, { sensitivity: 'base', numeric: true }) * sign;
}

const sortStorageKey = (id: string) => `bg_table_sort_${id}`;

function readSort(id: string, columns: Column<unknown>[]): SortState {
  try {
    const raw = localStorage.getItem(sortStorageKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { key?: unknown; dir?: unknown };
    const col = columns.find((c) => c.key === parsed.key && kindOf(c) !== 'none');
    if (!col || (parsed.dir !== 'asc' && parsed.dir !== 'desc')) return null;
    return { key: col.key, dir: parsed.dir };
  } catch {
    return null;
  }
}

export function useSortFilter<T>(
  rows: T[],
  columns: Column<T>[],
  id: string,
  opts: { defaultSort?: { key: string; dir: SortDir } } = {},
): SortFilter<T> {
  const [sort, setSortState] = useState<SortState>(() => readSort(id, columns as Column<unknown>[]) ?? opts.defaultSort ?? null);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const setSort = (s: SortState) => {
    setSortState(s);
    try {
      if (s) localStorage.setItem(sortStorageKey(id), JSON.stringify(s));
      else localStorage.removeItem(sortStorageKey(id));
    } catch { /* private mode: the sort just does not stick */ }
  };

  const setFilter = (key: string, value: string) => setFilters((f) => ({ ...f, [key]: value }));
  const clearFilters = () => setFilters({});

  const out = useMemo(() => {
    let list = rows;
    for (const col of columns) {
      const raw = (filters[col.key] ?? '').trim();
      if (!raw || !col.get) continue;
      const get = col.get;
      const kind = kindOf(col);
      if (kind === 'number') {
        const test = parseNumberFilter(raw);
        if (test) list = list.filter((r) => test(asNumber(get(r))));
      } else if (kind === 'select') {
        list = list.filter((r) => asText(get(r)) === raw);
      } else {
        const needle = raw.toLowerCase();
        list = list.filter((r) => asText(get(r)).toLowerCase().includes(needle));
      }
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col?.get) {
        const get = col.get;
        // Stable: equal rows keep the order the page gave them.
        list = list.map((r, i) => ({ r, i }))
          .sort((a, b) => compare(get(a.r), get(b.r), sort.dir) || a.i - b.i)
          .map((x) => x.r);
      }
    }
    return list;
  }, [rows, columns, filters, sort]);

  const activeCount = columns.filter((c) => (filters[c.key] ?? '').trim() !== '' && c.get).length;

  return { id, columns, rows: out, sort, setSort, filters, setFilter, clearFilters, activeCount };
}

const boxStyle: CSSProperties = {
  width: '100%', minWidth: 0, padding: '5px 8px', fontSize: 12, fontFamily: 'inherit',
  border: '1px solid var(--color-border)', borderRadius: 8, boxSizing: 'border-box',
  background: 'var(--color-surface)', color: 'var(--color-text)', fontWeight: 400, textTransform: 'none',
};

export const NUMBER_FILTER_HINT = 'Type a number, or <20, >=5, 10-50, none';

function labelText(label: ReactNode): string {
  return typeof label === 'string' || typeof label === 'number' ? String(label) : 'this column';
}

/** The box under one heading. */
export function FilterBox<T>({ controls, column, allRows }: { controls: SortFilter<T>; column: Column<T>; allRows?: T[] }) {
  const kind = kindOf(column);
  if (kind === 'none' || !column.get) return null;
  const value = controls.filters[column.key] ?? '';
  const testId = `${controls.id}-filter-${column.key}`;
  const aria = `Filter by ${labelText(column.label).toLowerCase()}`;
  if (kind === 'select') {
    const get = column.get;
    const options = column.options ?? Array.from(new Set((allRows ?? controls.rows).map((r) => asText(get(r))).filter((v) => v !== '')))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }))
      .map((v) => ({ value: v, label: v === 'yes' ? 'Yes' : v === 'no' ? 'No' : v }));
    return (
      <select aria-label={aria} data-testid={testId} value={value} onChange={(e) => controls.setFilter(column.key, e.target.value)} style={boxStyle}>
        <option value="">All</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  return (
    <input
      aria-label={aria}
      data-testid={testId}
      placeholder={column.placeholder ?? (kind === 'number' ? '<20' : 'contains…')}
      title={kind === 'number' ? NUMBER_FILTER_HINT : undefined}
      value={value}
      onChange={(e) => controls.setFilter(column.key, e.target.value)}
      style={boxStyle}
    />
  );
}

/**
 * The `<thead>`: headings that sort, boxes that narrow. `leading` is for a
 * cell the page owns before the columns (a select-all checkbox); it gets a
 * blank cell in the filter row so the columns stay lined up.
 *
 * `allRows` is what the pick-lists offer: the unnarrowed list, so choosing
 * one status does not hide the others from the dropdown.
 */
export function SortFilterHead<T>({ controls, leading, allRows, thStyle }: {
  controls: SortFilter<T>;
  leading?: ReactNode;
  allRows?: T[];
  thStyle?: CSSProperties;
}) {
  const { columns, sort, setSort, activeCount, clearFilters, id } = controls;
  const th = { ...TH, ...thStyle };
  const filterable = columns.some((c) => kindOf(c) !== 'none');
  // Clear goes in the last plain heading's cell (Actions, usually); failing
  // that, under the last column's box.
  const clearIndex = (() => {
    for (let i = columns.length - 1; i >= 0; i--) if (kindOf(columns[i]) === 'none') return i;
    return columns.length - 1;
  })();

  return (
    <thead>
      <tr>
        {leading !== undefined && <th style={th}>{leading}</th>}
        {columns.map((col) => {
          const kind = kindOf(col);
          const state = sort?.key === col.key ? sort.dir : null;
          if (kind === 'none' || !col.get) return <th key={col.key} style={{ ...th, ...col.th }}>{col.label}</th>;
          const next: SortState = state === 'asc' ? { key: col.key, dir: 'desc' } : { key: col.key, dir: 'asc' };
          return (
            <th key={col.key} style={{ ...th, ...col.th }} aria-sort={state === 'asc' ? 'ascending' : state === 'desc' ? 'descending' : 'none'}>
              {/* The arrow is drawn by CSS (data-sort), so the heading's text
                  is still just its label for anything reading the table. */}
              <button
                type="button"
                className="table-sort-btn"
                data-sort={state ?? 'none'}
                data-testid={`${id}-sort-${col.key}`}
                aria-label={`Sort by ${labelText(col.label)}`}
                title={state === 'asc' ? 'Sorted — tap for the other way' : state === 'desc' ? 'Sorted the other way — tap to go back' : 'Tap to sort by this'}
                onClick={() => setSort(next)}
                style={{
                  all: 'unset', cursor: 'pointer', font: 'inherit', color: state ? 'var(--color-primary)' : 'inherit',
                  textTransform: 'inherit', letterSpacing: 'inherit', display: 'inline-flex', gap: 4, alignItems: 'center',
                }}
              >
                {col.label}
              </button>
            </th>
          );
        })}
      </tr>
      {/* Plain cells, not headings: the boxes are controls, and a screen
          reader or a test counting the columns should find one heading per
          column, not two. */}
      {filterable && (
        <tr data-testid={`${id}-filter-row`}>
          {leading !== undefined && <td style={{ ...th, padding: '4px 8px 8px' }} />}
          {columns.map((col, i) => (
            <td key={col.key} style={{ ...th, padding: '4px 8px 8px', fontWeight: 400, verticalAlign: 'top' }}>
              <FilterBox controls={controls} column={col} allRows={allRows} />
              {i === clearIndex && activeCount > 0 && (
                <div style={{ marginTop: kindOf(col) === 'none' ? 0 : 4 }}>
                  <Btn small variant="ghost" onClick={clearFilters} data-testid={`${id}-clear-filters`}>
                    Clear ({activeCount})
                  </Btn>
                </div>
              )}
            </td>
          ))}
        </tr>
      )}
    </thead>
  );
}

/**
 * The same controls for a phone, where the table is a stack of cards and
 * there are no headings to tap: a sort pick and the boxes in a panel.
 */
export function SortFilterPanel<T>({ controls, allRows, open, onToggle }: {
  controls: SortFilter<T>;
  allRows?: T[];
  open: boolean;
  onToggle: () => void;
}) {
  const { columns, sort, setSort, activeCount, clearFilters, id } = controls;
  const sortable = columns.filter((c) => kindOf(c) !== 'none' && c.get);
  const value = sort ? `${sort.key}:${sort.dir}` : '';
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          aria-label="Sort by"
          data-testid={`${id}-sort-select`}
          value={value}
          onChange={(e) => {
            const [key, dir] = e.target.value.split(':');
            setSort(key ? { key, dir: dir === 'desc' ? 'desc' : 'asc' } : null);
          }}
          style={{ ...boxStyle, width: 'auto', minHeight: 40, fontSize: 14 }}
        >
          <option value="">Sort: as listed</option>
          {sortable.map((c) => (
            <optgroup key={c.key} label={labelText(c.label)}>
              <option value={`${c.key}:asc`}>{labelText(c.label)} ▲</option>
              <option value={`${c.key}:desc`}>{labelText(c.label)} ▼</option>
            </optgroup>
          ))}
        </select>
        <Btn small variant={open || activeCount > 0 ? 'primary' : 'secondary'} onClick={onToggle} data-testid={`${id}-filters-toggle`} aria-expanded={open}>
          ⚲ Filters{activeCount > 0 ? ` (${activeCount})` : ''}
        </Btn>
        {activeCount > 0 && (
          <Btn small variant="ghost" onClick={clearFilters} data-testid={`${id}-clear-filters`}>Clear</Btn>
        )}
      </div>
      {open && (
        <div data-testid={`${id}-filters-panel`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginTop: 10 }}>
          {sortable.map((c) => (
            <label key={c.key} style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
              {c.label}
              <div style={{ marginTop: 3 }}><FilterBox controls={controls} column={c} allRows={allRows} /></div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
