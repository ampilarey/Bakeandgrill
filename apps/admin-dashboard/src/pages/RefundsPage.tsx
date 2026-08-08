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
import {
  fetchAdminRefunds, issueRefund, approveRefund, rejectRefund, resendRefundOtp,
  REFUND_REASON_CATEGORIES, type AdminRefund, type RefundReasonCategory,
} from '../api';

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

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  REFUND_REASON_CATEGORIES.map((c) => [c.value, c.label]),
);

export default function RefundsPage() {
  usePageTitle('Refunds');
  const { can, user } = useCurrentUserPermissions();
  const canRequest = can('orders.refund_request') || can('orders.refund');
  const canApprove = can('orders.refund');
  const isOwner = user?.role === 'owner';
  const toast = useToast();
  const { state: dlg, ask, close: closeDlg } = useConfirmDialog();

  const [refunds, setRefunds] = useState<AdminRefund[]>([]);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [approvedTotal, setApprovedTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [phoneAddedPending, setPhoneAddedPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const [issueOpen, setIssueOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderSearchSelection | null>(null);
  const [amount, setAmount] = useState('');
  const [reasonCategory, setReasonCategory] = useState<RefundReasonCategory | ''>('');
  const [reason, setReason] = useState('');
  const [refundPhone, setRefundPhone] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState('');

  const [approveOpen, setApproveOpen] = useState<AdminRefund | null>(null);
  const [approveOtp, setApproveOtp] = useState('');
  const [ownerOverride, setOwnerOverride] = useState(false);
  const [approveBusy, setApproveBusy] = useState(false);

  const [rejectOpen, setRejectOpen] = useState<AdminRefund | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectBusy, setRejectBusy] = useState(false);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetchAdminRefunds({ page, status: statusFilter || undefined });
      setRefunds(res.refunds?.data ?? []);
      setTotal(res.refunds?.total ?? 0);
      setLastPage(res.refunds?.last_page ?? 1);
      setApprovedTotal(res.meta?.approved_amount_total ?? 0);
      setPendingCount(res.meta?.pending_count ?? 0);
      setPhoneAddedPending(res.meta?.phone_added_pending ?? 0);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [page, statusFilter]);

  const resetIssueForm = () => {
    setSelectedOrder(null);
    setAmount('');
    setReasonCategory('');
    setReason('');
    setRefundPhone('');
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
    if (!selectedOrder || !reasonCategory) return;
    const amt = parseFloat(amount);
    setIssuing(true); setIssueError('');
    try {
      const res = await issueRefund(selectedOrder.id, {
        amount: amt,
        reason_category: reasonCategory,
        reason: reason.trim(),
        ...(refundPhone.trim() ? { refund_phone: refundPhone.trim() } : {}),
      });
      setIssueOpen(false);
      resetIssueForm();
      const auto = res.auto_approved;
      toast.success(
        auto
          ? `Refund of MVR ${amt.toFixed(2)} approved for order #${selectedOrder.orderNumber}.`
          : `Refund of MVR ${amt.toFixed(2)} requested for order #${selectedOrder.orderNumber}. Awaiting approval.`,
      );
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
    if (!reasonCategory) { setIssueError('Pick a reason category.'); return; }
    if (!reason.trim()) { setIssueError('Describe the reason.'); return; }
    if (reasonCategory === 'other' && reason.trim().length < 3) {
      setIssueError('Please describe the reason when category is Other.');
      return;
    }
    setIssueError('');
    ask({
      title: 'Confirm refund request',
      message: `Request MVR ${amt.toFixed(2)} refund for order #${selectedOrder.orderNumber}?\n\nCategory: ${CATEGORY_LABEL[reasonCategory] ?? reasonCategory}\nReason: ${reason.trim()}\n\nMoney does not leave the drawer until approved. An OTP is sent to the customer phone for the approver.`,
      confirmLabel: 'Request refund',
      danger: true,
      onConfirm: () => void submitIssue(),
    });
  };

  const submitApprove = async () => {
    if (!approveOpen) return;
    setApproveBusy(true);
    try {
      await approveRefund(approveOpen.id, ownerOverride
        ? { owner_override_without_otp: true }
        : { otp: approveOtp.trim() });
      setApproveOpen(null);
      setApproveOtp('');
      setOwnerOverride(false);
      toast.success(ownerOverride ? 'Refund approved (owner OTP override).' : 'Refund approved.');
      void load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setApproveBusy(false);
    }
  };

  const submitReject = async () => {
    if (!rejectOpen) return;
    const text = rejectionReason.trim();
    if (!text) return;
    setRejectBusy(true);
    try {
      await rejectRefund(rejectOpen.id, text);
      setRejectOpen(null);
      setRejectionReason('');
      toast.success('Refund rejected — no money moved.');
      void load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRejectBusy(false);
    }
  };

  return (
    <PageShell>
    <div>
      <PageHeader section="Analyze"
        title="Refunds"
        action={canRequest ? (
          <Btn onClick={() => { resetIssueForm(); setIssueOpen(true); }}>+ Request Refund</Btn>
        ) : undefined}
      />

      <TableStateBar error={error} onRetry={() => void load()} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard label="Total Refunds" value={String(total)} accent="var(--color-primary)" />
        <StatCard label="Total Refunded" value={`MVR ${approvedTotal.toFixed(2)}`} accent="var(--color-danger)" />
        <StatCard label="Awaiting approval" value={String(pendingCount)} accent="var(--color-warning)" />
        <StatCard label="Phone added (pending)" value={String(phoneAddedPending)} accent="var(--color-danger)" />
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
          <TableSkeleton rows={6} cols={9} />
        ) : refunds.length === 0 ? (
          <TableStateBar isEmpty emptyMessage="No refunds found." filterActive={!!statusFilter} onClearFilters={() => { setStatusFilter(''); setPage(1); }} />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['#', 'Order', 'Amount', 'Reason', 'Status', 'Requested by', 'Approved by', 'Date', ''].map(h => (
                  <th key={h || 'actions'} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {refunds.map(r => {
                const flags = r.phone_flags;
                const highlight = flags?.phone_added_at_refund || flags?.otp_owner_override || flags?.has_prior_order_history === false;
                return (
                <tr key={r.id} style={highlight ? { background: 'var(--color-danger-bg, #FEF2F2)' } : undefined}>
                  <td style={{ ...TD, color: 'var(--color-text-muted)', fontSize: 12 }}>{r.id}</td>
                  <td style={TD}>
                    <Link
                      to={`/orders?order=${r.order_id}`}
                      style={{ fontWeight: 600, color: 'var(--color-primary)', textDecoration: 'none' }}
                    >
                      {r.order ? `#${r.order.order_number}` : `Order #${r.order_id}`}
                    </Link>
                    <div style={{ fontSize: 11, marginTop: 2, color: 'var(--color-text-secondary)' }}>
                      {flags?.refund_phone ?? r.refund_phone ?? '—'}
                      {flags?.phone_added_at_refund ? ' · ADDED' : ''}
                      {flags?.has_prior_order_history === false ? ' · NO HISTORY' : ''}
                      {(flags?.refunds_last_90_days ?? 0) > 0 ? ` · ${flags?.refunds_last_90_days} refunds/90d` : ''}
                      {flags?.otp_owner_override || r.otp_owner_override ? ' · OTP OVERRIDE' : ''}
                    </div>
                  </td>
                  <td style={{ ...TD, fontWeight: 700, color: 'var(--color-danger)' }}>MVR {parseFloat(String(r.amount ?? 0)).toFixed(2)}</td>
                  <td style={{ ...TD, color: 'var(--color-text-secondary)', fontSize: 13 }}>
                    {r.reason_category && (
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>
                        {CATEGORY_LABEL[r.reason_category] ?? r.reason_category}
                      </div>
                    )}
                    {r.reason ?? <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                    {r.rejection_reason && (
                      <div style={{ color: 'var(--color-danger)', marginTop: 4, fontSize: 12 }}>
                        Rejected: {r.rejection_reason}
                      </div>
                    )}
                  </td>
                  <td style={TD}><Badge color={STATUS_COLOR[r.status] ?? 'gray'}>{r.status}</Badge></td>
                  <td style={{ ...TD, color: 'var(--color-text-muted)', fontSize: 12 }}>
                    {r.user?.id ? (
                      <Link to={`/staff?staff=${r.user.id}`} style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>
                        {r.user.name}
                      </Link>
                    ) : (r.user?.name ?? '—')}
                  </td>
                  <td style={{ ...TD, color: 'var(--color-text-muted)', fontSize: 12 }}>
                    {r.approver?.id ? (
                      <Link to={`/staff?staff=${r.approver.id}`} style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>
                        {r.approver.name}
                      </Link>
                    ) : (r.approver?.name ?? (r.status === 'pending' ? '—' : '—'))}
                  </td>
                  <td style={{ ...TD, color: 'var(--color-text-muted)', fontSize: 12 }}>{new Date(r.created_at).toLocaleDateString()}</td>
                  <td style={TD}>
                    {canApprove && r.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <Btn small variant="secondary" onClick={() => { setApproveOpen(r); setApproveOtp(''); setOwnerOverride(false); }}>Approve</Btn>
                        <Btn small variant="danger" onClick={() => { setRejectOpen(r); setRejectionReason(''); }}>Reject</Btn>
                      </div>
                    )}
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        )}
      </TableCard>

      <Pagination page={page} totalPages={lastPage} onChange={setPage} />

      {issueOpen && (
        <Modal title="Request Refund" onClose={() => { setIssueOpen(false); resetIssueForm(); }} maxWidth={480}>
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
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Reason category *</span>
              <select
                value={reasonCategory}
                onChange={e => setReasonCategory(e.target.value as RefundReasonCategory | '')}
                style={{ width: '100%', height: 40, padding: '0 12px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', background: 'var(--color-surface)', boxSizing: 'border-box' }}
              >
                <option value="">Select category…</option>
                {REFUND_REASON_CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                Details *{reasonCategory === 'other' ? ' (required for Other)' : ''}
              </span>
              <textarea placeholder="Describe what happened…" value={reason} onChange={e => setReason(e.target.value)} rows={3} style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
            </label>
            <label>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                Walk-in phone (only if order has none)
              </span>
              <input
                type="tel"
                placeholder="7XXXXXX"
                value={refundPhone}
                onChange={e => setRefundPhone(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </label>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>
              Requires an open shift. If the order already has a phone, that number is used and cannot be changed here. An OTP is sent to the customer for approval.
            </p>
          </div>
          <ModalActions>
            <Btn variant="secondary" onClick={() => { setIssueOpen(false); resetIssueForm(); }}>Cancel</Btn>
            <Btn variant="danger" onClick={handleIssueClick} disabled={issuing || !selectedOrder}>{issuing ? 'Submitting…' : 'Request Refund'}</Btn>
          </ModalActions>
        </Modal>
      )}

      {approveOpen && (
        <Modal title="Approve refund" onClose={() => { setApproveOpen(null); setApproveOtp(''); setOwnerOverride(false); }} maxWidth={440}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>
              Approve MVR {parseFloat(String(approveOpen.amount ?? 0)).toFixed(2)} for{' '}
              {approveOpen.order ? `#${approveOpen.order.order_number}` : `order #${approveOpen.order_id}`}.
            </p>
            <div style={{ fontSize: 12, padding: 10, borderRadius: 8, background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
              <div><strong>Phone:</strong> {approveOpen.phone_flags?.refund_phone ?? approveOpen.refund_phone ?? '—'}</div>
              {approveOpen.phone_flags?.phone_added_at_refund && <div style={{ color: 'var(--color-danger)', fontWeight: 700 }}>Number was added at refund time</div>}
              {approveOpen.phone_flags?.has_prior_order_history === false && <div style={{ color: 'var(--color-danger)', fontWeight: 700 }}>No prior order history for this number</div>}
              {(approveOpen.phone_flags?.refunds_last_90_days ?? 0) > 0 && (
                <div style={{ color: 'var(--color-warning)', fontWeight: 700 }}>
                  {approveOpen.phone_flags?.refunds_last_90_days} refund(s) to this number in 90 days
                </div>
              )}
            </div>
            {!ownerOverride && (
              <label>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Customer OTP *</span>
                <input
                  value={approveOtp}
                  onChange={e => setApproveOtp(e.target.value)}
                  placeholder="4-digit code from customer"
                  inputMode="numeric"
                  style={{ width: '100%', padding: '8px 12px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 16, letterSpacing: 4, fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
              </label>
            )}
            {isOwner && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
                <input type="checkbox" checked={ownerOverride} onChange={e => setOwnerOverride(e.target.checked)} />
                <span>
                  <strong>Owner override — no OTP</strong>
                  <span style={{ display: 'block', color: 'var(--color-text-muted)' }}>
                    Use only when the customer cannot receive SMS (e.g. tourist). This is recorded prominently.
                  </span>
                </span>
              </label>
            )}
            <Btn variant="ghost" onClick={() => void resendRefundOtp(approveOpen.id).then(() => toast.success('OTP resent.')).catch(e => toast.error((e as Error).message))}>
              Resend OTP
            </Btn>
          </div>
          <ModalActions>
            <Btn variant="secondary" onClick={() => { setApproveOpen(null); setApproveOtp(''); setOwnerOverride(false); }}>Cancel</Btn>
            <Btn
              variant="danger"
              disabled={approveBusy || (!ownerOverride && approveOtp.trim().length < 4)}
              onClick={() => void submitApprove()}
            >
              {approveBusy ? '…' : 'Approve'}
            </Btn>
          </ModalActions>
        </Modal>
      )}

      {rejectOpen && (
        <Modal title="Reject refund" onClose={() => { setRejectOpen(null); setRejectionReason(''); }} maxWidth={420}>
          <label>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Rejection reason *</span>
            <textarea
              rows={3}
              value={rejectionReason}
              onChange={e => setRejectionReason(e.target.value)}
              placeholder="Why is this refund declined?"
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </label>
          <ModalActions>
            <Btn variant="secondary" onClick={() => { setRejectOpen(null); setRejectionReason(''); }}>Cancel</Btn>
            <Btn variant="danger" disabled={rejectBusy || !rejectionReason.trim()} onClick={() => void submitReject()}>
              {rejectBusy ? '…' : 'Reject'}
            </Btn>
          </ModalActions>
        </Modal>
      )}

      <ConfirmDialog state={dlg} close={closeDlg} />
    </div>

    </PageShell>
  );
}
