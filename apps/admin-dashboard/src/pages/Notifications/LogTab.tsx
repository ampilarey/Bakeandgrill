import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { RotateCcw, Send, AlertTriangle } from 'lucide-react';
import {
  fetchStaffNotificationLogs, resendStaffNotification,
  type StaffNotificationLog,
} from '../../api';
import { Badge, Btn, EmptyState, Spinner, StatCard, TableCard, TD, TH, TabScrollRow } from '../../components/SharedUI';
import { MessageLog } from './MessageLog';
import { errorBox } from './shared';

/*
 * Notifications → Log (notifications audit, 2026-10-10): every message the
 * system tried to send, and the order alerts each staff member was sent,
 * with Resend for one that failed. They were the SMS page's Audit Logs
 * and the bottom half of Automations.
 */

type View = 'all' | 'order-alerts';

const STATUS_COLOR: Record<string, string> = { sent: 'green', failed: 'red', queued: 'orange', skipped: 'brown' };
// "Order confirmed" is not sent to someone already told the order is new
// (owner, 2026-10-10: two alerts seconds apart for one till sale).
const STATUS_LABEL: Record<string, string> = { skipped: 'skipped: already told' };

export function LogTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view: View = searchParams.get('view') === 'order-alerts' ? 'order-alerts' : 'all';
  const campaignId = Number(searchParams.get('campaign_id')) || undefined;

  const pick = (next: View) => {
    const p = new URLSearchParams(searchParams);
    if (next === 'all') p.delete('view'); else p.set('view', next);
    if (next !== 'all') p.delete('campaign_id');
    setSearchParams(p, { replace: true });
  };

  return (
    <>
      <TabScrollRow style={{ display: 'flex', gap: 6, marginBottom: 16 }} aria-label="Log">
        {([['all', 'Every message'], ['order-alerts', 'Staff order alerts']] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={view === id}
            className={`sms-cc-chip${view === id ? ' is-on' : ''}`}
            onClick={() => pick(id)}
          >
            {label}
          </button>
        ))}
      </TabScrollRow>
      {view === 'all'
        ? <MessageLog key={campaignId ?? 'all'} initialFilters={campaignId ? { campaign_id: campaignId } : undefined} />
        : <OrderAlertLog />}
    </>
  );
}

function OrderAlertLog() {
  const [logs, setLogs] = useState<StaffNotificationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [total, setTotal] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [resendingId, setResendingId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchStaffNotificationLogs({ status: statusFilter || undefined });
      setLogs(res.data);
      setTotal(res.meta.total);
    } catch (e) {
      setLogs([]);
      setTotal(null);
      setError((e as Error).message || 'Could not load the order alert log.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const resend = async (id: number) => {
    setResendingId(id);
    setActionError('');
    try {
      await resendStaffNotification(id);
      await load();
    } catch (e) {
      setActionError((e as Error).message || 'Could not resend.');
    } finally {
      setResendingId(null);
    }
  };

  const sent = logs.filter((l) => l.status === 'sent').length;
  const failed = logs.filter((l) => l.status === 'failed').length;
  const fallback = logs.filter((l) => l.fallback_used).length;

  return (
    <div data-testid="order-alert-log">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)', flex: '1 1 240px' }}>
          Who each order alert went to. Sent by email or Telegram counts as sent.
          {total !== null && <> {total.toLocaleString()} in all.</>}
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            aria-label="Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ minHeight: 32, border: '1px solid var(--color-border)', borderRadius: 8, padding: '4px 10px', fontSize: 13, fontFamily: 'inherit', background: 'var(--color-surface)', color: 'var(--color-text)' }}
          >
            <option value="">All statuses</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="queued">Queued</option>
            <option value="skipped">Skipped (already told)</option>
          </select>
          <Btn small variant="secondary" onClick={() => void load()} aria-label="Refresh"><RotateCcw size={13} /></Btn>
        </div>
      </div>

      {error && <div style={errorBox}>{error}</div>}
      {actionError && <div style={errorBox}>{actionError}</div>}

      {!error && total !== null && (
        <div className="form-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
          <StatCard label="Sent" value={sent.toString()} accent="var(--color-success)" />
          <StatCard label="Failed" value={failed.toString()} accent="var(--color-danger)" />
          <StatCard label="Fallback used" value={fallback.toString()} accent="var(--color-warning)" />
        </div>
      )}

      {loading ? <Spinner /> : error ? null : logs.length === 0 ? (
        <TableCard><EmptyState message="No order alerts logged yet." /></TableCard>
      ) : (
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr>{['Order', 'Alert', 'To', 'Message', 'Status', 'Fallback', 'When', ''].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td style={{ ...TD, fontWeight: 600 }}>
                    {l.order_id && l.order_number ? (
                      <Link to={`/orders?order=${l.order_id}`} style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}>
                        #{l.order_number}
                      </Link>
                    ) : l.order_number ? `#${l.order_number}` : '—'}
                    {l.order_type && <div style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>{l.order_type.replace(/_/g, ' ')}</div>}
                  </td>
                  <td style={TD}><Badge label={l.event_type.replace(/_/g, ' ')} color="brown" /></td>
                  <td style={{ ...TD, fontSize: 12 }}>
                    {l.phone.startsWith('user:') ? 'Email / Telegram' : <span style={{ fontFamily: 'monospace' }}>{l.phone}</span>}
                    <div style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>{l.recipient_type}</div>
                  </td>
                  <td style={{ ...TD, maxWidth: 220, color: 'var(--color-text-secondary)', fontSize: 12 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.message}>{l.message}</span>
                  </td>
                  <td style={TD} title={l.status === 'skipped' ? 'They already had the "new order" alert for this order' : undefined}><Badge label={STATUS_LABEL[l.status] ?? l.status} color={STATUS_COLOR[l.status] ?? 'gray'} /></td>
                  <td style={{ ...TD, textAlign: 'center' }}>
                    {l.fallback_used
                      ? <span style={{ color: 'var(--color-warning)', display: 'inline-flex' }} title="Went to the fallback staff" aria-label="Fallback used"><AlertTriangle size={14} aria-hidden /></span>
                      : '—'}
                  </td>
                  <td style={{ ...TD, color: 'var(--color-text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>
                    {l.sent_at ? new Date(l.sent_at).toLocaleString() : new Date(l.created_at).toLocaleString()}
                  </td>
                  <td style={TD}>
                    {l.status !== 'sent' && l.status !== 'skipped' && (
                      <Btn small variant="ghost" disabled={resendingId === l.id} onClick={() => void resend(l.id)} aria-label="Resend" title="Resend">
                        <Send size={12} />
                      </Btn>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}
    </div>
  );
}

export default LogTab;
