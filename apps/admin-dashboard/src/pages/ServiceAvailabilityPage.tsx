import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock3,
  History,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Settings2,
  ShieldAlert,
} from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  Badge,
  Btn,
  Card,
  ErrorMsg,
  Input,
  Modal,
  ModalActions,
  PageHeader, PageShell,
  Select,
  Spinner,
  StatCard,
} from '../components/SharedUI';
import {
  applyPreset,
  getServiceHistory,
  listServiceStates,
  notifyRestoration,
  previewPreset,
  restoreService,
  updateServiceState,
  type PresetPreview,
  type ServiceHistoryResponse,
  type ServiceReasonType,
  type ServiceStateRow,
  type ServiceStatus,
  type ServiceStateUpdatePayload,
} from '../api';

// ── Catalog (human labels — mirrors config/service_availability.php) ─────────

type ServiceMeta = {
  label: string;
  blurb: string;
  affects: string;
};

const SERVICE_META: Record<string, ServiceMeta> = {
  online_ordering: {
    label: 'Online ordering',
    blurb: 'Umbrella pause for pickup + delivery + checkout.',
    affects: 'Order app',
  },
  online_pickup: {
    label: 'Pickup orders',
    blurb: 'New customer pickup orders.',
    affects: 'Order app · Pickup',
  },
  online_delivery: {
    label: 'Delivery orders',
    blurb: 'New customer delivery orders. Existing jobs keep running.',
    affects: 'Order app · Delivery',
  },
  online_checkout: {
    label: 'Checkout',
    blurb: 'Browse-only mode — menu stays up, place-order is blocked.',
    affects: 'Order app',
  },
  online_payment: {
    label: 'Online payment',
    blurb: 'Blocks new BML/Stripe initiation. COD and callbacks stay.',
    affects: 'Order app · Payments',
  },
  catering_inquiry: {
    label: 'Catering inquiries',
    blurb: 'New catering / event request forms.',
    affects: 'Website · Order app',
  },
  customer_registration: {
    label: 'New registrations',
    blurb: 'New accounts & guest sessions. Login and tracking stay open.',
    affects: 'Order app · Auth',
  },
  marketing_site: {
    label: 'Marketing website',
    blurb: 'Rare: serves a branded maintenance page instead of the site.',
    affects: 'bakeandgrill.mv',
  },
  pos_sales: {
    label: 'POS sales',
    blurb: 'Blocks new POS tickets only. Settle / print stay available.',
    affects: 'POS',
  },
  kds_operations: {
    label: 'KDS operations',
    blurb: 'Blocks kitchen state changes. Board remains readable.',
    affects: 'KDS',
  },
  delivery_operations: {
    label: 'Delivery dispatch',
    blurb: 'Blocks driver assign / driver writes. In-flight jobs continue.',
    affects: 'Delivery app',
  },
  emergency_write_lock: {
    label: 'Emergency write lock',
    blurb: 'Master internal kill switch. Prefer the Emergency lockdown preset.',
    affects: 'POS · KDS · Delivery',
  },
};

const STATUS_LABEL: Record<ServiceStatus, string> = {
  available: 'Available',
  operational_pause: 'Paused',
  scheduled_maintenance: 'Scheduled',
  unavailable: 'Unavailable',
  emergency_disabled: 'Emergency',
};

const STATUS_BADGE: Record<ServiceStatus, string> = {
  available: 'green',
  operational_pause: 'yellow',
  scheduled_maintenance: 'blue',
  unavailable: 'red',
  emergency_disabled: 'red',
};

const REASON_OPTIONS: Array<{ value: ServiceReasonType | ''; label: string }> = [
  { value: '', label: 'No reason set' },
  { value: 'operational_pause', label: 'Operational pause' },
  { value: 'technical_maintenance', label: 'Technical maintenance' },
  { value: 'payment_issue', label: 'Payment issue' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'emergency', label: 'Emergency' },
];

const STATUS_OPTIONS: Array<{ value: ServiceStatus; label: string }> = [
  { value: 'available', label: 'Available' },
  { value: 'operational_pause', label: 'Operational pause' },
  { value: 'scheduled_maintenance', label: 'Scheduled maintenance' },
  { value: 'unavailable', label: 'Unavailable' },
  { value: 'emergency_disabled', label: 'Emergency disabled' },
];

const PRESETS: Array<{
  id: string;
  label: string;
  description: string;
  danger?: boolean;
}> = [
  {
    id: 'pause_all_online_ordering',
    label: 'Pause all online ordering',
    description: 'Pickup, delivery, and checkout pause together. Marketing site stays up.',
  },
  {
    id: 'pause_delivery_only',
    label: 'Pause delivery only',
    description: 'Delivery paused — pickup and checkout remain open.',
  },
  {
    id: 'public_transaction_maintenance',
    label: 'Public transaction maintenance',
    description: 'Blocks public checkout / payment / catering. Site & tracking stay up.',
  },
  {
    id: 'emergency_lockdown',
    label: 'Emergency lockdown',
    description: 'Owner only. Disables POS, KDS, delivery ops, and public writes.',
    danger: true,
  },
];

const HIGH_IMPACT_KEYS = new Set([
  'pos_sales',
  'kds_operations',
  'delivery_operations',
  'emergency_write_lock',
]);

function metaFor(key: string): ServiceMeta {
  return SERVICE_META[key] ?? {
    label: key.replace(/_/g, ' '),
    blurb: '',
    affects: key,
  };
}

function needsTypedConfirm(key: string, status: ServiceStatus): boolean {
  return status === 'emergency_disabled' || (HIGH_IMPACT_KEYS.has(key) && status !== 'available');
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Convert API ISO → value for <input type="datetime-local"> */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(local: string): string | null {
  if (!local.trim()) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function defaultPauseMessage(key: string): string {
  const defaults: Record<string, string> = {
    online_ordering: 'Online ordering is temporarily unavailable — please call us or visit us.',
    online_checkout: 'Online ordering is temporarily unavailable — please call us or visit us.',
    online_delivery: 'Delivery is temporarily unavailable — pickup is still available.',
    online_pickup: 'Pickup orders are temporarily paused.',
    online_payment: 'Online payment is temporarily unavailable. Cash on collection is still available.',
    catering_inquiry: 'Catering inquiries are temporarily paused.',
    customer_registration: 'New account signups are temporarily paused.',
    marketing_site: 'Our website is temporarily down for maintenance. Please call us.',
  };
  return defaults[key] ?? `${metaFor(key).label} is temporarily unavailable.`;
}

// ── Page ─────────────────────────────────────────────────────────────────────

type Toast = { msg: string; type: 'ok' | 'err' };

export default function ServiceAvailabilityPage() {
  usePageTitle('Service Availability');

  const [rows, setRows] = useState<ServiceStateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const [presetPreview, setPresetPreview] = useState<PresetPreview | null>(null);
  const [presetBusy, setPresetBusy] = useState(false);
  const [presetConfirmText, setPresetConfirmText] = useState('');

  const [editing, setEditing] = useState<ServiceStateRow | null>(null);
  const [notifyTarget, setNotifyTarget] = useState<ServiceStateRow | null>(null);

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    window.setTimeout(() => setToast(null), 3500);
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listServiceStates();
      setRows(response.data);
    } catch (e) {
      setError((e as Error).message ?? 'Failed to load service states');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const grouped = useMemo(() => {
    const publicRows = rows.filter((r) => r.group === 'public');
    const internalRows = rows.filter((r) => r.group === 'internal');
    return { publicRows, internalRows };
  }, [rows]);

  const summary = useMemo(() => {
    const available = rows.filter((r) => r.resolved_available).length;
    const blocked = rows.filter((r) => !r.resolved_available).length;
    const waiting = rows.reduce((n, r) => n + (r.waiting_notify_count || 0), 0);
    const scheduled = rows.filter(
      (r) => r.status === 'scheduled_maintenance' || (!!r.starts_at && r.status !== 'available'),
    ).length;
    return { available, blocked, waiting, scheduled, total: rows.length };
  }, [rows]);

  const quickPause = async (row: ServiceStateRow) => {
    setBusyKey(row.service_key);
    try {
      const payload: ServiceStateUpdatePayload = {
        status: 'operational_pause',
        reason_type: 'operational_pause',
        public_message: row.public_message || defaultPauseMessage(row.service_key),
        notify_enabled: true,
      };
      if (needsTypedConfirm(row.service_key, 'operational_pause')) {
        // Internal keys require typed confirm — open the editor instead.
        setEditing(row);
        showToast('Confirm this high-impact change in the editor.', 'err');
        return;
      }
      await updateServiceState(row.service_key, payload);
      showToast(`${metaFor(row.service_key).label} paused.`);
      await load();
    } catch (e) {
      showToast((e as Error).message ?? 'Pause failed', 'err');
    } finally {
      setBusyKey(null);
    }
  };

  const quickRestore = async (row: ServiceStateRow) => {
    setBusyKey(row.service_key);
    try {
      await restoreService(row.service_key);
      showToast(`${metaFor(row.service_key).label} restored.`);
      const refreshed = await listServiceStates();
      setRows(refreshed.data);
      const next = refreshed.data.find((r) => r.service_key === row.service_key);
      if (next && next.waiting_notify_count > 0) {
        setNotifyTarget(next);
      }
    } catch (e) {
      showToast((e as Error).message ?? 'Restore failed', 'err');
    } finally {
      setBusyKey(null);
    }
  };

  const runPresetPreview = async (preset: string) => {
    setPresetBusy(true);
    setPresetConfirmText('');
    try {
      const preview = await previewPreset(preset);
      setPresetPreview(preview);
    } catch (e) {
      showToast((e as Error).message ?? 'Preview failed', 'err');
    } finally {
      setPresetBusy(false);
    }
  };

  const applyPresetNow = async () => {
    if (!presetPreview) return;
    const isEmergency = presetPreview.preset === 'emergency_lockdown';
    if (isEmergency && presetConfirmText.trim().toUpperCase() !== 'EMERGENCY LOCKDOWN') {
      showToast('Type EMERGENCY LOCKDOWN to confirm.', 'err');
      return;
    }
    setPresetBusy(true);
    try {
      await applyPreset(
        presetPreview.preset,
        isEmergency ? 'Emergency lockdown from admin' : 'Preset applied from admin',
      );
      setPresetPreview(null);
      showToast('Preset applied.');
      await load();
    } catch (e) {
      showToast((e as Error).message ?? 'Apply failed', 'err');
    } finally {
      setPresetBusy(false);
    }
  };

  return (
    <PageShell>
    <div className="svc-avail-page">
      <PageHeader section="System"
        title="Service Availability"
        subtitle="Pause or restore services during maintenance. Every change is audited."
        action={
          <Btn variant="secondary" onClick={() => void load()} disabled={loading} aria-label="Refresh">
            <RefreshCw size={16} />
            <span className="svc-avail-hide-mobile">Refresh</span>
          </Btn>
        }
      />

      {toast && (
        <div
          className="svc-avail-toast"
          role="status"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 'var(--z-toast)' as unknown as number,
background: toast.type === 'ok' ? 'var(--color-success)' : 'var(--color-danger)',
            color: '#fff',
            padding: '12px 16px',
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
            boxShadow: '0 8px 24px rgba(28,20,8,0.18)',
            maxWidth: 360,
          }}
        >
          {toast.msg}
        </div>
      )}

      {error && <ErrorMsg message={error} />}

      {loading && rows.length === 0 ? (
        <Spinner />
      ) : (
        <>
          {/* Summary — uses .stat-grid so mobile stays a compact 2×2 */}
          <div
            className="stat-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 10,
              marginBottom: 14,
            }}
          >
            <StatCard
              label="Open"
              value={String(summary.available)}
              sub={`${summary.total} total`}
              accent="var(--color-success-strong)"
              icon={CheckCircle2}
            />
            <StatCard
              label="Blocked"
              value={String(summary.blocked)}
              sub={summary.blocked ? 'Banner may show' : 'All clear'}
              accent={summary.blocked ? '#d97706' : 'var(--color-text-muted)'}
              icon={Pause}
            />
            <StatCard
              label="Scheduled"
              value={String(summary.scheduled)}
              sub="Timed windows"
              accent="#2563eb"
              icon={Clock3}
            />
            <StatCard
              label="SMS queue"
              value={String(summary.waiting)}
              sub="Waiting to notify"
              accent={summary.waiting ? 'var(--color-primary)' : 'var(--color-text-muted)'}
              icon={Bell}
            />
          </div>

          {/* Presets — collapsible summary on mobile; always expanded on desktop */}
          <Card style={{ marginBottom: 14, padding: 0, overflow: 'hidden' }}>
            <details className="mobile-filters" open style={{ marginBottom: 0, border: 'none' }}>
              <summary style={{ padding: '12px 14px' }}>Quick presets</summary>
              <div className="mobile-filters-body" style={{ display: 'block', width: '100%', padding: '0 14px 14px' }}>
                <p className="svc-avail-hide-mobile" style={{ ...sectionSub, margin: '0 0 10px' }}>
                  Preview exactly which services change before anything is applied.
                </p>
                <div
                  className="svc-avail-preset-list"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: 8,
                    width: '100%',
                  }}
                >
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className="svc-avail-preset-btn"
                      disabled={presetBusy}
                      onClick={() => void runPresetPreview(preset.id)}
                      style={{
                        textAlign: 'left',
                        padding: '12px 14px',
                        borderRadius: 12,
                        border: preset.danger ? '1.5px solid #fca5a5' : '1.5px solid var(--color-border)',
                        background: preset.danger ? 'var(--color-danger-bg)' : 'var(--color-bg)',
                        cursor: presetBusy ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit',
                        minHeight: 44,
                        width: '100%',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        {preset.danger ? (
                          <ShieldAlert size={16} color="var(--color-danger-strong)" />
                        ) : (
                          <Pause size={16} color="var(--color-primary)" />
                        )}
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: 14,
                            color: preset.danger ? 'var(--color-danger-strong)' : 'var(--color-text)',
                          }}
                        >
                          {preset.label}
                        </span>
                      </div>
                      <div
                        className="svc-avail-preset-desc"
                        style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}
                      >
                        {preset.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </details>
          </Card>

          <ServiceSection
            title="Customer-facing"
            subtitle="Order app, payments, catering, and the marketing site"
            rows={grouped.publicRows}
            busyKey={busyKey}
            onEdit={setEditing}
            onPause={(r) => void quickPause(r)}
            onRestore={(r) => void quickRestore(r)}
            onNotify={setNotifyTarget}
          />

          <ServiceSection
            title="Internal (owner)"
            subtitle="POS, KDS, and delivery dispatch — emergency use only. Admin panel is never locked out."
            rows={grouped.internalRows}
            busyKey={busyKey}
            onEdit={setEditing}
            onPause={(r) => void quickPause(r)}
            onRestore={(r) => void quickRestore(r)}
            onNotify={setNotifyTarget}
            warn
          />
        </>
      )}

      {presetPreview && (
        <Modal
          title={`Preview: ${PRESETS.find((p) => p.id === presetPreview.preset)?.label ?? presetPreview.preset}`}
          onClose={() => !presetBusy && setPresetPreview(null)}
          maxWidth={520}
        >
          <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--color-text-secondary)' }}>
            These services will change if you apply this preset:
          </p>
          <ul style={{ margin: '0 0 16px', paddingInlineStart: 18, fontSize: 14 }}>
            {presetPreview.changes.map((c) => (
              <li key={c.service_key} style={{ marginBottom: 6 }}>
                <strong>{metaFor(c.service_key).label}</strong>
                <span style={{ color: 'var(--color-text-muted)' }}> ({c.service_key})</span>
                {' → '}
                <Badge label={STATUS_LABEL[c.target_status]} color={STATUS_BADGE[c.target_status]} />
              </li>
            ))}
          </ul>
          {presetPreview.preset === 'emergency_lockdown' && (
            <div style={{ marginBottom: 12 }}>
              <Input
                label='Type EMERGENCY LOCKDOWN to confirm'
                value={presetConfirmText}
                onChange={setPresetConfirmText}
                autoComplete="off"
                placeholder="EMERGENCY LOCKDOWN"
              />
            </div>
          )}
          <ModalActions>
            <Btn variant="ghost" onClick={() => setPresetPreview(null)} disabled={presetBusy}>
              Cancel
            </Btn>
            <Btn
              variant={presetPreview.preset === 'emergency_lockdown' ? 'danger' : 'primary'}
              onClick={() => void applyPresetNow()}
              disabled={presetBusy}
            >
              {presetBusy ? <Loader2 size={16} className="animate-spin" /> : null}
              Apply preset
            </Btn>
          </ModalActions>
        </Modal>
      )}

      {editing && (
        <EditServiceModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => {
            setEditing(null);
            showToast(msg);
            await load();
          }}
          onError={(msg) => showToast(msg, 'err')}
        />
      )}

      {notifyTarget && (
        <NotifyConfirmModal
          row={notifyTarget}
          onClose={() => setNotifyTarget(null)}
          onDone={async (count) => {
            setNotifyTarget(null);
            showToast(`Queued ${count} restoration SMS.`);
            await load();
          }}
          onError={(msg) => showToast(msg, 'err')}
        />
      )}
    </div>

    </PageShell>
  );
}

// ── Section + cards ──────────────────────────────────────────────────────────

function ServiceSection({
  title,
  subtitle,
  rows,
  busyKey,
  onEdit,
  onPause,
  onRestore,
  onNotify,
  warn,
}: {
  title: string;
  subtitle: string;
  rows: ServiceStateRow[];
  busyKey: string | null;
  onEdit: (row: ServiceStateRow) => void;
  onPause: (row: ServiceStateRow) => void;
  onRestore: (row: ServiceStateRow) => void;
  onNotify: (row: ServiceStateRow) => void;
  warn?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <Card
      className="svc-avail-section"
      style={{
        marginBottom: 14,
        borderColor: warn ? '#fde68a' : undefined,
        background: warn ? '#fffbeb' : undefined,
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <h3 style={sectionTitle}>{title}</h3>
        <p className="svc-avail-hide-mobile" style={sectionSub}>{subtitle}</p>
      </div>
      <div
        className="svc-avail-list"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 10,
        }}
      >
        {rows.map((row) => (
          <ServiceCard
            key={row.service_key}
            row={row}
            busy={busyKey === row.service_key}
            onEdit={() => onEdit(row)}
            onPause={() => onPause(row)}
            onRestore={() => onRestore(row)}
            onNotify={() => onNotify(row)}
          />
        ))}
      </div>
    </Card>
  );
}

function ServiceCard({
  row,
  busy,
  onEdit,
  onPause,
  onRestore,
  onNotify,
}: {
  row: ServiceStateRow;
  busy: boolean;
  onEdit: () => void;
  onPause: () => void;
  onRestore: () => void;
  onNotify: () => void;
}) {
  const meta = metaFor(row.service_key);
  const down = !row.resolved_available;
  return (
    <div
      className="svc-avail-card"
      style={{
        background: 'var(--color-surface)',
        border: `1.5px solid ${down ? '#fecaca' : 'var(--color-border)'}`,
        borderRadius: 12,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text)' }}>{meta.label}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{meta.affects}</div>
        </div>
        <Badge label={STATUS_LABEL[row.status]} color={STATUS_BADGE[row.status]} />
      </div>

      <p
        className="svc-avail-card-blurb"
        style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}
      >
        {row.public_message?.trim() || meta.blurb}
      </p>

      <div
        className="svc-avail-chips"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}
      >
        <span style={chipStyle(down ? 'red' : 'green')}>
          {down ? `Blocked · ${row.resolved_source}` : 'Open'}
        </span>
        {row.waiting_notify_count > 0 && (
          <span style={chipStyle('orange')}>
            <Bell size={11} /> {row.waiting_notify_count} SMS
          </span>
        )}
        {(row.starts_at || row.ends_at) && (
          <span style={chipStyle('blue')} title={`${formatWhen(row.starts_at)} → ${formatWhen(row.ends_at)}`}>
            <Clock3 size={11} /> Scheduled
          </span>
        )}
      </div>

      <div className="svc-avail-actions">
        {row.status === 'available' ? (
          <Btn
            variant="secondary"
            small
            onClick={onPause}
            disabled={busy}
            data-primary-action="true"
          >
            <Pause size={14} /> Pause
          </Btn>
        ) : (
          <Btn
            variant="primary"
            small
            onClick={onRestore}
            disabled={busy}
            data-primary-action="true"
          >
            <Play size={14} /> Restore
          </Btn>
        )}
        <Btn variant="ghost" small onClick={onEdit} disabled={busy}>
          <Settings2 size={14} /> Edit
        </Btn>
        {row.waiting_notify_count > 0 && (
          <Btn variant="secondary" small onClick={onNotify} disabled={busy}>
            <Bell size={14} /> SMS ({row.waiting_notify_count})
          </Btn>
        )}
      </div>
    </div>
  );
}

function chipStyle(tone: 'green' | 'red' | 'orange' | 'blue'): CSSProperties {
  const map = {
    green: { bg: 'var(--color-success-bg)', fg: 'var(--color-success-strong)' },
    red: { bg: 'var(--color-danger-bg)', fg: 'var(--color-danger-strong)' },
    orange: { bg: '#ffedd5', fg: '#c2410c' },
    blue: { bg: '#dbeafe', fg: '#1e40af' },
  }[tone];
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    borderRadius: 999,
    background: map.bg,
    color: map.fg,
    fontWeight: 600,
  };
}

// ── Edit modal ───────────────────────────────────────────────────────────────

function EditServiceModal({
  row,
  onClose,
  onSaved,
  onError,
}: {
  row: ServiceStateRow;
  onClose: () => void;
  onSaved: (msg: string) => void | Promise<void>;
  onError: (msg: string) => void;
}) {
  const meta = metaFor(row.service_key);
  const [tab, setTab] = useState<'configure' | 'history'>('configure');
  const [status, setStatus] = useState<ServiceStatus>(row.status);
  const [reason, setReason] = useState<ServiceReasonType | ''>(row.reason_type ?? '');
  const [publicMessage, setPublicMessage] = useState(row.public_message ?? '');
  const [internalNote, setInternalNote] = useState(row.internal_note ?? '');
  const [startsAt, setStartsAt] = useState(toLocalInput(row.starts_at));
  const [endsAt, setEndsAt] = useState(toLocalInput(row.ends_at));
  const [notifyEnabled, setNotifyEnabled] = useState(row.notify_enabled);
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<ServiceHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (tab !== 'history') return;
    let cancelled = false;
    setHistoryLoading(true);
    getServiceHistory(row.service_key)
      .then((h) => {
        if (!cancelled) setHistory(h);
      })
      .catch((e) => {
        if (!cancelled) onError((e as Error).message ?? 'Failed to load history');
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // onError is a stable toast setter from the parent render; omit to avoid re-fetch loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, row.service_key]);

  const typedNeeded = needsTypedConfirm(row.service_key, status);

  const save = async () => {
    if (typedNeeded && confirmation.trim().toUpperCase() !== 'EMERGENCY LOCKDOWN') {
      onError('Type EMERGENCY LOCKDOWN to confirm this high-impact change.');
      return;
    }
    if (status !== 'available' && !publicMessage.trim()) {
      onError('Add a short public message customers will see.');
      return;
    }
    setSaving(true);
    try {
      const payload: ServiceStateUpdatePayload = {
        status,
        reason_type: reason || null,
        public_message: publicMessage.trim() || null,
        internal_note: internalNote.trim() || null,
        starts_at: fromLocalInput(startsAt),
        ends_at: fromLocalInput(endsAt),
        notify_enabled: notifyEnabled,
        confirmation: typedNeeded ? confirmation : undefined,
      };
      await updateServiceState(row.service_key, payload);
      await onSaved(`${meta.label} updated.`);
    } catch (e) {
      onError((e as Error).message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const previewMessage =
    publicMessage.trim() ||
    (status === 'available' ? 'No customer banner — service is available.' : defaultPauseMessage(row.service_key));

  return (
    <Modal title={`Edit · ${meta.label}`} onClose={onClose} maxWidth={640}>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
        {meta.blurb} Affects: <strong>{meta.affects}</strong>
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <TabBtn active={tab === 'configure'} onClick={() => setTab('configure')} icon={<Settings2 size={14} />}>
          Configure
        </TabBtn>
        <TabBtn active={tab === 'history'} onClick={() => setTab('history')} icon={<History size={14} />}>
          History
        </TabBtn>
      </div>

      {tab === 'configure' ? (
        <>
          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <Select
              label="Status"
              value={status}
              onChange={(v) => setStatus(v as ServiceStatus)}
              options={STATUS_OPTIONS}
            />
            <Select
              label="Reason"
              value={reason}
              onChange={(v) => setReason(v as ServiceReasonType | '')}
              options={REASON_OPTIONS}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Public message</label>
            <textarea
              value={publicMessage}
              onChange={(e) => setPublicMessage(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder={defaultPauseMessage(row.service_key)}
              style={textareaStyle}
            />
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
              {publicMessage.length}/500 · shown on the order app banner / website
            </div>
          </div>

          <div
            style={{
              marginBottom: 14,
              padding: '10px 12px',
              borderRadius: 10,
              background: status === 'available' ? '#f0fdf4' : '#fffbeb',
              border: `1px solid ${status === 'available' ? '#bbf7d0' : '#fde68a'}`,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
              CUSTOMER PREVIEW
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--color-text)', fontWeight: 600 }}>{previewMessage}</div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Internal note (staff only)</label>
            <textarea
              value={internalNote}
              onChange={(e) => setInternalNote(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Why this was paused — not shown to customers"
              style={textareaStyle}
            />
          </div>

          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <Input
              label="Starts at (schedule)"
              type="datetime-local"
              value={startsAt}
              onChange={setStartsAt}
            />
            <Input
              label="Ends at (auto-restore)"
              type="datetime-local"
              value={endsAt}
              onChange={setEndsAt}
            />
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--color-text-muted)' }}>
            Scheduled windows activate/restore via the minute cron. Auto-restore never sends SMS —
            use “Send N SMS” after restore if needed.
          </p>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 12, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={notifyEnabled}
              onChange={(e) => setNotifyEnabled(e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
            Offer “Notify me” to customers while this service is down
          </label>

          {typedNeeded && (
            <div
              style={{
                marginBottom: 12,
                padding: 12,
                borderRadius: 10,
                background: 'var(--color-danger-bg)',
                border: '1px solid #fecaca',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: 'var(--color-danger-strong)', fontWeight: 700, fontSize: 13 }}>
                <AlertTriangle size={16} /> High-impact change
              </div>
              <Input
                label='Type EMERGENCY LOCKDOWN to confirm'
                value={confirmation}
                onChange={setConfirmation}
                autoComplete="off"
                placeholder="EMERGENCY LOCKDOWN"
              />
            </div>
          )}

          <ModalActions>
            <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancel</Btn>
            <Btn onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              Save changes
            </Btn>
          </ModalActions>
        </>
      ) : (
        <HistoryPanel loading={historyLoading} history={history} />
      )}
    </Modal>
  );
}

function TabBtn({
  active,
  onClick,
  children,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        minHeight: 40,
        padding: '0 12px',
        borderRadius: 10,
        border: active ? '1.5px solid var(--color-primary)' : '1.5px solid var(--color-border)',
        background: active ? '#fff7ed' : 'var(--color-surface)',
        color: active ? '#c2410c' : 'var(--color-text-secondary)',
        fontWeight: 700,
        fontSize: 13,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {icon}
      {children}
    </button>
  );
}

function HistoryPanel({
  loading,
  history,
}: {
  loading: boolean;
  history: ServiceHistoryResponse | null;
}) {
  if (loading) return <Spinner size={20} />;
  if (!history) return <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>No history loaded.</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>Incidents</h4>
        {history.incidents.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>No incidents yet.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {history.incidents.slice(0, 8).map((inc) => (
              <li
                key={inc.id}
                style={{
                  padding: '10px 0',
                  borderBottom: '1px solid #F1EDE8',
                  fontSize: 13,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <Badge
                    label={inc.status === 'open' ? 'Open' : 'Restored'}
                    color={inc.status === 'open' ? 'red' : 'green'}
                  />
                  <span style={{ color: 'var(--color-text-muted)' }}>#{inc.id}</span>
                </div>
                <div style={{ marginTop: 4, color: 'var(--color-text-secondary)' }}>
                  {formatWhen(inc.started_at)}
                  {inc.restored_at ? ` → ${formatWhen(inc.restored_at)}` : ' · ongoing'}
                </div>
                {inc.public_message && (
                  <div style={{ marginTop: 4, color: 'var(--color-text)' }}>{inc.public_message}</div>
                )}
                <div style={{ marginTop: 2, fontSize: 12, color: 'var(--color-text-muted)' }}>
                  Notified: {inc.notified_count}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>Audit log</h4>
        {history.audits.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>No audit rows yet.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {history.audits.slice(0, 12).map((a) => (
              <li
                key={a.id}
                style={{
                  padding: '8px 0',
                  borderBottom: '1px solid #F1EDE8',
                  fontSize: 12.5,
                  color: 'var(--color-text-secondary)',
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>{a.action}</div>
                <div>{formatWhen(a.created_at)} · user #{a.user_id ?? '—'}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Notify confirm ───────────────────────────────────────────────────────────

function NotifyConfirmModal({
  row,
  onClose,
  onDone,
  onError,
}: {
  row: ServiceStateRow;
  onClose: () => void;
  onDone: (count: number) => void | Promise<void>;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const meta = metaFor(row.service_key);

  const send = async () => {
    setBusy(true);
    try {
      const res = await notifyRestoration(
        row.service_key,
        row.last_closed_incident_id ?? undefined,
      );
      await onDone(res.dispatched);
    } catch (e) {
      onError((e as Error).message ?? 'Notify failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Send restoration SMS" onClose={onClose} maxWidth={460}>
      <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.45 }}>
        Queue <strong>{row.waiting_notify_count}</strong> one-time SMS for{' '}
        <strong>{meta.label}</strong>. Messages go out via the queue (never synchronous) and
        numbers are not added to marketing lists.
      </p>
      {!row.resolved_available && (
        <div
          style={{
            marginBottom: 12,
            padding: 10,
            borderRadius: 10,
            background: '#fef3c7',
            border: '1px solid #fde68a',
            fontSize: 13,
            color: '#92400e',
          }}
        >
          This service still looks blocked. Restore it first, then send notifications once you
          confirm customers can order again.
        </div>
      )}
      <ModalActions>
        <Btn variant="ghost" onClick={onClose} disabled={busy}>Cancel</Btn>
        <Btn onClick={() => void send()} disabled={busy || !row.resolved_available}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />}
          Send {row.waiting_notify_count} SMS
        </Btn>
      </ModalActions>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const sectionTitle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 800,
  color: 'var(--color-text)',
};

const sectionSub: CSSProperties = {
  margin: '4px 0 0',
  fontSize: 13,
  color: 'var(--color-text-muted)',
};

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--color-text)',
  marginBottom: 4,
};

const textareaStyle: CSSProperties = {
  width: '100%',
  minHeight: 72,
  padding: '10px 12px',
  border: '1.5px solid var(--color-border)',
  borderRadius: 10,
  fontSize: 14,
  fontFamily: 'inherit',
  resize: 'vertical',
  boxSizing: 'border-box',
  color: 'var(--color-text)',
  background: 'var(--color-surface)',
};
