import { useState, useEffect } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  PageHeader, TableCard, TH, TD, Badge, Btn, Modal, ModalActions, Pagination, EmptyState, StatCard, DateInput,
} from '../components/SharedUI';
import { fetchWasteLogs, createWasteLog, fetchAdminItems, fetchInventoryItems, type WasteLog, type MenuItem, type InventoryItem } from '../api';
import { downloadCSV } from '../utils/csvExport';

const REASONS = ['spoilage', 'over_prep', 'drop', 'expired', 'quality', 'other'] as const;
type Reason = typeof REASONS[number];
const REASON_LABELS: Record<Reason, string> = { spoilage: 'Spoilage', over_prep: 'Over Prep', drop: 'Dropped', expired: 'Expired', quality: 'Quality Issue', other: 'Other' };
const REASON_COLOR: Record<Reason, string> = { spoilage: 'red', over_prep: 'orange', drop: 'orange', expired: 'red', quality: 'orange', other: 'gray' };

export default function WasteLogsPage() {
  usePageTitle('Waste Tracking');

  const today = new Date().toISOString().slice(0, 10);

  const [logs, setLogs] = useState<WasteLog[]>([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [totalCost, setTotalCost] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [itemType, setItemType] = useState<'menu' | 'inventory'>('menu');
  const [form, setForm] = useState({ item_id: '', quantity: '', unit: '', cost_estimate: '', reason: 'spoilage' as Reason, notes: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetchWasteLogs({ from, to, page });
      setLogs(res.data);
      setMeta(res.meta);
      setTotalCost(parseFloat(String(res.total_cost ?? 0)));
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [page, from, to]);
  useEffect(() => {
    fetchAdminItems({ per_page: 200 }).then(r => setMenuItems(r.data)).catch((e: Error) => setError(e.message || 'Failed to load menu items.'));
    fetchInventoryItems({}).then(r => setInventoryItems(r.data)).catch((e: Error) => setError(e.message || 'Failed to load inventory items.'));
  }, []);

  const handleLog = async () => {
    if (!form.item_id) { setFormError(`Select a ${itemType === 'menu' ? 'menu item' : 'inventory item'}.`); return; }
    const qty = parseFloat(form.quantity);
    if (isNaN(qty) || qty <= 0) { setFormError('Enter a valid quantity.'); return; }
    setSaving(true); setFormError('');
    try {
      const payload = itemType === 'menu'
        ? { item_id: Number(form.item_id) }
        : { inventory_item_id: Number(form.item_id) };
      const costRaw = form.cost_estimate ? parseFloat(form.cost_estimate) : undefined;
      if (costRaw !== undefined && isNaN(costRaw)) { setFormError('Enter a valid cost estimate.'); setSaving(false); return; }
      await createWasteLog({ ...payload, quantity: qty, unit: form.unit || undefined, cost_estimate: costRaw, reason: form.reason, notes: form.notes || undefined });
      setLogOpen(false);
      setForm({ item_id: '', quantity: '', unit: '', cost_estimate: '', reason: 'spoilage', notes: '' });
      void load();
    } catch (e) { setFormError((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <PageHeader
        title="Waste Tracking"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            {logs.length > 0 && (
              <Btn variant="secondary" onClick={() => downloadCSV('waste-logs', logs.map(l => ({ Date: l.created_at?.slice(0, 10) ?? '', Item: l.item?.name ?? '', Qty: l.quantity, Unit: l.unit ?? '', Reason: l.reason, 'Cost (MVR)': l.cost_estimate ?? '', Notes: l.notes ?? '' })))}>
                Export CSV
              </Btn>
            )}
            <Btn onClick={() => { setLogOpen(true); setFormError(''); }}>+ Log Waste</Btn>
          </div>
        }
      />
      {error && <p style={{ color: '#ef4444', marginBottom: 16 }}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard label="Total Entries" value={String(meta.total)} accent="#D4813A" />
        <StatCard label={`Waste Cost (${from} – ${to})`} value={`MVR ${totalCost.toFixed(2)}`} accent="#ef4444" />
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap' }}>
        <DateInput label="From" value={from} onChange={(v) => { setFrom(v); setPage(1); }} />
        <DateInput label="To" value={to} onChange={(v) => { setTo(v); setPage(1); }} />
      </div>

      <TableCard>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Item', 'Qty', 'Reason', 'Cost Est.', 'Notes', 'Logged By', 'Date'].map(h => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#9C8E7E' }}>Loading…</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={7}><EmptyState message="No waste logs for this period." /></td></tr>
            ) : logs.map(log => (
              <tr key={log.id}>
                <td style={{ ...TD, fontWeight: 600 }}>{log.item?.name ?? log.inventory_item?.name ?? <span style={{ color: '#9C8E7E' }}>—</span>}</td>
                <td style={TD}>{log.quantity}{log.unit ? ` ${log.unit}` : ''}</td>
                <td style={TD}><Badge color={REASON_COLOR[log.reason as Reason] ?? 'gray'}>{REASON_LABELS[log.reason as Reason] ?? log.reason}</Badge></td>
                <td style={TD}>{log.cost_estimate != null ? `MVR ${log.cost_estimate.toFixed(2)}` : <span style={{ color: '#9C8E7E' }}>—</span>}</td>
                <td style={{ ...TD, fontSize: 12, color: '#6B5D4F', maxWidth: 200 }}>{log.notes ?? <span style={{ color: '#9C8E7E' }}>—</span>}</td>
                <td style={{ ...TD, color: '#9C8E7E', fontSize: 12 }}>{log.logged_by ?? '—'}</td>
                <td style={{ ...TD, color: '#9C8E7E', fontSize: 12 }}>{new Date(log.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      <Pagination page={page} totalPages={meta.last_page} onChange={setPage} />

      {logOpen && (
        <Modal title="Log Waste" onClose={() => setLogOpen(false)}>
          {formError && <p style={{ color: '#ef4444', marginBottom: 12 }}>{formError}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 0, border: '1px solid #E8E0D8', borderRadius: 8, overflow: 'hidden' }}>
              {(['menu', 'inventory'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => { setItemType(t); setForm(f => ({ ...f, item_id: '' })); }}
                  style={{ flex: 1, padding: '8px 0', fontSize: 13, fontWeight: itemType === t ? 700 : 500, background: itemType === t ? '#D4813A' : '#fff', color: itemType === t ? '#fff' : '#6B5D4F', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {t === 'menu' ? 'Menu Item' : 'Inventory Item'}
                </button>
              ))}
            </div>
            <label>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>
                {itemType === 'menu' ? 'Menu Item' : 'Inventory Item'} *
              </span>
              <select value={form.item_id} onChange={e => setForm(f => ({ ...f, item_id: e.target.value }))} style={{ width: '100%', padding: '8px 12px', border: '1px solid #E8E0D8', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}>
                <option value="">Select…</option>
                {itemType === 'menu'
                  ? menuItems.map(item => <option key={item.id} value={item.id}>{item.name}</option>)
                  : inventoryItems.map(item => <option key={item.id} value={item.id}>{item.name}{item.unit ? ` (${item.unit})` : ''}</option>)
                }
              </select>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
              <label>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>Quantity *</span>
                <input type="number" min="0.001" step="any" placeholder="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </label>
              <label>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>Unit</span>
                <input type="text" placeholder="pcs" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </label>
            </div>
            <label>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>Reason *</span>
              <select value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value as Reason }))} style={{ width: '100%', padding: '8px 12px', border: '1px solid #E8E0D8', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}>
                {REASONS.map(r => <option key={r} value={r}>{REASON_LABELS[r]}</option>)}
              </select>
            </label>
            <label>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>Cost Estimate (MVR)</span>
              <input type="number" min="0" step="0.01" placeholder="Optional" value={form.cost_estimate} onChange={e => setForm(f => ({ ...f, cost_estimate: e.target.value }))} style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </label>
            <label>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>Notes</span>
              <textarea placeholder="Any additional details…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ width: '100%', padding: '8px 12px', border: '1px solid #E8E0D8', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
            </label>
          </div>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setLogOpen(false)}>Cancel</Btn>
            <Btn onClick={handleLog} disabled={saving}>{saving ? 'Logging…' : 'Log Waste'}</Btn>
          </ModalActions>
        </Modal>
      )}
    </div>
  );
}
