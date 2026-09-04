import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import type { MenuCategory, MenuGroupRow, MenuItem, MenuVariant } from '../../api';
import {
  bulkRowErrors, bulkUpdateItems, fetchAdminItems,
  type BulkItemFields, type BulkRowErrors,
} from '../../api';
import { Btn, Card, EmptyState, Spinner } from '../../components/Layout';
import { BulkActionBar } from './BulkActionBar';
import { GridToolbar } from './GridToolbar';
import {
  allVariants,
  changedPreviewRows,
  countDirtyCells,
  draftsToChanges,
  fieldChanged,
  previewAction,
  type BulkAction,
  type Drafts,
  type EditableRecord,
} from './bulkEdit';
import {
  categoryOptions,
  loadVisibleColumns,
  marginPct,
  menuGroupOptions,
  saveVisibleColumns,
  visibleColumns,
  type GridColumn,
} from './gridColumns';
import { ColumnFilterMenu } from './ColumnFilterMenu';
import {
  EMPTY_FILTERS, columnValueCounts, nextSort, visibleRows,
  type GridFilters, type SortState,
} from './gridFilters';
import { csvFilename, csvToDrafts, itemsToCsv, parseCsv, type CsvImportResult } from './menuCsv';

/**
 * Spreadsheet-style editing for the menu.
 *
 * Deliberately NOT a replacement for the item editor — it carries only the
 * columns that are a single value per row. Anything composed (photos, combos,
 * platters, channels, and the size LIST itself) stays behind Edit, because a
 * grid cell cannot express it and a sparse save would have to guess.
 *
 * Nothing is written while you type. Edits collect as drafts, the button says
 * how many cells are pending, and one Save sends them together — the server
 * applies the batch in one transaction, so a rejected row leaves the menu
 * exactly as it was and comes back highlighted.
 */

/** Remembered choice for whether sizes start open. */
const SIZES_KEY = 'menu-quick-edit-sizes';

/** A row typed into the bottom of the sheet, before it exists. */
type NewRow = { key: string; fields: Record<string, unknown> };

const cell: React.CSSProperties = { padding: '6px 8px', verticalAlign: 'middle' };
const head: React.CSSProperties = {
  padding: '8px', textAlign: 'left', fontWeight: 700, fontSize: 11,
  textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)',
  whiteSpace: 'nowrap',
};

function inputStyle(dirty: boolean, invalid: boolean, width?: number): React.CSSProperties {
  return {
    width: width ?? '100%',
    minWidth: width ?? undefined,
    padding: '6px 8px',
    fontSize: 13,
    fontFamily: 'inherit',
    borderRadius: 7,
    color: 'var(--color-text)',
    // A touched cell and a rejected cell must be tellable apart at a glance
    // when forty rows are on screen.
    border: `1.5px solid ${invalid ? 'var(--color-danger)' : dirty ? 'var(--color-warning)' : 'var(--color-border)'}`,
    background: invalid
      ? 'var(--color-danger-bg)'
      : dirty ? 'var(--color-warning-bg)' : 'var(--color-surface)',
    outline: 'none',
  };
}

export function QuickEditGrid({
  categories,
  menuGroups,
  categoryId,
  search,
  canSeeCost,
  onSaved,
  onExit,
  initialItems,
}: {
  categories: MenuCategory[];
  menuGroups: MenuGroupRow[];
  /** The list filters, mirrored so the grid loads the same set. */
  categoryId: number | null;
  search: string;
  /** recipes.manage — cost and margin are owner-only, as everywhere else. */
  canSeeCost: boolean;
  onSaved: (message: string) => void;
  onExit: () => void;
  /** Tests inject a fixed set instead of walking the API. */
  initialItems?: MenuItem[];
}) {
  // A spreadsheet you have to paginate is not a spreadsheet, so the grid pulls
  // every item matching the page filter rather than the page behind it. The
  // API caps a page at 100, hence the walk.
  const [items, setItems] = useState<MenuItem[]>(initialItems ?? []);
  const [loading, setLoading] = useState(!initialItems);
  const [loadError, setLoadError] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const all: MenuItem[] = [];
      for (let page = 1; page <= 20; page += 1) {
        const res = await fetchAdminItems({
          category_id: categoryId ?? undefined,
          search: search || undefined,
          page,
          per_page: 100,
        });
        all.push(...(res.data ?? []));
        if (page >= (res.meta?.last_page ?? 1)) break;
      }
      setItems(all);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [categoryId, search]);

  useEffect(() => {
    if (initialItems) return;
    void loadAll();
  }, [loadAll, initialItems]);

  const [drafts, setDrafts] = useState<Drafts>({});
  const [variantDrafts, setVariantDrafts] = useState<Drafts>({});
  // Owner, 2026-09-01: "variant is minimized by default, i have to maximize
  // each variant". Sizes now start open, and the choice is remembered.
  const [expandAll, setExpandAll] = useState(() => {
    try {
      return localStorage.getItem(SIZES_KEY) !== 'collapsed';
    } catch {
      return true;
    }
  });
  const [collapsed, setCollapsed] = useState<number[]>([]);
  const [expanded, setExpanded] = useState<number[]>([]);
  const [newRows, setNewRows] = useState<NewRow[]>([]);
  const [newRowErrors, setNewRowErrors] = useState<BulkRowErrors | null>(null);
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [rowErrors, setRowErrors] = useState<BulkRowErrors | null>(null);
  const [variantErrors, setVariantErrors] = useState<BulkRowErrors | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<BulkAction | null>(null);
  const [csvNotice, setCsvNotice] = useState<CsvImportResult | null>(null);
  const [filters, setFilters] = useState<GridFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortState>(null);
  const [applyToSizes, setApplyToSizes] = useState(true);
  const [columnKeys, setColumnKeys] = useState<string[]>(() => loadVisibleColumns(canSeeCost));

  const columns = useMemo(() => visibleColumns(columnKeys, canSeeCost), [columnKeys, canSeeCost]);
  const rows = useMemo(() => visibleRows(items, filters, sort), [items, filters, sort]);
  const variants = useMemo(() => allVariants(items), [items]);
  const changes = useMemo(() => draftsToChanges(items, drafts), [items, drafts]);
  const variantChanges = useMemo(
    () => draftsToChanges(variants, variantDrafts),
    [variants, variantDrafts],
  );
  /** New rows carrying anything at all — a blank row is not a pending item. */
  const filledNewRows = useMemo(
    () => newRows.filter((r) => Object.entries(r.fields)
      .some(([k, v]) => k !== 'category_id' && v !== '' && v !== null && v !== undefined)),
    [newRows],
  );
  const dirtyCells = useMemo(
    () => countDirtyCells(items, drafts)
      + countDirtyCells(variants, variantDrafts)
      // Only cells actually filled in count — the row is seeded with the
      // current category filter, and a seeded blank is not something typed.
      + filledNewRows.reduce(
        (n, r) => n + Object.values(r.fields).filter((v) => v !== '' && v !== null && v !== undefined).length,
        0,
      ),
    [items, drafts, variants, variantDrafts, filledNewRows],
  );
  const dirtyRows = changes.length + variantChanges.length + filledNewRows.length;
  const hasSizes = variants.length > 0;

  const setColumns = (keys: string[]) => {
    setColumnKeys(keys);
    saveVisibleColumns(keys);
  };

  const errorFor = (itemId: number, field: string): string[] | null => {
    if (!rowErrors) return null;
    const index = changes.findIndex((c) => c.id === itemId);

    return index < 0 ? null : (rowErrors[index]?.[field] ?? null);
  };

  const variantErrorFor = (variantId: number, field: string): string[] | null => {
    if (!variantErrors) return null;
    const index = variantChanges.findIndex((c) => c.id === variantId);

    return index < 0 ? null : (variantErrors[index]?.[field] ?? null);
  };

  const draftValue = (record: EditableRecord, field: string, store: Drafts): unknown => {
    const draft = store[record.id as number];
    if (draft && field in draft) return (draft as Record<string, unknown>)[field];

    return record[field];
  };

  const isDirty = (record: EditableRecord, field: string, store: Drafts): boolean => {
    const draft = store[record.id as number];
    if (!draft || !(field in draft)) return false;

    return fieldChanged(record, field, (draft as Record<string, unknown>)[field]);
  };

  const clearErrors = () => { setRowErrors(null); setVariantErrors(null); setNewRowErrors(null); };

  const setField = (id: number, field: string, value: unknown) => {
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? {}), [field]: value } as BulkItemFields }));
    clearErrors();
  };

  const setVariantField = (id: number, field: string, value: unknown) => {
    setVariantDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? {}), [field]: value } as BulkItemFields }));
    clearErrors();
  };

  // With sizes open by default, a per-row click is an exception to that
  // default in whichever direction the default is not.
  const isRowOpen = (id: number, pendingSize: boolean) =>
    pendingSize || (expandAll ? !collapsed.includes(id) : expanded.includes(id));

  const toggleExpanded = (id: number) => {
    if (expandAll) {
      setCollapsed((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
    } else {
      setExpanded((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));
    }
  };

  const toggleExpandAll = () => {
    const next = !expandAll;
    setExpandAll(next);
    setCollapsed([]);
    setExpanded([]);
    try {
      localStorage.setItem(SIZES_KEY, next ? 'expanded' : 'collapsed');
    } catch {
      /* a browser refusing storage is not a reason to fail the edit */
    }
  };

  const addNewRow = () =>
    setNewRows((r) => [...r, { key: `new-${Date.now()}-${r.length}`, fields: { category_id: categoryId } }]);

  const setNewRowField = (key: string, field: string, value: unknown) => {
    setNewRows((r) => r.map((row) => (row.key === key ? { ...row, fields: { ...row.fields, [field]: value } } : row)));
    setNewRowErrors(null);
  };

  const removeNewRow = (key: string) => {
    setNewRows((r) => r.filter((row) => row.key !== key));
    setNewRowErrors(null);
  };



  // Selection is scoped to what is on screen: ticking "all" while a filter is
  // on must not quietly include the rows the filter hid.
  const selectedItems = rows.filter((i) => selected.includes(i.id));
  const allSelected = rows.length > 0 && rows.every((i) => selected.includes(i.id));

  const toggleAll = () =>
    setSelected(allSelected ? [] : rows.map((i) => i.id));
  const toggleOne = (id: number) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  /** Stage an action as drafts so it lands in the same preview-and-save flow. */
  const applyAction = (action: BulkAction) => {
    const previewed = previewAction(selectedItems, action, { applyToSizes });
    setDrafts((d) => {
      const next = { ...d };
      for (const row of previewed) {
        if (Object.keys(row.fields).length === 0) continue;
        next[row.item.id] = { ...(next[row.item.id] ?? {}), ...row.fields };
      }
      return next;
    });

    // A price move on a sized dish has to reach the sizes — the base price is
    // not what the customer is charged for a Full or a Half.
    if (applyToSizes && (action.kind === 'price' || action.kind === 'margin')) {
      const sized = selectedItems.filter((i) => (i.variants ?? []).length > 0);
      if (sized.length > 0) {
        setVariantDrafts((d) => {
          const next = { ...d };
          for (const item of sized) {
            for (const v of item.variants ?? []) {
              if (v.id == null) continue;
              const stand = {
                id: v.id,
                base_price: v.price,
                cost: v.cost,
                effective_cost: v.cost,
              } as unknown as MenuItem;
              const [row] = previewAction([stand], action);
              if (row.fields.base_price === undefined) continue;
              next[v.id] = { ...(next[v.id] ?? {}), price: row.fields.base_price } as BulkItemFields;
            }
          }
          return next;
        });
        setExpanded((e) => [...new Set([...e, ...sized.map((i) => i.id)])]);
      }
    }

    clearErrors();
    setPending(null);
  };

  const save = async () => {
    if (changes.length === 0 && variantChanges.length === 0 && filledNewRows.length === 0) return;
    setSaving(true);
    setError('');
    clearErrors();
    try {
      const res = await bulkUpdateItems(
        changes,
        variantChanges,
        filledNewRows.map((r) => r.fields as BulkItemFields),
      );
      setDrafts({});
      setVariantDrafts({});
      setNewRows([]);
      setSelected([]);
      setCsvNotice(null);
      onSaved(res.message);
      await loadAll();
    } catch (e) {
      const parsed = bulkRowErrors(e);
      if (parsed) {
        setRowErrors(parsed.items);
        setVariantErrors(parsed.variants);
        setNewRowErrors(parsed.newRows);
      }
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setDrafts({});
    setVariantDrafts({});
    setNewRows([]);
    clearErrors();
    setError('');
    setCsvNotice(null);
  };

  const exportCsv = () => {
    // Exports what is on screen, so a filter is also a way to scope the file.
    const blob = new Blob([itemsToCsv(rows, canSeeCost, categories)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = csvFilename(categories.find((c) => c.id === categoryId) ?? null, search);
    link.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = async (file: File) => {
    setError('');
    try {
      const { header, rows: parsed } = parseCsv(await file.text());
      const result = csvToDrafts(parsed, header, items, canSeeCost);
      setDrafts((d) => ({ ...d, ...result.drafts }));
      setVariantDrafts((d) => ({ ...d, ...result.variantDrafts }));
      setExpanded((e) => [
        ...new Set([...e, ...items.filter((i) => (i.variants ?? [])
          .some((v) => v.id != null && result.variantDrafts[v.id])).map((i) => i.id)]),
      ]);
      setCsvNotice(result);
      clearErrors();
    } catch (e) {
      setError(`Could not read that file: ${(e as Error).message}`);
    }
  };

  const previewRows = pending ? previewAction(selectedItems, pending, { applyToSizes }) : [];
  const previewChanged = changedPreviewRows(previewRows);

  if (loading && items.length === 0) return <Spinner />;
  if (loadError && items.length === 0) {
    return <Card><EmptyState message={`Could not load the menu: ${loadError}`} /></Card>;
  }
  if (items.length === 0) {
    return <Card><EmptyState message="No items match this filter." /></Card>;
  }

  return (
    <div onClick={() => setOpenFilter(null)}>
      <GridToolbar
        filters={filters}
        onFiltersChange={setFilters}
        categories={categories}
        menuGroups={menuGroups}
        visibleKeys={columnKeys}
        onVisibleKeysChange={setColumns}
        canSeeCost={canSeeCost}
        shown={rows.length}
        total={items.length}
        allExpanded={expandAll}
        onToggleExpandAll={toggleExpandAll}
        hasSizes={hasSizes}
        onExport={exportCsv}
        onImport={(file) => void importCsv(file)}
      />

      {/* With nothing ticked the bar is one line of hint, not an empty card
          holding the sheet down. */}
      {selected.length > 0 ? (
        <Card style={{ padding: '14px 16px', marginBottom: 14 }}>
          <BulkActionBar
            selectedCount={selected.length}
            categories={categories}
            menuGroups={menuGroups}
            canSeeCost={canSeeCost}
            applyToSizes={applyToSizes}
            onApplyToSizesChange={setApplyToSizes}
            onPropose={setPending}
            onClear={() => setSelected([])}
          />
        </Card>
      ) : (
        <div className="qe-hint">
          <BulkActionBar
            selectedCount={0}
            categories={categories}
            menuGroups={menuGroups}
            canSeeCost={canSeeCost}
            applyToSizes={applyToSizes}
            onApplyToSizesChange={setApplyToSizes}
            onPropose={setPending}
            onClear={() => setSelected([])}
          />
        </div>
      )}

      {/* A bulk price move is the change nobody can undo by hand, so every
          affected row is shown before it even becomes a pending edit. */}
      {pending && (
        <Card style={{ padding: '14px 16px', marginBottom: 14, borderColor: 'var(--color-warning)' }} data-testid="bulk-preview">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: 'var(--color-text)' }}>
            {previewChanged.length === 0
              ? 'Nothing would change'
              : `${previewChanged.length} of ${previewRows.length} selected item${previewRows.length === 1 ? '' : 's'} would change`}
          </div>
          {/* When nothing moves, say why — a bare "nothing would change" after
              deliberately selecting rows reads as a broken button. */}
          {previewChanged.length === 0 && previewRows.length > 0 && (
            <ul
              data-testid="bulk-preview-reasons"
              style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6 }}
            >
              {[...new Set(previewRows.map((r) => r.after || 'already set'))].map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          {previewChanged.length > 0 && (
            <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <tbody>
                  {previewChanged.map((row) => (
                    <tr key={row.item.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                      <td style={{ padding: '5px 8px' }}>{row.item.name}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {row.before}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'center', color: 'var(--color-text-muted)' }}>→</td>
                      <td style={{ padding: '5px 8px', fontWeight: 700, color: 'var(--color-primary)', fontVariantNumeric: 'tabular-nums' }}>
                        {row.after || 'changed'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn small onClick={() => applyAction(pending)} disabled={previewChanged.length === 0}>
              Stage {previewChanged.length} change{previewChanged.length === 1 ? '' : 's'}
            </Btn>
            <Btn small variant="secondary" onClick={() => setPending(null)}>Cancel</Btn>
          </div>
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '8px 0 0' }}>
            Staging only fills the cells below — nothing is written until you press Save.
          </p>
        </Card>
      )}

      {csvNotice && (
        <Card style={{ padding: '12px 16px', marginBottom: 14 }} data-testid="csv-notice">
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>
            {csvNotice.changedRows === 0
              ? 'That file matched the menu exactly — nothing to change.'
              : `${csvNotice.changedRows} row${csvNotice.changedRows === 1 ? '' : 's'} from the file differ and are now pending below.`}
          </div>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
            {csvNotice.unknownRows > 0 && (
              <li>
                {csvNotice.unknownRows} row{csvNotice.unknownRows === 1 ? '' : 's'} had an id that is not in
                this filter and {csvNotice.unknownRows === 1 ? 'was' : 'were'} skipped — importing never
                creates items.
              </li>
            )}
            {csvNotice.malformedRows > 0 && (
              <li>{csvNotice.malformedRows} row{csvNotice.malformedRows === 1 ? '' : 's'} had no usable id or type and {csvNotice.malformedRows === 1 ? 'was' : 'were'} skipped.</li>
            )}
            {csvNotice.ignoredColumns.length > 0 && (
              <li>Columns not saved from this file: {csvNotice.ignoredColumns.join(', ')}.</li>
            )}
          </ul>
        </Card>
      )}

      {rows.length === 0 ? (
        <Card><EmptyState message="No items match these filters." /></Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {/* The sheet scrolls inside this box on a desk, so the header and the
              name column stay put while the rest moves. On a phone the page
              scrolls and only the name column is pinned. */}
          <div className={`qe-scroll${openFilter ? ' has-menu' : ''}`} data-testid="quick-edit-scroll">
            <table className="qe-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th className="qe-col-select" style={{ ...head, width: 34 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all rows"
                    />
                  </th>
                  {columns.map((c) => (
                    <SortableHeader
                      key={c.key}
                      column={c}
                      sort={sort}
                      onSort={() => setSort((s) => nextSort(s, c.key))}
                      filtered={(filters.columns[c.key] ?? []).length > 0}
                      menuOpen={openFilter === c.key}
                      onToggleMenu={() => setOpenFilter((k) => (k === c.key ? null : c.key))}
                      menu={openFilter === c.key ? (
                        <ColumnFilterMenu
                          label={c.label}
                          values={columnValueCounts(items, filters, c.key)}
                          selected={filters.columns[c.key] ?? []}
                          onChange={(next) => setFilters((f) => ({
                            ...f,
                            columns: { ...f.columns, [c.key]: next },
                          }))}
                          onClose={() => setOpenFilter(null)}
                        />
                      ) : null}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => {
                  // Pending edits are folded in, because the dish row counts
                  // how many sizes are on and that count has to describe what
                  // is on screen now — not what was on screen before the
                  // cashier started unticking.
                  const sizes = (item.variants ?? []).slice()
                    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                    .map((v) => (v.id != null && variantDrafts[v.id]
                      ? { ...v, ...variantDrafts[v.id] } as MenuVariant
                      : v));
                  // A dirty or rejected size forces its dish open, so a pending
                  // edit can never be hidden behind a collapsed row.
                  const hasPendingSize = sizes.some((v) => v.id != null && variantDrafts[v.id]);
                  const isOpen = isRowOpen(item.id, hasPendingSize);

                  return (
                    <Fragment key={item.id}>
                      <tr
                        data-testid={`quick-edit-row-${item.id}`}
                        className={`qe-row${selected.includes(item.id) ? ' is-selected' : ''}`}
                      >
                        <td className="qe-col-select" style={cell}>
                          <input
                            type="checkbox"
                            checked={selected.includes(item.id)}
                            onChange={() => toggleOne(item.id)}
                            aria-label={`Select ${item.name}`}
                          />
                        </td>
                        {columns.map((c) => (
                          <ItemCell
                            key={c.key}
                            column={c}
                            item={item}
                            sizes={sizes}
                            isOpen={isOpen}
                            onToggleExpanded={() => toggleExpanded(item.id)}
                            categories={categories}
                            menuGroups={menuGroups}
                            value={c.field ? draftValue(item as unknown as EditableRecord, c.field, drafts) : undefined}
                            dirty={!!c.field && isDirty(item as unknown as EditableRecord, c.field, drafts)}
                            errors={c.field ? errorFor(item.id, c.field) : null}
                            onChange={(v) => c.field && setField(item.id, c.field, v)}
                          />
                        ))}
                      </tr>
                      {isOpen && sizes.map((v) => (
                        <tr
                          key={v.id}
                          data-testid={`quick-edit-size-${v.id}`}
                          className="qe-row qe-row--size"
                        >
                          <td className="qe-col-select" style={cell} />
                          {columns.map((c) => (
                            <VariantCell
                              key={c.key}
                              column={c}
                              variant={v}
                              itemName={item.name}
                              value={c.variantField ? draftValue(v as unknown as EditableRecord, c.variantField, variantDrafts) : undefined}
                              dirty={!!c.variantField && isDirty(v as unknown as EditableRecord, c.variantField, variantDrafts)}
                              errors={c.variantField ? variantErrorFor(v.id as number, c.variantField) : null}
                              onChange={(val) => c.variantField && setVariantField(v.id as number, c.variantField, val)}
                            />
                          ))}
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}

                {/* New rows live at the bottom of the sheet and go through the
                    same all-or-nothing save as every edit above them. */}
                {newRows.map((row, index) => (
                  <tr
                    key={row.key}
                    data-testid={`quick-edit-new-${index}`}
                    className="qe-row qe-row--new"
                  >
                    <td className="qe-col-select" style={{ ...cell, textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => removeNewRow(row.key)}
                        aria-label={`Remove new row ${index + 1}`}
                        style={{
                          border: 'none', background: 'none', cursor: 'pointer',
                          color: 'var(--color-danger)', fontSize: 16, lineHeight: 1, padding: 0,
                        }}
                      >×</button>
                    </td>
                    {columns.map((c) => (
                      <NewCell
                        key={c.key}
                        column={c}
                        index={index}
                        categories={categories}
                        menuGroups={menuGroups}
                        value={c.field ? row.fields[c.field] : undefined}
                        errors={c.field ? (newRowErrors?.[index]?.[c.field] ?? null) : null}
                        onChange={(v) => c.field && setNewRowField(row.key, c.field, v)}
                      />
                    ))}
                  </tr>
                ))}

                <tr className="qe-row qe-row--footer">
                  <td colSpan={columns.length + 1} style={{ padding: '8px' }}>
                    <div className="qe-add-row">
                      <Btn small variant="secondary" onClick={addNewRow} data-testid="grid-add-row">
                        + Add item row
                      </Btn>
                      <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                        Name and price are required. Photos, sizes and recipes are added afterwards from Edit.
                      </span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Sits under the sheet and stays on screen while it scrolls, so Save
          is never somewhere above two hundred rows. */}
      <div className="qe-savebar" data-dirty={dirtyCells > 0 ? 'true' : 'false'} data-testid="quick-edit-savebar">
        {error && (
          <div className="qe-savebar-error" data-testid="quick-edit-error">
            {error} Nothing was saved — fix the highlighted cells and press Save again.
          </div>
        )}
        <div className="qe-savebar-row">
          <span className="qe-savebar-status" data-testid="quick-edit-dirty">
            {dirtyCells === 0
              ? 'No unsaved changes'
              : `${dirtyCells} unsaved change${dirtyCells === 1 ? '' : 's'} across ${dirtyRows} row${dirtyRows === 1 ? '' : 's'}`}
          </span>
          <div className="qe-savebar-actions">
            <Btn small variant="secondary" onClick={discard} disabled={dirtyCells === 0 || saving}>Discard</Btn>
            <Btn small onClick={() => void save()} disabled={dirtyCells === 0 || saving}>
              {saving ? 'Saving…' : `Save ${dirtyCells || ''}`.trim()}
            </Btn>
            <Btn small variant="secondary" onClick={onExit}>Done</Btn>
          </div>
        </div>
      </div>

      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '10px 0 0', lineHeight: 1.6 }}>
        Photos, combos, platters, channels, descriptions and the list of sizes itself are not editable
        here — use <strong>Edit</strong> on the normal list for those. Only the cells you change are
        saved, so this will not overwrite anything somebody else is editing.
      </p>
    </div>
  );
}

function SortableHeader({
  column, sort, onSort, filtered, menuOpen, onToggleMenu, menu,
}: {
  column: GridColumn;
  sort: SortState;
  onSort: () => void;
  filtered: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  menu: React.ReactNode;
}) {
  const active = sort?.key === column.key;
  const arrow = !active ? '⇅' : sort?.direction === 'asc' ? '↑' : '↓';

  // The name column's width lives in CSS, because it is the column pinned
  // to the left edge and a phone cannot give it the desk's 200px.
  const sizing = column.key === 'name'
    ? {}
    : { width: column.width, minWidth: column.minWidth ?? column.width };

  return (
    <th
      className={column.key === 'name' ? 'qe-col-name' : undefined}
      style={{ ...head, ...sizing }}
      title={column.help}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <button
          type="button"
          onClick={onSort}
          aria-label={`Sort by ${column.label}`}
          style={{
            border: 'none', background: 'none', cursor: 'pointer', padding: 0,
            font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit',
            color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          {column.label}
          <span style={{ fontSize: 10, opacity: active ? 1 : 0.5 }}>{arrow}</span>
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleMenu(); }}
          aria-label={`Filter by ${column.label}`}
          aria-expanded={menuOpen}
          title={`Pick which ${column.label} values to show`}
          style={{
            border: 'none', background: 'none', cursor: 'pointer', padding: '0 2px',
            fontSize: 11, lineHeight: 1,
            color: filtered ? 'var(--color-primary)' : 'var(--color-text-muted)',
            opacity: filtered ? 1 : 0.55,
          }}
        >
          ▼
        </button>
      </div>
      {menu}
    </th>
  );
}

/**
 * A cell on a not-yet-created row.
 *
 * Booleans start ticked for available and active, because a dish typed into
 * the sheet is one somebody means to sell — a new row that silently arrives
 * hidden is the sort of thing found weeks later.
 */
function NewCell({
  column, index, categories, menuGroups, value, errors, onChange,
}: {
  column: GridColumn;
  index: number;
  categories: MenuCategory[];
  menuGroups: MenuGroupRow[];
  value: unknown;
  errors: string[] | null;
  onChange: (value: unknown) => void;
}) {
  if (!column.field) {
    return <td style={{ ...cell, fontSize: 11, color: 'var(--color-text-muted)' }}>—</td>;
  }

  const defaulted = value === undefined && ['is_available', 'is_active'].includes(column.field)
    ? true
    : value;

  return (
    <td className={column.key === 'name' ? 'qe-col-name' : undefined} style={cell}>
      <Editor
        column={column}
        label={`New row ${index + 1} ${column.label}`}
        value={defaulted}
        dirty={false}
        invalid={!!errors}
        categories={categories}
        menuGroups={menuGroups}
        onChange={onChange}
      />
      {errors && <FieldError messages={errors} />}
    </td>
  );
}

/** Columns a size owns once a dish has sizes; the dish row shows a summary. */
const SIZE_OWNED_COLUMNS = new Set(['available', 'active', 'cost', 'track_stock', 'stock', 'low_stock_threshold']);

function ItemCell({
  column, item, sizes, isOpen, onToggleExpanded, categories, menuGroups,
  value, dirty, errors, onChange,
}: {
  column: GridColumn;
  item: MenuItem;
  sizes: MenuVariant[];
  isOpen: boolean;
  onToggleExpanded: () => void;
  categories: MenuCategory[];
  menuGroups: MenuGroupRow[];
  value: unknown;
  dirty: boolean;
  errors: string[] | null;
  onChange: (value: unknown) => void;
}) {
  // The margin column is read-only — it is arithmetic on price and cost, not
  // a field, and offering it as an input would imply it could be set.
  if (column.key === 'margin') {
    const pct = marginPct(item);

    return (
      <td style={{ ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-secondary)' }}>
        {pct === null ? '—' : `${pct.toFixed(1)}%`}
      </td>
    );
  }

  if (column.key === 'consumption_factor') {
    return <td style={{ ...cell, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 12 }}>—</td>;
  }

  // "Also show in" is picked in the item editor; here it is only shown.
  if (column.key === 'also_in') {
    const names = (item.extra_category_ids ?? [])
      .map((id) => categories.find((c) => c.id === id)?.name)
      .filter((n): n is string => !!n);
    return (
      <td
        style={{ ...cell, fontSize: 12, color: names.length ? 'var(--color-text-secondary)' : 'var(--color-text-muted)' }}
        title={names.length ? `Also listed under ${names.join(', ')} — change it in the item editor` : 'Only under its own category — add more in the item editor'}
        data-testid={`also-in-${item.id}`}
      >
        {names.length ? names.join(', ') : '—'}
      </td>
    );
  }

  const label = `${column.label} for ${item.name}`;

  if (column.key === 'name') {
    return (
      <td className="qe-col-name" style={cell}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {sizes.length > 0 ? (
            <button
              type="button"
              onClick={onToggleExpanded}
              aria-label={`${isOpen ? 'Hide' : 'Show'} sizes for ${item.name}`}
              aria-expanded={isOpen}
              style={{
                border: '1px solid var(--color-border)', background: 'var(--color-surface)',
                borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700,
                padding: '3px 6px', color: 'var(--color-text-secondary)', flexShrink: 0, minWidth: 34,
              }}
            >
              {isOpen ? '▾' : '▸'} {sizes.length}
            </button>
          ) : (
            <span style={{ width: 34, flexShrink: 0 }} />
          )}
          <input
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            aria-label={`Name for ${item.name}`}
            style={inputStyle(dirty, !!errors)}
          />
        </div>
        {errors && <FieldError messages={errors} />}
      </td>
    );
  }

  if (column.key === 'price' && sizes.filter((v) => v.is_active !== false).length > 0) {
    // A dish sold in sizes has no price of its own that anybody sees: the menu
    // shows the cheapest size and the till charges the size chosen. Its
    // base_price column is dead weight, so the grid shows the range the sizes
    // cover rather than an input that would accept a number and change
    // nothing. Edit the size rows below instead.
    const prices = sizes.filter((v) => v.is_active !== false).map((v) => Number(v.price) || 0);
    const min = Math.min(...prices);
    const max = Math.max(...prices);

    return (
      <td
        style={{ ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-secondary)' }}
        title="Set by the sizes below — this dish has no price of its own"
        data-testid={`price-range-${item.id}`}
      >
        {min === max ? min.toFixed(2) : `${min.toFixed(2)}–${max.toFixed(2)}`}
        <div style={{ fontSize: 10, color: 'var(--color-text-muted)', lineHeight: 1.3 }}>
          from sizes
        </div>
      </td>
    );
  }

  // Owner, 2026-09-03: "if there is a variant, selling today, stock, on menu
  // etc. should be only for the variant, not for the main item." A sized dish
  // sells by its sizes, so the dish row carries no input for anything a size
  // owns — it only says what the sizes under it add up to. The dish-level
  // switches still exist (the editor has them) but are not offered here,
  // where they read as one more tick in the same column.
  const liveSizes = sizes.filter((v) => v.is_active !== false);
  if (liveSizes.length > 0 && SIZE_OWNED_COLUMNS.has(column.key)) {
    if (column.key === 'available' || column.key === 'active') {
      const summary = sizeSummary(column.key, sizes);
      return (
        <td style={{ ...cell, textAlign: 'center' }} title={summary?.title}>
          <div
            data-testid={`${column.key}-summary-${item.id}`}
            style={{
              fontSize: 11, lineHeight: 1.3,
              color: summary?.stranded ? 'var(--color-danger)' : 'var(--color-text-secondary)',
            }}
          >
            {summary?.text ?? '—'}
          </div>
        </td>
      );
    }
    if (column.key === 'cost') {
      const costs = liveSizes.map((v) => Number(v.cost)).filter((n) => Number.isFinite(n) && n > 0);
      const min = costs.length ? Math.min(...costs) : null;
      const max = costs.length ? Math.max(...costs) : null;
      return (
        <td
          style={{ ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-secondary)' }}
          title="Set by the sizes below"
          data-testid={`cost-range-${item.id}`}
        >
          {min === null || max === null ? '—' : min === max ? min.toFixed(2) : `${min.toFixed(2)}–${max.toFixed(2)}`}
          <div style={{ fontSize: 10, color: 'var(--color-text-muted)', lineHeight: 1.3 }}>from sizes</div>
        </td>
      );
    }
    return (
      <td
        style={{ ...cell, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 11 }}
        title="Set per size below"
        data-testid={`${column.key}-per-size-${item.id}`}
      >
        per size
      </td>
    );
  }

  return (
    <td style={cell}>
      <Editor
        column={column}
        label={label}
        value={value}
        dirty={dirty}
        invalid={!!errors}
        categories={categories}
        menuGroups={menuGroups}
        onChange={onChange}
      />
      {errors && <FieldError messages={errors} />}
    </td>
  );
}

/**
 * What the sizes under a dish add up to, for the dish's own row.
 *
 * `stranded` is the case that misleads: the dish is ticked, so the grid reads
 * as "selling", while not one size beneath it can be bought.
 */
function sizeSummary(
  key: 'available' | 'active',
  sizes: MenuVariant[],
): { text: string; title: string; stranded: boolean } | null {
  // Sizes that are off the menu entirely cannot be sold today either way, so
  // the daily count is taken over the ones still on it.
  const pool = key === 'available' ? sizes.filter((v) => v.is_active !== false) : sizes;
  if (pool.length === 0) return null;

  const on = pool.filter((v) => (key === 'available' ? v.is_available !== false : v.is_active !== false)).length;
  const noun = key === 'available' ? 'selling' : 'on menu';

  return {
    text: on === 0 ? `no sizes ${noun}` : `${on}/${pool.length} sizes`,
    title: key === 'available'
      ? 'This tick is the whole dish — untick it to stop selling every size today. The sizes below switch on their own.'
      : 'This tick is the whole dish — untick it to take every size off the menu. The sizes below switch on their own.',
    stranded: on === 0,
  };
}

function VariantCell({
  column, variant, itemName, value, dirty, errors, onChange,
}: {
  column: GridColumn;
  variant: MenuVariant;
  itemName: string;
  value: unknown;
  dirty: boolean;
  errors: string[] | null;
  onChange: (value: unknown) => void;
}) {
  const label = `${column.label} for ${itemName} — ${variant.name}`;

  if (column.key === 'category') {
    return <td style={{ ...cell, fontSize: 11, color: 'var(--color-text-muted)' }}>size</td>;
  }
  if (!column.variantField) {
    // GST, packaging, prep time and the rest belong to the dish, not to one of
    // its portions — saying so beats an empty cell nobody can interpret.
    return <td style={{ ...cell, fontSize: 11, color: 'var(--color-text-muted)' }}>follows item</td>;
  }

  if (column.key === 'name') {
    return (
      <td className="qe-col-name" style={cell}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 34 }}>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 12, flexShrink: 0 }}>↳</span>
          <input
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            aria-label={`Size name for ${itemName} — ${variant.name}`}
            style={inputStyle(dirty, !!errors)}
          />
        </div>
        {errors && <FieldError messages={errors} />}
      </td>
    );
  }

  return (
    <td style={cell}>
      <Editor
        column={column}
        label={label}
        value={value}
        dirty={dirty}
        invalid={!!errors}
        categories={[]}
        menuGroups={[]}
        onChange={onChange}
      />
      {errors && <FieldError messages={errors} />}
    </td>
  );
}

function Editor({
  column, label, value, dirty, invalid, categories, menuGroups, onChange,
}: {
  column: GridColumn;
  label: string;
  value: unknown;
  dirty: boolean;
  invalid: boolean;
  categories: MenuCategory[];
  menuGroups: MenuGroupRow[];
  onChange: (value: unknown) => void;
}) {
  const style = inputStyle(dirty, invalid, column.width);

  switch (column.kind) {
    case 'bool':
      return (
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={label}
          style={{ outline: dirty ? '2px solid var(--color-warning)' : 'none', display: 'block', margin: '0 auto' }}
        />
      );
    case 'money':
      return (
        <input
          type="number" min="0" step="0.01"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          aria-label={label}
          style={{ ...style, textAlign: 'right' }}
        />
      );
    case 'decimal':
      return (
        <input
          type="number" min="0" step="0.05"
          value={String(value ?? 1)}
          onChange={(e) => onChange(e.target.value === '' ? 1 : Math.max(0, Number(e.target.value)))}
          aria-label={label}
          title="How much of the recipe one of this size uses — full 1, half 0.5"
          style={{ ...style, textAlign: 'right' }}
        />
      );
    case 'int':
      return (
        <input
          type="number" step="1"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value === '' ? null : Math.round(Number(e.target.value)))}
          aria-label={label}
          style={{ ...style, textAlign: 'right' }}
        />
      );
    case 'select':
      return (
        <select
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
          aria-label={label}
          style={style}
        >
          <option value="">—</option>
          {(column.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case 'category':
      return (
        <select
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          aria-label={label}
          style={style}
        >
          <option value="">—</option>
          {categoryOptions(categories).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case 'menu_group':
      return (
        <select
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          aria-label={label}
          style={style}
        >
          <option value="">—</option>
          {menuGroupOptions(menuGroups).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    default:
      return (
        <input
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
          aria-label={label}
          style={style}
        />
      );
  }
}

function FieldError({ messages }: { messages: string[] }) {
  return (
    <div style={{ fontSize: 11, color: 'var(--color-danger)', marginTop: 3, lineHeight: 1.4 }}>
      {messages[0]}
    </div>
  );
}
