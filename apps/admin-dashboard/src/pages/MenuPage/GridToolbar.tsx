import { useState } from 'react';
import type { MenuCategory, MenuGroupRow } from '../../api';
import { Btn } from '../../components/SharedUI';
import {
  COLUMN_GROUPS,
  GRID_COLUMNS,
  TAX_CODES,
  categoryOptions,
  defaultVisibleColumns,
  menuGroupOptions,
} from './gridColumns';
import { EMPTY_FILTERS, activeFilterCount, type GridFilters } from './gridFilters';

/**
 * Search, filters and the column chooser.
 *
 * Owner, 2026-09-01: "add enhanced separate filter option and search button"
 * and "option to hide/show in the table so unwanted column can be hided".
 *
 * All of it works on the set already in the browser, so typing narrows the
 * table instantly — the grid loads every item matching the page filters up
 * front, which is what makes an in-memory search honest rather than a
 * partial one over whichever page you happened to be on.
 */

const control: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 9, border: '1px solid var(--color-border)',
  fontSize: 13, fontFamily: 'inherit', background: 'var(--color-surface)',
  color: 'var(--color-text)', minHeight: 38,
};

export function GridToolbar({
  filters,
  onFiltersChange,
  categories,
  menuGroups,
  visibleKeys,
  onVisibleKeysChange,
  canSeeCost,
  shown,
  total,
  allExpanded,
  onToggleExpandAll,
  hasSizes,
  onExport,
  onImport,
}: {
  filters: GridFilters;
  onFiltersChange: (f: GridFilters) => void;
  categories: MenuCategory[];
  menuGroups: MenuGroupRow[];
  visibleKeys: string[];
  onVisibleKeysChange: (keys: string[]) => void;
  canSeeCost: boolean;
  shown: number;
  total: number;
  allExpanded: boolean;
  onToggleExpandAll: () => void;
  hasSizes: boolean;
  onExport: () => void;
  onImport: (file: File) => void;
}) {
  const [showFilters, setShowFilters] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const activeCount = activeFilterCount(filters);

  const set = <K extends keyof GridFilters>(key: K, value: GridFilters[K]) =>
    onFiltersChange({ ...filters, [key]: value });

  const toggleColumn = (key: string) => {
    const next = visibleKeys.includes(key)
      ? visibleKeys.filter((k) => k !== key)
      : [...visibleKeys, key];
    // A table of nothing but checkboxes is not a state worth allowing.
    if (next.length === 0) return;
    onVisibleKeysChange(next);
  };

  const available = GRID_COLUMNS.filter((c) => canSeeCost || !c.costOnly);

  return (
    <div style={{ marginBottom: 14 }}>
      <div className="qe-toolbar" data-testid="grid-toolbar">
        <div className="qe-toolbar-search">
          <input
            value={filters.search}
            onChange={(e) => set('search', e.target.value)}
            placeholder="Search name, Dhivehi name, SKU, barcode or size…"
            aria-label="Search the grid"
            data-testid="grid-search"
            style={{ ...control, width: '100%', paddingRight: 30 }}
          />
          {filters.search !== '' && (
            <button
              type="button"
              onClick={() => set('search', '')}
              aria-label="Clear search"
              style={{
                position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                border: 'none', background: 'none', cursor: 'pointer', fontSize: 15,
                color: 'var(--color-text-muted)', lineHeight: 1,
              }}
            >×</button>
          )}
        </div>

        <span className="qe-toolbar-count" data-testid="grid-count">
          {shown === total ? `${total} items` : `${shown} of ${total} items`}
        </span>

        {/* One row of buttons that scrolls sideways on a phone rather than
            stacking into three lines above the sheet. */}
        <div className="qe-toolbar-actions">
          <Btn
            small
            variant={activeCount > 0 ? 'primary' : 'secondary'}
            onClick={() => setShowFilters((v) => !v)}
            data-testid="grid-filter-toggle"
          >
            Filters{activeCount > 0 ? ` (${activeCount})` : ''}
          </Btn>
          <Btn small variant="secondary" onClick={() => setShowColumns((v) => !v)} data-testid="grid-columns-toggle">
            Columns ({visibleKeys.length})
          </Btn>
          {hasSizes && (
            <Btn small variant="secondary" onClick={onToggleExpandAll} data-testid="grid-expand-all">
              {allExpanded ? 'Collapse sizes' : 'Expand sizes'}
            </Btn>
          )}
          <Btn small variant="secondary" onClick={onExport} data-testid="csv-export">⭳ Export CSV</Btn>
          <label style={{ display: 'inline-flex' }}>
            <input
              type="file"
              accept=".csv,text/csv"
              data-testid="csv-file"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImport(file);
                e.target.value = '';
              }}
            />
            <Btn small variant="secondary" onClick={(e) => {
              (e.currentTarget.parentElement?.querySelector('input[type=file]') as HTMLInputElement | null)?.click();
            }} data-testid="csv-import">⭱ Import CSV</Btn>
          </label>
        </div>
      </div>

      {showFilters && (
        <div
          data-testid="grid-filters"
          style={{
            marginTop: 10, padding: 14, borderRadius: 12,
            border: '1px solid var(--color-border)', background: 'var(--color-bg)',
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10,
          }}
        >
          <Labelled label="Category">
            <select
              value={filters.categoryId ?? ''}
              onChange={(e) => set('categoryId', e.target.value ? Number(e.target.value) : null)}
              aria-label="Filter by category"
              style={{ ...control, width: '100%' }}
            >
              <option value="">Any category</option>
              {categoryOptions(categories).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Labelled>
          <Labelled label="Menu group">
            <select
              value={filters.menuGroupId ?? ''}
              onChange={(e) => set('menuGroupId', e.target.value ? Number(e.target.value) : null)}
              aria-label="Filter by menu group"
              style={{ ...control, width: '100%' }}
            >
              <option value="">Any group</option>
              {menuGroupOptions(menuGroups).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Labelled>
          <Labelled label="GST">
            <select
              value={filters.taxCode}
              onChange={(e) => set('taxCode', e.target.value)}
              aria-label="Filter by GST"
              style={{ ...control, width: '100%' }}
            >
              <option value="">Any GST</option>
              {TAX_CODES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Labelled>
          {/* Named to match the grid columns — these filter the same two
              switches, and calling them something else here is how "Avail"
              became a question in the first place. */}
          <Labelled label="Selling today">
            <select
              value={filters.availability}
              onChange={(e) => set('availability', e.target.value as GridFilters['availability'])}
              aria-label="Filter by availability"
              style={{ ...control, width: '100%' }}
            >
              <option value="any">Any</option>
              <option value="available">Selling today</option>
              <option value="sold_out">Sold out today</option>
            </select>
          </Labelled>
          <Labelled label="On menu">
            <select
              value={filters.status}
              onChange={(e) => set('status', e.target.value as GridFilters['status'])}
              aria-label="Filter by status"
              style={{ ...control, width: '100%' }}
            >
              <option value="any">Any</option>
              <option value="active">On menu</option>
              <option value="hidden">Off menu</option>
            </select>
          </Labelled>
          <Labelled label="Sizes">
            <select
              value={filters.sizes}
              onChange={(e) => set('sizes', e.target.value as GridFilters['sizes'])}
              aria-label="Filter by sizes"
              style={{ ...control, width: '100%' }}
            >
              <option value="any">Any</option>
              <option value="with">Has sizes</option>
              <option value="without">No sizes</option>
            </select>
          </Labelled>
          <Labelled label="Stock">
            <select
              value={filters.stock}
              onChange={(e) => set('stock', e.target.value as GridFilters['stock'])}
              aria-label="Filter by stock"
              style={{ ...control, width: '100%' }}
            >
              <option value="any">Any</option>
              <option value="tracked">Tracked</option>
              <option value="untracked">Not tracked</option>
              <option value="low">Low stock</option>
              <option value="out">Out of stock</option>
            </select>
          </Labelled>
          <Labelled label="Price between">
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="number" min="0" step="0.01" placeholder="min"
                value={filters.minPrice}
                onChange={(e) => set('minPrice', e.target.value)}
                aria-label="Minimum price"
                style={{ ...control, width: '100%', textAlign: 'right' }}
              />
              <input
                type="number" min="0" step="0.01" placeholder="max"
                value={filters.maxPrice}
                onChange={(e) => set('maxPrice', e.target.value)}
                aria-label="Maximum price"
                style={{ ...control, width: '100%', textAlign: 'right' }}
              />
            </div>
          </Labelled>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <Btn small variant="secondary" onClick={() => onFiltersChange(EMPTY_FILTERS)} data-testid="grid-clear-filters">
              Clear filters
            </Btn>
          </div>
        </div>
      )}

      {showColumns && (
        <div
          data-testid="grid-columns"
          style={{
            marginTop: 10, padding: 14, borderRadius: 12,
            border: '1px solid var(--color-border)', background: 'var(--color-bg)',
          }}
        >
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <Btn small variant="secondary" onClick={() => onVisibleKeysChange(available.map((c) => c.key))}>Show all</Btn>
            <Btn small variant="secondary" onClick={() => onVisibleKeysChange(defaultVisibleColumns(canSeeCost))}>Reset to default</Btn>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', alignSelf: 'center' }}>
              Remembered on this browser.
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            {COLUMN_GROUPS.map((group) => {
              const cols = available.filter((c) => c.group === group);
              if (cols.length === 0) return null;

              return (
                <div key={group}>
                  <div style={{
                    fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em',
                    color: 'var(--color-text-muted)', marginBottom: 6,
                  }}>
                    {group}
                  </div>
                  {cols.map((c) => (
                    <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, padding: '3px 0', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={visibleKeys.includes(c.key)}
                        onChange={() => toggleColumn(c.key)}
                        aria-label={`Show ${c.label} column`}
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{
        display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.05em', color: 'var(--color-text-muted)', marginBottom: 4,
      }}>
        {label}
      </span>
      {children}
    </label>
  );
}
