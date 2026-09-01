import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MenuCategory, MenuGroupRow, MenuItem, MenuVariant } from '../../api';
import {
  bulkRowErrors, bulkUpdateItems, fetchAdminItems,
  type BulkItemFields, type BulkRowErrors,
} from '../../api';
import { Btn, Card, EmptyState, Spinner } from '../../components/Layout';
import {
  allVariants,
  countDirtyCells,
  draftsToChanges,
  fieldChanged,
  previewAction,
  type BulkAction,
  type Drafts,
  type EditableRecord,
  type PriceMode,
  type RoundMode,
} from './bulkEdit';
import { csvFilename, csvToDrafts, itemsToCsv, parseCsv, type CsvImportResult } from './menuCsv';

/**
 * Spreadsheet-style editing for the menu.
 *
 * Owner, 2026-09-01: "all the items will be in a table like excel sheet and
 * seperatly edit like price ect,, and bulk edit for selected items, keep the
 * curent edit features for each item sepaatly."
 *
 * So this is deliberately NOT a replacement for the item editor — it carries
 * only the columns that are a single value per item. Anything composed
 * (variants, photos, combos, platters, channels) stays behind Edit, because a
 * grid cell cannot express it and the sparse save would have to guess.
 *
 * Nothing is written while you type. Edits collect as drafts, the button says
 * how many cells are pending, and one Save sends them together — the server
 * applies the batch in one transaction, so a rejected row leaves the menu
 * exactly as it was and comes back highlighted.
 */

const TAX_CODES: Array<{ value: string; label: string }> = [
  { value: 'standard_8', label: 'GST 8%' },
  { value: 'zero_rated', label: 'Zero-rated' },
  { value: 'exempt', label: 'Exempt' },
  { value: 'out_of_scope', label: 'Out of scope' },
];

const PRICE_MODES: Array<{ value: PriceMode; label: string }> = [
  { value: 'set', label: 'Set to' },
  { value: 'increase_pct', label: 'Increase by %' },
  { value: 'decrease_pct', label: 'Decrease by %' },
  { value: 'increase_amount', label: 'Increase by MVR' },
  { value: 'decrease_amount', label: 'Decrease by MVR' },
];

const ROUND_MODES: Array<{ value: RoundMode; label: string }> = [
  { value: 'none', label: 'No rounding' },
  { value: 'whole', label: 'Nearest 1.00' },
  { value: 'half', label: 'Nearest 0.50' },
  { value: 'five', label: 'Nearest 5.00' },
];

const cell: React.CSSProperties = { padding: '6px 8px', verticalAlign: 'middle' };
const head: React.CSSProperties = {
  padding: '10px 8px', textAlign: 'left', fontWeight: 700, fontSize: 11,
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
  /** recipes.manage — the cost column is owner-only, as it is everywhere else. */
  canSeeCost: boolean;
  onSaved: (message: string) => void;
  onExit: () => void;
  /** Tests inject a fixed set instead of walking the API. */
  initialItems?: MenuItem[];
}) {
  // A spreadsheet you have to paginate is not a spreadsheet, so the grid pulls
  // every item matching the current filter rather than the page behind it.
  // The API caps a page at 100, hence the walk.
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
  const [expanded, setExpanded] = useState<number[]>([]);
  const [csvNotice, setCsvNotice] = useState<CsvImportResult | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [rowErrors, setRowErrors] = useState<BulkRowErrors | null>(null);
  const [variantErrors, setVariantErrors] = useState<BulkRowErrors | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<BulkAction | null>(null);

  const [priceMode, setPriceMode] = useState<PriceMode>('increase_pct');
  const [priceValue, setPriceValue] = useState('10');
  const [roundMode, setRoundMode] = useState<RoundMode>('none');

  const variants = useMemo(() => allVariants(items), [items]);
  const changes = useMemo(() => draftsToChanges(items, drafts), [items, drafts]);
  const variantChanges = useMemo(
    () => draftsToChanges(variants, variantDrafts),
    [variants, variantDrafts],
  );
  const dirtyCells = useMemo(
    () => countDirtyCells(items, drafts) + countDirtyCells(variants, variantDrafts),
    [items, drafts, variants, variantDrafts],
  );
  const dirtyRows = changes.length + variantChanges.length;

  /** Which row index in the last save each row was — how errors map back. */
  const errorFor = (itemId: number, field: string): string[] | null => {
    if (!rowErrors) return null;
    const index = changes.findIndex((c) => c.id === itemId);
    if (index < 0) return null;

    return rowErrors[index]?.[field] ?? null;
  };

  const variantErrorFor = (variantId: number, field: string): string[] | null => {
    if (!variantErrors) return null;
    const index = variantChanges.findIndex((c) => c.id === variantId);
    if (index < 0) return null;

    return variantErrors[index]?.[field] ?? null;
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

  const setField = (id: number, field: keyof BulkItemFields, value: unknown) => {
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? {}), [field]: value } }));
    // The old highlight is about the previous attempt; typing invalidates it.
    setRowErrors(null);
    setVariantErrors(null);
  };

  const setVariantField = (id: number, field: string, value: unknown) => {
    setVariantDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? {}), [field]: value } as BulkItemFields }));
    setRowErrors(null);
    setVariantErrors(null);
  };

  const toggleExpanded = (id: number) =>
    setExpanded((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));

  const selectedItems = items.filter((i) => selected.includes(i.id));
  const allSelected = items.length > 0 && selected.length === items.length;

  const toggleAll = () => setSelected(allSelected ? [] : items.map((i) => i.id));
  const toggleOne = (id: number) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  /** Stage an action as drafts so it lands in the same preview-and-save flow. */
  const applyAction = (action: BulkAction) => {
    const rows = previewAction(selectedItems, action);
    setDrafts((d) => {
      const next = { ...d };
      for (const row of rows) {
        if (Object.keys(row.fields).length === 0) continue;
        next[row.item.id] = { ...(next[row.item.id] ?? {}), ...row.fields };
      }
      return next;
    });
    // A price move on a sized dish has to reach the sizes — the base price is
    // not what the customer is charged for a Full or a Half.
    if (action.kind === 'price') {
      const sized = selectedItems.filter((i) => (i.variants ?? []).length > 0);
      if (sized.length > 0) {
        setVariantDrafts((d) => {
          const next = { ...d };
          for (const item of sized) {
            for (const v of item.variants ?? []) {
              if (v.id == null) continue;
              const [row] = previewAction(
                [{ id: v.id, base_price: v.price } as unknown as MenuItem],
                action,
              );
              if (row.fields.base_price === undefined) continue;
              next[v.id] = { ...(next[v.id] ?? {}), price: row.fields.base_price } as BulkItemFields;
            }
          }
          return next;
        });
        setExpanded((e) => [...new Set([...e, ...sized.map((i) => i.id)])]);
      }
    }
    setRowErrors(null);
    setVariantErrors(null);
    setPending(null);
  };

  const save = async () => {
    if (changes.length === 0 && variantChanges.length === 0) return;
    setSaving(true);
    setError('');
    setRowErrors(null);
    setVariantErrors(null);
    try {
      const res = await bulkUpdateItems(changes, variantChanges);
      setDrafts({});
      setVariantDrafts({});
      setSelected([]);
      setCsvNotice(null);
      onSaved(res.message);
      await loadAll();
    } catch (e) {
      const rows = bulkRowErrors(e);
      if (rows) {
        setRowErrors(rows.items);
        setVariantErrors(rows.variants);
      }
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setDrafts({});
    setVariantDrafts({});
    setRowErrors(null);
    setVariantErrors(null);
    setError('');
    setCsvNotice(null);
  };

  const exportCsv = () => {
    const blob = new Blob([itemsToCsv(items, canSeeCost)], { type: 'text/csv;charset=utf-8' });
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
      const { header, rows } = parseCsv(await file.text());
      const result = csvToDrafts(rows, header, items, canSeeCost);
      setDrafts((d) => ({ ...d, ...result.drafts }));
      setVariantDrafts((d) => ({ ...d, ...result.variantDrafts }));
      setExpanded((e) => [
        ...new Set([...e, ...items.filter((i) => (i.variants ?? [])
          .some((v) => v.id != null && result.variantDrafts[v.id])).map((i) => i.id)]),
      ]);
      setCsvNotice(result);
      setRowErrors(null);
      setVariantErrors(null);
    } catch (e) {
      setError(`Could not read that file: ${(e as Error).message}`);
    }
  };

  const previewRows = pending ? previewAction(selectedItems, pending) : [];
  const previewChanged = previewRows.filter((r) => Object.keys(r.fields).length > 0);

  if (loading && items.length === 0) return <Spinner />;
  if (loadError && items.length === 0) {
    return <Card><EmptyState message={`Could not load the menu: ${loadError}`} /></Card>;
  }
  if (items.length === 0) {
    return <Card><EmptyState message="No items match this filter." /></Card>;
  }

  return (
    <>
      {/* Bulk-apply bar — one change to every ticked row. */}
      <Card style={{ padding: '14px 16px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 13, color: 'var(--color-text)' }} data-testid="quick-edit-selection">
            {selected.length === 0
              ? 'Tick rows to change them together'
              : `${selected.length} selected`}
          </strong>
          {selected.length > 0 && (
            <Btn small variant="secondary" onClick={() => setSelected([])}>Clear</Btn>
          )}
        </div>

        {selected.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
            <select
              value={priceMode}
              onChange={(e) => setPriceMode(e.target.value as PriceMode)}
              aria-label="Price change"
              style={{ padding: '7px 9px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 13, fontFamily: 'inherit' }}
            >
              {PRICE_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <input
              type="number" min="0" step="0.01"
              value={priceValue}
              onChange={(e) => setPriceValue(e.target.value)}
              aria-label="Price amount"
              style={{ width: 90, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 13, fontFamily: 'inherit', textAlign: 'right' }}
            />
            <select
              value={roundMode}
              onChange={(e) => setRoundMode(e.target.value as RoundMode)}
              aria-label="Rounding"
              style={{ padding: '7px 9px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 13, fontFamily: 'inherit' }}
            >
              {ROUND_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <Btn
              small
              onClick={() => setPending({
                kind: 'price',
                mode: priceMode,
                value: parseFloat(priceValue) || 0,
                round: roundMode,
              })}
            >
              Preview price change
            </Btn>

            <span style={{ width: 1, height: 26, background: 'var(--color-border)' }} />

            <select
              value=""
              aria-label="Move to category"
              onChange={(e) => e.target.value && setPending({ kind: 'category', categoryId: Number(e.target.value) })}
              style={{ padding: '7px 9px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 13, fontFamily: 'inherit' }}
            >
              <option value="">Move to category…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select
              value=""
              aria-label="Move to menu group"
              onChange={(e) => e.target.value && setPending({ kind: 'menu_group', menuGroupId: Number(e.target.value) })}
              style={{ padding: '7px 9px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 13, fontFamily: 'inherit' }}
            >
              <option value="">Move to menu group…</option>
              {menuGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <select
              value=""
              aria-label="Set GST treatment"
              onChange={(e) => e.target.value && setPending({ kind: 'tax_code', taxCode: e.target.value })}
              style={{ padding: '7px 9px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 13, fontFamily: 'inherit' }}
            >
              <option value="">Set GST…</option>
              {TAX_CODES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>

            <Btn small variant="secondary" onClick={() => setPending({ kind: 'is_available', value: true })}>Mark available</Btn>
            <Btn small variant="secondary" onClick={() => setPending({ kind: 'is_available', value: false })}>Mark sold out</Btn>
            <Btn small variant="secondary" onClick={() => setPending({ kind: 'is_active', value: false })}>Hide</Btn>
            <Btn small variant="secondary" onClick={() => setPending({ kind: 'is_active', value: true })}>Show</Btn>
          </div>
        )}
      </Card>

      {/* Preview — a bulk price move is the change nobody can undo by hand,
          so every affected row is shown before it becomes a pending edit. */}
      {pending && (
        <Card style={{ padding: '14px 16px', marginBottom: 14, borderColor: 'var(--color-warning)' }} data-testid="bulk-preview">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: 'var(--color-text)' }}>
            {previewChanged.length === 0
              ? 'Nothing would change'
              : `${previewChanged.length} of ${previewRows.length} selected item${previewRows.length === 1 ? '' : 's'} would change`}
          </div>
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

      {/* Spreadsheet round-trip. Export carries a byte-order mark so Excel does
          not mangle Dhivehi names, and import only ever updates rows it can
          match by id — it never creates or deletes. */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <Btn small variant="secondary" onClick={exportCsv} data-testid="csv-export">
          ⭳ Export CSV ({items.length} item{items.length === 1 ? '' : 's'})
        </Btn>
        <Btn small variant="secondary" onClick={() => fileInput.current?.click()} data-testid="csv-import">
          ⭱ Import CSV
        </Btn>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          data-testid="csv-file"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importCsv(file);
            e.target.value = '';
          }}
        />
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
          Edit in Excel, then import — changes land as pending cells below for you to check before saving.
        </span>
      </div>

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

      {/* Save bar. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14,
        padding: '10px 14px', borderRadius: 10,
        background: dirtyCells > 0 ? 'var(--color-warning-bg)' : 'var(--color-bg)',
        border: `1px solid ${dirtyCells > 0 ? 'var(--color-warning)' : 'var(--color-border)'}`,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }} data-testid="quick-edit-dirty">
          {dirtyCells === 0
            ? 'No unsaved changes'
            : `${dirtyCells} unsaved change${dirtyCells === 1 ? '' : 's'} across ${dirtyRows} row${dirtyRows === 1 ? '' : 's'}`}
        </span>
        <div style={{ flex: 1 }} />
        <Btn small variant="secondary" onClick={discard} disabled={dirtyCells === 0 || saving}>Discard</Btn>
        <Btn small onClick={() => void save()} disabled={dirtyCells === 0 || saving}>
          {saving ? 'Saving…' : `Save ${dirtyCells || ''}`.trim()}
        </Btn>
        <Btn small variant="secondary" onClick={onExit}>Done</Btn>
      </div>

      {error && (
        <div
          data-testid="quick-edit-error"
          style={{
            marginBottom: 14, padding: '10px 14px', borderRadius: 10, fontSize: 13,
            color: 'var(--color-danger)', background: 'var(--color-danger-bg)',
            border: '1px solid var(--color-danger)',
          }}
        >
          {error} Nothing was saved — fix the highlighted cells and press Save again.
        </div>
      )}

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-scroll">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ ...head, width: 34 }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all rows"
                  />
                </th>
                <th style={{ ...head, minWidth: 180 }}>Name</th>
                <th style={{ ...head, minWidth: 150 }}>Category</th>
                <th style={{ ...head, minWidth: 90 }}>Price</th>
                {canSeeCost && <th style={{ ...head, minWidth: 90 }}>Cost</th>}
                <th style={{ ...head, minWidth: 110 }}>SKU</th>
                <th style={{ ...head, minWidth: 120 }}>GST</th>
                <th style={{ ...head, minWidth: 80 }}>Stock</th>
                <th style={{ ...head, width: 70 }}>Avail</th>
                <th style={{ ...head, width: 70 }}>Active</th>
                <th style={{ ...head, width: 70 }}>Sort</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const nameErr = errorFor(item.id, 'name');
                const priceErr = errorFor(item.id, 'base_price');
                const costErr = errorFor(item.id, 'cost');
                const skuErr = errorFor(item.id, 'sku');
                const sizes = (item.variants ?? []).slice()
                  .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
                // Sizes stay folded away by default so a menu of sized dishes
                // is still readable; a dirty or rejected size forces them open.
                const hasPendingSize = sizes.some((v) => v.id != null && variantDrafts[v.id]);
                const isOpen = expanded.includes(item.id) || hasPendingSize;

                return (
                  <Fragment key={item.id}>
                  <tr
                    data-testid={`quick-edit-row-${item.id}`}
                    style={{
                      borderBottom: '1px solid var(--color-border-light)',
                      background: selected.includes(item.id) ? 'var(--color-bg)' : undefined,
                    }}
                  >
                    <td style={cell}>
                      <input
                        type="checkbox"
                        checked={selected.includes(item.id)}
                        onChange={() => toggleOne(item.id)}
                        aria-label={`Select ${item.name}`}
                      />
                    </td>
                    <td style={cell}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {sizes.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => toggleExpanded(item.id)}
                            aria-label={`${isOpen ? 'Hide' : 'Show'} sizes for ${item.name}`}
                            aria-expanded={isOpen}
                            style={{
                              border: '1px solid var(--color-border)', background: 'var(--color-surface)',
                              borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700,
                              padding: '3px 6px', color: 'var(--color-text-secondary)', flexShrink: 0,
                              minWidth: 34,
                            }}
                          >
                            {isOpen ? '▾' : '▸'} {sizes.length}
                          </button>
                        ) : (
                          <span style={{ width: 34, flexShrink: 0 }} />
                        )}
                        <input
                          value={String(draftValue(item, 'name', drafts) ?? '')}
                          onChange={(e) => setField(item.id, 'name', e.target.value)}
                          aria-label={`Name for ${item.name}`}
                          style={inputStyle(isDirty(item, 'name', drafts), !!nameErr)}
                        />
                      </div>
                      {nameErr && <FieldError messages={nameErr} />}
                    </td>
                    <td style={cell}>
                      <select
                        value={String(draftValue(item, 'category_id', drafts) ?? '')}
                        onChange={(e) => setField(item.id, 'category_id', e.target.value ? Number(e.target.value) : null)}
                        aria-label={`Category for ${item.name}`}
                        style={inputStyle(isDirty(item, 'category_id', drafts), false)}
                      >
                        <option value="">—</option>
                        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td style={cell}>
                      <input
                        type="number" min="0" step="0.01"
                        value={String(draftValue(item, 'base_price', drafts) ?? '')}
                        onChange={(e) => setField(item.id, 'base_price', e.target.value === '' ? '' : Number(e.target.value))}
                        aria-label={`Price for ${item.name}`}
                        style={{ ...inputStyle(isDirty(item, 'base_price', drafts), !!priceErr, 88), textAlign: 'right' }}
                      />
                      {priceErr && <FieldError messages={priceErr} />}
                    </td>
                    {canSeeCost && (
                      <td style={cell}>
                        <input
                          type="number" min="0" step="0.01"
                          value={String(draftValue(item, 'cost', drafts) ?? '')}
                          onChange={(e) => setField(item.id, 'cost', e.target.value === '' ? null : Number(e.target.value))}
                          aria-label={`Cost for ${item.name}`}
                          style={{ ...inputStyle(isDirty(item, 'cost', drafts), !!costErr, 88), textAlign: 'right' }}
                        />
                        {costErr && <FieldError messages={costErr} />}
                      </td>
                    )}
                    <td style={cell}>
                      <input
                        value={String(draftValue(item, 'sku', drafts) ?? '')}
                        onChange={(e) => setField(item.id, 'sku', e.target.value || null)}
                        aria-label={`SKU for ${item.name}`}
                        style={inputStyle(isDirty(item, 'sku', drafts), !!skuErr)}
                      />
                      {skuErr && <FieldError messages={skuErr} />}
                    </td>
                    <td style={cell}>
                      <select
                        value={String(draftValue(item, 'tax_code', drafts) ?? 'standard_8')}
                        onChange={(e) => setField(item.id, 'tax_code', e.target.value)}
                        aria-label={`GST for ${item.name}`}
                        style={inputStyle(isDirty(item, 'tax_code', drafts), false)}
                      >
                        {TAX_CODES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </td>
                    <td style={cell}>
                      {/* Stock only means anything while the item tracks it —
                          the full editor is where tracking gets turned on. */}
                      {item.track_stock ? (
                        <input
                          type="number" min="0" step="1"
                          value={String(draftValue(item, 'stock_quantity', drafts) ?? 0)}
                          onChange={(e) => setField(item.id, 'stock_quantity', e.target.value === '' ? null : Number(e.target.value))}
                          aria-label={`Stock for ${item.name}`}
                          style={{ ...inputStyle(isDirty(item, 'stock_quantity', drafts), false, 70), textAlign: 'right' }}
                        />
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={{ ...cell, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={!!draftValue(item, 'is_available', drafts)}
                        onChange={(e) => setField(item.id, 'is_available', e.target.checked)}
                        aria-label={`Available: ${item.name}`}
                        style={{ outline: isDirty(item, 'is_available', drafts) ? '2px solid var(--color-warning)' : 'none' }}
                      />
                    </td>
                    <td style={{ ...cell, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={!!draftValue(item, 'is_active', drafts)}
                        onChange={(e) => setField(item.id, 'is_active', e.target.checked)}
                        aria-label={`Active: ${item.name}`}
                        style={{ outline: isDirty(item, 'is_active', drafts) ? '2px solid var(--color-warning)' : 'none' }}
                      />
                    </td>
                    <td style={cell}>
                      <input
                        type="number" step="1"
                        value={String(draftValue(item, 'sort_order', drafts) ?? 0)}
                        onChange={(e) => setField(item.id, 'sort_order', e.target.value === '' ? null : Number(e.target.value))}
                        aria-label={`Sort order for ${item.name}`}
                        style={{ ...inputStyle(isDirty(item, 'sort_order', drafts), false, 62), textAlign: 'right' }}
                      />
                    </td>
                  </tr>
                  {isOpen && sizes.map((v) => (
                    <VariantRow
                      key={v.id}
                      variant={v}
                      itemName={item.name}
                      canSeeCost={canSeeCost}
                      draftValue={(field) => draftValue(v as unknown as EditableRecord, field, variantDrafts)}
                      isDirty={(field) => isDirty(v as unknown as EditableRecord, field, variantDrafts)}
                      errorFor={(field) => variantErrorFor(v.id as number, field)}
                      onChange={(field, value) => setVariantField(v.id as number, field, value)}
                    />
                  ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '10px 0 0', lineHeight: 1.6 }}>
        Photos, variants, combos, platters, channels and descriptions are not editable here —
        use <strong>Edit</strong> on the normal list for those. Only the cells you change are
        saved, so this will not overwrite anything somebody else is editing.
      </p>
    </>
  );
}

function FieldError({ messages }: { messages: string[] }) {
  return (
    <div style={{ fontSize: 11, color: 'var(--color-danger)', marginTop: 3, lineHeight: 1.4 }}>
      {messages[0]}
    </div>
  );
}

/**
 * One size, shown indented under its dish.
 *
 * Sizes carry the price the customer actually pays on a variant item, so a
 * repricing that stopped at the item row would miss the real number. The
 * consumption factor is here too because it belongs to the same mental task:
 * "Half is 0.5 of a portion and costs 12."
 */
function VariantRow({
  variant,
  itemName,
  canSeeCost,
  draftValue,
  isDirty,
  errorFor,
  onChange,
}: {
  variant: MenuVariant;
  itemName: string;
  canSeeCost: boolean;
  draftValue: (field: string) => unknown;
  isDirty: (field: string) => boolean;
  errorFor: (field: string) => string[] | null;
  onChange: (field: string, value: unknown) => void;
}) {
  const label = `${itemName} — ${variant.name}`;
  const priceErr = errorFor('price');
  const skuErr = errorFor('sku');

  return (
    <tr
      data-testid={`quick-edit-size-${variant.id}`}
      style={{ borderBottom: '1px solid var(--color-border-light)', background: 'var(--color-bg)' }}
    >
      <td style={cell} />
      <td style={cell}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 34 }}>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 12, flexShrink: 0 }}>↳</span>
          <input
            value={String(draftValue('name') ?? '')}
            onChange={(e) => onChange('name', e.target.value)}
            aria-label={`Size name for ${label}`}
            style={inputStyle(isDirty('name'), false)}
          />
        </div>
      </td>
      <td style={{ ...cell, fontSize: 11, color: 'var(--color-text-muted)' }}>size</td>
      <td style={cell}>
        <input
          type="number" min="0" step="0.01"
          value={String(draftValue('price') ?? '')}
          onChange={(e) => onChange('price', e.target.value === '' ? '' : Number(e.target.value))}
          aria-label={`Price for ${label}`}
          style={{ ...inputStyle(isDirty('price'), !!priceErr, 88), textAlign: 'right' }}
        />
        {priceErr && <FieldError messages={priceErr} />}
      </td>
      {canSeeCost && (
        <td style={cell}>
          <input
            type="number" min="0" step="0.01"
            value={String(draftValue('cost') ?? '')}
            onChange={(e) => onChange('cost', e.target.value === '' ? null : Number(e.target.value))}
            aria-label={`Cost for ${label}`}
            style={{ ...inputStyle(isDirty('cost'), !!errorFor('cost'), 88), textAlign: 'right' }}
          />
        </td>
      )}
      <td style={cell}>
        <input
          value={String(draftValue('sku') ?? '')}
          onChange={(e) => onChange('sku', e.target.value || null)}
          aria-label={`SKU for ${label}`}
          style={inputStyle(isDirty('sku'), !!skuErr)}
        />
        {skuErr && <FieldError messages={skuErr} />}
      </td>
      <td style={{ ...cell, fontSize: 11, color: 'var(--color-text-muted)' }}>
        {/* GST is a property of the dish, not of one of its sizes. */}
        follows item
      </td>
      <td style={cell}>
        {variant.track_stock ? (
          <input
            type="number" min="0" step="1"
            value={String(draftValue('stock_qty') ?? 0)}
            onChange={(e) => onChange('stock_qty', e.target.value === '' ? null : Number(e.target.value))}
            aria-label={`Stock for ${label}`}
            style={{ ...inputStyle(isDirty('stock_qty'), false, 70), textAlign: 'right' }}
          />
        ) : (
          <input
            type="number" min="0" step="0.05"
            value={String(draftValue('consumption_factor') ?? 1)}
            onChange={(e) => onChange('consumption_factor', e.target.value === '' ? 1 : Math.max(0, Number(e.target.value)))}
            aria-label={`Uses for ${label}`}
            title="How much of the recipe one of this size uses — full 1, half 0.5"
            style={{ ...inputStyle(isDirty('consumption_factor'), false, 70), textAlign: 'right' }}
          />
        )}
      </td>
      <td style={{ ...cell, textAlign: 'center', fontSize: 11, color: 'var(--color-text-muted)' }}>—</td>
      <td style={{ ...cell, textAlign: 'center' }}>
        <input
          type="checkbox"
          checked={!!draftValue('is_active')}
          onChange={(e) => onChange('is_active', e.target.checked)}
          aria-label={`Active: ${label}`}
          style={{ outline: isDirty('is_active') ? '2px solid var(--color-warning)' : 'none' }}
        />
      </td>
      <td style={cell}>
        <input
          type="number" step="1"
          value={String(draftValue('sort_order') ?? 0)}
          onChange={(e) => onChange('sort_order', e.target.value === '' ? null : Number(e.target.value))}
          aria-label={`Sort order for ${label}`}
          style={{ ...inputStyle(isDirty('sort_order'), false, 62), textAlign: 'right' }}
        />
      </td>
    </tr>
  );
}
