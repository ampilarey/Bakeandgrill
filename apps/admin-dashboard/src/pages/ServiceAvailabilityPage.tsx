import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Save } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import { PageHeader, Btn, Card } from '../components/SharedUI';
import {
  applyPreset,
  listServiceStates,
  notifyRestoration,
  previewPreset,
  restoreService,
  updateServiceState,
  type ServiceStateRow,
  type ServiceStatus,
  type PresetPreview,
} from '../api';

const STATUS_LABEL: Record<ServiceStatus, string> = {
  available: 'Available',
  operational_pause: 'Operational pause',
  scheduled_maintenance: 'Scheduled maintenance',
  unavailable: 'Unavailable',
  emergency_disabled: 'Emergency disabled',
};

const STATUS_COLORS: Record<ServiceStatus, { bg: string; fg: string }> = {
  available: { bg: '#dcfce7', fg: '#166534' },
  operational_pause: { bg: '#fef3c7', fg: '#92400e' },
  scheduled_maintenance: { bg: '#dbeafe', fg: '#1e40af' },
  unavailable: { bg: '#fee2e2', fg: '#991b1b' },
  emergency_disabled: { bg: '#450a0a', fg: '#fecaca' },
};

const PRESETS: Array<{ id: string; label: string; description: string; danger?: boolean }> = [
  { id: 'pause_all_online_ordering', label: 'Pause all online ordering', description: 'Umbrella + pickup + delivery + checkout → operational pause' },
  { id: 'pause_delivery_only', label: 'Pause delivery only', description: 'Delivery paused; pickup and checkout stay open' },
  { id: 'public_transaction_maintenance', label: 'Public transaction maintenance', description: 'Blocks all public transactions; marketing site stays up' },
  { id: 'emergency_lockdown', label: 'Emergency lockdown', description: 'Owner-only: disables POS, KDS, delivery ops, and every public write path', danger: true },
];

function StatusChip({ status }: { status: ServiceStatus }) {
  const c = STATUS_COLORS[status];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: c.bg,
        color: c.fg,
      }}
    >
      {status === 'available' ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
      {STATUS_LABEL[status]}
    </span>
  );
}

export default function ServiceAvailabilityPage() {
  usePageTitle('Service Availability');

  const [rows, setRows] = useState<ServiceStateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [presetPreview, setPresetPreview] = useState<PresetPreview | null>(null);
  const [presetBusy, setPresetBusy] = useState(false);

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

  const flipStatus = async (row: ServiceStateRow, next: ServiceStatus) => {
    setBusyKey(row.service_key);
    try {
      const highImpact = ['pos_sales', 'kds_operations', 'delivery_operations', 'emergency_write_lock'].includes(row.service_key)
        || next === 'emergency_disabled';
      const confirmation = highImpact
        ? window.prompt('Type EMERGENCY LOCKDOWN to confirm this high-impact change:') ?? ''
        : undefined;
      if (highImpact && confirmation?.toUpperCase() !== 'EMERGENCY LOCKDOWN') {
        return;
      }
      await updateServiceState(row.service_key, {
        status: next,
        confirmation,
      });
      await load();
    } catch (e) {
      alert(`Failed to update ${row.service_key}: ${(e as Error).message}`);
    } finally {
      setBusyKey(null);
    }
  };

  const restore = async (row: ServiceStateRow) => {
    setBusyKey(row.service_key);
    try {
      await restoreService(row.service_key);
      await load();
    } catch (e) {
      alert(`Restore failed: ${(e as Error).message}`);
    } finally {
      setBusyKey(null);
    }
  };

  const dispatchNotify = async (row: ServiceStateRow) => {
    const count = row.waiting_notify_count;
    if (!count) return;
    if (!window.confirm(`Send ${count} restoration SMS for ${row.service_key}?`)) return;
    setBusyKey(row.service_key);
    try {
      const res = await notifyRestoration(
        row.service_key,
        row.last_closed_incident_id ?? undefined,
      );
      alert(`Dispatched ${res.dispatched} SMS notification(s).`);
      await load();
    } catch (e) {
      alert(`Notify failed: ${(e as Error).message}`);
    } finally {
      setBusyKey(null);
    }
  };

  const runPresetPreview = async (preset: string) => {
    setPresetBusy(true);
    try {
      const preview = await previewPreset(preset);
      setPresetPreview(preview);
    } catch (e) {
      alert(`Preview failed: ${(e as Error).message}`);
    } finally {
      setPresetBusy(false);
    }
  };

  const applyPresetNow = async () => {
    if (!presetPreview) return;
    const confirmed = window.confirm(
      `Apply preset "${presetPreview.preset}"? ${presetPreview.changes.length} services will change.`,
    );
    if (!confirmed) return;
    setPresetBusy(true);
    try {
      await applyPreset(presetPreview.preset);
      setPresetPreview(null);
      await load();
    } catch (e) {
      alert(`Apply failed: ${(e as Error).message}`);
    } finally {
      setPresetBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Service Availability"
        subtitle="Toggle customer and internal services during maintenance or incidents. Every change is audited."
        action={
          <Btn variant="secondary" onClick={() => void load()}>
            <RefreshCw size={16} /> Refresh
          </Btn>
        }
      />

      {error && (
        <Card style={{ marginBottom: 16, background: '#fef2f2', borderColor: '#fecaca' }}>
          <div style={{ color: '#991b1b' }}>{error}</div>
        </Card>
      )}

      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, marginBottom: 8 }}>Presets</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PRESETS.map((preset) => (
            <Btn
              key={preset.id}
              variant={preset.danger ? 'danger' : 'secondary'}
              onClick={() => void runPresetPreview(preset.id)}
              disabled={presetBusy}
              title={preset.description}
            >
              {preset.label}
            </Btn>
          ))}
        </div>
      </Card>

      {presetPreview && (
        <Card style={{ marginBottom: 16, background: '#fef9c3', borderColor: '#facc15' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
            <div>
              <h4 style={{ margin: 0, fontSize: 15 }}>Preview: {presetPreview.preset}</h4>
              <ul style={{ margin: '8px 0', paddingInlineStart: 20 }}>
                {presetPreview.changes.map((c) => (
                  <li key={c.service_key}>
                    <code>{c.service_key}</code> → <strong>{c.target_status}</strong>
                  </li>
                ))}
              </ul>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="ghost" onClick={() => setPresetPreview(null)} disabled={presetBusy}>Cancel</Btn>
              <Btn onClick={() => void applyPresetNow()} disabled={presetBusy}>
                {presetBusy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Apply preset
              </Btn>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <div style={{ padding: 24, color: '#64748b' }}>Loading…</div>
      ) : (
        <>
          <ServiceGroupCard
            title="Public services"
            subtitle="Customer-facing flows"
            rows={grouped.publicRows}
            onFlip={flipStatus}
            onRestore={restore}
            onNotify={dispatchNotify}
            busyKey={busyKey}
          />
          <ServiceGroupCard
            title="Internal services (owner only)"
            subtitle="POS, KDS, delivery ops, emergency master switch"
            rows={grouped.internalRows}
            onFlip={flipStatus}
            onRestore={restore}
            onNotify={dispatchNotify}
            busyKey={busyKey}
          />
        </>
      )}
    </div>
  );
}

function ServiceGroupCard({
  title,
  subtitle,
  rows,
  onFlip,
  onRestore,
  onNotify,
  busyKey,
}: {
  title: string;
  subtitle: string;
  rows: ServiceStateRow[];
  onFlip: (row: ServiceStateRow, next: ServiceStatus) => void | Promise<void>;
  onRestore: (row: ServiceStateRow) => void | Promise<void>;
  onNotify: (row: ServiceStateRow) => void | Promise<void>;
  busyKey: string | null;
}) {
  if (rows.length === 0) return null;
  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
        <div style={{ color: '#64748b', fontSize: 13 }}>{subtitle}</div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
              <th style={cellStyle}>Service</th>
              <th style={cellStyle}>Status</th>
              <th style={cellStyle}>Resolved</th>
              <th style={cellStyle}>Reason</th>
              <th style={cellStyle}>Public message</th>
              <th style={cellStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.service_key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={cellStyle}>
                  <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>{row.service_key}</code>
                </td>
                <td style={cellStyle}>
                  <StatusChip status={row.status} />
                </td>
                <td style={cellStyle}>
                  {row.resolved_available ? (
                    <span style={{ color: '#166534' }}>✓ available</span>
                  ) : (
                    <span style={{ color: '#991b1b' }}>✗ blocked ({row.resolved_source})</span>
                  )}
                </td>
                <td style={cellStyle}>{row.reason_type ?? '—'}</td>
                <td style={{ ...cellStyle, maxWidth: 260 }}>{row.public_message ?? '—'}</td>
                <td style={cellStyle}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {row.status === 'available' ? (
                      <Btn
                        variant="secondary"
                        small
                        onClick={() => void onFlip(row, 'operational_pause')}
                        disabled={busyKey === row.service_key}
                      >
                        Pause
                      </Btn>
                    ) : (
                      <Btn
                        variant="primary"
                        small
                        onClick={() => void onRestore(row)}
                        disabled={busyKey === row.service_key}
                      >
                        Restore
                      </Btn>
                    )}
                    {row.waiting_notify_count > 0 && (
                      <Btn
                        variant="secondary"
                        small
                        onClick={() => void onNotify(row)}
                        disabled={busyKey === row.service_key}
                        title="Two-step restore: dispatch queued restoration SMS for the last incident"
                      >
                        Send {row.waiting_notify_count} SMS
                      </Btn>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const cellStyle: React.CSSProperties = {
  padding: '10px 8px',
  fontSize: 14,
  verticalAlign: 'top',
};
