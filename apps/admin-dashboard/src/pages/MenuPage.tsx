import { useEffect, useRef, useState } from 'react';
import {
  fetchAdminCategories, createCategory, updateCategory, deleteCategory,
  fetchAdminItems, createItem, updateItem, deleteItem, toggleItemAvailability,
  uploadMenuImage, getBarcodeLabel, getItemWithRecipe,
  fetchMenuGroups, getKitchenMenuState, updateKitchenMenuState,
  type MenuCategory, type MenuItem, type MenuItemPayload, type BarcodeLabel, type ItemWithRecipe,
  type MenuGroupRow, type MenuVariant,
} from '../api';
import { PhotosTab } from './MenuPage/PhotosTab';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  Badge, Btn, Card, ConfirmDialog, EmptyState, ErrorMsg, Input, Modal, PageHeader, Spinner, useConfirmDialog,
} from '../components/Layout';

// ── Image upload field ────────────────────────────────────────────────────────
function ImageUploadField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setUploadError('');
    setUploading(true);
    try {
      const { url } = await uploadMenuImage(file);
      onChange(url);
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Input
          value={value}
          onChange={onChange}
          placeholder="https://… or upload below"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          style={{
            flexShrink: 0, padding: '8px 14px', background: '#F8F6F3',
            border: '1px solid #E8E0D8', borderRadius: 8, cursor: 'pointer',
            fontSize: 13, fontWeight: 600, color: '#6B5D4F', whiteSpace: 'nowrap',
          }}
        >
          {uploading ? '⏳ Uploading…' : '📁 Upload'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = '';
          }}
        />
      </div>
      {uploadError && <p style={{ color: '#dc2626', fontSize: 12, margin: 0 }}>{uploadError}</p>}
      {value && (
        <img
          src={value}
          alt="preview"
          style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #E8E0D8' }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      )}
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function FormTextarea({ value, onChange, placeholder, rows = 3 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        width: '100%', border: '1px solid #E8E0D8', borderRadius: 9,
        padding: '9px 12px', fontSize: 14, fontFamily: 'inherit', resize: 'vertical',
        boxSizing: 'border-box',
      }}
    />
  );
}

// ── Category form ─────────────────────────────────────────────────────────────

type CatForm = {
  name: string; name_dv: string; description: string;
  image_url: string; sort_order: string; is_active: boolean;
  parent_id: string;
};

const EMPTY_CAT: CatForm = { name: '', name_dv: '', description: '', image_url: '', sort_order: '', is_active: true, parent_id: '' };

function CategoryFormModal({
  initial, title, onSave, onClose, categories, editingId,
}: {
  initial: CatForm;
  title: string;
  onSave: (f: CatForm) => Promise<void>;
  onClose: () => void;
  categories: MenuCategory[];
  editingId?: number;
}) {
  const [form, setForm] = useState<CatForm>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof CatForm>(k: K, v: CatForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Only top-level categories (no parent) can be parents — no deeper than 2 levels.
  // Also exclude the category being edited from the dropdown.
  const parentOptions = categories.filter(
    (c) => !c.parent_id && c.id !== editingId
  );

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Category name is required.'); return; }
    setError(''); setLoading(true);
    try { await onSave(form); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  const selectStyle: React.CSSProperties = {
    width: '100%', border: '1px solid #E8E0D8', borderRadius: 9,
    padding: '9px 12px', fontSize: 14, fontFamily: 'inherit',
    background: '#fff', cursor: 'pointer', boxSizing: 'border-box',
  };

  return (
    <Modal title={title} onClose={onClose}>
      {error && <ErrorMsg message={error} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Name (English)">
            <Input value={form.name} onChange={(v) => set('name', v)} placeholder="e.g. Grills" />
          </Field>
          <Field label="Name (Dhivehi) — optional">
            <Input value={form.name_dv} onChange={(v) => set('name_dv', v)} placeholder="ދިވެހި" />
          </Field>
        </div>
        <Field label="Parent Category — optional">
          <select value={form.parent_id} onChange={(e) => set('parent_id', e.target.value)} style={selectStyle}>
            <option value="">— None (top-level category) —</option>
            {parentOptions.map((c) => (
              <option key={c.id} value={String(c.id)}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Description">
          <FormTextarea value={form.description} onChange={(v) => set('description', v)} placeholder="Short description…" rows={2} />
        </Field>
        <Field label="Image">
          <ImageUploadField value={form.image_url} onChange={(v) => set('image_url', v)} />
        </Field>
        <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Sort Order">
            <Input value={form.sort_order} onChange={(v) => set('sort_order', v)} type="number" placeholder="0" />
          </Field>
          <Field label="Status">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
              Active (visible to customers)
            </label>
          </Field>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={handleSave} disabled={loading}>{loading ? 'Saving…' : 'Save Category'}</Btn>
      </div>
    </Modal>
  );
}

// ── Item form ────────────────────────────────────────────────────────────────

const SALES_CHANNELS = [
  { id: 'dine_in', label: 'Dine-in' },
  { id: 'takeaway', label: 'Takeaway (POS)' },
  { id: 'online_pickup', label: 'Online pickup' },
  { id: 'delivery', label: 'Delivery' },
] as const;

type VariantRow = MenuVariant & { _key: string };

type ItemForm = {
  name: string; name_dv: string; description: string; sku: string;
  image_url: string; base_price: string; tax_rate: string;
  sort_order: string; is_active: boolean; is_available: boolean;
  category_id: string;
  menu_group_id: string;
  channels: Record<string, boolean>;
  has_variants: boolean;
  track_stock: boolean;
  stock_quantity: string;
  low_stock_threshold: string;
  variants: VariantRow[];
};

function emptyVariantRow(): VariantRow {
  return { _key: String(Date.now() + Math.random()), name: '', price: 0, cost: null, sku: null, track_stock: false, stock_qty: 0, is_active: true, sort_order: 0 };
}

function channelsFromItem(item: MenuItem): Record<string, boolean> {
  const base: Record<string, boolean> = {
    dine_in: true, takeaway: true, online_pickup: true, delivery: true,
  };
  if (!item.channel_availabilities?.length) return base;
  for (const r of item.channel_availabilities) {
    if (r.channel in base) base[r.channel] = r.is_enabled;
  }
  return base;
}

function itemToForm(item: MenuItem): ItemForm {
  return {
    name: item.name,
    name_dv: item.name_dv ?? '',
    description: item.description ?? '',
    sku: item.sku ?? '',
    image_url: item.image_url ?? '',
    base_price: String(item.base_price),
    tax_rate: item.tax_rate != null ? String(item.tax_rate) : '',
    sort_order: item.sort_order != null ? String(item.sort_order) : '',
    is_active: item.is_active,
    is_available: item.is_available,
    category_id: item.category_id != null ? String(item.category_id) : '',
    menu_group_id: item.menu_group_id != null ? String(item.menu_group_id) : '1',
    channels: channelsFromItem(item),
    has_variants: item.has_variants ?? false,
    track_stock: item.track_stock ?? false,
    stock_quantity: item.stock_quantity != null ? String(item.stock_quantity) : '0',
    low_stock_threshold: item.low_stock_threshold != null ? String(item.low_stock_threshold) : '5',
    variants: (item.variants ?? []).map((v) => ({ ...v, _key: String(v.id ?? Math.random()) })),
  };
}


function formToPayload(form: ItemForm, includeChannels: boolean): MenuItemPayload {
  const payload: MenuItemPayload = {
    name: form.name.trim(),
    name_dv: form.name_dv.trim() || null,
    description: form.description.trim() || null,
    sku: form.sku.trim() || null,
    image_url: form.image_url.trim() || null,
    base_price: parseFloat(form.base_price) || 0,
    has_variants: form.has_variants,
    tax_rate: form.tax_rate !== '' ? parseFloat(form.tax_rate) : null,
    sort_order: form.sort_order !== '' ? parseInt(form.sort_order) : null,
    is_active: form.is_active,
    is_available: form.is_available,
    category_id: form.category_id !== '' ? parseInt(form.category_id) : null,
    menu_group_id: form.menu_group_id !== '' ? parseInt(form.menu_group_id, 10) : null,
    variants: form.has_variants
      ? form.variants.map(({ _key, ...v }, i) => ({ ...v, sort_order: i }))
      : undefined,
  };
  if (!form.has_variants) {
    payload.track_stock = form.track_stock;
    payload.stock_quantity = form.track_stock
      ? Math.max(0, parseInt(form.stock_quantity, 10) || 0)
      : 0;
    payload.low_stock_threshold = form.track_stock
      ? Math.max(0, parseInt(form.low_stock_threshold, 10) || 0)
      : 0;
    payload.availability_type = form.track_stock ? 'stock_based' : 'made_to_order';
  }
  if (includeChannels) {
    payload.channel_availability = SALES_CHANNELS.map(({ id }) => ({
      channel: id,
      is_enabled: !!form.channels[id],
    }));
  }
  return payload;
}

function ItemFormModal({
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
  const set = <K extends keyof ItemForm>(k: K, v: ItemForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Item name is required.'); return; }
    if (!form.has_variants) {
      const priceNum = parseFloat(form.base_price);
      if (!form.base_price || !Number.isFinite(priceNum) || priceNum < 0) { setError('Price must be a valid number (0 or more).'); return; }
    }
    if (form.has_variants && form.variants.length === 0) { setError('Add at least one variant, or turn off "This product has variants".'); return; }
    if (form.has_variants && form.variants.some((v) => !v.name.trim())) { setError('All variants must have a name.'); return; }
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
            <Field label="Description">
              <FormTextarea value={form.description} onChange={(v) => set('description', v)} placeholder="Describe the item…" />
            </Field>
            {/* Variant toggle */}
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
                  <Field label="Tax Rate (%)">
                    <Input value={form.tax_rate} onChange={(v) => set('tax_rate', v)} type="number" placeholder="0" />
                  </Field>
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
                <Field label="Tax Rate (%)">
                  <Input value={form.tax_rate} onChange={(v) => set('tax_rate', v)} type="number" placeholder="0" />
                </Field>
                <Field label="Sort Order">
                  <Input value={form.sort_order} onChange={(v) => set('sort_order', v)} type="number" placeholder="0" />
                </Field>
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
            {itemId && (
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6B5D4F', marginBottom: 8 }}>
                  Per-channel availability
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 20px' }}>
                  {SALES_CHANNELS.map(({ id, label }) => (
                    <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
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
                <p style={{ fontSize: 11, color: '#94a3b8', margin: '8px 0 0' }}>
                  Delivery also requires the global delivery switch (Settings → Website) and active menu duty above.
                </p>
              </div>
            )}
            <Field label="Image">
              <ImageUploadField value={form.image_url} onChange={(v) => set('image_url', v)} />
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

// ── Variants editor ────────────────────────────────────────────────────────────

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

// Local Modal removed — using SharedUI Modal from ../components/Layout

// ── Main page ─────────────────────────────────────────────────────────────────

type View = 'categories' | 'items';

export function MenuPage() {
    usePageTitle('Menu');
  const [view, setView] = useState<View>('categories');
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  // Modals
  const { state: dlg, ask: askConfirm, close: closeDlg } = useConfirmDialog();
  const [editingCat, setEditingCat] = useState<MenuCategory | null>(null);
  const [creatingCat, setCreatingCat] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [creatingItem, setCreatingItem] = useState(false);
  const [barcodeLabel, setBarcodeLabel] = useState<BarcodeLabel | null>(null);
  const [recipeItem, setRecipeItem] = useState<ItemWithRecipe | null>(null);
  const [menuGroups, setMenuGroups] = useState<MenuGroupRow[]>([]);
  const [activeMenuGroupIds, setActiveMenuGroupIds] = useState<number[]>([1]);
  const [kitchenSaving, setKitchenSaving] = useState(false);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const res = await fetchAdminCategories();
      setCategories(res.data ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  const loadItems = async (p = page) => {
    setLoading(true);
    try {
      const res = await fetchAdminItems({
        category_id: selectedCat ?? undefined,
        search: search || undefined,
        page: p,
        per_page: perPage,
      });
      setItems(res.data ?? []);
      setLastPage(res.meta?.last_page ?? 1);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void loadCategories(); }, []);
  useEffect(() => {
    if (view !== 'items') return;
    void (async () => {
      try {
        const [mg, ks] = await Promise.all([fetchMenuGroups(), getKitchenMenuState()]);
        setMenuGroups(mg.data);
        setActiveMenuGroupIds(ks.kitchen_menu_state.active_menu_group_ids?.length ? ks.kitchen_menu_state.active_menu_group_ids : [1]);
      } catch { /* ignore */ }
    })();
  }, [view]);
  useEffect(() => {
    if (view === 'items') { setPage(1); void loadItems(1); }
  }, [view, selectedCat, search, perPage]);

  // ── Category actions ──
  const handleCreateCat = async (form: CatForm) => {
    try {
      await createCategory({
        name: form.name.trim(), name_dv: form.name_dv.trim() || null,
        description: form.description.trim() || null,
        image_url: form.image_url.trim() || null,
        sort_order: form.sort_order !== '' ? parseInt(form.sort_order) : null,
        parent_id: form.parent_id !== '' ? parseInt(form.parent_id) : null,
      });
      setCreatingCat(false);
      await loadCategories();
    } catch (e) { setError((e as Error).message); }
  };

  const handleUpdateCat = async (form: CatForm) => {
    if (!editingCat) return;
    try {
      await updateCategory(editingCat.id, {
        name: form.name.trim(), name_dv: form.name_dv.trim() || null,
        description: form.description.trim() || null,
        image_url: form.image_url.trim() || null,
        sort_order: form.sort_order !== '' ? parseInt(form.sort_order) : null,
        is_active: form.is_active,
        parent_id: form.parent_id !== '' ? parseInt(form.parent_id) : null,
      });
      setEditingCat(null);
      await loadCategories();
    } catch (e) { setError((e as Error).message); }
  };

  const handleDeleteCat = (id: number) => {
    askConfirm({
      title: 'Delete Category',
      message: 'Delete this category? It must have no items assigned.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        try { await deleteCategory(id); await loadCategories(); }
        catch (e) { setError((e as Error).message); }
      },
    });
  };

  const handleToggleCat = async (cat: MenuCategory) => {
    try {
      await updateCategory(cat.id, { is_active: !cat.is_active });
      await loadCategories();
    } catch (e) { setError((e as Error).message); }
  };

  // ── Item actions ──
  const handleCreateItem = async (form: ItemForm) => {
    try {
      await createItem(formToPayload(form, false));
      setCreatingItem(false);
      await loadItems();
    } catch (e) { setError((e as Error).message); }
  };

  const handleUpdateItem = async (form: ItemForm) => {
    if (!editingItem) return;
    try {
      await updateItem(editingItem.id, formToPayload(form, true));
      setEditingItem(null);
      await loadItems();
    } catch (e) { setError((e as Error).message); }
  };

  const toggleKitchenGroup = (id: number) => {
    setActiveMenuGroupIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      return next.length ? next : prev;
    });
  };

  const saveKitchenDuty = async () => {
    setKitchenSaving(true);
    try {
      await updateKitchenMenuState(activeMenuGroupIds);
    } catch (e) { setError((e as Error).message); }
    finally { setKitchenSaving(false); }
  };

  const handleDeleteItem = (id: number) => {
    askConfirm({
      title: 'Delete Item',
      message: 'Delete this menu item? This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        try { await deleteItem(id); await loadItems(); }
        catch (e) { setError((e as Error).message); }
      },
    });
  };

  const handleToggleAvail = async (item: MenuItem) => {
    try {
      await toggleItemAvailability(item.id);
      await loadItems();
    } catch (e) { setError((e as Error).message); }
  };

  const EMPTY_ITEM_FORM: ItemForm = {
    name: '', name_dv: '', description: '', sku: '', image_url: '',
    base_price: '', tax_rate: '', sort_order: '',
    is_active: true, is_available: true,
    category_id: selectedCat != null ? String(selectedCat) : '',
    menu_group_id: '1',
    channels: { dine_in: true, takeaway: true, online_pickup: true, delivery: true },
    has_variants: false, variants: [],
    track_stock: false, stock_quantity: '0', low_stock_threshold: '5',
  };

  return (
    <>
      <ConfirmDialog state={dlg} close={closeDlg} />
      <PageHeader
        title="Menu Management"
        subtitle="Categories, items, prices and availability"
        action={
          view === 'categories'
            ? <Btn onClick={() => setCreatingCat(true)}>+ New Category</Btn>
            : <Btn onClick={() => setCreatingItem(true)}>+ New Item</Btn>
        }
      />

      {error && <ErrorMsg message={error} />}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '2px solid #E8E0D8' }}>
        {(['categories', 'items'] as View[]).map((t) => (
          <button key={t} onClick={() => setView(t)} style={{
            padding: '10px 22px', fontSize: 14, fontWeight: view === t ? 700 : 400,
            color: view === t ? '#D4813A' : '#9C8E7E',
            background: 'none', border: 'none', cursor: 'pointer', textTransform: 'capitalize',
            borderBottom: view === t ? '2px solid #D4813A' : '2px solid transparent',
            marginBottom: -2, fontFamily: 'inherit',
          }}>
            {t === 'categories' ? `Categories (${categories.length})` : 'Items'}
          </button>
        ))}
      </div>

      {/* ── Categories view ── */}
      {view === 'categories' && (
        loading && categories.length === 0 ? <Spinner /> :
        categories.length === 0 ? (
          <Card><EmptyState message="No categories yet. Add your first one." /></Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {categories.filter((c) => !c.parent_id).map((cat) => (
              <div key={cat.id}>
                <Card style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    {cat.image_url && (
                      <img src={cat.image_url} alt={cat.name}
                        style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{cat.name}</span>
                        {cat.name_dv && <span style={{ color: '#94a3b8', fontSize: 13 }}>{cat.name_dv}</span>}
                        <Badge label={cat.is_active ? 'Active' : 'Hidden'} color={cat.is_active ? 'green' : 'gray'} />
                      </div>
                      {cat.description && (
                        <p style={{ fontSize: 13, color: '#6B5D4F', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {cat.description}
                        </p>
                      )}
                      <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>
                        Sort: {cat.sort_order ?? 0} · {cat.items?.length ?? '?'} items
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <Btn small variant="ghost" onClick={() => handleToggleCat(cat)}>
                        {cat.is_active ? 'Hide' : 'Show'}
                      </Btn>
                      <Btn small variant="secondary" onClick={() => setEditingCat(cat)}>Edit</Btn>
                      <Btn small variant="danger" onClick={() => handleDeleteCat(cat.id)}>Delete</Btn>
                    </div>
                  </div>
                </Card>
                {/* Subcategories indented beneath parent */}
                {categories.filter((c) => c.parent_id === cat.id).map((sub) => (
                  <Card key={sub.id} style={{ padding: '12px 18px', marginTop: 6, marginLeft: 28, borderLeft: '3px solid #E8E0D8' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <span style={{ fontSize: 16, color: '#94a3b8', flexShrink: 0 }}>↳</span>
                      {sub.image_url && (
                        <img src={sub.image_url} alt={sub.name}
                          style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
                          <span style={{ fontWeight: 600, fontSize: 14 }}>{sub.name}</span>
                          {sub.name_dv && <span style={{ color: '#94a3b8', fontSize: 13 }}>{sub.name_dv}</span>}
                          <Badge label={sub.is_active ? 'Active' : 'Hidden'} color={sub.is_active ? 'green' : 'gray'} />
                        </div>
                        <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                          Sort: {sub.sort_order ?? 0} · {sub.items?.length ?? '?'} items
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <Btn small variant="ghost" onClick={() => handleToggleCat(sub)}>
                          {sub.is_active ? 'Hide' : 'Show'}
                        </Btn>
                        <Btn small variant="secondary" onClick={() => setEditingCat(sub)}>Edit</Btn>
                        <Btn small variant="danger" onClick={() => handleDeleteCat(sub.id)}>Delete</Btn>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ))}
          </div>
        )
      )}

      {/* ── Items view ── */}
      {view === 'items' && (
        <>
          <Card style={{ padding: '16px 18px', marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', marginBottom: 8 }}>Chef menu on duty</div>
            <p style={{ fontSize: 12, color: '#6B5D4F', margin: '0 0 12px', lineHeight: 1.45 }}>
              Only items in the selected menu groups appear on the public menu (per channel rules). Choose one or more groups that are live right now.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 18px', marginBottom: 12 }}>
              {(menuGroups.length ? menuGroups : [{ id: 1, name: 'Default', slug: 'default', sort_order: 0, is_active: true }]).map((g) => (
                <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={activeMenuGroupIds.includes(g.id)}
                    onChange={() => toggleKitchenGroup(g.id)}
                  />
                  {g.name}
                </label>
              ))}
            </div>
            <Btn small onClick={() => void saveKitchenDuty()} disabled={kitchenSaving}>
              {kitchenSaving ? 'Saving…' : 'Save active menus'}
            </Btn>
          </Card>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <select
              value={selectedCat ?? ''}
              onChange={(e) => setSelectedCat(e.target.value ? parseInt(e.target.value) : null)}
              style={{ border: '1px solid #E8E0D8', borderRadius: 9, padding: '8px 12px', fontSize: 14, minWidth: 180 }}
            >
              <option value="">All Categories</option>
              {categories.filter((c) => !c.parent_id).map((parent) => (
                <optgroup key={parent.id} label={parent.name}>
                  <option value={parent.id}>{parent.name}</option>
                  {categories.filter((c) => c.parent_id === parent.id).map((sub) => (
                    <option key={sub.id} value={sub.id}>{'↳ ' + sub.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <div style={{ flex: 1, minWidth: 180 }}>
              <Input value={search} onChange={setSearch} placeholder="Search by name or SKU…" />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6B5D4F' }}>
              Per page:
              <select
                value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); void loadItems(1); }}
                style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid #E8E0D8', fontSize: 13, fontFamily: 'inherit' }}
              >
                {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>

          {loading && items.length === 0 ? <Spinner /> :
          items.length === 0 ? (
            <Card><EmptyState message="No items found." /></Card>
          ) : (
            <>
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ background: '#F8F6F3', borderBottom: '1px solid #E8E0D8' }}>
                      {['', 'Name', 'Category', 'Price', 'Available', 'Active', ''].map((h, i) => (
                        <th key={i} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 700, color: '#9C8E7E', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #F0EBE5', opacity: item.is_active ? 1 : 0.5 }}>
                        <td style={{ padding: '10px 14px', width: 52 }}>
                          {item.image_url ? (
                            <img src={item.image_url} alt={item.name}
                              style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 8 }}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          ) : (
                            <div style={{ width: 40, height: 40, background: '#F0EBE5', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🍽</div>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 600 }}>{item.name}</div>
                          {item.sku && <div style={{ fontSize: 11, color: '#94a3b8' }}>{item.sku}</div>}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#6B5D4F', fontSize: 13 }}>
                          {item.category ? (() => {
                            const cat = categories.find((c) => c.id === item.category_id);
                            const parent = cat?.parent_id ? categories.find((c) => c.id === cat.parent_id) : null;
                            return parent
                              ? <span>{parent.name} <span style={{ color: '#94a3b8' }}>› {cat?.name}</span></span>
                              : cat?.name ?? item.category.name;
                          })() : <span style={{ color: '#cbd5e1' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#D4813A' }}>
                          MVR {parseFloat(String(item.base_price)).toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <button
                            onClick={() => handleToggleAvail(item)}
                            title={item.is_available ? 'Click to mark sold out' : 'Click to mark available'}
                            style={{
                              width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                              background: item.is_available ? '#22c55e' : '#d1d5db',
                              position: 'relative', transition: 'background 0.2s', flexShrink: 0, display: 'inline-block',
                              verticalAlign: 'middle',
                            }}
                          >
                            <span style={{
                              position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%',
                              background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                              transition: 'left 0.2s',
                              left: item.is_available ? 22 : 2,
                            }} />
                          </button>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <Badge label={item.is_active ? 'Active' : 'Hidden'} color={item.is_active ? 'green' : 'gray'} />
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <Btn small variant="secondary" onClick={() => setEditingItem(item)}>Edit</Btn>
                            <Btn small variant="secondary" onClick={() => { getBarcodeLabel(item.id).then((res) => setBarcodeLabel(res.label)).catch((e: Error) => setError(e.message)); }} title="Print barcode label">🏷</Btn>
                            <Btn small variant="secondary" onClick={() => { getItemWithRecipe(item.id).then((res) => setRecipeItem(res.item)).catch((e: Error) => setError(e.message)); }} title="View recipe">📋</Btn>
                            <Btn small variant="danger" onClick={() => handleDeleteItem(item.id)}>Delete</Btn>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </Card>

              {/* Pagination */}
              {lastPage > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
                  <Btn small variant="secondary" disabled={page <= 1}
                    onClick={() => { const p = page - 1; setPage(p); void loadItems(p); }}>
                    ← Prev
                  </Btn>
                  <span style={{ padding: '6px 14px', fontSize: 14, color: '#6B5D4F' }}>
                    Page {page} of {lastPage}
                  </span>
                  <Btn small variant="secondary" disabled={page >= lastPage}
                    onClick={() => { const p = page + 1; setPage(p); void loadItems(p); }}>
                    Next →
                  </Btn>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Modals ── */}
      {creatingCat && (
        <CategoryFormModal
          initial={EMPTY_CAT}
          title="New Category"
          onSave={handleCreateCat}
          onClose={() => setCreatingCat(false)}
          categories={categories}
        />
      )}
      {editingCat && (
        <CategoryFormModal
          key={editingCat.id}
          initial={{
            name: editingCat.name, name_dv: editingCat.name_dv ?? '',
            description: editingCat.description ?? '', image_url: editingCat.image_url ?? '',
            sort_order: editingCat.sort_order != null ? String(editingCat.sort_order) : '',
            is_active: editingCat.is_active,
            parent_id: editingCat.parent_id != null ? String(editingCat.parent_id) : '',
          }}
          title={`Edit: ${editingCat.name}`}
          onSave={handleUpdateCat}
          onClose={() => setEditingCat(null)}
          categories={categories}
          editingId={editingCat.id}
        />
      )}
      {creatingItem && (
        <ItemFormModal
          initial={EMPTY_ITEM_FORM}
          title="New Menu Item"
          categories={categories}
          menuGroups={menuGroups.length ? menuGroups : [{ id: 1, name: 'Default', slug: 'default', sort_order: 0, is_active: true }]}
          onSave={handleCreateItem}
          onClose={() => setCreatingItem(false)}
        />
      )}
      {editingItem && (
        <ItemFormModal
          key={editingItem.id}
          initial={itemToForm(editingItem)}
          title={`Edit: ${editingItem.name}`}
          categories={categories}
          menuGroups={menuGroups.length ? menuGroups : [{ id: 1, name: 'Default', slug: 'default', sort_order: 0, is_active: true }]}
          onSave={handleUpdateItem}
          onClose={() => setEditingItem(null)}
          itemId={editingItem.id}
        />
      )}

      {/* Recipe modal */}
      {recipeItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 480, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Recipe — {recipeItem.name}</h3>
              <button onClick={() => setRecipeItem(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9C8E7E' }}>×</button>
            </div>
            {!recipeItem.recipe ? (
              <p style={{ color: '#9C8E7E', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No recipe defined for this item.</p>
            ) : (recipeItem.recipe.recipe_items ?? []).length === 0 ? (
              <p style={{ color: '#9C8E7E', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Recipe exists but has no ingredients.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#9C8E7E', borderBottom: '1px solid #F0EAE3' }}>Ingredient</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#9C8E7E', borderBottom: '1px solid #F0EAE3' }}>Qty</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#9C8E7E', borderBottom: '1px solid #F0EAE3' }}>Unit</th>
                </tr></thead>
                <tbody>
                  {(recipeItem.recipe.recipe_items ?? []).map((ri) => (
                    <tr key={ri.id}>
                      <td style={{ padding: '10px', fontSize: 13, borderBottom: '1px solid #F8F4F0', fontWeight: 600 }}>
                        {ri.inventory_item?.name ?? '—'}
                      </td>
                      <td style={{ padding: '10px', fontSize: 13, borderBottom: '1px solid #F8F4F0' }}>{ri.quantity}</td>
                      <td style={{ padding: '10px', fontSize: 13, borderBottom: '1px solid #F8F4F0', color: '#9C8E7E' }}>
                        {ri.unit ?? ri.inventory_item?.unit ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Barcode label preview modal */}
      {barcodeLabel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 360, width: '90%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 800 }}>Barcode Label</h3>
            <div style={{ border: '2px solid #E8E0D8', borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 16 }}>{barcodeLabel.name}</p>
              {barcodeLabel.barcode && (
                <p style={{ margin: '0 0 4px', fontFamily: 'monospace', fontSize: 18, letterSpacing: 3, color: '#1C1408' }}>{barcodeLabel.barcode}</p>
              )}
              {barcodeLabel.sku && <p style={{ margin: '0 0 4px', fontSize: 12, color: '#9C8E7E' }}>SKU: {barcodeLabel.sku}</p>}
              <p style={{ margin: 0, fontWeight: 700, fontSize: 20, color: '#D4813A' }}>
                MVR {Number(barcodeLabel.price).toFixed(2)}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button
                onClick={() => { window.print(); }}
                style={{ padding: '10px 20px', background: '#D4813A', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                🖨 Print
              </button>
              <button
                onClick={() => setBarcodeLabel(null)}
                style={{ padding: '10px 20px', background: 'transparent', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
