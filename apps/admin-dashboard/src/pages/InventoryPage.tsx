import { useState, useEffect } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  PageHeader, TableCard, TH, TD, Badge, Btn, Modal, ModalActions,
  EmptyState, StatCard, useConfirmDialog, ConfirmDialog,
} from '../components/SharedUI';
import {
  fetchInventoryItems, fetchLowStockItems, adjustInventoryStock,
  fetchInventoryCategories, createInventoryCategory, updateInventoryCategory,
  type InventoryItem, type InventoryCategory,
} from '../api';

const S = {
  input: { width: '100%', padding: '8px 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' as const },
  select: { width: '100%', padding: '8px 12px', border: '1px solid #E8E0D8', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' },
  label: { display: 'block' as const, fontSize: 13, fontWeight: 600 as const, color: '#6B5D4F', marginBottom: 4 },
  tab: (active: boolean): React.CSSProperties => ({
    padding: '8px 20px', border: 'none', borderRadius: 8, cursor: 'pointer',
    fontWeight: 600, fontSize: 14, fontFamily: 'inherit',
    background: active ? '#D4813A' : 'transparent',
    color: active ? '#fff' : '#6B5D4F',
  }),
};

export default function InventoryPage() {
  usePageTitle('Inventory');
  const [tab, setTab] = useState<'stock' | 'categories'>('stock');

  // ── Stock tab ──────────────────────────────────────────────────────────────
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [lowCount, setLowCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [adjForm, setAdjForm] = useState({ type: 'add' as 'add' | 'remove' | 'set', quantity: '', reason: '' });
  const [adjSaving, setAdjSaving] = useState(false);
  const [adjError, setAdjError] = useState('');

  const loadItems = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetchInventoryItems({ search: search || undefined });
      setItems(res.data);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  const loadLowStock = async () => {
    try {
      const res = await fetchLowStockItems();
      setLowCount(res.data.length);
    } catch { /* ignore */ }
  };

  useEffect(() => { void loadItems(); }, [search]);
  useEffect(() => { void loadLowStock(); }, []);

  const handleAdjust = async () => {
    const qty = parseFloat(adjForm.quantity);
    if (isNaN(qty) || qty < 0) { setAdjError('Enter a valid quantity.'); return; }
    setAdjSaving(true); setAdjError('');
    try {
      await adjustInventoryStock(adjustItem!.id, { type: adjForm.type, quantity: qty, reason: adjForm.reason || undefined });
      setAdjustItem(null);
      setAdjForm({ type: 'add', quantity: '', reason: '' });
      void loadItems();
    } catch (e) { setAdjError((e as Error).message); }
    finally { setAdjSaving(false); }
  };

  // ── Categories tab ─────────────────────────────────────────────────────────
  const [cats, setCats] = useState<InventoryCategory[]>([]);
  const [catsLoading, setCatsLoading] = useState(false);
  const [catModal, setCatModal] = useState(false);
  const [editCat, setEditCat] = useState<InventoryCategory | null>(null);
  const [catName, setCatName] = useState('');
  const [catSaving, setCatSaving] = useState(false);
  const [catError, setCatError] = useState('');
  const { state: dlg, close: closeDlg } = useConfirmDialog();

  const loadCats = async () => {
    setCatsLoading(true);
    try { const r = await fetchInventoryCategories(); setCats(r.data); }
    catch { /* ignore */ }
    finally { setCatsLoading(false); }
  };

  useEffect(() => { if (tab === 'categories') void loadCats(); }, [tab]);

  const openCatModal = (cat?: InventoryCategory) => {
    setEditCat(cat ?? null);
    setCatName(cat?.name ?? '');
    setCatError('');
    setCatModal(true);
  };

  const handleSaveCat = async () => {
    if (!catName.trim()) { setCatError('Name is required.'); return; }
    setCatSaving(true); setCatError('');
    try {
      if (editCat) {
        await updateInventoryCategory(editCat.id, { name: catName.trim() });
      } else {
        await createInventoryCategory({ name: catName.trim() });
      }
      setCatModal(false);
      void loadCats();
    } catch (e) { setCatError((e as Error).message); }
    finally { setCatSaving(false); }
  };

  return (
    <div>
      <ConfirmDialog state={dlg} close={closeDlg} />
      <PageHeader title="Inventory" subtitle={lowCount > 0 ? `${lowCount} item${lowCount !== 1 ? 's' : ''} below reorder level` : undefined} />

      {error && <p style={{ color: '#ef4444', marginBottom: 16 }}>{error}</p>}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: '#F5F0EB', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        <button style={S.tab(tab === 'stock')} onClick={() => setTab('stock')}>Stock</button>
        <button style={S.tab(tab === 'categories')} onClick={() => setTab('categories')}>Categories</button>
      </div>

      {/* ── Stock Tab ── */}
      {tab === 'stock' && (
        <>
          {lowCount > 0 && (
            <div style={{ background: '#FEF3E8', border: '1px solid #D4813A', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#D4813A', fontWeight: 600 }}>
              ⚠ {lowCount} item{lowCount !== 1 ? 's are' : ' is'} below reorder level
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 20 }}>
            <StatCard label="Total Items" value={String(items.length)} accent="#D4813A" />
            <StatCard label="Low Stock" value={String(lowCount)} accent={lowCount > 0 ? '#ef4444' : '#16a34a'} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <input
              placeholder="Search items…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...S.input, maxWidth: 320 }}
            />
          </div>

          <TableCard>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Name', 'SKU', 'Category', 'On Hand', 'Reorder Level', 'Status', 'Actions'].map(h => (
                    <th key={h} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#9C8E7E' }}>Loading…</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={7}><EmptyState message="No inventory items found." /></td></tr>
                ) : items.map(item => {
                  const isLow = item.reorder_level != null && item.quantity_on_hand <= item.reorder_level;
                  return (
                    <tr key={item.id}>
                      <td style={{ ...TD, fontWeight: 600 }}>{item.name}</td>
                      <td style={{ ...TD, color: '#9C8E7E', fontSize: 12 }}>{item.sku ?? '—'}</td>
                      <td style={TD}>{item.category?.name ?? <span style={{ color: '#9C8E7E' }}>—</span>}</td>
                      <td style={{ ...TD, fontWeight: 700, color: isLow ? '#ef4444' : '#1C1408' }}>
                        {item.quantity_on_hand} {item.unit}
                      </td>
                      <td style={{ ...TD, color: '#9C8E7E' }}>
                        {item.reorder_level != null ? `${item.reorder_level} ${item.unit}` : '—'}
                      </td>
                      <td style={TD}>
                        <Badge color={isLow ? 'red' : 'green'}>{isLow ? 'Low Stock' : 'OK'}</Badge>
                      </td>
                      <td style={TD}>
                        <Btn small variant="secondary" onClick={() => {
                          setAdjustItem(item);
                          setAdjForm({ type: 'add', quantity: '', reason: '' });
                          setAdjError('');
                        }}>Adjust</Btn>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableCard>
        </>
      )}

      {/* ── Categories Tab ── */}
      {tab === 'categories' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <Btn onClick={() => openCatModal()}>+ Add Category</Btn>
          </div>
          <TableCard>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Name', 'Actions'].map(h => <th key={h} style={TH}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {catsLoading ? (
                  <tr><td colSpan={2} style={{ textAlign: 'center', padding: 40, color: '#9C8E7E' }}>Loading…</td></tr>
                ) : cats.length === 0 ? (
                  <tr><td colSpan={2}><EmptyState message="No categories yet." /></td></tr>
                ) : cats.map(cat => (
                  <tr key={cat.id}>
                    <td style={{ ...TD, fontWeight: 600 }}>{cat.name}</td>
                    <td style={TD}>
                      <Btn small variant="secondary" onClick={() => openCatModal(cat)}>Edit</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        </>
      )}

      {/* ── Adjust Modal ── */}
      {adjustItem && (
        <Modal title={`Adjust Stock — ${adjustItem.name}`} onClose={() => setAdjustItem(null)} maxWidth={400}>
          {adjError && <p style={{ color: '#ef4444', marginBottom: 12 }}>{adjError}</p>}
          <p style={{ fontSize: 13, color: '#6B5D4F', marginBottom: 16 }}>
            Current stock: <strong>{adjustItem.quantity_on_hand} {adjustItem.unit}</strong>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label>
              <span style={S.label}>Adjustment Type</span>
              <select value={adjForm.type} onChange={e => setAdjForm(f => ({ ...f, type: e.target.value as 'add' | 'remove' | 'set' }))} style={S.select}>
                <option value="add">Add (increase)</option>
                <option value="remove">Remove (decrease)</option>
                <option value="set">Set to exact amount</option>
              </select>
            </label>
            <label>
              <span style={S.label}>Quantity *</span>
              <input type="number" min="0" step="any" placeholder={adjForm.type === 'set' ? 'New total' : 'Amount'} value={adjForm.quantity} onChange={e => setAdjForm(f => ({ ...f, quantity: e.target.value }))} style={S.input} />
            </label>
            <label>
              <span style={S.label}>Reason</span>
              <input type="text" placeholder="e.g. Stock count, received delivery…" value={adjForm.reason} onChange={e => setAdjForm(f => ({ ...f, reason: e.target.value }))} style={S.input} />
            </label>
          </div>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setAdjustItem(null)}>Cancel</Btn>
            <Btn onClick={handleAdjust} disabled={adjSaving}>{adjSaving ? 'Saving…' : 'Save Adjustment'}</Btn>
          </ModalActions>
        </Modal>
      )}

      {/* ── Category Modal ── */}
      {catModal && (
        <Modal title={editCat ? 'Edit Category' : 'Add Category'} onClose={() => setCatModal(false)} maxWidth={360}>
          {catError && <p style={{ color: '#ef4444', marginBottom: 12 }}>{catError}</p>}
          <label>
            <span style={S.label}>Category Name *</span>
            <input type="text" placeholder="e.g. Produce, Dairy…" value={catName} onChange={e => setCatName(e.target.value)} style={S.input} />
          </label>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setCatModal(false)}>Cancel</Btn>
            <Btn onClick={handleSaveCat} disabled={catSaving}>{catSaving ? 'Saving…' : 'Save'}</Btn>
          </ModalActions>
        </Modal>
      )}
    </div>
  );
}
