import { useEffect, useState } from 'react';
import { approvePurchase, getPurchaseSuggestions, apiRequest as req, type PurchaseSuggestions } from '../api';
import { Badge, Btn, Card, EmptyState, ErrorMsg, Modal, ModalActions, PageHeader, Select, Spinner, TableCard, TD, TH } from '../components/Layout';
import { usePageTitle } from '../hooks/usePageTitle';

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
  items: {
    id: number; quantity: number; received_quantity: number;
    receive_status: string; unit_cost: number;
    inventory_item: { id: number; name: string } | null;
  }[];
};

const STATUS_COLOR: Record<string, string> = {
  draft:    'gray',
  ordered:  'blue',
  partial:  'yellow',
  received: 'green',
  cancelled:'red',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'draft',     label: 'Draft'     },
  { value: 'ordered',   label: 'Ordered'   },
  { value: 'partial',   label: 'Partial'   },
  { value: 'received',  label: 'Received'  },
  { value: 'cancelled', label: 'Cancelled' },
];

export function PurchaseOrdersPage() {
  usePageTitle('Purchase Orders');
  const [purchases, setPurchases]         = useState<Purchase[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState('');
  const [suggestions, setSuggestions]     = useState<PurchaseSuggestions | null>(null);
  const [sugLoading, setSugLoading]       = useState(false);
  const [statusFilter, setStatus]         = useState('');
  const [detail, setDetail]               = useState<Purchase | null>(null);

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
    try { await approvePurchase(id); void load(); }
    catch (e) { setError((e as Error).message); }
  };

  return (
    <>
      <PageHeader title="Purchase Orders" subtitle="Manage procurement workflow" />
      {error && <ErrorMsg message={error} />}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Select value={statusFilter} onChange={(v) => setStatus(v)} options={STATUS_OPTIONS} style={{ width: 180 }} />
        <Btn variant="secondary" onClick={load}>↻ Refresh</Btn>
        <div style={{ marginLeft: 'auto' }}>
          <Btn onClick={loadSuggestions} disabled={sugLoading}>
            {sugLoading ? 'Loading…' : '💡 Auto-Suggest POs'}
          </Btn>
        </div>
      </div>

      {/* Suggestions panel */}
      {suggestions && (
        <Card style={{ marginBottom: 20, background: '#fffbeb', border: '1px solid #fef08a' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <p style={{ fontWeight: 700, color: '#92400e', margin: 0, fontSize: 14 }}>
              Low-Stock Suggestions — {suggestions.items.length} items below reorder point
            </p>
            <Btn small variant="ghost" onClick={() => setSuggestions(null)}>Dismiss</Btn>
          </div>
          {suggestions.by_supplier.length === 0 ? (
            <p style={{ color: '#6B5D4F', fontSize: 13, margin: 0 }}>All items are above reorder points. No purchases needed.</p>
          ) : (
            suggestions.by_supplier.map((group) => (
              <div key={group.supplier_id ?? 'unknown'} style={{ marginBottom: 16 }}>
                <p style={{ fontWeight: 700, marginBottom: 8, color: '#1C1408', fontSize: 13, margin: '0 0 8px' }}>
                  {group.supplier_name} — Est. MVR {group.estimated_total.toFixed(2)}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {(group.items as { name: string; current_stock: number; unit: string; suggested_quantity: number }[]).map((item) => (
                    <div key={item.name} style={{ background: '#fff', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 14px', fontSize: 13 }}>
                      <span style={{ fontWeight: 700, color: '#1C1408' }}>{item.name}</span>
                      <span style={{ color: '#ef4444', margin: '0 6px' }}>Stock: {item.current_stock.toFixed(2)}</span>
                      <span style={{ color: '#16a34a' }}>Order: {item.suggested_quantity} {item.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </Card>
      )}

      {/* Purchase Orders table */}
      {loading ? <Spinner /> : purchases.length === 0 ? (
        <Card><EmptyState message="No purchase orders found." /></Card>
      ) : (
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                {['PO Number', 'Supplier', 'Status', 'Total', 'PO Date', 'Exp. Delivery', 'Items', 'Actions'].map((h) => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {purchases.map((po) => (
                <tr key={po.id}>
                  <td style={{ ...TD, fontWeight: 700 }}>
                    <button
                      onClick={() => setDetail(po)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: '#D4813A', fontSize: 14, fontFamily: 'inherit', padding: 0 }}
                    >
                      {po.purchase_number}
                    </button>
                  </td>
                  <td style={{ ...TD, color: '#6B5D4F' }}>{po.supplier?.name ?? '—'}</td>
                  <td style={TD}>
                    <Badge label={po.status.toUpperCase()} color={STATUS_COLOR[po.status] ?? 'gray'} />
                  </td>
                  <td style={{ ...TD, fontWeight: 700, color: '#D4813A' }}>MVR {(po.total ?? po.subtotal ?? 0).toFixed(2)}</td>
                  <td style={{ ...TD, color: '#6B5D4F', whiteSpace: 'nowrap' }}>{po.purchase_date}</td>
                  <td style={{ ...TD, color: po.expected_delivery_date ? '#6B5D4F' : '#9C8E7E', whiteSpace: 'nowrap' }}>
                    {po.expected_delivery_date ?? '—'}
                  </td>
                  <td style={{ ...TD, color: '#6B5D4F', textAlign: 'center' }}>{po.items?.length ?? 0}</td>
                  <td style={TD}>
                    {po.status === 'draft' && (
                      <Btn small onClick={() => handleApprove(po.id)}>Approve</Btn>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      {/* Detail modal */}
      {detail && (
        <Modal title={detail.purchase_number} onClose={() => setDetail(null)} maxWidth={560}>
          <p style={{ fontSize: 13, color: '#6B5D4F', marginBottom: 16 }}>
            Supplier: <strong style={{ color: '#1C1408' }}>{detail.supplier?.name ?? '—'}</strong>
            {' · '}Status: <strong style={{ color: '#1C1408' }}>{detail.status}</strong>
            {' · '}Total: <strong style={{ color: '#D4813A' }}>MVR {(detail.total ?? 0).toFixed(2)}</strong>
          </p>
          <TableCard>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Item', 'Ordered', 'Received', 'Status'].map((h) => (
                    <th key={h} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detail.items?.map((item) => (
                  <tr key={item.id}>
                    <td style={TD}>{item.inventory_item?.name ?? '—'}</td>
                    <td style={{ ...TD, textAlign: 'center' }}>{item.quantity}</td>
                    <td style={{
                      ...TD, textAlign: 'center', fontWeight: 700,
                      color: item.received_quantity >= item.quantity ? '#22c55e' : '#f59e0b',
                    }}>
                      {item.received_quantity}
                    </td>
                    <td style={TD}>
                      <Badge
                        label={item.receive_status}
                        color={item.receive_status === 'complete' ? 'green' : item.receive_status === 'partial' ? 'yellow' : 'gray'}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setDetail(null)}>Close</Btn>
          </ModalActions>
        </Modal>
      )}
    </>
  );
}
