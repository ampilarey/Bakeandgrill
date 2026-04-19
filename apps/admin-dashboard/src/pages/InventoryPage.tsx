import { useState, useEffect } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  PageHeader, TableCard, TH, TD, Badge, Btn, Modal, ModalActions,
  EmptyState, StatCard, useConfirmDialog, ConfirmDialog,
} from '../components/SharedUI';
import {
  fetchInventoryItems, fetchLowStockItems, adjustInventoryStock,
  fetchInventoryCategories, createInventoryCategory, updateInventoryCategory,
  getUnitConversions, createUnitConversion, deleteUnitConversion,
  getInventoryPriceHistory, getInventoryCheapestSupplier, submitStockCount,
  type InventoryItem, type InventoryCategory, type UnitConversion,
  type InventoryPriceHistoryEntry, type CheapestSupplier,
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
  const [tab, setTab] = useState<'stock' | 'categories' | 'conversions' | 'stock-count'>('stock');

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
      setItems(res.data ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  const loadLowStock = async () => {
    try {
      const res = await fetchLowStockItems();
      setLowCount((res.data ?? []).length);
    } catch {
      // Non-critical: badge simply won't show if this fails
    }
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
    try { const r = await fetchInventoryCategories(); setCats(r.categories ?? []); }
    catch (e) { setCatError((e as Error).message); }
    finally { setCatsLoading(false); }
  };

  useEffect(() => { if (tab === 'categories') void loadCats(); }, [tab]);

  // ── Unit Conversions tab ───────────────────────────────────────────────────
  const [conversions, setConversions] = useState<UnitConversion[]>([]);
  const [convLoading, setConvLoading] = useState(false);
  const [convError, setConvError] = useState('');
  const [convForm, setConvForm] = useState({ from_unit: '', to_unit: '', factor: '' });
  const [convSaving, setConvSaving] = useState(false);

  const loadConversions = async () => {
    setConvLoading(true);
    try { const r = await getUnitConversions(); setConversions(r.conversions); }
    catch (e) { setConvError((e as Error).message); }
    finally { setConvLoading(false); }
  };

  useEffect(() => { if (tab === 'conversions') void loadConversions(); }, [tab]);

  const handleAddConversion = async () => {
    const f = parseFloat(convForm.factor);
    if (!convForm.from_unit.trim() || !convForm.to_unit.trim() || isNaN(f) || f <= 0) {
      setConvError('All fields are required and factor must be > 0.'); return;
    }
    setConvSaving(true); setConvError('');
    try {
      await createUnitConversion({ from_unit: convForm.from_unit.trim(), to_unit: convForm.to_unit.trim(), factor: f });
      setConvForm({ from_unit: '', to_unit: '', factor: '' });
      void loadConversions();
    } catch (e) { setConvError((e as Error).message); }
    finally { setConvSaving(false); }
  };

  const handleDeleteConversion = async (id: number) => {
    try { await deleteUnitConversion(id); void loadConversions(); }
    catch (e) { setConvError((e as Error).message); }
  };

  // ── Price History drawer ───────────────────────────────────────────────────
  const [priceHistoryItem, setPriceHistoryItem] = useState<InventoryItem | null>(null);
  const [priceHistory, setPriceHistory] = useState<InventoryPriceHistoryEntry[]>([]);
  const [cheapestSupplier, setCheapestSupplier] = useState<CheapestSupplier | null | undefined>(undefined);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  const openPriceHistory = async (item: InventoryItem) => {
    setPriceHistoryItem(item);
    setPriceHistory([]);
    setCheapestSupplier(undefined);
    setHistoryError('');
    setHistoryLoading(true);
    try {
      const [histRes, cheapRes] = await Promise.all([
        getInventoryPriceHistory(item.id),
        getInventoryCheapestSupplier(item.id),
      ]);
      setPriceHistory(histRes.history);
      setCheapestSupplier(cheapRes.supplier);
    } catch (e) { setHistoryError((e as Error).message); }
    finally { setHistoryLoading(false); }
  };

  // ── Stock Count tab ────────────────────────────────────────────────────────
  const [countItems, setCountItems] = useState<InventoryItem[]>([]);
  const [countQtys, setCountQtys] = useState<Record<number, string>>({});
  const [countNotes, setCountNotes] = useState<Record<number, string>>({});
  const [countLoading, setCountLoading] = useState(false);
  const [countSaving, setCountSaving] = useState(false);
  const [countResult, setCountResult] = useState<{ item_id: number; difference: number; balance_after: number }[] | null>(null);
  const [countError, setCountError] = useState('');

  const loadCountItems = async () => {
    setCountLoading(true);
    try {
      // Paginate through all inventory items (API doesn't support per_page override)
      const allItems: InventoryItem[] = [];
      let page = 1;
      while (true) {
        const r = await fetchInventoryItems({ page });
        allItems.push(...(r.data ?? []));
        if ((r.meta?.current_page ?? 1) >= (r.meta?.last_page ?? 1)) break;
        page++;
      }
      setCountItems(allItems);
      const qtys: Record<number, string> = {};
      allItems.forEach((i) => { qtys[i.id] = String(i.quantity_on_hand ?? ''); });
      setCountQtys(qtys);
    } catch (e) { setCountError((e as Error).message); }
    finally { setCountLoading(false); }
  };

  useEffect(() => { if (tab === 'stock-count') void loadCountItems(); }, [tab]);

  const handleSubmitCount = async () => {
    const counts = countItems
      .filter((i) => countQtys[i.id] !== '' && countQtys[i.id] !== undefined)
      .map((i) => ({ inventory_item_id: i.id, quantity: parseFloat(countQtys[i.id] ?? '0'), notes: countNotes[i.id] }));
    if (counts.some((c) => isNaN(c.quantity) || c.quantity < 0)) { setCountError('One or more quantities are invalid.'); return; }
    if (!counts.length) { setCountError('No counts entered.'); return; }
    setCountSaving(true); setCountError('');
    try {
      const res = await submitStockCount(counts);
      setCountResult(res.adjustments);
    } catch (e) { setCountError((e as Error).message); }
    finally { setCountSaving(false); }
  };

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
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: '#F5F0EB', borderRadius: 10, padding: 4, width: 'fit-content', flexWrap: 'wrap' }}>
        <button style={S.tab(tab === 'stock')} onClick={() => setTab('stock')}>Stock</button>
        <button style={S.tab(tab === 'categories')} onClick={() => setTab('categories')}>Categories</button>
        <button style={S.tab(tab === 'conversions')} onClick={() => setTab('conversions')}>Unit Conversions</button>
        <button style={S.tab(tab === 'stock-count')} onClick={() => setTab('stock-count')}>Stock Count</button>
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
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Btn small variant="secondary" onClick={() => {
                            setAdjustItem(item);
                            setAdjForm({ type: 'add', quantity: '', reason: '' });
                            setAdjError('');
                          }}>Adjust</Btn>
                          <Btn small variant="secondary" onClick={() => void openPriceHistory(item)} title="Price history">📈</Btn>
                        </div>
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

      {/* ── Unit Conversions Tab ── */}
      {tab === 'conversions' && (
        <div>
          {convError && <p style={{ color: '#ef4444', marginBottom: 12 }}>{convError}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, alignItems: 'flex-end', marginBottom: 20, background: '#F9F5F0', padding: 16, borderRadius: 12 }}>
            {(['from_unit', 'to_unit', 'factor'] as const).map((k) => (
              <div key={k}>
                <label style={S.label}>{k === 'from_unit' ? 'From Unit' : k === 'to_unit' ? 'To Unit' : 'Factor'}</label>
                <input value={convForm[k]} onChange={(e) => setConvForm((f) => ({ ...f, [k]: e.target.value }))}
                  type={k === 'factor' ? 'number' : 'text'} min="0.000001" step="0.001"
                  placeholder={k === 'factor' ? '1.0' : k === 'from_unit' ? 'kg' : 'g'}
                  style={S.input} />
              </div>
            ))}
            <Btn onClick={() => void handleAddConversion()} disabled={convSaving}>{convSaving ? '…' : '+ Add'}</Btn>
          </div>
          {convLoading ? <p style={{ color: '#9C8E7E', fontSize: 13 }}>Loading…</p> : conversions.length === 0 ? (
            <EmptyState message="No conversions defined." />
          ) : (
            <TableCard>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={TH}>From</th><th style={TH}>To</th><th style={TH}>Factor</th><th style={TH}></th>
                </tr></thead>
                <tbody>
                  {conversions.map((c) => (
                    <tr key={c.id}>
                      <td style={TD}>{c.from_unit}</td>
                      <td style={TD}>{c.to_unit}</td>
                      <td style={TD}>{c.factor}</td>
                      <td style={TD}><Btn small variant="danger" onClick={() => void handleDeleteConversion(c.id)}>Delete</Btn></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableCard>
          )}
        </div>
      )}

      {/* ── Stock Count Tab ── */}
      {tab === 'stock-count' && (
        <div>
          {countError && <p style={{ color: '#ef4444', marginBottom: 12 }}>{countError}</p>}
          {countResult ? (
            <div>
              <div style={{ background: '#DCFCE7', color: '#166534', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
                ✓ Stock count submitted. {countResult.filter(r => r.difference !== 0).length} adjustments made.
              </div>
              <TableCard>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={TH}>Item</th><th style={TH}>Variance</th><th style={TH}>New Balance</th></tr></thead>
                  <tbody>
                    {countResult.map((r) => (
                      <tr key={r.item_id}>
                        <td style={TD}>{countItems.find(i => i.id === r.item_id)?.name ?? `#${r.item_id}`}</td>
                        <td style={{ ...TD, color: r.difference > 0 ? '#15803D' : r.difference < 0 ? '#991B1B' : '#9C8E7E', fontWeight: 700 }}>
                          {r.difference > 0 ? '+' : ''}{r.difference}
                        </td>
                        <td style={TD}>{r.balance_after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableCard>
              <Btn variant="secondary" onClick={() => { setCountResult(null); void loadCountItems(); }} style={{ marginTop: 16 }}>New Count</Btn>
            </div>
          ) : countLoading ? <p style={{ color: '#9C8E7E', fontSize: 13 }}>Loading items…</p> : (
            <div>
              <p style={{ fontSize: 13, color: '#6B5D4F', marginBottom: 16 }}>
                Enter the actual counted quantities. Leave blank to skip an item.
              </p>
              <TableCard>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={TH}>Item</th><th style={TH}>Unit</th>
                    <th style={TH}>On Hand</th><th style={TH}>Counted Qty</th><th style={TH}>Notes</th>
                  </tr></thead>
                  <tbody>
                    {countItems.map((item) => (
                      <tr key={item.id}>
                        <td style={{ ...TD, fontWeight: 600 }}>{item.name}</td>
                        <td style={TD}>{item.unit}</td>
                        <td style={{ ...TD, color: '#9C8E7E' }}>{item.quantity_on_hand ?? '—'}</td>
                        <td style={TD}>
                          <input type="number" min="0" step="0.001"
                            value={countQtys[item.id] ?? ''}
                            onChange={(e) => setCountQtys((q) => ({ ...q, [item.id]: e.target.value }))}
                            style={{ width: 90, padding: '5px 8px', border: '1.5px solid #E8E0D8', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }} />
                        </td>
                        <td style={TD}>
                          <input value={countNotes[item.id] ?? ''}
                            onChange={(e) => setCountNotes((n) => ({ ...n, [item.id]: e.target.value }))}
                            placeholder="Optional note"
                            style={{ width: 160, padding: '5px 8px', border: '1.5px solid #E8E0D8', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableCard>
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                <Btn onClick={() => void handleSubmitCount()} disabled={countSaving}>
                  {countSaving ? 'Submitting…' : '✓ Submit Stock Count'}
                </Btn>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Price History Modal ── */}
      {priceHistoryItem && (
        <Modal title={`Price History — ${priceHistoryItem.name}`} onClose={() => setPriceHistoryItem(null)} maxWidth={560}>
          {historyError && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 8 }}>{historyError}</p>}
          {historyLoading ? <p style={{ color: '#9C8E7E', fontSize: 13, textAlign: 'center', padding: 20 }}>Loading…</p> : (
            <>
              {cheapestSupplier && (
                <div style={{ background: '#DCFCE7', color: '#166534', padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
                  💰 Cheapest supplier: <strong>{cheapestSupplier.name}</strong> at MVR {cheapestSupplier.min_cost.toFixed(2)}
                </div>
              )}
              {priceHistory.length === 0 ? (
                <p style={{ color: '#9C8E7E', textAlign: 'center', padding: 20, fontSize: 13 }}>No purchase history.</p>
              ) : (
                <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                      <th style={TH}>Date</th><th style={TH}>Supplier</th>
                      <th style={TH}>Qty</th><th style={TH}>Unit Cost</th>
                    </tr></thead>
                    <tbody>
                      {priceHistory.map((h, i) => (
                        <tr key={i}>
                          <td style={TD}>{h.purchase_date ?? '—'}</td>
                          <td style={TD}>{h.supplier ?? '—'}</td>
                          <td style={TD}>{h.quantity}</td>
                          <td style={{ ...TD, fontWeight: 600 }}>MVR {h.unit_cost.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
