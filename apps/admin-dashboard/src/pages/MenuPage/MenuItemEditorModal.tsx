import { useState } from 'react';
import type { MenuCategory, MenuGroupRow } from '../../api';
import { useGstBootstrap } from '../../hooks/useGstBootstrap';
import { Btn, ErrorMsg, Input, Modal } from '../../components/Layout';
import { ItemSearch, type MenuItemSelection } from '../../components/ItemSearch';
import { Field, FormTextarea, ImageUploadField } from './menuFormPrimitives';
import {
  emptyPackagingOptionRow, emptyVariantRow, SALES_CHANNELS, type ItemForm, type VariantRow,
} from './menuItemForm';
import { PhotosTab } from './PhotosTab';
import { TagChipField, parseTagsCsv, tagsToCsv } from './TagChipField';
import { cardDescriptionPreview } from '@shared/utils';

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

const TAX_CODE_OPTIONS = [
  { value: 'standard_8', label: 'Standard rated (8%)' },
  { value: 'zero_rated', label: 'Zero rated' },
  { value: 'exempt', label: 'Exempt' },
  { value: 'out_of_scope', label: 'Out of scope' },
] as const;

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
        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #E8DDD0', fontSize: 14 }}
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
        <span style={{ fontSize: 11, color: '#9C8E7E', marginTop: 4, display: 'block' }}>
          Rate from GST settings: {displayRate}% (read-only)
        </span>
      )}
    </Field>
  );
}

function VariantsEditor({
  rows, onChange,
}: { rows: VariantRow[]; onChange: (rows: VariantRow[]) => void }) {
  const update = (key: string, field: keyof VariantRow, val: unknown) =>
    onChange(rows.map((r) => (r._key === key ? { ...r, [field]: val } : r)));

  const remove = (key: string) => onChange(rows.filter((r) => r._key !== key));

  const addRow = () => onChange([...rows, emptyVariantRow()]);

  const headerStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em',
  };
  const cellStyle: React.CSSProperties = { padding: '4px 0' };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F' }}>Variants</label>
        <Btn variant="ghost" onClick={addRow} style={{ fontSize: 12, padding: '3px 10px' }}>+ Add variant</Btn>
      </div>
      {rows.length === 0 ? (
        <p style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
          No variants yet. Click "+ Add variant" to start.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E8E0D8' }}>
                <th style={{ ...headerStyle, textAlign: 'left', paddingBottom: 6, minWidth: 100 }}>Name *</th>
                <th style={{ ...headerStyle, textAlign: 'right', paddingBottom: 6, minWidth: 72 }}>Price *</th>
                <th style={{ ...headerStyle, textAlign: 'right', paddingBottom: 6, minWidth: 72 }}>Cost</th>
                <th style={{ ...headerStyle, textAlign: 'left', paddingBottom: 6, minWidth: 90 }}>SKU</th>
                <th style={{ ...headerStyle, textAlign: 'right', paddingBottom: 6, minWidth: 56 }}>Stock</th>
                <th style={{ ...headerStyle, textAlign: 'right', paddingBottom: 6, minWidth: 56 }}>Alert at</th>
                <th style={{ ...headerStyle, textAlign: 'center', paddingBottom: 6, minWidth: 50 }}>Track</th>
                <th style={{ ...headerStyle, textAlign: 'center', paddingBottom: 6, minWidth: 50 }}>Active</th>
                <th style={{ paddingBottom: 6, minWidth: 30 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._key} style={{ borderBottom: '1px solid #F0EBE5' }}>
                  <td style={cellStyle}>
                    <input
                      value={row.name}
                      onChange={(e) => update(row._key, 'name', e.target.value)}
                      placeholder="e.g. Large"
                      style={{ width: '100%', border: '1px solid #E8E0D8', borderRadius: 6, padding: '5px 8px', fontSize: 12 }}
                    />
                  </td>
                  <td style={{ ...cellStyle, paddingLeft: 4 }}>
                    <input
                      type="number" min="0" step="0.01"
                      value={row.price}
                      onChange={(e) => update(row._key, 'price', parseFloat(e.target.value) || 0)}
                      style={{ width: 68, border: '1px solid #E8E0D8', borderRadius: 6, padding: '5px 6px', fontSize: 12, textAlign: 'right' }}
                    />
                  </td>
                  <td style={{ ...cellStyle, paddingLeft: 4 }}>
                    <input
                      type="number" min="0" step="0.01"
                      value={row.cost ?? ''}
                      onChange={(e) => update(row._key, 'cost', e.target.value !== '' ? parseFloat(e.target.value) : null)}
                      placeholder="—"
                      style={{ width: 68, border: '1px solid #E8E0D8', borderRadius: 6, padding: '5px 6px', fontSize: 12, textAlign: 'right' }}
                    />
                  </td>
                  <td style={{ ...cellStyle, paddingLeft: 4 }}>
                    <input
                      value={row.sku ?? ''}
                      onChange={(e) => update(row._key, 'sku', e.target.value || null)}
                      placeholder="optional"
                      style={{ width: 86, border: '1px solid #E8E0D8', borderRadius: 6, padding: '5px 6px', fontSize: 12 }}
                    />
                  </td>
                  <td style={{ ...cellStyle, paddingLeft: 4 }}>
                    <input
                      type="number" min="0" step="1"
                      value={row.stock_qty ?? 0}
                      onChange={(e) => update(row._key, 'stock_qty', parseInt(e.target.value) || 0)}
                      disabled={!row.track_stock}
                      style={{ width: 52, border: '1px solid #E8E0D8', borderRadius: 6, padding: '5px 6px', fontSize: 12, textAlign: 'right', opacity: row.track_stock ? 1 : 0.4 }}
                    />
                  </td>
                  <td style={{ ...cellStyle, paddingLeft: 4 }}>
                    <input
                      type="number" min="0" step="1"
                      value={row.low_stock_threshold ?? 5}
                      onChange={(e) => update(row._key, 'low_stock_threshold', parseInt(e.target.value) || 0)}
                      disabled={!row.track_stock}
                      title="Low-stock alert threshold"
                      style={{ width: 52, border: '1px solid #E8E0D8', borderRadius: 6, padding: '5px 6px', fontSize: 12, textAlign: 'right', opacity: row.track_stock ? 1 : 0.4 }}
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
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}
                      title="Remove variant"
                    >×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function MenuItemEditorModal({
  initial, title, categories, menuGroups, onSave, onClose, itemId,
}: {
  initial: ItemForm;
  title: string;
  categories: MenuCategory[];
  menuGroups: MenuGroupRow[];
  onSave: (f: ItemForm) => Promise<void>;
  onClose: () => void;
  itemId?: number;
}) {
  const [activeTab, setActiveTab] = useState<'details' | 'photos'>('details');
  const [form, setForm] = useState<ItemForm>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const gstBootstrap = useGstBootstrap();
  const set = <K extends keyof ItemForm>(k: K, v: ItemForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Item name is required.'); return; }
    if (!form.has_variants) {
      const priceNum = parseFloat(form.base_price);
      if (!form.base_price || !Number.isFinite(priceNum) || priceNum < 0) { setError('Price must be a valid number (0 or more).'); return; }
    }
    if (form.has_variants && form.variants.length === 0) { setError('Add at least one variant, or turn off "This product has variants".'); return; }
    if (form.has_variants && form.variants.some((v) => !v.name.trim())) { setError('All variants must have a name.'); return; }
    if (form.is_combo && !form.has_variants) {
      const rows = form.combo_items.filter((row) => row.item_id !== '');
      if (rows.length === 0) { setError('Add at least one component item for this bundle.'); return; }
    }
    if (!form.has_variants && form.track_stock) {
      const qty = parseInt(form.stock_quantity, 10);
      if (!Number.isFinite(qty) || qty < 0) { setError('Quantity on hand must be 0 or more.'); return; }
    }
    setError(''); setLoading(true);
    try { await onSave(form); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '7px 16px', fontSize: 13, fontWeight: 600, border: 'none',
    borderBottom: active ? '2px solid #D4813A' : '2px solid transparent',
    background: 'none', cursor: 'pointer',
    color: active ? '#D4813A' : '#9C8E7E',
  });

  return (
    <Modal title={title} onClose={onClose} maxWidth={640}>

      {itemId && (
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #E8E0D8', marginBottom: 20 }}>
          <button type="button" style={tabStyle(activeTab === 'details')} onClick={() => setActiveTab('details')}>Details</button>
          <button type="button" style={tabStyle(activeTab === 'photos')} onClick={() => setActiveTab('photos')}>Photos</button>
        </div>
      )}

      {activeTab === 'details' && (
        <>
          {error && <ErrorMsg message={error} />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Name (English) *">
                <Input value={form.name} onChange={(v) => set('name', v)} placeholder="e.g. Chicken Grill" />
              </Field>
              <Field label="Name (Dhivehi) — optional">
                <Input value={form.name_dv} onChange={(v) => set('name_dv', v)} placeholder="ދިވެހި" />
              </Field>
            </div>
            <div style={{ padding: '14px 16px', background: '#FFFAF5', borderRadius: 12, border: '1px solid #F0E0D0' }}>
              <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: '#3D2B1F' }}>Customer-facing details</p>
              <p style={{ margin: '0 0 12px', fontSize: 12, color: '#9C8E7E' }}>
                Shown on the online menu card and the item detail sheet when customers tap an item.
              </p>
              <Field label="Description">
                <FormTextarea
                  value={form.description}
                  onChange={(v) => set('description', v)}
                  placeholder={"Line 1 — short hook for the menu card\nLine 2 — optional second teaser line\n\nMore detail here — customers see all of this when they tap the item."}
                  rows={6}
                />
              </Field>
              {(() => {
                const preview = cardDescriptionPreview(form.description);
                const lines = form.description.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim()).length;
                return (
                  <>
                    <p style={{ fontSize: 11, color: '#9C8E7E', margin: '4px 0 8px' }}>
                      {form.description.trim().length} characters · {lines} line{lines === 1 ? '' : 's'} ·
                      menu card shows the first 2 lines; full text (with line breaks) opens on tap
                    </p>
                    {preview.text && (
                      <div style={{
                        marginBottom: 12, padding: '10px 12px', borderRadius: 10,
                        background: '#fff', border: '1px dashed #E8E0D8',
                      }}>
                        <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: '#9C8E7E', letterSpacing: '0.04em' }}>
                          MENU CARD PREVIEW{preview.truncated ? ' (truncated)' : ''}
                        </p>
                        <p style={{
                          margin: 0, fontSize: 13, color: '#6B5D4F', lineHeight: 1.45,
                          whiteSpace: 'pre-line',
                        }}>
                          {preview.text}
                        </p>
                      </div>
                    )}
                  </>
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
              <p style={{ fontSize: 11, color: '#9C8E7E', margin: '4px 0 12px' }}>
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
              <p style={{ fontSize: 11, color: '#9C8E7E', margin: '4px 0 12px' }}>
                Shown as “Contains …” on the item detail sheet (not on the menu card)
              </p>
              <div className="form-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <Field label="Spice level">
                  <select
                    value={form.spice_level}
                    onChange={(e) => set('spice_level', e.target.value as ItemForm['spice_level'])}
                    style={{ width: '100%', minHeight: 44, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 14 }}
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
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer', padding: '8px 10px', background: '#F8F6F3', borderRadius: 8, border: '1px solid #E8E0D8' }}>
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
              <span style={{ color: '#94a3b8', fontWeight: 400 }}>(e.g. sizes, portions)</span>
            </label>

            {form.has_variants ? (
              <>
                <VariantsEditor rows={form.variants} onChange={(rows) => set('variants', rows)} />
                <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <TaxCodeField value={form.tax_code} onChange={(v) => set('tax_code', v)} bootstrap={gstBootstrap} />
                  <Field label="Sort Order">
                    <Input value={form.sort_order} onChange={(v) => set('sort_order', v)} type="number" placeholder="0" />
                  </Field>
                </div>
              </>
            ) : (
              <div className="form-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <Field label="Price (MVR) *">
                  <Input value={form.base_price} onChange={(v) => set('base_price', v)} type="number" placeholder="0.00" />
                </Field>
                <TaxCodeField value={form.tax_code} onChange={(v) => set('tax_code', v)} bootstrap={gstBootstrap} />
                <Field label="Sort Order">
                  <Input value={form.sort_order} onChange={(v) => set('sort_order', v)} type="number" placeholder="0" />
                </Field>
              </div>
            )}

            <div style={{ padding: '12px 14px', background: '#F8F6F3', borderRadius: 10, border: '1px solid #E8E0D8' }}>
              <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#3D2B1F' }}>Packaging</p>
              <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <Field label="Charge mode">
                  <select
                    value={form.packaging_fee_mode}
                    onChange={(e) => set('packaging_fee_mode', e.target.value as 'per_unit' | 'per_line')}
                    style={{ width: '100%', minHeight: 44, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 14 }}
                  >
                    <option value="per_unit">Per unit (× qty)</option>
                    <option value="per_line">Per line (once)</option>
                  </select>
                </Field>
                <Field label="Fallback fee (MVR)">
                  <Input value={form.packaging_fee} onChange={(v) => set('packaging_fee', v)} type="number" placeholder="0.00" />
                </Field>
              </div>
              <p style={{ margin: '0 0 10px', fontSize: 12, color: '#9C8E7E' }}>
                Fallback applies when this item has no packaging options. Dine-in is never charged.
              </p>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: '#6B5B4F' }}>Options (optional)</p>
              {form.packaging_options.map((row, idx) => (
                <div
                  key={row._key}
                  style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 80px 44px', gap: 8, alignItems: 'end', marginBottom: 8 }}
                >
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
                      minHeight: 44, border: '1px solid #E8E0D8', borderRadius: 8,
                      background: '#fff', cursor: 'pointer', fontSize: 16, color: '#9C8E7E',
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
                style={{
                  marginTop: 4, minHeight: 40, padding: '0 12px', borderRadius: 8,
                  border: '1px dashed #C4B5A5', background: 'transparent',
                  cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#6B5B4F',
                }}
              >
                + Add packaging option
              </button>
            </div>

            {!form.has_variants && (
              <div style={{ padding: '12px 14px', background: '#F8F6F3', borderRadius: 10, border: '1px solid #E8E0D8' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer', marginBottom: form.is_combo ? 12 : 0 }}>
                  <input
                    type="checkbox"
                    checked={form.is_combo}
                    onChange={(e) => {
                      set('is_combo', e.target.checked);
                      if (e.target.checked && form.combo_items.length === 0) {
                        set('combo_items', [{ item_id: '', quantity: '1', is_optional: false }]);
                      }
                    }}
                  />
                  <span style={{ fontWeight: 600 }}>Bundle / combo item</span>
                </label>
                {form.is_combo && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <Field label="Bundle discount (%)">
                      <Input value={form.combo_discount_pct} onChange={(v) => set('combo_discount_pct', v)} type="number" placeholder="Optional" />
                    </Field>
                    <p style={{ margin: 0, fontSize: 12, color: '#9C8E7E', fontWeight: 600 }}>Included items</p>
                    {form.combo_items.map((row, idx) => (
                      <div key={idx} style={{ border: '1px solid #E8E0D8', borderRadius: 10, padding: 10, background: '#fff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>Component {idx + 1}</span>
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
                            }} />
                            Optional
                          </label>
                        </div>
                      </div>
                    ))}
                    <Btn variant="secondary" small onClick={() => set('combo_items', [...form.combo_items, { item_id: '', quantity: '1', is_optional: false }])}>
                      + Add component
                    </Btn>
                  </div>
                )}
              </div>
            )}

            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Category">
                <select
                  value={form.category_id}
                  onChange={(e) => set('category_id', e.target.value)}
                  style={{ width: '100%', border: '1px solid #E8E0D8', borderRadius: 9, padding: '9px 12px', fontSize: 14 }}
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
              </Field>
              <Field label="Menu group (chef / station)">
                <select
                  value={form.menu_group_id}
                  onChange={(e) => set('menu_group_id', e.target.value)}
                  style={{ width: '100%', border: '1px solid #E8E0D8', borderRadius: 9, padding: '9px 12px', fontSize: 14 }}
                >
                  {menuGroups.map((g) => (
                    <option key={g.id} value={String(g.id)}>{g.name}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="SKU / Internal Code">
              <Input value={form.sku} onChange={(v) => set('sku', v)} placeholder="e.g. CHKGRL-01" />
            </Field>
            <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6B5D4F', marginBottom: 8 }}>
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
                <p style={{ fontSize: 11, color: '#94a3b8', margin: '8px 0 0', lineHeight: 1.45 }}>
                  Immediate sale needs dine-in / takeaway / pickup / delivery. Catering alone = event menu only
                  (not orderable at the till or online until you also enable an immediate channel). Delivery also
                  needs the global delivery switch and active menu duty above.
                </p>
              </div>
            <Field label="Image">
              <ImageUploadField
                value={form.image_url}
                originalValue={form.image_original_url}
                onChange={({ url, original_url, thumb_url }) => {
                  set('image_url', url);
                  set('image_original_url', original_url);
                  set('thumb_url', thumb_url ?? '');
                }}
              />
            </Field>
            {!form.has_variants && (
              <div style={{ border: '1px solid #E8E0D8', borderRadius: 10, padding: '14px 16px', background: '#FAFAF8' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: form.track_stock ? 12 : 0 }}>
                  <input
                    type="checkbox"
                    checked={form.track_stock}
                    onChange={(e) => set('track_stock', e.target.checked)}
                  />
                  Track prepared quantity
                </label>
                <p style={{ fontSize: 11, color: '#94a3b8', margin: '6px 0 0 24px' }}>
                  Turn on for pre-made batches (e.g. 12 croissants ready). Leave off for made-to-order items.
                </p>
                {form.track_stock && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 14, paddingLeft: 24 }}>
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
              </div>
            )}
            <div style={{ display: 'flex', gap: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
                Active (exists in system)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_available} onChange={(e) => set('is_available', e.target.checked)} />
                Available (orderable today)
              </label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            <Btn onClick={handleSave} disabled={loading}>{loading ? 'Saving…' : 'Save Item'}</Btn>
          </div>
        </>
      )}

      {activeTab === 'photos' && itemId && (
        <>
          <PhotosTab itemId={itemId} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
            <Btn variant="ghost" onClick={onClose}>Close</Btn>
          </div>
        </>
      )}
    </Modal>
  );
}
