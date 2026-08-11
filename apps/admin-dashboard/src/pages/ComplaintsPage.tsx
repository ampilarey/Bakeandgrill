import { useEffect, useState } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import {
  PageHeader, PageShell, TableCard, TH, TD, Badge, Btn, Modal, ModalActions,
  StatCard, TableSkeleton, TableStateBar, Pagination,
} from '../components/SharedUI';
// TableStateBar used for error/retry only
import { useToast } from '../components/ui';
import {
  addComplaintContactLog,
  fetchAdminComplaints,
  fetchComplaintPhotoBlob,
  getComplaint,
  linkComplaintRefund,
  updateComplaintStatus,
  type AdminComplaint,
  type ComplaintStatus,
} from '../api';

const CATEGORY_LABEL: Record<string, string> = {
  wrong_item: 'Wrong item',
  missing_item: 'Missing item',
  food_quality: 'Food quality',
  food_safety: 'Food safety / allergy',
  wrong_amount: 'Wrong amount',
  too_long: 'Took too long',
  delivery_problem: 'Delivery',
  something_else: 'Something else',
  bill_wrong_amount: 'Bill: wrong amount',
  bill_wrong_items: 'Bill: wrong items',
  bill_already_paid: 'Bill: already paid',
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'awaiting_customer', label: 'Awaiting customer' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'not_actionable', label: 'Not actionable' },
];

function categoryLabels(categories: string[] | undefined): string {
  if (!categories?.length) return '—';
  return categories.map((c) => CATEGORY_LABEL[c] ?? c).join(', ');
}

function ageLabel(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function ComplaintsPage() {
  usePageTitle('Complaints');
  const { can } = useCurrentUserPermissions();
  const canManage = can('complaints.manage');
  const toast = useToast();

  const [rows, setRows] = useState<AdminComplaint[]>([]);
  const [meta, setMeta] = useState({ open_count: 0, oldest_open_age_minutes: null as number | null });
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [status, setStatus] = useState('open');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<AdminComplaint | null>(null);
  const [nextStatus, setNextStatus] = useState<ComplaintStatus>('in_progress');
  const [internalNote, setInternalNote] = useState('');
  const [customerReply, setCustomerReply] = useState('');
  const [contactChannel, setContactChannel] = useState<'phone' | 'whatsapp' | 'in_person'>('phone');
  const [contactNote, setContactNote] = useState('');
  const [refundIdInput, setRefundIdInput] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchAdminComplaints({ page, status });
      setRows(res.complaints?.data ?? []);
      setLastPage(res.complaints?.last_page ?? 1);
      setMeta({
        open_count: res.meta?.open_count ?? 0,
        oldest_open_age_minutes: res.meta?.oldest_open_age_minutes ?? null,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [page, status]);

  const openDetail = async (id: number) => {
    try {
      const res = await getComplaint(id);
      setDetail(res.complaint);
      setNextStatus(
        res.complaint.status === 'new' ? 'in_progress' : res.complaint.status,
      );
      setInternalNote(res.complaint.internal_note ?? '');
      setCustomerReply(res.complaint.customer_reply ?? '');
      setRefundIdInput(res.complaint.refund_id ? String(res.complaint.refund_id) : '');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const saveRefundLink = async () => {
    if (!detail) return;
    const rid = parseInt(refundIdInput, 10);
    if (!Number.isFinite(rid) || rid < 1) {
      toast.error('Enter a valid refund id');
      return;
    }
    setBusy(true);
    try {
      const res = await linkComplaintRefund(detail.id, rid);
      setDetail(res.complaint);
      toast.success('Refund linked for audit');
      void load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveStatus = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      const res = await updateComplaintStatus(detail.id, {
        status: nextStatus,
        internal_note: internalNote.trim() || undefined,
        customer_reply: customerReply.trim() || undefined,
      });
      setDetail(res.complaint);
      toast.success('Status updated');
      void load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveContact = async () => {
    if (!detail || !contactNote.trim()) return;
    setBusy(true);
    try {
      await addComplaintContactLog(detail.id, {
        channel: contactChannel,
        note: contactNote.trim(),
      });
      setContactNote('');
      toast.success('Contact logged');
      await openDetail(detail.id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const closing = nextStatus === 'resolved' || nextStatus === 'not_actionable';

  const oldestLabel = meta.oldest_open_age_minutes == null
    ? '—'
    : meta.oldest_open_age_minutes < 60
      ? `${meta.oldest_open_age_minutes}m`
      : `${Math.floor(meta.oldest_open_age_minutes / 60)}h`;

  return (
    <PageShell>
      <PageHeader title="Complaints" subtitle="Customer concerns from receipts and invoices" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 16 }}>
        <StatCard label="Open" value={String(meta.open_count)} />
        <StatCard label="Oldest open" value={oldestLabel} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <select
          value={status}
          onChange={(e) => { setPage(1); setStatus(e.target.value); }}
          style={{ minHeight: 44 }}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <TableStateBar error={error || undefined} onRetry={() => void load()} />

      <TableCard stickyHead>
        {loading ? <TableSkeleton rows={6} cols={6} /> : (
          <table>
            <thead>
              <tr>
                {['Ref', 'Categories', 'Order', 'Customer', 'Amount', 'Age', ''].map((h) => (
                  <th key={h || 'actions'} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td style={{ ...TD, color: 'var(--color-text-muted)' }} colSpan={7}>No complaints</td></tr>
              ) : rows.map((c) => (
                <tr key={c.id} style={c.is_food_safety ? { background: 'color-mix(in srgb, var(--color-danger) 8%, transparent)' } : undefined}>
                  <td style={TD}>
                    {c.reference_number}{' '}
                    {c.is_food_safety && <Badge color="red">Food safety</Badge>}{' '}
                    {c.needs_refund_review && <Badge color="yellow">Refund review</Badge>}
                  </td>
                  <td style={TD}>{categoryLabels(c.categories)}</td>
                  <td style={TD}>{c.order?.order_number ?? '—'}</td>
                  <td style={TD}>{c.customer?.name || c.customer?.phone || '—'}</td>
                  <td style={TD}>{c.order ? `MVR ${Number(c.order.total).toFixed(2)}` : '—'}</td>
                  <td style={TD}>{ageLabel(c.created_at)}</td>
                  <td style={TD}>
                    <Btn small onClick={() => void openDetail(c.id)}>Open</Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>

      <Pagination page={page} totalPages={lastPage} onChange={setPage} />

      {detail && (
        <Modal title={detail.reference_number} onClose={() => setDetail(null)} maxWidth={720}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <strong>{categoryLabels(detail.categories)}</strong>
              {' · '}
              {detail.status}
              {detail.comment ? <p style={{ marginTop: 8 }}>{detail.comment}</p> : null}
              {detail.has_photo ? (
                <p style={{ marginTop: 8 }}>
                  <Btn
                    small
                    variant="ghost"
                    onClick={() => {
                      void (async () => {
                        try {
                          const blob = await fetchComplaintPhotoBlob(detail.id);
                          const url = URL.createObjectURL(blob);
                          window.open(url, '_blank', 'noopener,noreferrer');
                          setTimeout(() => URL.revokeObjectURL(url), 60_000);
                        } catch (e) {
                          toast.error((e as Error).message || 'Could not open photo');
                        }
                      })();
                    }}
                  >
                    View customer photo
                  </Btn>
                </p>
              ) : null}
            </div>

            {canManage && (
              <>
                <label>
                  Status
                  <select
                    value={nextStatus}
                    onChange={(e) => setNextStatus(e.target.value as ComplaintStatus)}
                    style={{ display: 'block', width: '100%', minHeight: 44 }}
                  >
                    {(['new', 'in_progress', 'awaiting_customer', 'resolved', 'not_actionable'] as ComplaintStatus[]).map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Internal note
                  <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: '4px 0 6px' }}>
                    Staff only. Never shown on the receipt and never sent by SMS.
                  </span>
                  <textarea value={internalNote} onChange={(e) => setInternalNote(e.target.value)} rows={2} style={{ width: '100%' }} />
                </label>
                <label>
                  Customer reply {closing ? '(required to close)' : ''}
                  <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: '4px 0 6px' }}>
                    The customer will see this on their receipt and in the resolution SMS.
                  </span>
                  <textarea
                    value={customerReply}
                    onChange={(e) => setCustomerReply(e.target.value)}
                    rows={3}
                    style={{
                      width: '100%',
                      border: closing ? '2px solid var(--color-primary)' : undefined,
                      background: closing ? 'color-mix(in srgb, var(--color-primary) 6%, transparent)' : undefined,
                    }}
                    placeholder="What should the customer see?"
                  />
                </label>
                <Btn onClick={() => void saveStatus()} disabled={busy}>Save status</Btn>

                {(detail.needs_refund_review || detail.refund_id || detail.refund) && (
                  <>
                    <hr />
                    <strong>Refund review</strong>
                    <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                      Billing complaints only flag review. Create the refund yourself on the order
                      (Refunds / Orders), then link the refund id here for audit. This page never
                      creates or approves a refund.
                    </p>
                    {detail.order?.id ? (
                      <p style={{ margin: 0, fontSize: '0.875rem' }}>
                        Order {detail.order.order_number} (#{detail.order.id})
                      </p>
                    ) : null}
                    {detail.refund ? (
                      <p style={{ margin: 0 }}>
                        Linked refund #{detail.refund.id} · {detail.refund.status} · MVR{' '}
                        {Number(detail.refund.amount).toFixed(2)}
                      </p>
                    ) : (
                      <label>
                        Refund id
                        <input
                          value={refundIdInput}
                          onChange={(e) => setRefundIdInput(e.target.value)}
                          inputMode="numeric"
                          style={{ display: 'block', width: '100%', minHeight: 44 }}
                          placeholder="id from Refunds page"
                        />
                      </label>
                    )}
                    {!detail.refund && (
                      <Btn onClick={() => void saveRefundLink()} disabled={busy || !refundIdInput.trim()}>
                        Link refund
                      </Btn>
                    )}
                  </>
                )}

                <hr />
                <strong>Contact log</strong>
                <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                  Internal only — records what staff did, not a message to the customer.
                </p>
                <select
                  value={contactChannel}
                  onChange={(e) => setContactChannel(e.target.value as typeof contactChannel)}
                  style={{ minHeight: 44 }}
                >
                  <option value="phone">Phone</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="in_person">In person</option>
                </select>
                <textarea value={contactNote} onChange={(e) => setContactNote(e.target.value)} rows={2} placeholder="What was said / agreed" style={{ width: '100%' }} />
                <Btn onClick={() => void saveContact()} disabled={busy || !contactNote.trim()}>Add contact note</Btn>
              </>
            )}

            <div>
              <strong>History</strong>
              <ul style={{ paddingLeft: 18 }}>
                {(detail.status_histories ?? []).map((h) => (
                  <li key={h.id}>
                    {h.from_status ?? '—'} → {h.to_status}
                    {h.internal_note ? ` — internal: ${h.internal_note}` : ''}
                    {h.customer_reply ? ` — customer reply: ${h.customer_reply}` : ''}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <strong>Logged contacts</strong>
              <ul style={{ paddingLeft: 18 }}>
                {(detail.contact_logs ?? []).length === 0 && <li>None yet</li>}
                {(detail.contact_logs ?? []).map((l) => (
                  <li key={l.id}>{l.channel}: {l.note}</li>
                ))}
              </ul>
            </div>
          </div>
          <ModalActions>
            <Btn variant="ghost" onClick={() => setDetail(null)}>Close</Btn>
          </ModalActions>
        </Modal>
      )}
    </PageShell>
  );
}
