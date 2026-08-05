import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Save } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import { PageHeader, PageShell } from '../components/SharedUI';
import { OrderingControlTabs } from '../components/OrderingControlTabs';
import {
  getDeliveryStatus,
  toggleDelivery,
  setDeliveryOverride,
  updateDeliverySchedule,
  updateDeliveryCapacity,
  getDeliveryFeeSettings,
  updateDeliveryFeeSettings,
  getOpsAlertsSettings,
  updateOpsAlertsSettings,
  type DeliveryGateStatus,
  type DeliveryFeeSettings,
  type OpsAlertsSettings,
} from '../api';
import {
  DAYS,
  GateStatusCard,
  S,
  ScheduleEditor,
  StatusChipStrip,
  parseSchedule,
  safeIsoFromLocal,
  toDatetimeLocal,
  withAllDays,
  type Schedule,
} from './OnlineOrderingPage/orderingControlUi';

const DEFAULT_DELIVERY_SCHEDULE: Schedule = Object.fromEntries(
  DAYS.map(({ key }) => [key, { enabled: true, windows: [{ open: '11:00', close: '22:00' }] }]),
) as Schedule;

type ZoneFeeRow = { name: string; fee: string };

export default function DeliverySettingsPage() {
  usePageTitle('Delivery Settings');

  const [status, setStatus]         = useState<DeliveryGateStatus | null>(null);
  const [loading, setLoading]       = useState(true);
  const [toggling, setToggling]     = useState(false);
  const [overrideUntil, setOverrideUntil] = useState('');
  const [savingOverride, setSavingOverride] = useState(false);
  const [toast, setToast]           = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [error, setError]           = useState('');

  const [schedule, setSchedule]         = useState<Schedule>(DEFAULT_DELIVERY_SCHEDULE);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleSaving, setScheduleSaving]   = useState(false);
  const [maxActiveOrders, setMaxActiveOrders] = useState('0');
  const [capacitySaving, setCapacitySaving] = useState(false);

  const [feeSettings, setFeeSettings] = useState<DeliveryFeeSettings | null>(null);
  const [defaultFee, setDefaultFee] = useState('30');
  const [freeThreshold, setFreeThreshold] = useState('200');
  const [zoneRows, setZoneRows] = useState<ZoneFeeRow[]>([]);
  const [restrictZones, setRestrictZones] = useState(false);
  const [feeSaving, setFeeSaving] = useState(false);
  const [opsAlerts, setOpsAlerts] = useState<OpsAlertsSettings | null>(null);
  const [opsSaving, setOpsSaving] = useState(false);

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = () => {
    setLoading(true);
    Promise.all([getDeliveryStatus(), getDeliveryFeeSettings(), getOpsAlertsSettings()])
      .then(([s, feeRes, opsRes]) => {
        setStatus(s);
        setFeeSettings(feeRes.settings);
        setOpsAlerts(opsRes.settings);
        setDefaultFee(String(feeRes.settings.default_fee));
        setFreeThreshold(String(feeRes.settings.free_threshold));
        setRestrictZones(feeRes.settings.zones_enforced);
        setZoneRows(
          Object.entries(feeRes.settings.zone_fees).map(([name, fee]) => ({
            name,
            fee: String(fee),
          })),
        );
        setScheduleEnabled(s.schedule_active);
        setMaxActiveOrders(String(s.max_active_orders ?? 0));
        if (s.delivery_schedule) {
          setSchedule(parseSchedule(JSON.stringify(s.delivery_schedule)));
        }
        setOverrideUntil(toDatetimeLocal(s.override_until));
      })
      .catch(() => setError('Failed to load delivery status.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleToggle = async () => {
    if (!status) return;
    const next = !status.accepting_flag;
    setToggling(true);
    try {
      const res = await toggleDelivery(next);
      setStatus(res.delivery_status);
      showToast(`Delivery ${next ? 'enabled' : 'disabled'}.`);
    } catch {
      showToast('Failed to update. Try again.', 'err');
    } finally {
      setToggling(false);
    }
  };

  const saveSchedule = async () => {
    setScheduleSaving(true);
    try {
      const payload = scheduleEnabled ? schedule : null;
      const res = await updateDeliverySchedule(payload);
      setStatus(res.delivery_status);
      showToast('Delivery schedule saved.');
    } catch {
      showToast('Failed to save schedule.', 'err');
    } finally {
      setScheduleSaving(false);
    }
  };

  const handleSetOverride = async () => {
    const isoVal = safeIsoFromLocal(overrideUntil);
    if (!isoVal) {
      showToast('Please pick a valid date and time first.', 'err');
      return;
    }
    setSavingOverride(true);
    try {
      const res = await setDeliveryOverride(isoVal);
      setStatus(res.delivery_status);
      showToast('Force-open override set.');
    } catch {
      showToast('Failed to save override.', 'err');
    } finally {
      setSavingOverride(false);
    }
  };

  const handleClearOverride = async () => {
    setSavingOverride(true);
    try {
      const res = await setDeliveryOverride(null);
      setStatus(res.delivery_status);
      setOverrideUntil('');
      showToast('Override cleared.');
    } catch {
      showToast('Failed to clear override.', 'err');
    } finally {
      setSavingOverride(false);
    }
  };

  const saveCapacity = async () => {
    const n = Math.max(0, Math.min(500, parseInt(maxActiveOrders, 10) || 0));
    setCapacitySaving(true);
    try {
      const res = await updateDeliveryCapacity(n);
      setStatus(res.delivery_status);
      setMaxActiveOrders(String(res.max_active_orders));
      showToast(n > 0 ? `Delivery capacity set to ${n} open orders.` : 'Delivery capacity limit cleared.');
    } catch {
      showToast('Failed to save capacity.', 'err');
    } finally {
      setCapacitySaving(false);
    }
  };

  const saveFeeSettings = async () => {
    const zoneFees: Record<string, number> = {};
    for (const row of zoneRows) {
      const name = row.name.trim();
      const fee = parseFloat(row.fee);
      if (!name || Number.isNaN(fee)) {
        showToast('Each zone needs a name and valid fee.', 'err');
        return;
      }
      zoneFees[name] = fee;
    }

    setFeeSaving(true);
    try {
      const res = await updateDeliveryFeeSettings({
        default_fee: parseFloat(defaultFee) || 0,
        free_threshold: parseFloat(freeThreshold) || 0,
        zone_fees: zoneFees,
        restrict_to_zone_fees: restrictZones,
      });
      setFeeSettings(res.settings);
      setStatus(res.delivery_status);
      showToast('Zones and fees saved.');
    } catch {
      showToast('Failed to save zones and fees.', 'err');
    } finally {
      setFeeSaving(false);
    }
  };

  const addZoneRow = () => {
    setZoneRows((prev) => [...prev, { name: '', fee: '30' }]);
  };

  const updateZoneRow = (idx: number, field: 'name' | 'fee', value: string) => {
    setZoneRows((prev) => prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));
  };

  const removeZoneRow = (idx: number) => {
    setZoneRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const toggleOpsAlert = (key: 'delivery_delay_alert_sms' | 'inventory_reorder_alert_sms') => {
    if (!opsAlerts || opsSaving) return;
    void (async () => {
      setOpsSaving(true);
      try {
        const res = await updateOpsAlertsSettings({ [key]: !opsAlerts[key] });
        setOpsAlerts(res.settings);
        showToast('Alert settings saved.');
      } catch {
        showToast('Failed to save alert settings.', 'err');
      } finally {
        setOpsSaving(false);
      }
    })();
  };

  if (loading) {
    return (
      <PageShell>
        <div className="ordering-page">
          <PageHeader section="Manage" title="Ordering Control Center" />
          <OrderingControlTabs />
          <p style={{ color: '#9C8575', fontSize: 14 }}>Loading…</p>
        </div>
      </PageShell>
    );
  }

  if (error || !status) {
    return (
      <PageShell>
        <div className="ordering-page">
          <PageHeader section="Manage" title="Ordering Control Center" />
          <OrderingControlTabs />
          <p style={{ color: 'var(--color-danger-strong)', fontSize: 14 }}>{error || 'Status unavailable.'}</p>
        </div>
      </PageShell>
    );
  }

  const isOpen = status.delivery_open;
  const overrideActive = status.override_active;

  const deliveryChips = [
    { id: 'delivery-now', label: 'Delivery', open: isOpen },
    {
      id: 'capacity',
      label: status.capacity_enforced
        ? `Capacity ${status.active_delivery_orders ?? 0}/${status.max_active_orders}`
        : 'Capacity unlimited',
      open: status.capacity_enforced
        ? (status.active_delivery_orders ?? 0) < (status.max_active_orders ?? 0)
        : true,
    },
    { id: 'zones', label: restrictZones ? 'Listed zones only' : 'All zones', open: true },
  ];

  return (
    <PageShell>
    <div className="ordering-page">
      <PageHeader section="Manage"
        title="Ordering Control Center"
        subtitle="Delivery gates, zones, fees, and schedules"
      />
      <OrderingControlTabs />

      <StatusChipStrip chips={deliveryChips} />

      {/* Toast */}
      {toast && (
        <div style={{
          marginBottom: '1rem', padding: '10px 16px', borderRadius: 10,
          background: toast.type === 'ok' ? '#D1FAE5' : 'var(--color-danger-bg)',
          color: toast.type === 'ok' ? '#065F46' : 'var(--color-danger-strong)',
          fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {toast.type === 'ok' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          {toast.msg}
        </div>
      )}

      {/* Status + master switch + force-open, merged */}
      <GateStatusCard
        open={isOpen}
        openText="Delivery available"
        closedText="Delivery unavailable"
        reason={!isOpen ? status.message : null}
        extraStatus={!isOpen && status.next_delivery_window ? (
          <p style={S.reasonNote}>
            Next window: {new Date(status.next_delivery_window).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </p>
        ) : null}
        onRefresh={load}
        switchRow={{
          on: status.accepting_flag,
          toggling,
          titleOn: 'Delivery is ON',
          titleOff: 'Delivery is OFF',
          helpOn: 'Customers can select delivery at checkout (subject to schedule).',
          helpOff: 'Delivery is hidden at checkout. Customers can still order for takeaway.',
          onToggle: () => void handleToggle(),
        }}
        override={{
          value: overrideUntil,
          onChange: setOverrideUntil,
          activeUntil: overrideActive ? status.override_until : null,
          saving: savingOverride,
          onSet: () => void handleSetOverride(),
          onClear: () => void handleClearOverride(),
          help: 'Force delivery open until a specific time, ignoring the master switch and schedule. Useful for special delivery windows outside normal hours.',
        }}
        testId="delivery-gate"
      />

      {/* Daily schedule editor */}
      <div className="oc-card" style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: '0.75rem' }}>
          <p style={{ ...S.sectionTitle, marginBottom: 0 }}>Delivery Hours Schedule</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              style={S.toggleTrack(scheduleEnabled)}
              onClick={() => setScheduleEnabled((v) => !v)}
              role="switch"
              aria-checked={scheduleEnabled}
              title={scheduleEnabled ? 'Disable schedule' : 'Enable schedule'}
            >
              <span style={S.toggleThumb(scheduleEnabled)} />
            </button>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{scheduleEnabled ? 'Schedule on' : 'No schedule (all day)'}</span>
          </div>
        </div>

        {scheduleEnabled && (
          <>
            <p style={{ fontSize: 12, color: '#9C8575', marginBottom: 14 }}>
              Delivery will only be available during these windows. Supports multiple windows per day (e.g. lunch + dinner).
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button style={{ ...S.btnSecondary, fontSize: 12, padding: '5px 10px', minHeight: 36 }} onClick={() => setSchedule((prev) => withAllDays(prev, true))}>All open</button>
              <button style={{ ...S.btnSecondary, fontSize: 12, padding: '5px 10px', minHeight: 36 }} onClick={() => setSchedule((prev) => withAllDays(prev, false))}>All closed</button>
            </div>
            <ScheduleEditor schedule={schedule} onChange={setSchedule} />
          </>
        )}

        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="oc-btn-block" style={S.btnPrimary} onClick={saveSchedule} disabled={scheduleSaving}>
            <Save size={14} />
            {scheduleSaving ? 'Saving…' : 'Save Schedule'}
          </button>
          {scheduleEnabled && (
            <button
              className="oc-btn-block"
              style={S.btnSecondary}
              onClick={() => {
                setScheduleEnabled(false);
                void updateDeliverySchedule(null).catch(() => null);
                showToast('Schedule cleared.');
              }}
            >
              Clear Schedule
            </button>
          )}
        </div>
      </div>

      {/* Zones & fees */}
      <div className="oc-card" style={S.card}>
        <div style={S.sectionTitle}>Zones &amp; Fees</div>
        <p style={{ fontSize: 12, color: '#9C8575', marginTop: -8, marginBottom: 16, lineHeight: 1.5 }}>
          Per-island delivery fees and free-delivery threshold. Online cart progress uses the threshold automatically.
          {feeSettings?.source === 'config' && (
            <span> Currently showing config defaults until you save.</span>
          )}
        </p>

        <div className="oc-form-grid" style={{ marginBottom: 16 }}>
          <div>
            <label style={S.label}>Default fee (MVR)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={defaultFee}
              onChange={(e) => setDefaultFee(e.target.value)}
              style={S.input}
            />
          </div>
          <div>
            <label style={S.label}>Free delivery from (MVR)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={freeThreshold}
              onChange={(e) => setFreeThreshold(e.target.value)}
              style={S.input}
            />
            <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
              Used at checkout for fee math. Website marketing text (“MVR 200”) is edited separately in Content Hub → delivery threshold.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {zoneRows.map((row, idx) => (
            <div key={idx} className="oc-zone-row">
              <input
                type="text"
                placeholder="Island / area"
                value={row.name}
                onChange={(e) => updateZoneRow(idx, 'name', e.target.value)}
                style={S.input}
              />
              <div className="oc-zone-fee">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Fee"
                  value={row.fee}
                  onChange={(e) => updateZoneRow(idx, 'fee', e.target.value)}
                  style={S.input}
                />
                <span style={{ fontSize: 12, color: '#9C8575', flexShrink: 0 }}>MVR</span>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => removeZoneRow(idx)}
                  style={{ background: 'none', border: 'none', color: '#C0392B', cursor: 'pointer', fontSize: 18, padding: '8px 10px' }}
                  aria-label="Remove zone"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          <button type="button" style={S.btnSecondary} onClick={addZoneRow}>+ Add zone</button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#4A3728', cursor: 'pointer', minHeight: 44 }}>
            <input
              type="checkbox"
              checked={restrictZones}
              onChange={(e) => setRestrictZones(e.target.checked)}
            />
            Only deliver to listed zones
          </label>
        </div>

        <button type="button" className="oc-btn-block" style={S.btnPrimary} onClick={() => void saveFeeSettings()} disabled={feeSaving}>
          <Save size={14} />
          {feeSaving ? 'Saving…' : 'Save Zones & Fees'}
        </button>
      </div>

      {/* Capacity */}
      <div className="oc-card" style={S.card}>
        <p style={S.sectionTitle}>Capacity</p>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
          Limit concurrent open delivery tickets (pending through out for delivery).
          Set <strong>0</strong> for unlimited. Staff phone-in delivery still bypasses this gate.
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={S.label} htmlFor="max-active-orders">Max active orders</label>
            <input
              id="max-active-orders"
              type="number"
              min={0}
              max={500}
              value={maxActiveOrders}
              onChange={(e) => setMaxActiveOrders(e.target.value)}
              style={{ ...S.input, width: 120 }}
            />
          </div>
          <button type="button" style={S.btnPrimary} onClick={() => void saveCapacity()} disabled={capacitySaving}>
            <Save size={14} />
            {capacitySaving ? 'Saving…' : 'Save capacity'}
          </button>
        </div>
        <p style={S.reasonNote}>
          Currently open: {status.active_delivery_orders ?? 0}
          {status.capacity_enforced
            ? ` / max ${status.max_active_orders}`
            : ' (no limit)'}
        </p>
      </div>

      {/* Operations alerts */}
      <div className="oc-card" style={{
        padding: '12px 16px', background: 'var(--color-warning-bg)',
        border: '1px solid rgba(212,129,58,0.3)', borderRadius: 10,
        marginBottom: '1.25rem',
      }}>
        <p style={{ ...S.sectionTitle, marginBottom: 8 }}>Operations alerts</p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#3D2B1F' }}>
          <button
            type="button"
            style={S.toggleTrack(opsAlerts?.delivery_delay_alert_sms ?? false)}
            onClick={() => toggleOpsAlert('delivery_delay_alert_sms')}
            role="switch"
            aria-checked={opsAlerts?.delivery_delay_alert_sms ?? false}
            aria-label="Delivery delay SMS alert"
          >
            <span style={S.toggleThumb(opsAlerts?.delivery_delay_alert_sms ?? false)} />
          </button>
          SMS business phone when delivery orders pass estimated ready time
        </label>
        <p style={{ margin: '8px 0 0', fontSize: 12, color: '#9C8575', lineHeight: 1.5 }}>
          Uses the business phone from Website Settings. Runs hourly via scheduler; also appears in System Health alert inbox.
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#3D2B1F', marginTop: 14 }}>
          <button
            type="button"
            style={S.toggleTrack(opsAlerts?.inventory_reorder_alert_sms ?? false)}
            onClick={() => toggleOpsAlert('inventory_reorder_alert_sms')}
            role="switch"
            aria-checked={opsAlerts?.inventory_reorder_alert_sms ?? false}
            aria-label="Inventory reorder SMS alert"
          >
            <span style={S.toggleThumb(opsAlerts?.inventory_reorder_alert_sms ?? false)} />
          </button>
          SMS owners/managers when inventory hits reorder point
        </label>
        <p style={{ margin: '8px 0 0', fontSize: 12, color: '#9C8575', lineHeight: 1.5 }}>
          Daily digest when new reorder alerts are created (skips snoozed SKUs). Falls back to business phone if staff have no phone.
        </p>
      </div>

      <div style={{
        padding: '12px 16px', background: 'var(--color-warning-bg)',
        border: '1px solid rgba(212,129,58,0.3)', borderRadius: 10,
      }}>
        <p style={{ margin: 0, fontSize: 12, color: '#9C8575', lineHeight: 1.6 }}>
          💡 When delivery is off or outside schedule, the order app shows an amber <strong>"Pickup only"</strong> pill at checkout.
          Customers can still place takeaway orders normally.
        </p>
      </div>
    </div>

    </PageShell>
  );
}
