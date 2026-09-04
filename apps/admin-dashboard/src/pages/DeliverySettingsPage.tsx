import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Save } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import { PageHeader, PageShell } from '../components/SharedUI';
import { OrderingControlTabs } from '../components/OrderingControlTabs';
import {
  getDeliveryStatus,
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
  S,
  StatusChipStrip,
} from './OnlineOrderingPage/orderingControlUi';

type ZoneFeeRow = { name: string; fee: string };

export default function DeliverySettingsPage() {
  usePageTitle('Delivery Settings');

  const [status, setStatus] = useState<DeliveryGateStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [error, setError] = useState('');

  const [maxActiveOrders, setMaxActiveOrders] = useState('0');
  const [capacitySaving, setCapacitySaving] = useState(false);

  const [feeSettings, setFeeSettings] = useState<DeliveryFeeSettings | null>(null);
  const [defaultFee, setDefaultFee] = useState('30');
  const [freeThreshold, setFreeThreshold] = useState('200');
  const [deliveryTime, setDeliveryTime] = useState('');
  const [zoneRows, setZoneRows] = useState<ZoneFeeRow[]>([]);
  const [restrictZones, setRestrictZones] = useState(false);
  const [feeTaxable, setFeeTaxable] = useState(true);
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
        setDeliveryTime(String(feeRes.settings.delivery_time ?? ''));
        setRestrictZones(feeRes.settings.zones_enforced);
        setFeeTaxable(feeRes.settings.fee_taxable !== false);
        setZoneRows(
          Object.entries(feeRes.settings.zone_fees).map(([name, fee]) => ({
            name,
            fee: String(fee),
          })),
        );
        setMaxActiveOrders(String(s.max_active_orders ?? 0));
      })
      .catch(() => setError('Failed to load delivery status.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

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
        delivery_time: deliveryTime.trim(),
        zone_fees: zoneFees,
        restrict_to_zone_fees: restrictZones,
        fee_taxable: feeTaxable,
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

  const toggleDeliveryDelayAlert = () => {
    if (!opsAlerts || opsSaving) return;
    void (async () => {
      setOpsSaving(true);
      try {
        const res = await updateOpsAlertsSettings({
          delivery_delay_alert_sms: !opsAlerts.delivery_delay_alert_sms,
        });
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
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Loading…</p>
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
        subtitle="Delivery zones, fees, and capacity"
      />
      <OrderingControlTabs />

      <StatusChipStrip chips={deliveryChips} />

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

      <div className="oc-card" style={S.card} data-testid="delivery-gate-pointers">
        <p style={S.sectionTitle}>Delivery on/off &amp; hours</p>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
          Today’s delivery switch and schedule live on the Online tab.
          Tomorrow’s delivery is controlled on the Features tab.
          This tab is only for zones, fees, and capacity.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/online-ordering" className="oc-btn-block" style={{ ...S.btnSecondary, textDecoration: 'none' }}>
            Today — delivery →
          </Link>
          <Link to="/online-ordering?section=features" className="oc-btn-block" style={{ ...S.btnSecondary, textDecoration: 'none' }}>
            Tomorrow — delivery →
          </Link>
        </div>
        {!isOpen && status.message && (
          <p style={{ ...S.reasonNote, marginTop: 12 }}>{status.message}</p>
        )}
        {!isOpen && status.next_delivery_window && (
          <p style={S.reasonNote}>
            Next window: {new Date(status.next_delivery_window).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </p>
        )}
      </div>

      <div className="oc-card" style={S.card}>
        <div style={S.sectionTitle}>Zones &amp; Fees</div>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: -8, marginBottom: 16, lineHeight: 1.5 }}>
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
            <label style={S.label}>Delivery time promise</label>
            <input
              type="text"
              value={deliveryTime}
              onChange={(e) => setDeliveryTime(e.target.value)}
              placeholder="30–45 min"
              data-testid="delivery-time-input"
              style={S.input}
            />
            <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
              What customers are told on the Website and Order App. Kept here beside the free-delivery threshold so the two cannot disagree. Content &amp; Branding cannot edit a separate copy.
            </p>
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
              Authoritative free-delivery threshold for checkout, invoices, receipts, Website and Order App messaging. Content & Branding cannot edit a separate copy.
            </p>
          </div>

          <div>
            <label style={S.label}>GST on delivery</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)', cursor: 'pointer', minHeight: 44 }}>
              <input
                type="checkbox"
                checked={feeTaxable}
                onChange={(e) => setFeeTaxable(e.target.checked)}
                data-testid="delivery-fee-taxable"
              />
              Charge GST on the delivery fee
            </label>
            <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
              A delivery charge is a taxable supply in the Maldives, so this is normally on. Turning it off stops GST being charged on delivery and takes the fee out of the GST return — check with whoever files your returns before changing it.
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
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', flexShrink: 0 }}>MVR</span>
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
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)', cursor: 'pointer', minHeight: 44 }}>
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

      <div className="oc-card" style={{
        padding: '12px 16px', background: 'var(--color-warning-bg)',
        border: '1px solid rgba(212,129,58,0.3)', borderRadius: 10,
        marginBottom: '1.25rem',
      }}>
        <p style={{ ...S.sectionTitle, marginBottom: 8 }}>Operations alerts</p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--color-text)' }}>
          <button
            type="button"
            style={S.toggleTrack(opsAlerts?.delivery_delay_alert_sms ?? false)}
            onClick={toggleDeliveryDelayAlert}
            role="switch"
            aria-checked={opsAlerts?.delivery_delay_alert_sms ?? false}
            aria-label="Delivery delay SMS alert"
          >
            <span style={S.toggleThumb(opsAlerts?.delivery_delay_alert_sms ?? false)} />
          </button>
          SMS business phone when delivery orders pass estimated ready time
        </label>
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          Uses the business phone from Website Settings. Runs hourly via scheduler; also appears in System Health alert inbox.
        </p>
      </div>

      <div style={{
        padding: '12px 16px', background: 'var(--color-warning-bg)',
        border: '1px solid rgba(212,129,58,0.3)', borderRadius: 10,
      }}>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          When delivery is off or outside schedule, the order app shows an amber <strong>Pickup only</strong> pill at checkout.
          Customers can still place takeaway orders normally.
        </p>
      </div>
    </div>

    </PageShell>
  );
}
