import { useEffect, useState } from 'react';
import { approvePurchase, getPurchaseSuggestions } from '../api';
import { Btn, Card, ErrorMsg, PageHeader, Spinner } from '../components/Layout';

const BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.PROD ? '/api' : 'http://localhost:8000/api');

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = localStorage.getItem('admin_token');
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts?.headers },
  });
  if (!res.ok) { const b = await res.json().catch(() => ({})) as { message?: string }; throw new Error(b.message ?? `Error ${res.status}`); }
  return res.json() as Promise<T>;
}

type Purchase = {
  id: number;
  purchase_number: string;
  status: string;
  total: number;
  subtotal?: number;
  purchase_date: string;
  expected_delivery_date: string | null;
  actual_delivery_date: string | null;
  approved_at: string | null;
  supplier: { id: number; name: string } | null;
  items: { id: number; quantity: number; received_quantity: number; receive_status: string; unit_cost: number; inventory_item: { id: number; name: string } | null }[];
};

const STATUS_COLOR: Record<string, string> = {
  draft:    '#64748b',
  ordered:  '#0ea5e9',
  partial:  '#f59e0b',
  received: '#22c55e',
  cancelled:'#ef4444',
};

export function PurchaseOrdersPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [suggestions, setSuggestions] = useState<{ items: { inventory_item_id: number; name: string; unit: string; current_stock: number; reorder_point: number; suggested_quantity: number; suggested_supplier: { id: number; name: string; price: number } | null }[]; by_supplier: { supplier_id: number | null; supplier_name: string; items: unknown[]; estimated_total: number }[] } | null>(null);
  const [sugLoading, setSugLoading] = useState(false);
  const [statusFilter, setStatus]   = useState('');
  const [detail, setDetail]         = useState<Purchase | null>(null);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await req<{ data: Purchase[] }>(`/purchases${statusFilter ? `?status=${statusFilter}` : ''}`);
      setPurchases(res.data ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  const loadSuggestions = async () => {
    setSugLoading(true);
    try { setSuggestions(await getPurchaseSuggestions()); }
    catch (e) { setError((e as Error).message); }
    finally { setSugLoading(false); }
  };

  useEffect(() => { void load(); }, [statusFilter]);

  const handleApprove = async (id: number) => {
    try {
      await approvePurchase(id);
      void load();
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <>
      <PageHeader title="Purchase Orders" subtitle="Manage procurement workflow" />
      {error && <ErrorMsg message={error} />}

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={statusFilter} onChange={e => setStatus(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 }}>
          <option value="">All Statuses</option>
          {['draft', 'ordered', 'partial', 'received', 'cancelled'].map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <Btn onClick={load}>Refresh</Btn>
        <div style={{ marginLeft: 'auto' }}>
          <Btn onClick={loadSuggestions}>{sugLoading ? 'Loading…' : 'Auto-Suggest POs'}</Btn>
        </div>
      </div>

      {/* Auto-Suggest section */}
      {suggestions && (
        <Card style={{ marginBottom: 20, background: '#fffbeb', border: '1px solid #fef08a' }}>
          <div style={{ fontWeight: 700, marginBottom: 12, color: '#92400e' }}>
            Low-Stock Suggestions ({suggestions.items.length} items below reorder point)
          </div>
          {suggestions.by_supplier.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: 13 }}>All items are above reorder points. No purchases needed.</div>
          ) : (
            suggestions.by_supplier.map(group => (
              <div key={group.supplier_id ?? 'unknown'} style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 8, color: '#0f172a' }}>
                  {group.supplier_name} — Est. MVR {group.estimated_total.toFixed(2)}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {(group.items as { name: string; current_stock: number; unit: string; suggested_quantity: number }[]).map(item => (
                    <div key={item.name} style={{ background: '#fff', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                      <span style={{ fontWeight: 600 }}>{item.name}</span>
                      <span style={{ color: '#dc2626', margin: '0 6px' }}>Stock: {item.current_stock.toFixed(2)}</span>
                      <span style={{ color: '#16a34a' }}>Order: {item.suggested_quantity} {item.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
          <button onClick={() => setSuggestions(null)} style={{ marginTop: 8, padding: '4px 10px', borderRadius: 6, border: '1px solid #fde68a', background: 'transparent', cursor: 'pointer', fontSize: 12 }}>Dismiss</button>
        </Card>
      )}

      {loading ? <Spinner /> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                {['PO Number', 'Supplier', 'Status', 'Total', 'PO Date', 'Exp. Delivery', 'Items', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 12, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {purchases.map(po => (
                <tr key={po.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1e293b' }}>
                    <button onClick={() => setDetail(po)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, color: '#6366f1', fontSize: 13 }}>{po.purchase_number}</button>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#475569' }}>{po.supplier?.name ?? '—'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                      background: (STATUS_COLOR[po.status] ?? '#64748b') + '22',
                      color: STATUS_COLOR[po.status] ?? '#64748b' }}>
                      {po.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 700 }}>MVR {(po.total ?? po.subtotal ?? 0).toFixed(2)}</td>
                  <td style={{ padding: '10px 12px', color: '#64748b' }}>{po.purchase_date}</td>
                  <td style={{ padding: '10px 12px', color: po.expected_delivery_date ? '#475569' : '#94a3b8' }}>{po.expected_delivery_date ?? '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#64748b' }}>{po.items?.length ?? 0}</td>
                  <td style={{ padding: '10px 12px' }}>
                    {po.status === 'draft' && (
                      <button onClick={() => handleApprove(po.id)}
                        style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#22c55e', color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                        Approve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {purchases.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No purchase orders found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <Card style={{ width: '100%', maxWidth: 560, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontWeight: 700 }}>{detail.purchase_number}</h3>
              <button onClick={() => setDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#94a3b8' }}>×</button>
            </div>
            <div style={{ fontSize: 13, color: '#475569', marginBottom: 16 }}>
              Supplier: <strong>{detail.supplier?.name ?? '—'}</strong> · Status: <strong>{detail.status}</strong> · Total: <strong>MVR {(detail.total ?? 0).toFixed(2)}</strong>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                  {['Item', 'Ordered', 'Received', 'Status'].map(h => (
                    <th key={h} style={{ padding: '8px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detail.items?.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '8px' }}>{item.inventory_item?.name ?? '—'}</td>
                    <td style={{ padding: '8px' }}>{item.quantity}</td>
                    <td style={{ padding: '8px', color: item.received_quantity >= item.quantity ? '#16a34a' : '#f59e0b' }}>{item.received_quantity}</td>
                    <td style={{ padding: '8px' }}>
                      <span style={{ padding: '2px 6px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                        background: item.receive_status === 'complete' ? '#dcfce7' : item.receive_status === 'partial' ? '#fef3c7' : '#f1f5f9',
                        color: item.receive_status === 'complete' ? '#16a34a' : item.receive_status === 'partial' ? '#92400e' : '#64748b' }}>
                        {item.receive_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </>
  );
}
