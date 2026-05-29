import { useState, useEffect, useMemo } from 'react';
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
const REASON_HEX: Record<Reason, string> = { spoilage: '#ef4444', over_prep: '#f59e0b', drop: '#f97316', expired: '#dc2626', quality: '#eab308', other: '#9C8E7E' };

type Tab = 'logs' | 'summary';

function mvr(n: number) {
  return `MVR ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10);
}

export default function WasteLogsPage() {
  usePageTitle('Waste Tracking');

  const today = new Date().toISOString().slice(0, 10);
  const [tab, setTab] = useState<Tab>('logs');

  // shared date range
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo]     = useState(today);

  // logs tab
  const [logs, setLogs]           = useState<WasteLog[]>([]);
  const [meta, setMeta]           = useState({ current_page: 1, last_page: 1, total: 0 });
  const [totalCost, setTotalCost] = useState(0);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [page, setPage]           = useState(1);

  // summary tab
  const [allLogs, setAllLogs]         = useState<WasteLog[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // log form
  const [menuItems, setMenuItems]           = useState<MenuItem[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [logOpen, setLogOpen]               = useState(false);
  const [itemType, setItemType]             = useState<'menu' | 'inventory'>('menu');
  const [form, setForm]                     = useState({ item_id: '', quantity: '', unit: '', cost_estimate: '', reason: 'spoilage' as Reason, notes: '' });
  const [saving, setSaving]                 = useState(false);
  const [formError, setFormError]           = useState('');

  const load = async () => {
    if (from > to) { setError('Start date cannot be after end date.'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetchWasteLogs({ from, to, page });
      setLogs(res.data ?? []);
      setMeta(res.meta);
      setTotalCost(parseFloat(String(res.total_cost ?? 0)));
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  const loadSummary = async () => {
    if (from > to) return;
    setSummaryLoading(true);
    try {
      const res = await fetchWasteLogs({ from, to, page: 1, per_page: 500 } as Parameters<typeof fetchWasteLogs>[0]);
      setAllLogs(res.data ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setSummaryLoading(false); }
  };

  useEffect(() => { void load(); }, [page, from, to]);
  useEffect(() => { if (tab === 'summary') void loadSummary(); }, [tab, from, to]);
  useEffect(() => {
    fetchAdminItems({ per_page: 200 }).then(r => setMenuItems(r.data ?? [])).catch(() => {});
    fetchInventoryItems({}).then(r => setInventoryItems(r.data ?? [])).catch(() => {});
  }, []);

  // ── Summary aggregations ────────────────────────────────────────────────────
  const byReason = useMemo(() => {
    const map: Record<string, { count: number; cost: number }> = {};
    for (const log of allLogs) {
      if (!map[log.reason]) map[log.reason] = { count: 0, cost: 0 };
      map[log.reason].count++;
      map[log.reason].cost += log.cost_estimate ?? 0;
    }
    return Object.entries(map)
      .map(([reason, v]) => ({ reason: reason as Reason, ...v }))
      .sort((a, b) => b.cost - a.cost);
  }, [allLogs]);

  const totalSummaryCost = useMemo(() => allLogs.reduce((s, l) => s + (l.cost_estimate ?? 0), 0), [allLogs]);

  const topItems = useMemo(() => {
    const map: Record<string, { key: string; name: string; count: number; cost: number }> = {};
    for (const log of allLogs) {
      const key = log.item ? `menu-${log.item.id}` : log.inventory_item ? `inv-${log.inventory_item.id}` : 'unknown';
      const name = log.item?.name ?? log.inventory_item?.name ?? 'Unknown';
      if (!map[key]) map[key] = { key, name, count: 0, cost: 0 };
      map[key].count++;
      map[key].cost += log.cost_estimate ?? 0;
    }
    return Object.values(map).sort((a, b) => b.cost - a.cost).slice(0, 10);
  }, [allLogs]);

  const maxItemCost = topItems[0]?.cost ?? 1;
  const maxReasonCost = byReason[0]?.cost ?? 1;

  const wasteTrend = useMemo(() => {
    const map: Record<string, number> = {};
    for (const log of allLogs) {
      const day = log.created_at?.slice(0, 10);
      if (!day) continue;
      map[day] = (map[day] ?? 0) + (log.cost_estimate ?? 0);
    }
    return Object.entries(map)
      .map(([date, cost]) => ({ date, cost }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [allLogs]);

  const maxTrendCost = wasteTrend.reduce((m, d) => Math.max(m, d.cost), 0) || 1;

  // ── Log form handler ────────────────────────────────────────────────────────
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
            {tab === 'logs' && logs.length > 0 && (
              <Btn variant="secondary" onClick={() => downloadCSV('waste-logs', logs.map(l => ({
                Date: l.created_at?.slice(0, 10) ?? '',
                Item: l.item?.name ?? l.inventory_item?.name ?? '',
                Qty: l.quantity, Unit: l.unit ?? '',
                Reason: l.reason,
                'Cost (MVR)': l.cost_estimate ?? '',
                Notes: l.notes ?? '',
              })))}>
                Export CSV
              </Btn>
            )}
            <Btn onClick={() => { setLogOpen(true); setFormError(''); }}>+ Log Waste</Btn>
          </div>
        }
      />
      {error && <p style={{ color: '#ef4444', marginBottom: 16 }}>{error}</p>}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid #E8E0D8', marginBottom: 24 }}>
        {(['logs', 'summary'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '10px 20px', fontSize: 14,
            fontWeight: tab === t ? 700 : 500,
            color: tab === t ? '#D4813A' : '#9C8E7E',
            background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            borderBottom: tab === t ? '2px solid #D4813A' : '2px solid transparent',
            marginBottom: -2, transition: 'color 0.15s',
          }}>
            {t === 'logs' ? 'Log Entries' : 'Summary'}
          </button>
        ))}
      </div>

      {/* Shared date range */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap' }}>
        <DateInput label="From" value={from} onChange={(v) => { setFrom(v); setPage(1); }} />
        <DateInput label="To"   value={to}   onChange={(v) => { setTo(v);   setPage(1); }} />
        <div style={{ display: 'flex', gap: 6 }}>
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => { setFrom(daysAgo(d - 1)); setTo(today); setPage(1); }}
              style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, border: '1.5px solid #E8E0D8', borderRadius: 8, background: '#fff', color: '#6B5D4F', cursor: 'pointer', fontFamily: 'inherit' }}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* ── LOG ENTRIES TAB ─────────────────────────────────────────────────── */}
      {tab === 'logs' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            <StatCard label="Total Entries" value={String(meta.total)} accent="#D4813A" />
            <StatCard label={`Waste Cost (${from} – ${to})`} value={mvr(totalCost)} accent="#ef4444" />
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
                    <td style={TD}>{log.cost_estimate != null ? mvr(log.cost_estimate) : <span style={{ color: '#9C8E7E' }}>—</span>}</td>
                    <td style={{ ...TD, fontSize: 12, color: '#6B5D4F', maxWidth: 200 }}>{log.notes ?? <span style={{ color: '#9C8E7E' }}>—</span>}</td>
                    <td style={{ ...TD, color: '#9C8E7E', fontSize: 12 }}>{log.logged_by ?? '—'}</td>
                    <td style={{ ...TD, color: '#9C8E7E', fontSize: 12 }}>{new Date(log.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
          <Pagination page={page} totalPages={meta.last_page} onChange={setPage} />
        </>
      )}

      {/* ── SUMMARY TAB ─────────────────────────────────────────────────────── */}
      {tab === 'summary' && (
        summaryLoading ? (
          <p style={{ textAlign: 'center', padding: 40, color: '#9C8E7E' }}>Loading summary…</p>
        ) : allLogs.length === 0 ? (
          <EmptyState message="No waste logs for this period." />
        ) : (
          <>
            {allLogs.length >= 500 && (
              <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 16px', marginBottom: 20, fontSize: 13, color: '#92400e' }}>
                Summary shows up to 500 entries. Narrow the date range for complete accuracy.
              </div>
            )}
            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 28 }}>
              <StatCard label="Total Entries" value={String(allLogs.length)} accent="#D4813A" />
              <StatCard label="Total Waste Cost" value={mvr(totalSummaryCost)} accent="#ef4444" />
              <StatCard label="Avg Cost / Entry" value={allLogs.length > 0 ? mvr(totalSummaryCost / allLogs.length) : 'MVR 0.00'} accent="#f59e0b" />
              <StatCard label="Reason Types" value={String(byReason.length)} accent="#6B5D4F" />
            </div>

            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>

              {/* Daily waste trend */}
              <div style={{ background: '#fff', border: '1px solid #E8E0D8', borderRadius: 14, padding: 20, gridColumn: '1 / -1' }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1C1408', margin: '0 0 16px' }}>
                  Waste Cost Trend
                </h3>
                {wasteTrend.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#9C8E7E' }}>No data in this range.</p>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, minHeight: 120, overflowX: 'auto', paddingBottom: 4 }}>
                    {wasteTrend.map(({ date, cost }) => (
                      <div key={date} style={{ flex: '1 0 28px', maxWidth: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <div
                          title={`${date}: ${mvr(cost)}`}
                          style={{
                            width: '100%',
                            maxWidth: 36,
                            height: `${Math.max(8, (cost / maxTrendCost) * 100)}px`,
                            background: '#ef4444',
                            borderRadius: '6px 6px 2px 2px',
                            transition: 'height 0.3s ease',
                          }}
                        />
                        <span style={{ fontSize: 10, color: '#9C8E7E', transform: 'rotate(-45deg)', transformOrigin: 'top left', whiteSpace: 'nowrap' }}>
                          {date.slice(5)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Breakdown by reason */}
              <div style={{ background: '#fff', border: '1px solid #E8E0D8', borderRadius: 14, padding: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1C1408', marginBottom: 16, margin: '0 0 16px' }}>
                  By Reason
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {byReason.map(({ reason, count, cost }) => {
                    const pct = totalSummaryCost > 0 ? (cost / totalSummaryCost) * 100 : 0;
                    const hex = REASON_HEX[reason] ?? '#9C8E7E';
                    return (
                      <div key={reason}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: hex, display: 'inline-block', flexShrink: 0 }} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#1C1408' }}>
                              {REASON_LABELS[reason] ?? reason}
                            </span>
                            <span style={{ fontSize: 12, color: '#9C8E7E' }}>{count}×</span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#1C1408' }}>{mvr(cost)}</span>
                            <span style={{ fontSize: 11, color: '#9C8E7E', marginLeft: 6 }}>{pct.toFixed(1)}%</span>
                          </div>
                        </div>
                        {/* bar */}
                        <div style={{ height: 6, background: '#F0EAE3', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: 999,
                            background: hex,
                            width: `${maxReasonCost > 0 ? (cost / maxReasonCost) * 100 : 0}%`,
                            transition: 'width 0.4s ease',
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Top wasted items */}
              <div style={{ background: '#fff', border: '1px solid #E8E0D8', borderRadius: 14, padding: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1C1408', marginBottom: 16, margin: '0 0 16px' }}>
                  Top Items by Cost
                </h3>
                {topItems.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#9C8E7E' }}>No data.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {topItems.map((item, i) => (
                      <div key={item.key}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#9C8E7E', width: 16 }}>#{i + 1}</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#1C1408', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.name}
                            </span>
                            <span style={{ fontSize: 12, color: '#9C8E7E' }}>{item.count}×</span>
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#ef4444' }}>{mvr(item.cost)}</span>
                        </div>
                        {/* bar */}
                        <div style={{ height: 6, background: '#F0EAE3', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: 999,
                            background: `hsl(${Math.round(200 - i * 15)}, 70%, 55%)`,
                            width: `${maxItemCost > 0 ? (item.cost / maxItemCost) * 100 : 0}%`,
                            transition: 'width 0.4s ease',
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Raw breakdown table */}
            <TableCard>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Reason', 'Entries', 'Total Cost', '% of Total', 'Avg per Entry'].map(h => (
                      <th key={h} style={TH}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byReason.map(({ reason, count, cost }) => (
                    <tr key={reason}>
                      <td style={TD}>
                        <Badge color={REASON_COLOR[reason] ?? 'gray'}>{REASON_LABELS[reason] ?? reason}</Badge>
                      </td>
                      <td style={{ ...TD, fontWeight: 600 }}>{count}</td>
                      <td style={{ ...TD, fontWeight: 700, color: '#ef4444' }}>{mvr(cost)}</td>
                      <td style={TD}>{totalSummaryCost > 0 ? `${((cost / totalSummaryCost) * 100).toFixed(1)}%` : '—'}</td>
                      <td style={{ ...TD, color: '#6B5D4F' }}>{count > 0 ? mvr(cost / count) : '—'}</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#F8F6F3' }}>
                    <td style={{ ...TD, fontWeight: 700 }}>Total</td>
                    <td style={{ ...TD, fontWeight: 700 }}>{allLogs.length}</td>
                    <td style={{ ...TD, fontWeight: 700, color: '#ef4444' }}>{mvr(totalSummaryCost)}</td>
                    <td style={{ ...TD, fontWeight: 700 }}>100%</td>
                    <td style={{ ...TD, fontWeight: 700, color: '#6B5D4F' }}>
                      {allLogs.length > 0 ? mvr(totalSummaryCost / allLogs.length) : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </TableCard>
          </>
        )
      )}

      {/* ── Log Waste Modal ──────────────────────────────────────────────────── */}
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
