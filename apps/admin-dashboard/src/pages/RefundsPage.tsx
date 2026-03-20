import { useState, useEffect } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  PageHeader, TableCard, TH, TD, Badge, Btn, Modal, ModalActions, Pagination, EmptyState, StatCard,
} from '../components/SharedUI';
import { fetchAdminRefunds, issueRefund, type AdminRefund } from '../api';

const STATUS_COLOR: Record<string, string> = {
  pending: 'orange', approved: 'green', completed: 'green', rejected: 'red', cancelled: 'gray',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
];

export default function RefundsPage() {
  usePageTitle('Refunds');

  const [refunds, setRefunds] = useState<AdminRefund[]>([]);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const [issueOpen, setIssueOpen] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetchAdminRefunds({ page, status: statusFilter || undefined });
      setRefunds(res.refunds.data);
      setTotal(res.refunds.total);
      setLastPage(res.refunds.last_page);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [page, statusFilter]);

  const handleIssue = async () => {
    const oId = parseInt(orderId, 10);
    const amt = parseFloat(amount);
    if (!orderId || isNaN(oId) || oId <= 0) { setIssueError('Enter a valid order ID.'); return; }
    if (!amount || isNaN(amt) || amt <= 0) { setIssueError('Enter a valid amount.'); return; }
    setIssuing(true); setIssueError('');
    try {
      await issueRefund(oId, { amount: amt, reason: reason || undefined });
      setIssueOpen(false); setOrderId(''); setAmount(''); setReason('');
      void load();
    } catch (e) { setIssueError((e as Error).message); }
    finally { setIssuing(false); }
  };

  const approvedTotal = refunds
    .filter(r => ['approved', 'completed'].includes(r.status))
    .reduce((s, r) => s + parseFloat(String(r.amount ?? 0)), 0);

  return (
    <div>
      <PageHeader
        title="Refunds"
        action={<Btn onClick={() => { setIssueOpen(true); setIssueError(''); }}>+ Process Refund</Btn>}
      />
      {error && <p style={{ color: '#ef4444', marginBottom: 16 }}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard label="Total Refunds" value={String(total)} accent="#D4813A" />
        <StatCard label="Amount This Page" value={`MVR ${approvedTotal.toFixed(2)}`} accent="#ef4444" />
      </div>

      <div style={{ marginBottom: 20 }}>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ height: 36, padding: '0 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#1C1408', cursor: 'pointer' }}
        >
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <TableCard>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['#', 'Order', 'Amount', 'Reason', 'Status', 'Processed By', 'Date'].map(h => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#9C8E7E' }}>Loading…</td></tr>
            ) : refunds.length === 0 ? (
              <tr><td colSpan={7}><EmptyState message="No refunds found." /></td></tr>
            ) : refunds.map(r => (
              <tr key={r.id}>
                <td style={{ ...TD, color: '#9C8E7E', fontSize: 12 }}>{r.id}</td>
                <td style={TD}>
                  {r.order
                    ? <span style={{ fontWeight: 600 }}>#{r.order.order_number}</span>
                    : <span style={{ color: '#9C8E7E' }}>Order #{r.order_id}</span>}
                </td>
                <td style={{ ...TD, fontWeight: 700, color: '#ef4444' }}>MVR {parseFloat(String(r.amount ?? 0)).toFixed(2)}</td>
                <td style={{ ...TD, color: '#6B5D4F', fontSize: 13 }}>{r.reason ?? <span style={{ color: '#9C8E7E' }}>—</span>}</td>
                <td style={TD}><Badge color={STATUS_COLOR[r.status] ?? 'gray'}>{r.status}</Badge></td>
                <td style={{ ...TD, color: '#9C8E7E', fontSize: 12 }}>{r.user?.name ?? '—'}</td>
                <td style={{ ...TD, color: '#9C8E7E', fontSize: 12 }}>{new Date(r.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      <Pagination page={page} totalPages={lastPage} onChange={setPage} />

      {issueOpen && (
        <Modal title="Process Refund" onClose={() => setIssueOpen(false)}>
          {issueError && <p style={{ color: '#ef4444', marginBottom: 12 }}>{issueError}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>Order ID *</span>
              <input type="number" placeholder="e.g. 1042" value={orderId} onChange={e => setOrderId(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </label>
            <label>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>Refund Amount (MVR) *</span>
              <input type="number" min="0.01" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </label>
            <label>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>Reason</span>
              <textarea placeholder="Describe the reason…" value={reason} onChange={e => setReason(e.target.value)} rows={3} style={{ width: '100%', padding: '8px 12px', border: '1px solid #E8E0D8', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
            </label>
          </div>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setIssueOpen(false)}>Cancel</Btn>
            <Btn variant="danger" onClick={handleIssue} disabled={issuing}>{issuing ? 'Processing…' : 'Issue Refund'}</Btn>
          </ModalActions>
        </Modal>
      )}
    </div>
  );
}
