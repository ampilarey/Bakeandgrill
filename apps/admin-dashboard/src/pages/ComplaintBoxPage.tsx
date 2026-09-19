import { useEffect, useState } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  PageHeader, PageShell, TableCard, TD, TH, Badge, Btn, Modal, ModalActions,
  StatCard, TableSkeleton, TableStateBar, Pagination,
} from '../components/SharedUI';
import { useToast } from '../components/ui';
import {
  fetchComplaintBox,
  getComplaintBoxEntry,
  messageComplaintBoxCustomer,
  updateComplaintBoxStatus,
  type ComplaintBoxEntry,
  type ComplaintBoxMeta,
  type ComplaintBoxStatus,
} from '../api';

/*
 * The complaint box. Owner, 2026-09-19: "some customers complain about
 * staffs ... an easy way for customers to complain ... there should be an
 * easy way to see and manage the complains ... i want a separate complaints
 * option not the one now used, because now complain is about the receipt."
 *
 * The other Complaints page is about a receipt or an invoice. This one is
 * about the place: whoever, whenever, with or without a number.
 */

const STATUS_LABEL: Record<string, string> = {
  new: 'New',
  in_progress: 'Taken up',
  resolved: 'Sorted',
  closed: 'Closed',
};

const STATUS_COLOR: Record<string, string> = {
  new: 'red',
  in_progress: 'yellow',
  resolved: 'green',
  closed: 'gray',
};

const STATUS_FILTERS = [
  { value: 'open', label: 'Open' },
  { value: 'new', label: 'New' },
  { value: 'in_progress', label: 'Taken up' },
  { value: 'resolved', label: 'Sorted' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
];

/** What the owner usually wants to say; editable before it goes. */
const QUICK_MESSAGES: { label: string; text: string }[] = [
  { label: 'Taken up', text: 'We have read your complaint and are looking into it now. We will get back to you today.' },
  { label: 'Spoken to staff', text: 'We have spoken to the staff member concerned. We are sorry this happened and it will not happen again. Thank you for telling us.' },
  { label: 'Sorted', text: 'This has been sorted. Thank you for telling us — it helps us do better.' },
];

function ageLabel(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function when(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function ComplaintBoxPage() {
  usePageTitle('Complaint Box');
  const { can } = useCurrentUserPermissions();
  const canManage = can('complaints.manage');
  const toast = useToast();
  const isMobile = useIsMobile();

  const [rows, setRows] = useState<ComplaintBoxEntry[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [categoryOptions, setCategoryOptions] = useState<{ value: string; label: string }[]>([]);
  const [meta, setMeta] = useState<ComplaintBoxMeta>({ open_count: 0, new_count: 0, staff_open_count: 0, this_week_count: 0 });
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [status, setStatus] = useState('open');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [detail, setDetail] = useState<ComplaintBoxEntry | null>(null);
  const [nextStatus, setNextStatus] = useState<ComplaintBoxStatus>('in_progress');
  const [internalNote, setInternalNote] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchComplaintBox({ page, status, category: category || undefined, search: search.trim() || undefined });
      setRows(res.entries?.data ?? []);
      setLastPage(res.entries?.last_page ?? 1);
      setMeta(res.meta);
      setCategoryOptions(res.categories ?? []);
      setLabels(Object.fromEntries((res.categories ?? []).map((c) => [c.value, c.label])));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [page, status, category]);

  const cats = (e: ComplaintBoxEntry) => (e.categories ?? []).map((c) => labels[c] ?? c).join(', ') || '—';

  const openDetail = async (id: number) => {
    try {
      const res = await getComplaintBoxEntry(id);
      setDetail(res.entry);
      setNextStatus(res.entry.status === 'new' ? 'in_progress' : res.entry.status);
      setInternalNote(res.entry.internal_note ?? '');
      setMessage('');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const saveStatus = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      const res = await updateComplaintBoxStatus(detail.id, {
        status: nextStatus,
        internal_note: internalNote.trim() || undefined,
        message: message.trim() || undefined,
      });
      setDetail(res.entry);
      setMessage('');
      toast.success(message.trim() ? 'Saved, and the customer has been messaged' : 'Saved');
      void load();
    } catch (e) {
      toast.error((e as Error).message);
      // The status may have moved even if the SMS did not go.
      void openDetail(detail.id);
    } finally {
      setBusy(false);
    }
  };

  const sendMessage = async () => {
    if (!detail || !message.trim()) return;
    setBusy(true);
    try {
      const res = await messageComplaintBoxCustomer(detail.id, message.trim());
      setDetail(res.entry);
      setMessage('');
      toast.success('Message sent');
      void load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const contactCell = (e: ComplaintBoxEntry) => (e.is_anonymous || !e.phone
    ? <span style={{ color: 'var(--color-text-muted)' }}>Anonymous</span>
    : <a href={`tel:${e.phone}`}>{e.phone}</a>);

  return (
    <PageShell>
      <PageHeader
        section="Analyze"
        title="Complaint Box"
        subtitle="Staff, food and service complaints from the public form — anonymous or with a number"
        action={(
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a href={`${origin}/complain`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 14px', borderRadius: 10, border: '1px solid var(--color-border)', fontWeight: 600, fontSize: 13 }}>
              Open the form ↗
            </a>
            <a href={`${origin}/complain/poster`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 14px', borderRadius: 10, border: '1px solid var(--color-border)', fontWeight: 600, fontSize: 13 }}>
              Print QR poster
            </a>
          </div>
        )}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 16 }}>
        <StatCard label="Open" value={String(meta.open_count)} />
        <StatCard label="New, not yet read" value={String(meta.new_count)} accent="var(--color-danger)" />
        <StatCard label="About staff (open)" value={String(meta.staff_open_count)} accent="var(--color-warning)" />
        <StatCard label="This week" value={String(meta.this_week_count)} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); setPage(1); void load(); }}
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}
      >
        <select aria-label="Status" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} style={{ minHeight: 44 }}>
          {STATUS_FILTERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select aria-label="About" value={category} onChange={(e) => { setPage(1); setCategory(e.target.value); }} style={{ minHeight: 44 }}>
          <option value="">Everything</option>
          <option value="staff">Staff (any)</option>
          {categoryOptions.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <input
          aria-label="Search complaints"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, words, order, phone"
          style={{ minHeight: 44, flex: '1 1 200px', padding: '0 12px', border: '1px solid var(--color-border)', borderRadius: 10 }}
        />
        <Btn type="submit" variant="secondary">Search</Btn>
      </form>

      <TableStateBar error={error || undefined} onRetry={() => void load()} />

      {isMobile ? (
        <div data-testid="complaint-box-cards" style={{ display: 'grid', gap: 10 }}>
          {loading && <TableSkeleton rows={4} cols={1} />}
          {!loading && rows.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>No complaints here.</p>}
          {!loading && rows.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => void openDetail(e.id)}
              style={{ textAlign: 'left', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 12, display: 'grid', gap: 4, font: 'inherit', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <strong>{e.reference_number} · {cats(e)}</strong>
                <Badge label={STATUS_LABEL[e.status] ?? e.status} color={STATUS_COLOR[e.status] ?? 'gray'} />
              </div>
              {e.about_staff && <div style={{ fontSize: 13 }}>About: {e.about_staff}</div>}
              {e.comment && <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{e.comment}</div>}
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{contactCell(e)} · {ageLabel(e.created_at)}</div>
            </button>
          ))}
        </div>
      ) : (
        <TableCard stickyHead>
          {loading ? <TableSkeleton rows={6} cols={7} /> : (
            <table>
              <thead>
                <tr>
                  {['Ref', 'About', 'Who / what', 'Contact', 'When', 'Status', ''].map((h) => <th key={h} style={TH}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td style={{ ...TD, color: 'var(--color-text-muted)' }} colSpan={7}>No complaints here.</td></tr>
                ) : rows.map((e) => (
                  <tr key={e.id} style={e.status === 'new' ? { background: 'color-mix(in srgb, var(--color-danger) 6%, transparent)' } : undefined}>
                    <td style={TD}>{e.reference_number}</td>
                    <td style={TD}>{cats(e)}</td>
                    <td style={{ ...TD, maxWidth: 320 }}>
                      {e.about_staff && <div><strong>{e.about_staff}</strong></div>}
                      {e.comment && <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.comment}</div>}
                    </td>
                    <td style={TD}>{contactCell(e)}</td>
                    <td style={TD} title={when(e.created_at)}>{ageLabel(e.created_at)}</td>
                    <td style={TD}><Badge label={STATUS_LABEL[e.status] ?? e.status} color={STATUS_COLOR[e.status] ?? 'gray'} /></td>
                    <td style={TD}><Btn small onClick={() => void openDetail(e.id)}>Open</Btn></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableCard>
      )}

      <Pagination page={page} totalPages={lastPage} onChange={setPage} />

      {detail && (
        <Modal title={`${detail.reference_number} · ${STATUS_LABEL[detail.status] ?? detail.status}`} onClose={() => setDetail(null)} maxWidth={720}>
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <div><strong>{cats(detail)}</strong></div>
              {detail.about_staff && <div>About: <strong>{detail.about_staff}</strong></div>}
              {detail.comment ? (
                <p style={{ margin: 0, whiteSpace: 'pre-wrap', padding: 12, background: 'var(--color-bg)', borderRadius: 10 }}>{detail.comment}</p>
              ) : (
                <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>No description given.</p>
              )}
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span>Sent {when(detail.created_at)}</span>
                {detail.visited_on && <span>· Visit {new Date(detail.visited_on).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
                {detail.order_ref && <span>· Order {detail.order_ref}</span>}
                <span>· via {detail.source}</span>
              </div>
              <div data-testid="complaint-box-contact" style={{ fontSize: 13 }}>
                {detail.is_anonymous || !detail.phone ? (
                  <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>Anonymous — no number, so no reply can be sent.</span>
                ) : (
                  <span>Customer number: <a href={`tel:${detail.phone}`}><strong>{detail.phone}</strong></a></span>
                )}
                {detail.owner_alert_status !== 'sent' && (
                  <span style={{ marginLeft: 10, color: 'var(--color-danger)' }}>Owner SMS {detail.owner_alert_status}{detail.owner_alert_detail ? ` (${detail.owner_alert_detail})` : ''}</span>
                )}
              </div>
            </div>

            {canManage && (
              <div style={{ display: 'grid', gap: 10, borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
                <label>
                  Status
                  <select aria-label="New status" value={nextStatus} onChange={(e) => setNextStatus(e.target.value as ComplaintBoxStatus)} style={{ display: 'block', width: '100%', minHeight: 44 }}>
                    {(['new', 'in_progress', 'resolved', 'closed'] as ComplaintBoxStatus[]).map((s) => (
                      <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Note for staff
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)', margin: '2px 0 6px' }}>Never sent to the customer.</span>
                  <textarea aria-label="Note for staff" value={internalNote} onChange={(e) => setInternalNote(e.target.value)} rows={2} style={{ width: '100%' }} />
                </label>
                {/* Not a <label> around the whole block: a <button> is a
                    labelable element, so the label would attach itself to the
                    first quick-message button instead of the box. */}
                <div>
                  <div style={{ fontWeight: 600 }}>Message to the customer (SMS)</div>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)', margin: '2px 0 6px' }}>
                    {detail.is_anonymous || !detail.phone
                      ? 'Not possible — this complaint is anonymous.'
                      : `Goes to ${detail.phone} as "Bake & Grill (${detail.reference_number}): …"`}
                  </span>
                  {!(detail.is_anonymous || !detail.phone) && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                      {QUICK_MESSAGES.map((q) => (
                        <Btn key={q.label} small variant="ghost" type="button" onClick={() => setMessage(q.text)}>{q.label}</Btn>
                      ))}
                    </div>
                  )}
                  <textarea
                    aria-label="Message to the customer"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                    maxLength={600}
                    disabled={detail.is_anonymous || !detail.phone}
                    placeholder="What should the customer hear?"
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Btn onClick={() => void saveStatus()} disabled={busy}>
                    {message.trim() ? 'Save and send SMS' : 'Save'}
                  </Btn>
                  {!(detail.is_anonymous || !detail.phone) && (
                    <Btn variant="secondary" onClick={() => void sendMessage()} disabled={busy || !message.trim()}>Send SMS only</Btn>
                  )}
                </div>
              </div>
            )}

            <div>
              <strong>What happened since</strong>
              <ul data-testid="complaint-box-events" style={{ paddingLeft: 18, margin: '6px 0 0', display: 'grid', gap: 4, fontSize: 13 }}>
                {(detail.events ?? []).map((ev) => (
                  <li key={ev.id}>
                    <span style={{ color: 'var(--color-text-muted)' }}>{when(ev.created_at)}</span>{' '}
                    {ev.type === 'status' && (ev.from_status ? `${STATUS_LABEL[ev.from_status] ?? ev.from_status} → ${STATUS_LABEL[ev.to_status ?? ''] ?? ev.to_status}` : 'Received')}
                    {ev.type === 'note' && <>Note: {ev.message}</>}
                    {ev.type === 'sms' && <>SMS to customer{ev.sms_status && !['sent', 'demo', 'queued'].includes(ev.sms_status) ? ` (${ev.sms_status})` : ''}: “{ev.message}”</>}
                    {ev.user?.name ? <span style={{ color: 'var(--color-text-muted)' }}> — {ev.user.name}</span> : null}
                  </li>
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
