import { useMemo, useState } from 'react';
import type { MenuCategory, MenuGroupRow, MenuItem } from '../../api';
import { bulkRowErrors, bulkUpdateItems, type BulkItemFields, type BulkRowErrors } from '../../api';
import { Btn, Card, EmptyState, Spinner } from '../../components/Layout';
import {
  countDirtyCells,
  draftsToChanges,
  fieldChanged,
  previewAction,
  type BulkAction,
  type Drafts,
  type PriceMode,
  type RoundMode,
} from './bulkEdit';

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
  items,
  categories,
  menuGroups,
  loading,
  canSeeCost,
  onSaved,
  onExit,
}: {
  items: MenuItem[];
  categories: MenuCategory[];
  menuGroups: MenuGroupRow[];
  loading: boolean;
  /** recipes.manage — the cost column is owner-only, as it is everywhere else. */
  canSeeCost: boolean;
  onSaved: (message: string) => void;
  onExit: () => void;
}) {
  const [drafts, setDrafts] = useState<Drafts>({});
  const [selected, setSelected] = useState<number[]>([]);
  const [rowErrors, setRowErrors] = useState<BulkRowErrors | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<BulkAction | null>(null);

  const [priceMode, setPriceMode] = useState<PriceMode>('increase_pct');
  const [priceValue, setPriceValue] = useState('10');
  const [roundMode, setRoundMode] = useState<RoundMode>('none');

  const changes = useMemo(() => draftsToChanges(items, drafts), [items, drafts]);
  const dirtyCells = useMemo(() => countDirtyCells(items, drafts), [items, drafts]);

  /** Which row index in the last save each item was — how errors map back. */
  const errorFor = (itemId: number, field: string): string[] | null => {
    if (!rowErrors) return null;
    const index = changes.findIndex((c) => c.id === itemId);
    if (index < 0) return null;

    return rowErrors[index]?.[field] ?? null;
  };

  const draftValue = <K extends keyof BulkItemFields>(item: MenuItem, field: K): unknown => {
    const draft = drafts[item.id];
    if (draft && field in draft) return draft[field];

    return (item as unknown as Record<string, unknown>)[field as string];
  };

  const isDirty = (item: MenuItem, field: keyof BulkItemFields): boolean => {
    const draft = drafts[item.id];
    if (!draft || !(field in draft)) return false;

    return fieldChanged(item, field, draft[field]);
  };

  const setField = (id: number, field: keyof BulkItemFields, value: unknown) => {
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? {}), [field]: value } }));
    // The old highlight is about the previous attempt; typing invalidates it.
    setRowErrors(null);
  };

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
    setRowErrors(null);
    setPending(null);
  };

  const save = async () => {
    if (changes.length === 0) return;
    setSaving(true);
    setError('');
    setRowErrors(null);
    try {
      const res = await bulkUpdateItems(changes);
      setDrafts({});
      setSelected([]);
      onSaved(res.message);
    } catch (e) {
      const rows = bulkRowErrors(e);
      if (rows) {
        setRowErrors(rows);
        setError((e as Error).message);
      } else {
        setError((e as Error).message);
      }
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setDrafts({});
    setRowErrors(null);
    setError('');
  };

  const previewRows = pending ? previewAction(selectedItems, pending) : [];
  const previewChanged = previewRows.filter((r) => Object.keys(r.fields).length > 0);

  if (loading && items.length === 0) return <Spinner />;
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
            : `${dirtyCells} unsaved change${dirtyCells === 1 ? '' : 's'} across ${changes.length} item${changes.length === 1 ? '' : 's'}`}
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

                return (
                  <tr
                    key={item.id}
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
                      <input
                        value={String(draftValue(item, 'name') ?? '')}
                        onChange={(e) => setField(item.id, 'name', e.target.value)}
                        aria-label={`Name for ${item.name}`}
                        style={inputStyle(isDirty(item, 'name'), !!nameErr)}
                      />
                      {nameErr && <FieldError messages={nameErr} />}
                    </td>
                    <td style={cell}>
                      <select
                        value={String(draftValue(item, 'category_id') ?? '')}
                        onChange={(e) => setField(item.id, 'category_id', e.target.value ? Number(e.target.value) : null)}
                        aria-label={`Category for ${item.name}`}
                        style={inputStyle(isDirty(item, 'category_id'), false)}
                      >
                        <option value="">—</option>
                        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td style={cell}>
                      <input
                        type="number" min="0" step="0.01"
                        value={String(draftValue(item, 'base_price') ?? '')}
                        onChange={(e) => setField(item.id, 'base_price', e.target.value === '' ? '' : Number(e.target.value))}
                        aria-label={`Price for ${item.name}`}
                        style={{ ...inputStyle(isDirty(item, 'base_price'), !!priceErr, 88), textAlign: 'right' }}
                      />
                      {priceErr && <FieldError messages={priceErr} />}
                    </td>
                    {canSeeCost && (
                      <td style={cell}>
                        <input
                          type="number" min="0" step="0.01"
                          value={String(draftValue(item, 'cost') ?? '')}
                          onChange={(e) => setField(item.id, 'cost', e.target.value === '' ? null : Number(e.target.value))}
                          aria-label={`Cost for ${item.name}`}
                          style={{ ...inputStyle(isDirty(item, 'cost'), !!costErr, 88), textAlign: 'right' }}
                        />
                        {costErr && <FieldError messages={costErr} />}
                      </td>
                    )}
                    <td style={cell}>
                      <input
                        value={String(draftValue(item, 'sku') ?? '')}
                        onChange={(e) => setField(item.id, 'sku', e.target.value || null)}
                        aria-label={`SKU for ${item.name}`}
                        style={inputStyle(isDirty(item, 'sku'), !!skuErr)}
                      />
                      {skuErr && <FieldError messages={skuErr} />}
                    </td>
                    <td style={cell}>
                      <select
                        value={String(draftValue(item, 'tax_code') ?? 'standard_8')}
                        onChange={(e) => setField(item.id, 'tax_code', e.target.value)}
                        aria-label={`GST for ${item.name}`}
                        style={inputStyle(isDirty(item, 'tax_code'), false)}
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
                          value={String(draftValue(item, 'stock_quantity') ?? 0)}
                          onChange={(e) => setField(item.id, 'stock_quantity', e.target.value === '' ? null : Number(e.target.value))}
                          aria-label={`Stock for ${item.name}`}
                          style={{ ...inputStyle(isDirty(item, 'stock_quantity'), false, 70), textAlign: 'right' }}
                        />
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={{ ...cell, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={!!draftValue(item, 'is_available')}
                        onChange={(e) => setField(item.id, 'is_available', e.target.checked)}
                        aria-label={`Available: ${item.name}`}
                        style={{ outline: isDirty(item, 'is_available') ? '2px solid var(--color-warning)' : 'none' }}
                      />
                    </td>
                    <td style={{ ...cell, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={!!draftValue(item, 'is_active')}
                        onChange={(e) => setField(item.id, 'is_active', e.target.checked)}
                        aria-label={`Active: ${item.name}`}
                        style={{ outline: isDirty(item, 'is_active') ? '2px solid var(--color-warning)' : 'none' }}
                      />
                    </td>
                    <td style={cell}>
                      <input
                        type="number" step="1"
                        value={String(draftValue(item, 'sort_order') ?? 0)}
                        onChange={(e) => setField(item.id, 'sort_order', e.target.value === '' ? null : Number(e.target.value))}
                        aria-label={`Sort order for ${item.name}`}
                        style={{ ...inputStyle(isDirty(item, 'sort_order'), false, 62), textAlign: 'right' }}
                      />
                    </td>
                  </tr>
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
