import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RotateCcw, Send, AlertTriangle, CheckCircle, Truck, Bell, UserPlus } from 'lucide-react';
import {
  getSiteSettings, updateSiteSettings,
  fetchStaffNotificationLogs, resendStaffNotification,
  type StaffNotificationLog,
} from '../../api';
import { Badge, Btn, EmptyState, Spinner, StatCard, TableCard, TD, TH } from '../../components/SharedUI';
import { isAutomationEnabled } from './automationSettings';

type EventConfig = {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
};

const EVENTS: EventConfig[] = [
  { key: 'staff_sms_new_order_enabled', label: 'New Order', description: 'Notify staff when a new order is placed.', icon: <Bell size={14} /> },
  { key: 'staff_sms_order_confirmed_enabled', label: 'Order Confirmed', description: 'Notify when order moves to in-progress / paid.', icon: <CheckCircle size={14} /> },
  { key: 'staff_sms_order_ready_enabled', label: 'Order Ready', description: 'Notify when order is marked ready.', icon: <CheckCircle size={14} /> },
  { key: 'staff_sms_order_out_for_delivery_enabled', label: 'Out for Delivery', description: 'Notify when a delivery order is on its way.', icon: <Truck size={14} /> },
  { key: 'staff_sms_no_staff_found_enabled', label: 'No Staff Found (Fallback)', description: 'Send alert to fallback contact when no matching staff is on shift.', icon: <AlertTriangle size={14} /> },
  { key: 'staff_sms_schedule_assigned_enabled', label: 'Schedule Assigned', description: 'SMS staff when a new shift is assigned to them.', icon: <Bell size={14} /> },
  { key: 'staff_sms_shift_reminder_enabled', label: 'Shift Reminder', description: 'Send a reminder 1 hour before each shift.', icon: <Bell size={14} /> },
  { key: 'staff_sms_new_customer_enabled', label: 'New Customer Registered', description: 'Notify staff when a new customer registers online or via POS.', icon: <UserPlus size={14} /> },
];

const STATUS_COLOR: Record<string, string> = { sent: 'green', failed: 'red', queued: 'orange' };

const errorBoxStyle: React.CSSProperties = {
  background: 'var(--color-danger-bg)',
  color: 'var(--color-danger-strong)',
  padding: '10px 14px',
  borderRadius: 8,
  marginBottom: 16,
  fontSize: '0.875rem',
};

export function AutomationsTab() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [settingsError, setSettingsError] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const [logs, setLogs] = useState<StaffNotificationLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState('');
  const [logsMeta, setLogsMeta] = useState<{ total: number } | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [resendingId, setResendingId] = useState<number | null>(null);

  const loadSettings = async () => {
    setLoadingSettings(true);
    setSettingsError('');
    try {
      const res = await getSiteSettings();
      const map: Record<string, string> = {};
      Object.values(res.settings ?? {}).forEach((group) => {
        (group as { key: string; value: string | null }[]).forEach(s => {
          if (s.value !== null) map[s.key] = s.value;
        });
      });
      // Successful fetch: absent keys default ON — same as StaffNotificationDispatcher.
      for (const event of EVENTS) {
        if (map[event.key] === undefined) map[event.key] = '1';
      }
      setSettings(map);
    } catch (e) {
      setSettings({});
      setSettingsError((e as Error).message || 'Failed to load automation settings.');
    } finally {
      setLoadingSettings(false);
    }
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    setLogsError('');
    try {
      const res = await fetchStaffNotificationLogs({ status: statusFilter || undefined });
      setLogs(res.data);
      setLogsMeta({ total: res.meta.total });
    } catch (e) {
      setLogs([]);
      setLogsMeta(null);
      setLogsError((e as Error).message || 'Failed to load notification logs.');
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => { void loadSettings(); }, []);
  useEffect(() => { void loadLogs(); }, [statusFilter]);

  const toggleEvent = async (key: string, currentValue: string) => {
    const newValue = currentValue === '1' || currentValue === '' ? '0' : '1';
    setSavingKey(key);
    setActionError('');
    try {
      await updateSiteSettings({ [key]: newValue });
      setSettings(s => ({ ...s, [key]: newValue }));
    } catch (e) {
      setActionError((e as Error).message || 'Failed to update automation.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleResend = async (id: number) => {
    setResendingId(id);
    setActionError('');
    try {
      await resendStaffNotification(id);
      await loadLogs();
    } catch (e) {
      setActionError((e as Error).message || 'Failed to resend notification.');
    } finally {
      setResendingId(null);
    }
  };

  const isEnabled = (key: string) => isAutomationEnabled(settings[key]);

  const sentCount = logs.filter(l => l.status === 'sent').length;
  const failedCount = logs.filter(l => l.status === 'failed').length;
  const fallbackCount = logs.filter(l => l.fallback_used).length;

  return (
    <>
      {/* Event Toggles */}
      <div style={{ marginBottom: 28 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Event Triggers</h3>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 16 }}>
          Enable or disable SMS notifications for each event. Staff routing is configured per-staff in the Staff page.
        </p>

        {actionError && (
          <div data-testid="automations-action-error" style={errorBoxStyle}>{actionError}</div>
        )}

        {loadingSettings ? <Spinner /> : settingsError ? (
          <div data-testid="automations-settings-error" style={errorBoxStyle}>
            <div style={{ marginBottom: 8 }}>
              Could not load automation settings — toggles are hidden so they cannot be mistaken for live state.
            </div>
            <div style={{ marginBottom: 10 }}>{settingsError}</div>
            <Btn variant="secondary" onClick={() => void loadSettings()}>Retry</Btn>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }} data-testid="automations-toggles">
            {EVENTS.map(event => {
              const enabled = isEnabled(event.key);
              return (
                <div key={event.key} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '12px 16px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ color: 'var(--color-primary)' }}>{event.icon}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{event.label}</div>
                      <div style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{event.description}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={`${event.label}: ${enabled ? 'enabled' : 'disabled'}`}
                    data-testid={`automation-toggle-${event.key}`}
                    data-enabled={enabled ? '1' : '0'}
                    onClick={() => toggleEvent(event.key, settings[event.key] ?? '1')}
                    disabled={savingKey === event.key}
                    style={{
                      width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                      background: enabled ? 'var(--color-primary)' : '#D1D5DB', transition: 'background 0.2s',
                      position: 'relative', flexShrink: 0,
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: 3, left: enabled ? 22 : 3,
                      width: 18, height: 18, borderRadius: '50%', background: 'var(--color-surface)', transition: 'left 0.2s',
                    }} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Notification Logs */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>Staff Notification Log</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 10px', fontSize: 13, fontFamily: 'inherit' }}>
              <option value="">All Statuses</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
              <option value="queued">Queued</option>
            </select>
            <Btn variant="secondary" onClick={() => void loadLogs()}><RotateCcw size={13} /></Btn>
          </div>
        </div>

        {logsError && (
          <div data-testid="automations-logs-error" style={errorBoxStyle}>{logsError}</div>
        )}

        {logsMeta && (
          <div className="form-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
            <StatCard label="Total Sent" value={sentCount.toString()} accent="var(--color-success)" />
            <StatCard label="Failed" value={failedCount.toString()} accent="var(--color-danger)" />
            <StatCard label="Fallback Used" value={fallbackCount.toString()} accent="var(--color-warning)" />
          </div>
        )}

        {logsLoading ? <Spinner /> : logsError ? null : logs.length === 0 ? (
          <TableCard><EmptyState message="No staff notifications logged yet." /></TableCard>
        ) : (
          <TableCard>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr>{['Order', 'Event', 'Recipient', 'Phone', 'Message', 'Status', 'Fallback', 'Sent At', ''].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l.id}>
                    <td style={{ ...TD, fontWeight: 600 }}>
                      {l.order_id && l.order_number ? (
                        <Link
                          to={`/orders?order=${l.order_id}`}
                          style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}
                        >
                          #{l.order_number}
                        </Link>
                      ) : l.order_number ? (
                        `#${l.order_number}`
                      ) : (
                        '—'
                      )}
                      {l.order_type && <div style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>{l.order_type}</div>}
                    </td>
                    <td style={TD}><Badge label={l.event_type.replace(/_/g, ' ')} color="blue" /></td>
                    <td style={{ ...TD, color: 'var(--color-text-secondary)', fontSize: 11 }}>
                      <Badge label={l.recipient_type} color="gray" />
                    </td>
                    <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12 }}>{l.phone}</td>
                    <td style={{ ...TD, maxWidth: 200, color: 'var(--color-text-secondary)', fontSize: 11 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.message}</span>
                    </td>
                    <td style={TD}><Badge label={l.status} color={STATUS_COLOR[l.status] ?? 'gray'} /></td>
                    <td style={{ ...TD, textAlign: 'center' }}>
                      {l.fallback_used ? <span style={{ color: 'var(--color-warning)', fontSize: 13 }}>⚠</span> : '—'}
                    </td>
                    <td style={{ ...TD, color: 'var(--color-text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>
                      {l.sent_at ? new Date(l.sent_at).toLocaleString() : '—'}
                    </td>
                    <td style={TD}>
                      {l.status !== 'sent' && (
                        <Btn variant="ghost" disabled={resendingId === l.id} onClick={() => void handleResend(l.id)} title="Resend">
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
    </>
  );
}
