import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import {
  PageHeader, PageShell, TableCard, TH, TD, Badge, Btn, Modal, ModalActions, Pagination,
  StatCard, TableSkeleton, TableStateBar, ConfirmDialog, useConfirmDialog,
} from '../components/SharedUI';
import { OrderSearch, type OrderSearchSelection } from '../components/OrderSearch';
import { useToast } from '../components/ui';
import { fetchAdminRefunds, issueRefund, type AdminRefund } from '../api';

const STATUS_COLOR: Record<string, string> = {
  pending: 'orange', approved: 'green', processed: 'green', rejected: 'red', cancelled: 'gray',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'processed', label: 'Processed' },
  { value: 'rejected', label: 'Rejected' },
];

export default function RefundsPage() {
  usePageTitle('Refunds');
  const { can } = useCurrentUserPermissions();
  const canIssueRefund = can('orders.refund');
  const toast = useToast();
  const { state: dlg, ask, close: closeDlg } = useConfirmDialog();

  const [refunds, setRefunds] = useState<AdminRefund[]>([]);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [approvedTotal, setApprovedTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const [issueOpen, setIssueOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderSearchSelection | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetchAdminRefunds({ page, status: statusFilter || undefined });
      setRefunds(res.refunds?.data ?? []);
      setTotal(res.refunds?.total ?? 0);
      setLastPage(res.refunds?.last_page ?? 1);
      setApprovedTotal(res.meta?.approved_amount_total ?? 0);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [page, statusFilter]);

  const resetIssueForm = () => {
    setSelectedOrder(null);
    setAmount('');
    setReason('');
    setIssueError('');
  };

  const handleOrderChange = (order: OrderSearchSelection | null) => {
    setSelectedOrder(order);
    setIssueError('');
    if (order) {
      setAmount(order.total > 0 ? order.total.toFixed(2) : '');
    }
  };

  const submitIssue = async () => {
    if (!selectedOrder) return;
    const amt = parseFloat(amount);
    setIssuing(true); setIssueError('');
    try {
      await issueRefund(selectedOrder.id, { amount: amt, reason: reason.trim() });
      setIssueOpen(false);
      resetIssueForm();
      toast.success(`Refund of MVR ${amt.toFixed(2)} issued for order #${selectedOrder.orderNumber}.`);
      void load();
    } catch (e) {
      const msg = (e as Error).message;
      setIssueError(msg);
      toast.error(msg);
    }
    finally { setIssuing(false); }
  };

  const handleIssueClick = () => {
    const amt = parseFloat(amount);
    if (!selectedOrder) { setIssueError('Select an order first.'); return; }
    if (!amount || isNaN(amt) || amt <= 0) { setIssueError('Enter a valid amount.'); return; }
    if (!reason.trim()) { setIssueError('A reason is required before issuing a refund.'); return; }
    setIssueError('');
    ask({
      title: 'Confirm refund',
      message: `Issue MVR ${amt.toFixed(2)} refund for order #${selectedOrder.orderNumber}?\n\nReason: ${reason.trim()}\n\nYou need an open shift to process refunds.`,
      confirmLabel: 'Issue refund',
      danger: true,
      onConfirm: () => void submitIssue(),
    });
  };

  return (
    <PageShell>
    <div>
      <PageHeader section="Analyze"
        title="Refunds"
        action={canIssueRefund ? (
          <Btn onClick={() => { resetIssueForm(); setIssueOpen(true); }}>+ Process Refund</Btn>
        ) : undefined}
      />

      <TableStateBar error={error} onRetry={() => void load()} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard label="Total Refunds" value={String(total)} accent="var(--color-primary)" />
        <StatCard label="Total Refunded" value={`MVR ${approvedTotal.toFixed(2)}`} accent="var(--color-danger)" />
      </div>

      <div style={{ marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ height: 36, padding: '0 12px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', background: 'var(--color-surface)', color: 'var(--color-text)', cursor: 'pointer' }}
        >
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {statusFilter && (
          <Btn variant="ghost" onClick={() => { setStatusFilter(''); setPage(1); }}>Clear filters</Btn>
        )}
      </div>

      <TableCard stickyHead>
        {loading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : refunds.length === 0 ? (
          <TableStateBar isEmpty emptyMessage="No refunds found." filterActive={!!statusFilter} onClearFilters={() => { setStatusFilter(''); setPage(1); }} />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['#', 'Order', 'Amount', 'Reason', 'Status', 'Processed By', 'Date'].map(h => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {refunds.map(r => (
                <tr key={r.id}>
                  <td style={{ ...TD, color: 'var(--color-text-muted)', fontSize: 12 }}>{r.id}</td>
                  <td style={TD}>
                    <Link
                      to={`/orders?order=${r.order_id}`}
                      style={{ fontWeight: 600, color: 'var(--color-primary)', textDecoration: 'none' }}
                    >
                      {r.order ? `#${r.order.order_number}` : `Order #${r.order_id}`}
                    </Link>
                  </td>
                  <td style={{ ...TD, fontWeight: 700, color: 'var(--color-danger)' }}>MVR {parseFloat(String(r.amount ?? 0)).toFixed(2)}</td>
                  <td style={{ ...TD, color: 'var(--color-text-secondary)', fontSize: 13 }}>{r.reason ?? <span style={{ color: 'var(--color-text-muted)' }}>—</span>}</td>
                  <td style={TD}><Badge color={STATUS_COLOR[r.status] ?? 'gray'}>{r.status}</Badge></td>
                  <td style={{ ...TD, color: 'var(--color-text-muted)', fontSize: 12 }}>
                    {r.user?.id ? (
                      <Link to={`/staff?staff=${r.user.id}`} style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>
                        {r.user.name}
                      </Link>
                    ) : (r.user?.name ?? '—')}
                  </td>
                  <td style={{ ...TD, color: 'var(--color-text-muted)', fontSize: 12 }}>{new Date(r.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>

      <Pagination page={page} totalPages={lastPage} onChange={setPage} />

      {issueOpen && (
        <Modal title="Process Refund" onClose={() => { setIssueOpen(false); resetIssueForm(); }} maxWidth={480}>
          {issueError && <p style={{ color: 'var(--color-danger)', marginBottom: 12 }}>{issueError}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Order *</span>
              <OrderSearch value={selectedOrder} onChange={handleOrderChange} />
            </label>
            <label>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Refund Amount (MVR) *</span>
              <input type="number" min="0.01" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </label>
            <label>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Reason *</span>
              <textarea placeholder="Describe the reason (required)…" value={reason} onChange={e => setReason(e.target.value)} rows={3} style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
            </label>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>
              Requires an open shift. Amount is capped at what was paid minus prior refunds.
            </p>
          </div>
          <ModalActions>
            <Btn variant="secondary" onClick={() => { setIssueOpen(false); resetIssueForm(); }}>Cancel</Btn>
            <Btn variant="danger" onClick={handleIssueClick} disabled={issuing || !selectedOrder}>{issuing ? 'Processing…' : 'Issue Refund'}</Btn>
          </ModalActions>
        </Modal>
      )}

      <ConfirmDialog state={dlg} close={closeDlg} />
    </div>

    </PageShell>
  );
}
