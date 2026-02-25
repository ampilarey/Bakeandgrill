import { useEffect, useRef, useState } from 'react';
import {
  fetchAdminCategories, createCategory, updateCategory, deleteCategory,
  fetchAdminItems, createItem, updateItem, deleteItem, toggleItemAvailability,
  uploadMenuImage,
  type MenuCategory, type MenuItem, type MenuItemPayload,
} from '../api';
import {
  Badge, Btn, Card, EmptyState, ErrorMsg, Input, PageHeader, Spinner,
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
            flexShrink: 0, padding: '8px 14px', background: '#f1f5f9',
            border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer',
            fontSize: 13, fontWeight: 600, color: '#475569', whiteSpace: 'nowrap',
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
          style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0' }}
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
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
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
        width: '100%', border: '1px solid #e2e8f0', borderRadius: 9,
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
};

const EMPTY_CAT: CatForm = { name: '', name_dv: '', description: '', image_url: '', sort_order: '', is_active: true };

function CategoryFormModal({
  initial, title, onSave, onClose,
}: {
  initial: CatForm;
  title: string;
  onSave: (f: CatForm) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<CatForm>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof CatForm>(k: K, v: CatForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Category name is required.'); return; }
    setError(''); setLoading(true);
    try { await onSave(form); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  return (
    <Modal onClose={onClose}>
      <h3 style={{ fontWeight: 800, fontSize: 17, marginBottom: 20, color: '#0f172a' }}>{title}</h3>
      {error && <ErrorMsg message={error} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Name (English)">
            <Input value={form.name} onChange={(v) => set('name', v)} placeholder="e.g. Grills" />
          </Field>
          <Field label="Name (Dhivehi) — optional">
            <Input value={form.name_dv} onChange={(v) => set('name_dv', v)} placeholder="ދިވެހި" />
          </Field>
        </div>
        <Field label="Description">
          <FormTextarea value={form.description} onChange={(v) => set('description', v)} placeholder="Short description…" rows={2} />
        </Field>
        <Field label="Image">
          <ImageUploadField value={form.image_url} onChange={(v) => set('image_url', v)} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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

type ItemForm = {
  name: string; name_dv: string; description: string; sku: string;
  image_url: string; base_price: string; tax_rate: string;
  sort_order: string; is_active: boolean; is_available: boolean;
  category_id: string;
};

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
  };
}

function formToPayload(form: ItemForm): MenuItemPayload {
  return {
    name: form.name.trim(),
    name_dv: form.name_dv.trim() || null,
    description: form.description.trim() || null,
    sku: form.sku.trim() || null,
    image_url: form.image_url.trim() || null,
    base_price: parseFloat(form.base_price) || 0,
    tax_rate: form.tax_rate !== '' ? parseFloat(form.tax_rate) : null,
    sort_order: form.sort_order !== '' ? parseInt(form.sort_order) : null,
    is_active: form.is_active,
    is_available: form.is_available,
    category_id: form.category_id !== '' ? parseInt(form.category_id) : null,
  };
}

function ItemFormModal({
  initial, title, categories, onSave, onClose,
}: {
  initial: ItemForm;
  title: string;
  categories: MenuCategory[];
  onSave: (f: ItemForm) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ItemForm>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof ItemForm>(k: K, v: ItemForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Item name is required.'); return; }
    if (!form.base_price || parseFloat(form.base_price) < 0) { setError('Price must be 0 or more.'); return; }
    setError(''); setLoading(true);
    try { await onSave(form); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  return (
    <Modal onClose={onClose} wide>
      <h3 style={{ fontWeight: 800, fontSize: 17, marginBottom: 20, color: '#0f172a' }}>{title}</h3>
      {error && <ErrorMsg message={error} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
          <Field label="Category">
            <select
              value={form.category_id}
              onChange={(e) => set('category_id', e.target.value)}
              style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 9, padding: '9px 12px', fontSize: 14 }}
            >
              <option value="">— No category —</option>
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="SKU / Internal Code">
            <Input value={form.sku} onChange={(v) => set('sku', v)} placeholder="e.g. CHKGRL-01" />
          </Field>
        </div>
        <Field label="Image">
          <ImageUploadField value={form.image_url} onChange={(v) => set('image_url', v)} />
        </Field>
        {false && (
          <img
            src={form.image_url}
            alt="preview"
            style={{ height: 80, width: 80, objectFit: 'cover', borderRadius: 10, border: '1px solid #e2e8f0' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
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
    </Modal>
  );
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────

function Modal({ children, onClose, wide }: {
  children: React.ReactNode; onClose: () => void; wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div ref={ref} style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: wide ? 640 : 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        {children}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type View = 'categories' | 'items';

export function MenuPage() {
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

  // Modals
  const [editingCat, setEditingCat] = useState<MenuCategory | null>(null);
  const [creatingCat, setCreatingCat] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [creatingItem, setCreatingItem] = useState(false);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const res = await fetchAdminCategories();
      setCategories(res.data);
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
      });
      setItems(res.data);
      setLastPage(res.meta?.last_page ?? 1);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void loadCategories(); }, []);
  useEffect(() => {
    if (view === 'items') { setPage(1); void loadItems(1); }
  }, [view, selectedCat, search]);

  // ── Category actions ──
  const handleCreateCat = async (form: CatForm) => {
    await createCategory({
      name: form.name.trim(), name_dv: form.name_dv.trim() || null,
      description: form.description.trim() || null,
      image_url: form.image_url.trim() || null,
      sort_order: form.sort_order !== '' ? parseInt(form.sort_order) : null,
    });
    setCreatingCat(false);
    await loadCategories();
  };

  const handleUpdateCat = async (form: CatForm) => {
    if (!editingCat) return;
    await updateCategory(editingCat.id, {
      name: form.name.trim(), name_dv: form.name_dv.trim() || null,
      description: form.description.trim() || null,
      image_url: form.image_url.trim() || null,
      sort_order: form.sort_order !== '' ? parseInt(form.sort_order) : null,
      is_active: form.is_active,
    });
    setEditingCat(null);
    await loadCategories();
  };

  const handleDeleteCat = async (id: number) => {
    if (!confirm('Delete this category? It must have no items.')) return;
    try { await deleteCategory(id); await loadCategories(); }
    catch (e) { setError((e as Error).message); }
  };

  const handleToggleCat = async (cat: MenuCategory) => {
    await updateCategory(cat.id, { is_active: !cat.is_active });
    await loadCategories();
  };

  // ── Item actions ──
  const handleCreateItem = async (form: ItemForm) => {
    await createItem(formToPayload(form));
    setCreatingItem(false);
    await loadItems();
  };

  const handleUpdateItem = async (form: ItemForm) => {
    if (!editingItem) return;
    await updateItem(editingItem.id, formToPayload(form));
    setEditingItem(null);
    await loadItems();
  };

  const handleDeleteItem = async (id: number) => {
    if (!confirm('Delete this item?')) return;
    try { await deleteItem(id); await loadItems(); }
    catch (e) { setError((e as Error).message); }
  };

  const handleToggleAvail = async (item: MenuItem) => {
    await toggleItemAvailability(item.id);
    await loadItems();
  };

  const EMPTY_ITEM_FORM: ItemForm = {
    name: '', name_dv: '', description: '', sku: '', image_url: '',
    base_price: '', tax_rate: '', sort_order: '',
    is_active: true, is_available: true,
    category_id: selectedCat != null ? String(selectedCat) : '',
  };

  return (
    <>
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
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '2px solid #e2e8f0' }}>
        {(['categories', 'items'] as View[]).map((t) => (
          <button key={t} onClick={() => setView(t)} style={{
            padding: '10px 22px', fontSize: 14, fontWeight: view === t ? 700 : 400,
            color: view === t ? '#0ea5e9' : '#64748b',
            background: 'none', border: 'none', cursor: 'pointer', textTransform: 'capitalize',
            borderBottom: view === t ? '2px solid #0ea5e9' : '2px solid transparent',
            marginBottom: -2,
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
            {categories.map((cat) => (
              <Card key={cat.id} style={{ padding: '14px 18px' }}>
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
                      <p style={{ fontSize: 13, color: '#64748b', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
            ))}
          </div>
        )
      )}

      {/* ── Items view ── */}
      {view === 'items' && (
        <>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <select
              value={selectedCat ?? ''}
              onChange={(e) => setSelectedCat(e.target.value ? parseInt(e.target.value) : null)}
              style={{ border: '1px solid #e2e8f0', borderRadius: 9, padding: '8px 12px', fontSize: 14, minWidth: 180 }}
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div style={{ flex: 1, minWidth: 180 }}>
              <Input value={search} onChange={setSearch} placeholder="Search by name or SKU…" />
            </div>
          </div>

          {loading && items.length === 0 ? <Spinner /> :
          items.length === 0 ? (
            <Card><EmptyState message="No items found." /></Card>
          ) : (
            <>
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      {['', 'Name', 'Category', 'Price', 'Available', 'Active', ''].map((h, i) => (
                        <th key={i} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: 12 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: item.is_active ? 1 : 0.5 }}>
                        <td style={{ padding: '10px 14px', width: 52 }}>
                          {item.image_url ? (
                            <img src={item.image_url} alt={item.name}
                              style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 8 }}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          ) : (
                            <div style={{ width: 40, height: 40, background: '#f1f5f9', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🍽</div>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 600 }}>{item.name}</div>
                          {item.sku && <div style={{ fontSize: 11, color: '#94a3b8' }}>{item.sku}</div>}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#475569', fontSize: 13 }}>
                          {item.category?.name ?? <span style={{ color: '#cbd5e1' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0ea5e9' }}>
                          MVR {item.base_price.toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <button
                            onClick={() => handleToggleAvail(item)}
                            style={{
                              background: item.is_available ? '#dcfce7' : '#fee2e2',
                              color: item.is_available ? '#16a34a' : '#dc2626',
                              border: 'none', borderRadius: 20, padding: '3px 12px', fontSize: 12,
                              fontWeight: 700, cursor: 'pointer',
                            }}
                          >
                            {item.is_available ? 'Yes' : 'No'}
                          </button>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <Badge label={item.is_active ? 'Active' : 'Hidden'} color={item.is_active ? 'green' : 'gray'} />
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <Btn small variant="secondary" onClick={() => setEditingItem(item)}>Edit</Btn>
                            <Btn small variant="danger" onClick={() => handleDeleteItem(item.id)}>Delete</Btn>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              {/* Pagination */}
              {lastPage > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
                  <Btn small variant="secondary" disabled={page <= 1}
                    onClick={() => { const p = page - 1; setPage(p); void loadItems(p); }}>
                    ← Prev
                  </Btn>
                  <span style={{ padding: '6px 14px', fontSize: 14, color: '#64748b' }}>
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
        />
      )}
      {editingCat && (
        <CategoryFormModal
          initial={{
            name: editingCat.name, name_dv: editingCat.name_dv ?? '',
            description: editingCat.description ?? '', image_url: editingCat.image_url ?? '',
            sort_order: editingCat.sort_order != null ? String(editingCat.sort_order) : '',
            is_active: editingCat.is_active,
          }}
          title={`Edit: ${editingCat.name}`}
          onSave={handleUpdateCat}
          onClose={() => setEditingCat(null)}
        />
      )}
      {creatingItem && (
        <ItemFormModal
          initial={EMPTY_ITEM_FORM}
          title="New Menu Item"
          categories={categories}
          onSave={handleCreateItem}
          onClose={() => setCreatingItem(false)}
        />
      )}
      {editingItem && (
        <ItemFormModal
          initial={itemToForm(editingItem)}
          title={`Edit: ${editingItem.name}`}
          categories={categories}
          onSave={handleUpdateItem}
          onClose={() => setEditingItem(null)}
        />
      )}
    </>
  );
}
