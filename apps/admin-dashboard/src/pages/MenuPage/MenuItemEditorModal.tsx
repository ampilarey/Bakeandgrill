import { useRef, useState, type ReactNode } from 'react';
import type { MenuCategory, MenuGroupRow } from '../../api';
import { useGstBootstrap } from '../../hooks/useGstBootstrap';
import { Btn, ErrorMsg, Input, Modal, ModalActions } from '../../components/SharedUI';
import { ItemSearch, type MenuItemSelection } from '../../components/ItemSearch';
import { Field, FormTextarea, ImageUploadField } from './menuFormPrimitives';
import {
  emptyPackagingOptionRow, emptyPlatterGroupRow, emptyVariantRow, SALES_CHANNELS,
  type ItemForm, type PlatterGroupRow, type VariantRow,
} from './menuItemForm';
import { PhotosTab } from './PhotosTab';
import { TagChipField, parseTagsCsv, tagsToCsv } from './TagChipField';
import { ItemSnoozeControls, type ItemSnoozeControlsHandle } from './ItemSnoozeControls';
import type { SnoozeUntil } from '../../api';
import { cardDescriptionPreview } from '@shared/utils';

function MenuCardLivePreview({ form }: { form: ItemForm }) {
  const previewName = (form.card_name.trim() || form.name.trim() || 'Item name');
  const previewDetail = (
    form.short_description.trim()
    || cardDescriptionPreview(form.description).text
    || 'Little detail line'
  );
  const price = Number.parseFloat(form.base_price);
  const priceLabel = Number.isFinite(price) ? `MVR ${price.toFixed(2)}` : 'MVR —';
  const note = form.price_note.trim();
  const img = form.thumb_url.trim() || form.image_url.trim();

  return (
    <div
      data-testid="menu-card-live-preview"
      className="mie-card-preview"
      style={{
        width: 148,
        padding: '12px 10px 14px',
        borderRadius: 14,
        border: '1px solid var(--color-border)',
        background: 'radial-gradient(120% 90% at 50% 0%, #F8E8D4 0%, #fff 55%)',
        textAlign: 'center',
        position: 'sticky',
        top: 8,
      }}
    >
      <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.04em' }}>
        LIVE CARD
      </p>
      <div
        style={{
          width: 112,
          height: 112,
          margin: '0 auto 10px',
          borderRadius: '50%',
          overflow: 'hidden',
          background: 'linear-gradient(145deg, #F3E6D4, var(--color-warning-bg))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {img ? (
          <img
            src={img}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ fontWeight: 800, color: 'var(--color-primary)', fontSize: 22 }}>
            {(previewName[0] || 'B').toUpperCase()}
          </span>
        )}
      </div>
      <p
        data-testid="menu-card-preview-name"
        style={{
          margin: '0 0 4px',
          fontSize: 13,
          fontWeight: 800,
          color: 'var(--color-text)',
          lineHeight: 1.25,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {previewName}
      </p>
      <p
        data-testid="menu-card-preview-detail"
        style={{
          margin: '0 0 6px',
          fontSize: 11,
          color: 'var(--color-text-muted)',
          lineHeight: 1.3,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {previewDetail}
      </p>
      <p data-testid="menu-card-preview-price" style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--color-text)' }}>
        {note ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', marginRight: 4 }}>{note}</span> : null}
        {priceLabel}
      </p>
    </div>
  );
}

const DIETARY_PRESETS = ['vegetarian', 'vegan', 'halal', 'gluten-free', 'spicy'] as const;
const ALLERGEN_PRESETS = ['nuts', 'dairy', 'gluten', 'eggs', 'soy', 'shellfish', 'fish', 'sesame'] as const;

function comboRowSelection(row: { item_id: string; item_name?: string }): MenuItemSelection | null {
  if (!row.item_id) return null;
  const id = Number(row.item_id);
  if (!Number.isFinite(id) || id <= 0) return null;
  const name = row.item_name || `Item #${id}`;
  return {
    id,
    label: name,
    item: {
      id,
      name,
      base_price: 0,
      is_available: true,
      is_active: true,
    },
  };
}

function platterRuleHint(group: PlatterGroupRow, hasSizes: boolean): string {
  if (hasSizes && group.rule_type === 'exactly') {
    return 'Set how many pieces for each size (e.g. 6 / 9 / 12). Prices come from the size variants above.';
  }
  if (group.rule_type === 'exactly') {
    const n = parseInt(group.choose_count, 10);
    return Number.isFinite(n) && n >= 1 ? `Customers must choose exactly ${n}.` : 'Customers must choose an exact count.';
  }
  if (group.rule_type === 'min') {
    const n = parseInt(group.min_count, 10);
    return Number.isFinite(n) && n >= 1 ? `Customers must choose at least ${n}.` : 'Customers must choose at least this many.';
  }
  const lo = parseInt(group.min_count, 10);
  const hi = parseInt(group.max_count, 10);
  if (Number.isFinite(lo) && Number.isFinite(hi)) {
    return `Customers choose between ${lo} and ${hi}.`;
  }
  return 'Customers choose within a min and max.';
}

function PlatterGroupsEditor({
  groups,
  variants,
  excludeItemId,
  onChange,
}: {
  groups: PlatterGroupRow[];
  variants: VariantRow[];
  excludeItemId?: number | null;
  onChange: (groups: PlatterGroupRow[]) => void;
}) {
  const hasSizes = variants.length > 0;
  const updateGroup = (idx: number, patch: Partial<PlatterGroupRow>) => {
    const next = [...groups];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="platter-groups-editor">
      <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.45 }}>
        Define what customers can pick. Example: one group named “Short eats” with “Choose any 6”.
        For 6 / 9 / 12 sizes, turn on variants above and set a count per size.
      </p>
      {groups.map((group, gIdx) => (
        <div
          key={group._key}
          style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: 12, background: 'var(--color-surface)' }}
          data-testid={`platter-group-${gIdx}`}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)' }}>
              Choice group {gIdx + 1}
            </span>
            <Btn variant="ghost" small onClick={() => onChange(groups.filter((_, i) => i !== gIdx))}>Remove</Btn>
          </div>
          <Field label="Group name">
            <Input
              value={group.name}
              onChange={(v) => updateGroup(gIdx, { name: v })}
              placeholder="e.g. Short eats"
            />
          </Field>
          <div style={{ marginTop: 10 }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Rule</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {([
                ['exactly', 'Choose exactly'],
                ['min', 'At least'],
                ['range', 'Between'],
              ] as const).map(([value, label]) => (
                <label key={value} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', minHeight: 40 }}>
                  <input
                    type="radio"
                    name={`platter-rule-${group._key}`}
                    checked={group.rule_type === value}
                    onChange={() => updateGroup(gIdx, { rule_type: value })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {group.rule_type === 'exactly' && !hasSizes && (
            <div style={{ marginTop: 10, maxWidth: 200 }}>
              <Field label="Choose any…">
                <Input
                  value={group.choose_count}
                  onChange={(v) => updateGroup(gIdx, { choose_count: v.replace(/[^\d]/g, '') })}
                  type="number"
                  placeholder="6"
                  data-testid={`platter-choose-count-${gIdx}`}
                />
              </Field>
            </div>
          )}
          {group.rule_type === 'exactly' && hasSizes && (
            <div style={{ marginTop: 10 }} data-testid={`platter-size-counts-${gIdx}`}>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                Pieces per size
              </p>
              <div className="form-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
                {variants.map((v) => {
                  const key = v.id != null ? String(v.id) : v._key;
                  return (
                    <Field key={key} label={v.name.trim() || 'Size'}>
                      <Input
                        value={group.size_counts[key] ?? ''}
                        onChange={(raw) => {
                          const nextCounts = { ...group.size_counts, [key]: raw.replace(/[^\d]/g, '') };
                          updateGroup(gIdx, { size_counts: nextCounts });
                        }}
                        type="number"
                        placeholder="6"
                      />
                    </Field>
                  );
                })}
              </div>
            </div>
          )}
          {group.rule_type === 'min' && (
            <div style={{ marginTop: 10, maxWidth: 200 }}>
              <Field label="Minimum to choose">
                <Input
                  value={group.min_count}
                  onChange={(v) => updateGroup(gIdx, { min_count: v.replace(/[^\d]/g, '') })}
                  type="number"
                  placeholder="2"
                />
              </Field>
            </div>
          )}
          {group.rule_type === 'range' && (
            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10, maxWidth: 320 }}>
              <Field label="Minimum">
                <Input
                  value={group.min_count}
                  onChange={(v) => updateGroup(gIdx, { min_count: v.replace(/[^\d]/g, '') })}
                  type="number"
                  placeholder="2"
                />
              </Field>
              <Field label="Maximum">
                <Input
                  value={group.max_count}
                  onChange={(v) => updateGroup(gIdx, { max_count: v.replace(/[^\d]/g, '') })}
                  type="number"
                  placeholder="6"
                />
              </Field>
            </div>
          )}
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
            {platterRuleHint(group, hasSizes)}
          </p>

          <p style={{ margin: '14px 0 8px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            Items they can pick
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {group.items.map((row, iIdx) => (
              <div key={iIdx} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)' }}>Item {iIdx + 1}</span>
                  <Btn
                    variant="ghost"
                    small
                    onClick={() => {
                      const items = group.items.filter((_, i) => i !== iIdx);
                      updateGroup(gIdx, { items: items.length ? items : [{ item_id: '', surcharge: '0' }] });
                    }}
                  >
                    Remove
                  </Btn>
                </div>
                <ItemSearch
                  kind="menu"
                  value={comboRowSelection(row)}
                  excludeIds={excludeItemId ? [excludeItemId] : []}
                  excludeCombos
                  placeholder="Search menu item…"
                  onChange={(sel) => {
                    const items = [...group.items];
                    items[iIdx] = {
                      ...items[iIdx],
                      item_id: sel ? String(sel.id) : '',
                      item_name: sel?.item.name,
                    };
                    updateGroup(gIdx, { items });
                  }}
                />
                <div style={{ marginTop: 8, maxWidth: 160 }}>
                  <Field label="Extra charge (MVR)">
                    <Input
                      value={row.surcharge}
                      onChange={(v) => {
                        const items = [...group.items];
                        items[iIdx] = { ...items[iIdx], surcharge: v };
                        updateGroup(gIdx, { items });
                      }}
                      type="number"
                      placeholder="0"
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>
          <Btn
            variant="secondary"
            small
            onClick={() => updateGroup(gIdx, { items: [...group.items, { item_id: '', surcharge: '0' }] })}
          >
            + Add item
          </Btn>
        </div>
      ))}
      <Btn variant="secondary" small onClick={() => onChange([...groups, emptyPlatterGroupRow()])}>
        + Add choice group
      </Btn>
    </div>
  );
}

const TAX_CODE_OPTIONS = [
  { value: 'standard_8', label: 'Standard rated (8%)' },
  { value: 'zero_rated', label: 'Zero rated' },
  { value: 'exempt', label: 'Exempt' },
  { value: 'out_of_scope', label: 'Out of scope' },
] as const;

const selectStyle: React.CSSProperties = {
  width: '100%', minHeight: 44, borderRadius: 8, border: '1px solid var(--color-border)',
  padding: '0 10px', fontSize: 14, fontFamily: 'inherit', background: 'var(--color-surface)',
  color: 'var(--color-text)', boxSizing: 'border-box',
};

function TaxCodeField({
  value,
  onChange,
  bootstrap,
}: {
  value: string;
  onChange: (v: string) => void;
  bootstrap: ReturnType<typeof useGstBootstrap>;
}) {
  const displayRate = value === 'standard_8' ? (bootstrap?.tax_rate_percent ?? 8) : 0;
  return (
    <Field label="Tax classification">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={selectStyle}
      >
        {TAX_CODE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.value === 'standard_8'
              ? `Standard rated (${bootstrap?.tax_rate_percent ?? 8}%)`
              : o.label}
          </option>
        ))}
      </select>
      {value === 'standard_8' && (
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4, display: 'block' }}>
          Rate from GST settings: {displayRate}% (read-only)
        </span>
      )}
    </Field>
  );
}

/**
 * One nudge of a size up or down the list.
 *
 * Named after the size rather than the row number so a screen reader says
 * "Move Large up" — a nameless row is one somebody has just added and not
 * filled in yet, so it falls back to its position.
 */
function MoveButton({
  direction, disabled, name, onClick,
}: {
  direction: 'up' | 'down';
  disabled: boolean;
  name: string;
  onClick: () => void;
}) {
  const label = `Move ${name.trim() || 'this size'} ${direction}`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={disabled ? undefined : label}
      style={{
        border: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
        borderRadius: 4,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.3 : 1,
        color: 'var(--color-text-secondary)',
        fontSize: 9,
        lineHeight: 1,
        padding: '2px 4px',
        width: 24,
      }}
    >
      {direction === 'up' ? '▲' : '▼'}
    </button>
  );
}

function VariantsEditor({
  rows, onChange,
}: { rows: VariantRow[]; onChange: (rows: VariantRow[]) => void }) {
  const update = (key: string, field: keyof VariantRow, val: unknown) =>
    onChange(rows.map((r) => (r._key === key ? { ...r, [field]: val } : r)));

  const remove = (key: string) => onChange(rows.filter((r) => r._key !== key));

  const addRow = () => onChange([...rows, emptyVariantRow()]);

  /**
   * Move a size up or down the list.
   *
   * The order here is the order the POS size popup, the website and the app
   * all show — the payload stamps sort_order from each row's position — but
   * until now the only way to change it was to type numbers into the Sort
   * column of the quick-edit sheet, which is not where anybody looks when
   * they are already staring at the list of sizes. Owner, 2026-09-01.
   */
  const move = (key: string, delta: -1 | 1) => {
    const from = rows.findIndex((r) => r._key === key);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= rows.length) return;

    const next = [...rows];
    [next[from], next[to]] = [next[to], next[from]];
    onChange(next);
  };

  const headerStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
  };
  const cellStyle: React.CSSProperties = { padding: '4px 0' };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Variants</label>
        <Btn variant="ghost" onClick={addRow} style={{ fontSize: 12, padding: '3px 10px' }}>+ Add variant</Btn>
      </div>
      {rows.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
          No variants yet. Click "+ Add variant" to start.
        </p>
      ) : (
        <div className="mie-variants-scroll" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ ...headerStyle, textAlign: 'center', paddingBottom: 6, width: 34 }} title="The order sizes appear on the till, the website and the app">Order</th>
                <th style={{ ...headerStyle, textAlign: 'left', paddingBottom: 6, minWidth: 100 }}>Name *</th>
                <th style={{ ...headerStyle, textAlign: 'right', paddingBottom: 6, minWidth: 72 }}>Price *</th>
                <th style={{ ...headerStyle, textAlign: 'right', paddingBottom: 6, minWidth: 72 }}>Cost</th>
                <th style={{ ...headerStyle, textAlign: 'left', paddingBottom: 6, minWidth: 90 }}>SKU</th>
                <th style={{ ...headerStyle, textAlign: 'right', paddingBottom: 6, minWidth: 56 }}>Stock</th>
                <th style={{ ...headerStyle, textAlign: 'right', paddingBottom: 6, minWidth: 56 }}>Alert at</th>
                <th style={{ ...headerStyle, textAlign: 'center', paddingBottom: 6, minWidth: 50 }}>Track</th>
                <th style={{ ...headerStyle, textAlign: 'right', paddingBottom: 6, minWidth: 56 }}>Uses</th>
                <th style={{ ...headerStyle, textAlign: 'center', paddingBottom: 6, minWidth: 50 }}>Active</th>
                <th style={{ paddingBottom: 6, minWidth: 30 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row._key} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                  <td style={{ ...cellStyle, textAlign: 'center', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center' }}>
                      <MoveButton
                        direction="up"
                        disabled={index === 0}
                        name={row.name}
                        onClick={() => move(row._key, -1)}
                      />
                      <MoveButton
                        direction="down"
                        disabled={index === rows.length - 1}
                        name={row.name}
                        onClick={() => move(row._key, 1)}
                      />
                    </div>
                  </td>
                  <td style={cellStyle}>
                    <input
                      value={row.name}
                      onChange={(e) => update(row._key, 'name', e.target.value)}
                      placeholder="e.g. Large"
                      style={{ width: '100%', border: '1px solid var(--color-border)', borderRadius: 6, padding: '5px 8px', fontSize: 12 }}
                    />
                  </td>
                  <td style={{ ...cellStyle, paddingLeft: 4 }}>
                    <input
                      type="number" min="0" step="0.01"
                      value={row.price}
                      onChange={(e) => update(row._key, 'price', parseFloat(e.target.value) || 0)}
                      style={{ width: 68, border: '1px solid var(--color-border)', borderRadius: 6, padding: '5px 6px', fontSize: 12, textAlign: 'right' }}
                    />
                  </td>
                  <td style={{ ...cellStyle, paddingLeft: 4 }}>
                    <input
                      type="number" min="0" step="0.01"
                      value={row.cost ?? ''}
                      onChange={(e) => update(row._key, 'cost', e.target.value !== '' ? parseFloat(e.target.value) : null)}
                      placeholder="—"
                      style={{ width: 68, border: '1px solid var(--color-border)', borderRadius: 6, padding: '5px 6px', fontSize: 12, textAlign: 'right' }}
                    />
                  </td>
                  <td style={{ ...cellStyle, paddingLeft: 4 }}>
                    <input
                      value={row.sku ?? ''}
                      onChange={(e) => update(row._key, 'sku', e.target.value || null)}
                      placeholder="optional"
                      style={{ width: 86, border: '1px solid var(--color-border)', borderRadius: 6, padding: '5px 6px', fontSize: 12 }}
                    />
                  </td>
                  <td style={{ ...cellStyle, paddingLeft: 4 }}>
                    <input
                      type="number" min="0" step="1"
                      value={row.stock_qty ?? 0}
                      onChange={(e) => update(row._key, 'stock_qty', parseInt(e.target.value) || 0)}
                      disabled={!row.track_stock}
                      style={{ width: 52, border: '1px solid var(--color-border)', borderRadius: 6, padding: '5px 6px', fontSize: 12, textAlign: 'right', opacity: row.track_stock ? 1 : 0.4 }}
                    />
                  </td>
                  <td style={{ ...cellStyle, paddingLeft: 4 }}>
                    <input
                      type="number" min="0" step="1"
                      value={row.low_stock_threshold ?? 5}
                      onChange={(e) => update(row._key, 'low_stock_threshold', parseInt(e.target.value) || 0)}
                      disabled={!row.track_stock}
                      title="Low-stock alert threshold"
                      style={{ width: 52, border: '1px solid var(--color-border)', borderRadius: 6, padding: '5px 6px', fontSize: 12, textAlign: 'right', opacity: row.track_stock ? 1 : 0.4 }}
                    />
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={!!row.track_stock}
                      onChange={(e) => update(row._key, 'track_stock', e.target.checked)}
                      title="Track stock for this variant"
                    />
                  </td>
                  <td style={{ ...cellStyle, paddingLeft: 4 }}>
                    <input
                      type="number" min="0" step="0.05"
                      value={row.consumption_factor ?? 1}
                      onChange={(e) => update(row._key, 'consumption_factor', e.target.value !== '' ? Math.max(0, parseFloat(e.target.value)) : 1)}
                      title="How much of the recipe one of this size uses — full 1, half 0.5. Lets sizes share one pool of ingredients."
                      style={{ width: 56, border: '1px solid var(--color-border)', borderRadius: 6, padding: '5px 6px', fontSize: 12, textAlign: 'right' }}
                    />
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={row.is_active}
                      onChange={(e) => update(row._key, 'is_active', e.target.checked)}
                      title="Active / visible"
                    />
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => remove(row._key)}
                      style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}
                      title="Remove variant"
                    >×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            The <strong>▲▼</strong> arrows set the order sizes appear in — on the till&rsquo;s size
            popup, on the website and in the app. Saved when you save the dish.
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            <strong>Uses</strong> is how much of the item&rsquo;s recipe one of this size takes —
            full <code>1</code>, half <code>0.5</code>. Sizes then share one pool of ingredients:
            50 leaves serve 50 fulls, 100 halves, or any mix. Set the recipe to
            &ldquo;stop selling when ingredients run out&rdquo; for it to affect the menu.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * The form in named sections, with a chip row at the top that jumps to
 * each one.
 *
 * Owner, 2026-09-02: "did u do the same for new item adding box". The
 * editor had grown to twenty-odd fields in one unbroken column: category
 * and menu group sat near the bottom under packaging and bundles, and the
 * Save button was the last thing on the page — off screen on a phone and
 * on a laptop alike until you had scrolled past everything. Now the
 * basics come first, every group has a heading, the chips take you
 * straight to a section, and Save lives in the dialog's own footer so it
 * is always in reach.
 */
type SectionId =
  | 'basics' | 'pricing' | 'card' | 'details' | 'selling' | 'photo' | 'stock' | 'packaging' | 'bundle' | 'signage';

const SECTIONS: Array<{ id: SectionId; label: string }> = [
  { id: 'basics', label: 'Basics' },
  { id: 'pricing', label: 'Price & sizes' },
  { id: 'card', label: 'Menu card' },
  { id: 'details', label: 'Details' },
  { id: 'selling', label: 'Where sold' },
  { id: 'photo', label: 'Photo' },
  { id: 'stock', label: 'Stock' },
  { id: 'packaging', label: 'Packaging' },
  { id: 'bundle', label: 'Bundle' },
  { id: 'signage', label: 'TV board' },
];

function Section({
  id, title, hint, children, register, testId,
}: {
  id: SectionId;
  title: string;
  hint?: string;
  children: ReactNode;
  register: (id: SectionId, el: HTMLElement | null) => void;
  testId?: string;
}) {
  return (
    <section
      ref={(el) => register(id, el)}
      className="mie-section"
      data-testid={testId ?? `mie-section-${id}`}
      aria-labelledby={`mie-${id}-title`}
    >
      <div className="mie-section-head">
        <h3 id={`mie-${id}-title`} className="mie-section-title">{title}</h3>
        {hint && <p className="mie-section-hint">{hint}</p>}
      </div>
      <div className="mie-section-body">{children}</div>
    </section>
  );
}

export function MenuItemEditorModal({
  initial, title, categories, menuGroups, onSave, onClose, itemId,
  snoozedUntil = null,
  reasonNote = null,
  onSnooze,
}: {
  initial: ItemForm;
  title: string;
  categories: MenuCategory[];
  menuGroups: MenuGroupRow[];
  onSave: (f: ItemForm) => Promise<void>;
  onClose: () => void;
  itemId?: number;
  snoozedUntil?: string | null;
  reasonNote?: string | null;
  onSnooze?: (
    until: SnoozeUntil,
    opts?: { until_date?: string; unavailable_reason_note?: string | null },
  ) => Promise<{ is_available?: boolean; snoozed_until?: string | null; unavailable_reason_note?: string | null } | void>;
}) {
  const [activeTab, setActiveTab] = useState<'details' | 'photos'>('details');
  const [form, setForm] = useState<ItemForm>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const snoozeRef = useRef<ItemSnoozeControlsHandle>(null);
  const sectionRefs = useRef<Partial<Record<SectionId, HTMLElement | null>>>({});
  const gstBootstrap = useGstBootstrap();
  const set = <K extends keyof ItemForm>(k: K, v: ItemForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const register = (id: SectionId, el: HTMLElement | null) => { sectionRefs.current[id] = el; };
  const jump = (id: SectionId) => {
    const el = sectionRefs.current[id];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  };

  /** Keep form.is_available aligned with snooze API so Save Item cannot undo indefinite. */
  const handleSnooze = async (
    until: SnoozeUntil,
    opts?: { until_date?: string; unavailable_reason_note?: string | null },
  ) => {
    const updated = await onSnooze?.(until, opts);
    if (updated && typeof updated.is_available === 'boolean') {
      set('is_available', updated.is_available);
    }
    return updated;
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Item name is required.'); return; }
    if (!form.has_variants) {
      const priceNum = parseFloat(form.base_price);
      if (!form.base_price || !Number.isFinite(priceNum) || priceNum < 0) { setError('Price must be a valid number (0 or more).'); return; }
    }
    if (form.has_variants && form.variants.length === 0) { setError('Add at least one variant, or turn off "This product has variants".'); return; }
    if (form.has_variants && form.variants.some((v) => !v.name.trim())) { setError('All variants must have a name.'); return; }
    if (form.is_combo && form.combo_mode === 'fixed') {
      const rows = form.combo_items.filter((row) => row.item_id !== '');
      if (rows.length === 0) { setError('Add at least one component item for this bundle.'); return; }
    }
    if (form.is_combo && form.combo_mode === 'choose') {
      const groups = form.platter_groups.filter(
        (g) => g.name.trim() !== '' || g.items.some((r) => r.item_id !== ''),
      );
      if (groups.length === 0) {
        setError('Add at least one choice group for this platter (e.g. “Choose any 6”).');
        return;
      }
      for (const g of groups) {
        const allowed = g.items.filter((r) => r.item_id !== '');
        if (allowed.length === 0) {
          setError(`Group “${g.name.trim() || 'untitled'}” needs at least one item customers can pick.`);
          return;
        }
        if (g.rule_type === 'exactly' && !form.has_variants) {
          const n = parseInt(g.choose_count, 10);
          if (!Number.isFinite(n) || n < 1) {
            setError(`Group “${g.name.trim() || 'untitled'}” needs a choose count (e.g. 6).`);
            return;
          }
        }
        if (form.has_variants && g.rule_type === 'exactly') {
          const named = form.variants.filter((v) => v.name.trim() !== '');
          const missing = named.filter((v) => {
            const key = v.id != null ? String(v.id) : v._key;
            const raw = g.size_counts[key] ?? g.size_counts[String(v.id ?? '')] ?? '';
            const n = parseInt(raw, 10);
            return !Number.isFinite(n) || n < 1;
          });
          if (missing.length > 0) {
            setError(`Set how many to choose for each size in “${g.name.trim() || 'untitled'}”.`);
            return;
          }
        }
      }
    }
    if (!form.has_variants && form.track_stock) {
      const qty = parseInt(form.stock_quantity, 10);
      if (!Number.isFinite(qty) || qty < 0) { setError('Quantity on hand must be 0 or more.'); return; }
    }
    setError(''); setLoading(true);
    try {
      // Only flush snooze when the user edited duration/note (not on every Save).
      let saveForm = form;
      if (itemId != null && onSnooze) {
        const snoozed = await snoozeRef.current?.applyCurrentIfDirty() as
          | { is_available?: boolean }
          | undefined;
        if (snoozed && typeof snoozed.is_available === 'boolean') {
          saveForm = { ...form, is_available: snoozed.is_available };
          set('is_available', snoozed.is_available);
        }
      }
      await onSave(saveForm);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '7px 16px', fontSize: 13, fontWeight: 600, border: 'none',
    borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
    background: 'none', cursor: 'pointer',
    color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
  });

  const sections = SECTIONS.filter((s) => s.id !== 'stock' || !form.has_variants);

  // The footer is the dialog's own, so it stays on screen however long the
  // form is. A validation message lands there too — next to the button that
  // produced it, rather than at the top of a form the person has just
  // scrolled to the bottom of.
  const footer = activeTab === 'details' ? (
    <div data-testid="mie-footer">
      {error && <ErrorMsg message={error} />}
      <ModalActions>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={handleSave} disabled={loading}>{loading ? 'Saving…' : 'Save Item'}</Btn>
      </ModalActions>
    </div>
  ) : (
    <ModalActions>
      <Btn variant="ghost" onClick={onClose}>Close</Btn>
    </ModalActions>
  );

  return (
    // 640 was the width of a simple form, and this stopped being one: it now
    // carries a sizes table of eight input columns, combo and platter builders,
    // channel toggles and a photo tab, all squeezed into a column narrower than
    // half a laptop screen while the space beside it sat empty. Owner,
    // 2026-09-01: "in desktop view, new item box is v small in width".
    //
    // Phones are unaffected — the global mobile rule forces the panel to
    // max-width:100vw as a bottom sheet, so this only lets it grow on a screen
    // that has the room.
    <Modal title={title} onClose={onClose} maxWidth={1040} footer={footer}>

      {itemId && (
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--color-border)', marginBottom: 12 }}>
          <button type="button" style={tabStyle(activeTab === 'details')} onClick={() => setActiveTab('details')}>Details</button>
          <button type="button" style={tabStyle(activeTab === 'photos')} onClick={() => setActiveTab('photos')}>Photos</button>
        </div>
      )}

      {activeTab === 'details' && (
        <div className="mie">
          <nav className="mie-nav" aria-label="Sections" data-testid="mie-nav">
            {sections.map((s) => (
              <button key={s.id} type="button" className="mie-nav-chip" onClick={() => jump(s.id)}>
                {s.label}
              </button>
            ))}
          </nav>

          <Section id="basics" title="Basics" register={register}>
            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Name (English) *">
                <Input value={form.name} onChange={(v) => set('name', v)} placeholder="e.g. Chicken Grill" />
              </Field>
              <Field label="Name (Dhivehi) — optional">
                <Input value={form.name_dv} onChange={(v) => set('name_dv', v)} placeholder="ދިވެހި" />
              </Field>
            </div>
            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Category">
                <select
                  value={form.category_id}
                  onChange={(e) => set('category_id', e.target.value)}
                  style={selectStyle}
                >
                  <option value="">— No category —</option>
                  {categories.filter((c) => !c.parent_id).map((parent) => (
                    <optgroup key={parent.id} label={parent.name}>
                      <option value={String(parent.id)}>{parent.name}</option>
                      {categories.filter((c) => c.parent_id === parent.id).map((sub) => (
                        <option key={sub.id} value={String(sub.id)}>{'↳ ' + sub.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {/* Owner, 2026-09-03: "Bajiya is Kulhi Hedhikaa, but it's an
                    evening tea item, so can it be in that too?" The category
                    above is the home — sort order, reports, station, stock.
                    These only add where else the menus list the same card. */}
                <details className="also-show-in" data-testid="also-show-in" style={{ marginTop: 8 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    Also show in
                    {form.extra_category_ids.length > 0 && (
                      <strong style={{ marginLeft: 6, color: 'var(--color-primary)' }}>
                        {form.extra_category_ids
                          .map((id) => categories.find((c) => c.id === id)?.name)
                          .filter(Boolean)
                          .join(', ')}
                      </strong>
                    )}
                  </summary>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 8 }}>
                    {categories
                      .filter((c) => String(c.id) !== form.category_id)
                      .map((c) => {
                        const parent = c.parent_id ? categories.find((p) => p.id === c.parent_id) : null;
                        const on = form.extra_category_ids.includes(c.id);
                        return (
                          <label
                            key={c.id}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
                              borderRadius: 999, border: `1px solid ${on ? 'var(--color-primary)' : 'var(--color-border)'}`,
                              background: on ? 'var(--color-primary-light)' : 'var(--color-surface)',
                              fontSize: 12, cursor: 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={(e) => set(
                                'extra_category_ids',
                                e.target.checked
                                  ? [...form.extra_category_ids, c.id]
                                  : form.extra_category_ids.filter((id) => id !== c.id),
                              )}
                              aria-label={`Also show in ${parent ? `${parent.name} › ` : ''}${c.name}`}
                            />
                            {parent ? `${parent.name} › ${c.name}` : c.name}
                          </label>
                        );
                      })}
                  </div>
                  <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--color-text-muted)' }}>
                    The same card appears under each of these as well. Reports, sort order and stock stay with the category above.
                  </p>
                </details>
              </Field>
              <Field label="Menu group (chef / station)">
                <select
                  value={form.menu_group_id}
                  onChange={(e) => set('menu_group_id', e.target.value)}
                  style={selectStyle}
                >
                  {menuGroups.map((g) => (
                    <option key={g.id} value={String(g.id)}>{g.name}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="SKU / Internal Code">
                <Input value={form.sku} onChange={(v) => set('sku', v)} placeholder="e.g. CHKGRL-01" />
              </Field>
              <Field label="Sort Order">
                <Input value={form.sort_order} onChange={(v) => set('sort_order', v)} type="number" placeholder="0" />
              </Field>
            </div>
          </Section>

          <Section
            id="pricing"
            title="Price & sizes"
            hint="A dish sold in sizes takes its price from the sizes; otherwise set one price here."
            register={register}
          >
            <label className="mie-toggle">
              <input
                type="checkbox"
                checked={form.has_variants}
                onChange={(e) => {
                  set('has_variants', e.target.checked);
                  if (e.target.checked && form.variants.length === 0) {
                    set('variants', [emptyVariantRow()]);
                  }
                }}
              />
              <span style={{ fontWeight: 600 }}>This product has variants</span>
              <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(e.g. sizes, portions)</span>
            </label>

            {form.has_variants ? (
              <>
                <VariantsEditor rows={form.variants} onChange={(rows) => set('variants', rows)} />
                <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <TaxCodeField value={form.tax_code} onChange={(v) => set('tax_code', v)} bootstrap={gstBootstrap} />
                </div>
              </>
            ) : (
              <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Price (MVR) *">
                  <Input value={form.base_price} onChange={(v) => set('base_price', v)} type="number" placeholder="0.00" />
                </Field>
                <TaxCodeField value={form.tax_code} onChange={(v) => set('tax_code', v)} bootstrap={gstBootstrap} />
              </div>
            )}
          </Section>

          <Section
            id="card"
            title="Menu card"
            hint="The compact card on the mobile menu: circular image, name, a little detail line and the price. Leave blank to fall back to the full name and description."
            register={register}
            testId="menu-card-display-section"
          >
            <div className="mie-card-grid">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
                <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field label="Card name (English)">
                    <Input
                      value={form.card_name}
                      onChange={(v) => set('card_name', v.slice(0, 120))}
                      placeholder={form.name || 'Falls back to name'}
                    />
                  </Field>
                  <Field label="Card name (Dhivehi)">
                    <Input
                      value={form.card_name_dv}
                      onChange={(v) => set('card_name_dv', v.slice(0, 120))}
                      placeholder={form.name_dv || 'Falls back to name (DV)'}
                    />
                  </Field>
                </div>
                <Field label="Short description (English)">
                  <FormTextarea
                    value={form.short_description}
                    onChange={(v) => set('short_description', v.slice(0, 140))}
                    placeholder="Little detail line on the mobile menu card"
                    rows={2}
                  />
                </Field>
                <p className="mie-count">
                  {form.short_description.length}/140 · little detail line on the mobile menu card
                </p>
                <Field label="Short description (Dhivehi)">
                  <FormTextarea
                    value={form.short_description_dv}
                    onChange={(v) => set('short_description_dv', v.slice(0, 140))}
                    placeholder="Optional Dhivehi detail line"
                    rows={2}
                  />
                </Field>
                <p className="mie-count">
                  {form.short_description_dv.length}/140
                </p>
                <Field label="Price note">
                  <Input
                    value={form.price_note}
                    onChange={(v) => set('price_note', v.slice(0, 40))}
                    placeholder='e.g. "from" / "per box"'
                  />
                </Field>
                <p className="mie-count">
                  {form.price_note.length}/40 · shown beside the price on the card
                </p>
              </div>
              <MenuCardLivePreview form={form} />
            </div>
          </Section>

          <Section
            id="details"
            title="Details"
            hint="What customers read when they open the item."
            register={register}
          >
            <Field label="Description">
              <FormTextarea
                value={form.description}
                onChange={(v) => set('description', v)}
                placeholder={"Full item description — customers see this when they open the item."}
                rows={6}
              />
            </Field>
            {(() => {
              const lines = form.description.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim()).length;
              return (
                <p className="mie-count">
                  {form.description.trim().length} characters · {lines} line{lines === 1 ? '' : 's'} ·
                  used as the card detail fallback when short description is empty
                </p>
              );
            })()}
            <Field label="Dietary tags">
              <TagChipField
                value={parseTagsCsv(form.dietary_tags)}
                onChange={(tags) => set('dietary_tags', tagsToCsv(tags))}
                presets={DIETARY_PRESETS}
                placeholder="Custom dietary tag…"
              />
            </Field>
            <p className="mie-count">
              Filter chips on the menu · also listed on the item detail sheet
            </p>
            <Field label="Allergens">
              <TagChipField
                value={parseTagsCsv(form.allergens)}
                onChange={(tags) => set('allergens', tagsToCsv(tags))}
                presets={ALLERGEN_PRESETS}
                placeholder="Custom allergen…"
              />
            </Field>
            <p className="mie-count">
              Shown as “Contains …” on the item detail sheet (not on the menu card)
            </p>
            <div className="form-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Field label="Spice level">
                <select
                  value={form.spice_level}
                  onChange={(e) => set('spice_level', e.target.value as ItemForm['spice_level'])}
                  style={selectStyle}
                >
                  <option value="none">None / not spicy</option>
                  <option value="mild">Mild</option>
                  <option value="medium">Medium</option>
                  <option value="hot">Hot</option>
                  <option value="extra_hot">Extra hot</option>
                </select>
              </Field>
              <Field label="Prep time (min)">
                <Input
                  value={form.prep_time_minutes}
                  onChange={(v) => set('prep_time_minutes', v)}
                  type="number"
                  placeholder="e.g. 15"
                />
              </Field>
              <Field label="Calories (optional)">
                <Input
                  value={form.calories}
                  onChange={(v) => set('calories', v.replace(/[^\d]/g, ''))}
                  type="number"
                  placeholder="e.g. 450"
                />
              </Field>
            </div>
          </Section>

          <Section
            id="selling"
            title="Where sold"
            hint="Which channels can order it, and whether it is on sale right now."
            register={register}
          >
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                Where can this be ordered? (channel matrix)
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 20px' }}>
                {SALES_CHANNELS.map(({ id, label }) => (
                  <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', minHeight: 44 }}>
                    <input
                      type="checkbox"
                      checked={!!form.channels[id]}
                      onChange={(e) => setForm((f) => ({
                        ...f,
                        channels: { ...f.channels, [id]: e.target.checked },
                      }))}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '8px 0 0', lineHeight: 1.45 }}>
                Immediate sale needs dine-in / takeaway / pickup / delivery. Catering alone = event menu only
                (not orderable at the till or online until you also enable an immediate channel). Delivery also
                needs the global delivery switch and active menu duty above.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
                On menu (exists in system)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_available} onChange={(e) => set('is_available', e.target.checked)} />
                Selling today (orderable now)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.allow_pre_order}
                  onChange={(e) => {
                    set('allow_pre_order', e.target.checked);
                    if (!e.target.checked) set('tomorrow_daily_capacity', '');
                  }}
                  data-testid="allow-pre-order-toggle"
                />
                Can be ordered for tomorrow
              </label>
            </div>
            {form.allow_pre_order && (
              <div style={{ maxWidth: 280 }} data-testid="tomorrow-daily-capacity-field">
                <Field label="Most you can make in a day">
                  <Input
                    value={form.tomorrow_daily_capacity}
                    onChange={(v) => set('tomorrow_daily_capacity', v.replace(/[^\d]/g, ''))}
                    placeholder="No limit"
                    data-testid="tomorrow-daily-capacity-input"
                  />
                </Field>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                  Leave blank for no limit. Counts every tomorrow order for this item across all customers.
                </p>
              </div>
            )}
            {itemId != null && onSnooze && (
              <ItemSnoozeControls
                ref={snoozeRef}
                canManage
                snoozedUntil={snoozedUntil}
                isAvailable={form.is_available}
                reasonNote={reasonNote}
                onSnooze={handleSnooze}
              />
            )}
          </Section>

          <Section id="photo" title="Photo" register={register}>
            <ImageUploadField
              value={form.image_url}
              originalValue={form.image_original_url}
              onChange={({ url, original_url, thumb_url, image_webp_url, thumb_webp_url }) => {
                set('image_url', url);
                set('image_original_url', original_url);
                set('thumb_url', thumb_url ?? '');
                set('image_webp_url', image_webp_url ?? '');
                set('thumb_webp_url', thumb_webp_url ?? '');
              }}
            />
          </Section>

          {!form.has_variants && (
            <Section
              id="stock"
              title="Stock"
              hint="Turn on for pre-made batches (e.g. 12 croissants ready). Leave off for made-to-order items."
              register={register}
            >
              <label className="mie-toggle">
                <input
                  type="checkbox"
                  checked={form.track_stock}
                  onChange={(e) => set('track_stock', e.target.checked)}
                />
                <span style={{ fontWeight: 600 }}>Track prepared quantity</span>
              </label>
              {form.track_stock && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                  <Field label="Quantity on hand">
                    <Input
                      value={form.stock_quantity}
                      onChange={(v) => set('stock_quantity', v.replace(/[^\d]/g, ''))}
                      placeholder="0"
                    />
                  </Field>
                  <Field label="Low-stock alert at">
                    <Input
                      value={form.low_stock_threshold}
                      onChange={(v) => set('low_stock_threshold', v.replace(/[^\d]/g, ''))}
                      placeholder="5"
                    />
                  </Field>
                </div>
              )}
            </Section>
          )}

          <Section
            id="packaging"
            title="Packaging"
            hint="Fallback applies when this item has no packaging options. Dine-in is never charged."
            register={register}
          >
            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Charge mode">
                <select
                  value={form.packaging_fee_mode}
                  onChange={(e) => set('packaging_fee_mode', e.target.value as 'per_unit' | 'per_line')}
                  style={selectStyle}
                >
                  <option value="per_unit">Per unit (× qty)</option>
                  <option value="per_line">Per line (once)</option>
                </select>
              </Field>
              <Field label="Fallback fee (MVR)">
                <Input value={form.packaging_fee} onChange={(v) => set('packaging_fee', v)} type="number" placeholder="0.00" />
              </Field>
            </div>
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Options (optional)</p>
              {form.packaging_options.map((row, idx) => (
                <div key={row._key} className="mie-pack-row">
                  <Field label={idx === 0 ? 'Name' : ' '}>
                    <Input
                      value={row.name}
                      onChange={(v) => {
                        const next = form.packaging_options.map((r, i) => (i === idx ? { ...r, name: v } : r));
                        set('packaging_options', next);
                      }}
                      placeholder="e.g. Standard bag"
                    />
                  </Field>
                  <Field label={idx === 0 ? 'Fee (MVR)' : ' '}>
                    <Input
                      value={row.fee}
                      onChange={(v) => {
                        const next = form.packaging_options.map((r, i) => (i === idx ? { ...r, fee: v } : r));
                        set('packaging_options', next);
                      }}
                      type="number"
                      placeholder="0.00"
                    />
                  </Field>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, minHeight: 44, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="packaging_default"
                      checked={row.is_default}
                      onChange={() => {
                        set(
                          'packaging_options',
                          form.packaging_options.map((r, i) => ({ ...r, is_default: i === idx })),
                        );
                      }}
                    />
                    Default
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const next = form.packaging_options.filter((_, i) => i !== idx);
                      if (next.length > 0 && !next.some((r) => r.is_default)) {
                        next[0] = { ...next[0], is_default: true };
                      }
                      set('packaging_options', next);
                    }}
                    style={{
                      minHeight: 44, border: '1px solid var(--color-border)', borderRadius: 8,
                      background: 'var(--color-surface)', cursor: 'pointer', fontSize: 16, color: 'var(--color-text-muted)',
                    }}
                    aria-label="Remove packaging option"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  const next = [
                    ...form.packaging_options,
                    emptyPackagingOptionRow(form.packaging_options.length === 0),
                  ];
                  set('packaging_options', next);
                }}
                className="mie-add-dashed"
              >
                + Add packaging option
              </button>
            </div>
          </Section>

          <Section
            id="bundle"
            title="Bundle / combo / platter"
            register={register}
            testId="bundle-platter-section"
          >
            <label className="mie-toggle">
              <input
                type="checkbox"
                checked={form.is_combo}
                onChange={(e) => {
                  set('is_combo', e.target.checked);
                  if (e.target.checked) {
                    if (form.combo_mode === 'fixed' && form.combo_items.length === 0) {
                      set('combo_items', [{ item_id: '', quantity: '1', is_optional: false, surcharge: '' }]);
                    }
                    if (form.combo_mode === 'choose' && form.platter_groups.length === 0) {
                      set('platter_groups', [emptyPlatterGroupRow()]);
                    }
                  }
                }}
              />
              <span style={{ fontWeight: 600 }}>Bundle / combo / platter</span>
            </label>
            {form.is_combo && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Field label="Bundle discount (%)">
                  <Input value={form.combo_discount_pct} onChange={(v) => set('combo_discount_pct', v)} type="number" placeholder="Optional" />
                </Field>
                <div>
                  <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600 }}>
                    How customers get what&apos;s inside
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', minHeight: 44 }}>
                      <input
                        type="radio"
                        name="combo_mode"
                        checked={form.combo_mode === 'fixed'}
                        onChange={() => {
                          set('combo_mode', 'fixed');
                          if (form.combo_items.length === 0) {
                            set('combo_items', [{ item_id: '', quantity: '1', is_optional: false, surcharge: '' }]);
                          }
                        }}
                      />
                      Fixed items (always the same)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', minHeight: 44 }}>
                      <input
                        type="radio"
                        name="combo_mode"
                        checked={form.combo_mode === 'choose'}
                        onChange={() => {
                          set('combo_mode', 'choose');
                          if (form.platter_groups.length === 0) {
                            set('platter_groups', [emptyPlatterGroupRow()]);
                          }
                        }}
                        data-testid="combo-mode-choose"
                      />
                      Build-your-own platter (customer chooses)
                    </label>
                  </div>
                </div>

                {form.combo_mode === 'fixed' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600 }}>Included items</p>
                    {form.combo_items.map((row, idx) => (
                      <div key={idx} style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: 10, background: 'var(--color-surface)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)' }}>Component {idx + 1}</span>
                          <Btn variant="ghost" small onClick={() => set('combo_items', form.combo_items.filter((_, i) => i !== idx))}>Remove</Btn>
                        </div>
                        <ItemSearch
                          kind="menu"
                          value={comboRowSelection(row)}
                          excludeIds={itemId ? [itemId] : []}
                          excludeCombos
                          placeholder="Search menu item…"
                          onChange={(sel) => {
                            const next = [...form.combo_items];
                            next[idx] = {
                              ...next[idx],
                              item_id: sel ? String(sel.id) : '',
                              item_name: sel?.item.name,
                            };
                            set('combo_items', next);
                          }}
                        />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginTop: 8, alignItems: 'center' }}>
                          <Input value={row.quantity} onChange={(v) => {
                            const next = [...form.combo_items];
                            next[idx] = { ...next[idx], quantity: v };
                            set('combo_items', next);
                          }} type="number" placeholder="Qty" />
                          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, whiteSpace: 'nowrap' }}>
                            <input type="checkbox" checked={row.is_optional} onChange={(e) => {
                              const next = [...form.combo_items];
                              next[idx] = { ...next[idx], is_optional: e.target.checked };
                              set('combo_items', next);
                            }} data-testid={`combo-optional-${idx}`} />
                            Optional
                          </label>
                        </div>
                        {/* An optional extra is now a real choice the customer
                            makes, so it needs a price of its own. Leave it at 0
                            and it is included, which is what every bundle did
                            before this existed. */}
                        {row.is_optional && (
                          <div style={{ marginTop: 8 }}>
                            <Input
                              label="Extra charge if taken (MVR)"
                              value={row.surcharge}
                              onChange={(v) => {
                                const next = [...form.combo_items];
                                next[idx] = { ...next[idx], surcharge: v };
                                set('combo_items', next);
                              }}
                              type="number"
                              placeholder="0.00"
                              // Two optional components would otherwise share
                              // an id derived from the label.
                              id={`combo-surcharge-${idx}`}
                              data-testid={`combo-surcharge-${idx}`}
                            />
                            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-muted)' }}>
                              Leave at 0 to include it free. The customer chooses whether to take it.
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                    <Btn variant="secondary" small onClick={() => set('combo_items', [...form.combo_items, { item_id: '', quantity: '1', is_optional: false, surcharge: '' }])}>
                      + Add component
                    </Btn>
                  </div>
                ) : (
                  <PlatterGroupsEditor
                    groups={form.platter_groups}
                    variants={form.has_variants ? form.variants : []}
                    excludeItemId={itemId}
                    onChange={(groups) => set('platter_groups', groups)}
                  />
                )}
              </div>
            )}
          </Section>

          <Section
            id="signage"
            title="TV signage board"
            hint="Items with a photo or an active discount already get their own slide. Feature an item that has neither."
            register={register}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.show_on_signage}
                onChange={(e) => set('show_on_signage', e.target.checked)}
              />
              <span style={{ fontWeight: 600 }}>Show on the TV board</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: form.show_on_signage ? 'pointer' : 'not-allowed', opacity: form.show_on_signage ? 1 : 0.5 }}>
              <input
                type="checkbox"
                disabled={!form.show_on_signage}
                checked={form.is_signage_promoted}
                onChange={(e) => set('is_signage_promoted', e.target.checked)}
              />
              <span style={{ fontWeight: 600 }}>Feature on its own slide</span>
            </label>
          </Section>
        </div>
      )}

      {activeTab === 'photos' && itemId && (
        <PhotosTab itemId={itemId} />
      )}
    </Modal>
  );
}
