import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, Shield, Smartphone, Link2, Bell, Truck } from 'lucide-react';
import { Button, Card } from '../components/ui';
import { WebsiteSettings } from './SettingsPage/WebsiteSettingsSubPage';
import { PermissionsSettings } from './SettingsPage/PermissionsSettingsSubPage';
import { fetchDevices, enableDevice, disableDevice, getSiteSettings, updateSiteSettings, getDeliveryStatus, toggleDelivery, updateDeliverySchedule } from '../api';
import type { Device, DeliveryGateStatus, DeliveryDayWindow } from '../api';

// ─── Sub-page cards ───────────────────────────────────────────────────────────
const HUB_CARDS = [
  { id: 'website',       icon: Globe,       label: 'Website Settings',     desc: 'Hero slides, homepage content, contact info, branding & SEO' },
  { id: 'permissions',   icon: Shield,      label: 'Roles & Permissions',  desc: 'Manage role defaults and per-user overrides' },
  { id: 'devices',       icon: Smartphone,  label: 'Devices',              desc: 'Register and manage POS/KDS devices' },
  { id: 'notifications', icon: Bell,        label: 'Notifications',        desc: 'Customer SMS alerts for order status changes' },
  { id: 'integrations',  icon: Link2,       label: 'Integrations',         desc: 'Xero, Webhooks, SMS provider' },
  { id: 'delivery',      icon: Truck,       label: 'Delivery Availability', desc: 'Toggle delivery on/off and set delivery hours separately from ordering hours' },
];

// ─── Devices sub-page ────────────────────────────────────────────────────────
function DevicesSettings() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toggling, setToggling] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    fetchDevices()
      .then((res) => setDevices(res.data ?? []))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleToggle = async (device: Device) => {
    setToggling(device.id);
    try {
      const res = device.is_active ? await disableDevice(device.id) : await enableDevice(device.id);
      setDevices((ds) => ds.map((d) => d.id === device.id ? res.device : d));
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setToggling(null);
    }
  };

  const typeIcon: Record<string, string> = { pos: '🖥️', kds: '📺', display: '📟' };

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: '#9C8E7E' }}>
          Devices register automatically on first login. Disable to block a device from accessing the system.
        </p>
        <Button variant="secondary" onClick={load}>↻ Refresh</Button>
      </div>
      {error && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</p>}
      {loading ? (
        <p style={{ fontSize: 13, color: '#9C8E7E' }}>Loading devices…</p>
      ) : devices.length === 0 ? (
        <Card><p style={{ margin: 0, fontSize: 13, color: '#9C8E7E', textAlign: 'center', padding: '16px 0' }}>No devices registered yet.</p></Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {devices.map((d) => (
            <Card key={d.id}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 22 }}>{typeIcon[d.type] ?? '📱'}</span>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#3D2B1F' }}>{d.name}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9C8E7E' }}>
                      {d.type.toUpperCase()}
                      {d.last_seen_at && ` · Last seen ${new Date(d.last_seen_at).toLocaleDateString()}`}
                      {d.registered_by && ` · Registered by ${d.registered_by}`}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: d.is_active ? '#DCFCE7' : '#FEE2E2', color: d.is_active ? '#166534' : '#991B1B' }}>
                    {d.is_active ? 'Active' : 'Disabled'}
                  </span>
                  <Button
                    variant="secondary"
                    onClick={() => void handleToggle(d)}
                    disabled={toggling === d.id}
                  >
                    {toggling === d.id ? '…' : d.is_active ? 'Disable' : 'Enable'}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Integrations sub-page ────────────────────────────────────────────────────
function IntegrationsSettings() {
  const navigate = useNavigate();
  const integrations = [
    { label: 'Xero Accounting', desc: 'Sync invoices and expenses to Xero.', path: '/xero', icon: '📊' },
    { label: 'Webhooks', desc: 'Send real-time event payloads to external services.', path: '/webhooks', icon: '🔗' },
    { label: 'SMS Campaigns', desc: 'Send bulk SMS and manage campaigns.', path: '/sms', icon: '💬' },
  ];
  return (
    <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {integrations.map((intg) => (
        <Card key={intg.path}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 24 }}>{intg.icon}</span>
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#3D2B1F' }}>{intg.label}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9C8E7E' }}>{intg.desc}</p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => navigate(intg.path)}>
              Open →
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ─── Notifications sub-page ──────────────────────────────────────────────────
type NotifToggle = { key: string; label: string; desc: string; emoji: string };

const CUSTOMER_SMS_TOGGLES: NotifToggle[] = [
  {
    key:   'sms_customer_preparing_enabled',
    label: 'Order Preparing',
    desc:  'SMS customer when the kitchen starts preparing their order.',
    emoji: '🍳',
  },
  {
    key:   'sms_customer_ready_enabled',
    label: 'Order Ready / Packed',
    desc:  'SMS customer when their order is ready for pickup, or packed for delivery.',
    emoji: '✅',
  },
  {
    key:   'sms_customer_on_the_way_enabled',
    label: 'Out for Delivery',
    desc:  'SMS customer when a rider picks up their delivery order.',
    emoji: '🛵',
  },
];

const ALWAYS_ON_TOGGLES: NotifToggle[] = [
  {
    key:   '_order_confirmed',
    label: 'Order Confirmed (Payment Received)',
    desc:  'Always on — SMS sent automatically when payment is received.',
    emoji: '🎉',
  },
  {
    key:   '_order_delivered',
    label: 'Order Delivered / Completed (Receipt)',
    desc:  'Always on — receipt link SMS sent when order is delivered or completed.',
    emoji: '📄',
  },
];

function NotificationsSettings() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState<string | null>(null);
  const [error, setError]       = useState('');

  useEffect(() => {
    setLoading(true);
    getSiteSettings()
      .then((res) => {
        const map: Record<string, string> = {};
        Object.values(res.settings ?? {}).forEach((group) => {
          (group as { key: string; value: string | null }[]).forEach((s) => {
            if (s.value !== null) map[s.key] = s.value;
          });
        });
        setSettings(map);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const isEnabled = (key: string) => {
    const v = settings[key];
    return v === undefined || v === 'true' || v === '1';
  };

  const toggle = async (key: string) => {
    const newVal = isEnabled(key) ? 'false' : 'true';
    setSaving(key);
    setError('');
    try {
      await updateSiteSettings({ [key]: newVal });
      setSettings((s) => ({ ...s, [key]: newVal }));
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSaving(null);
    }
  };

  const ToggleRow = ({ t, readOnly }: { t: NotifToggle; readOnly?: boolean }) => {
    const on = readOnly ? true : isEnabled(t.key);
    return (
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: '#fff', border: '1px solid #E8E0D8', borderRadius: 10, padding: '12px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>{t.emoji}</span>
          <div>
            <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: '#3D2B1F' }}>{t.label}</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9C8E7E' }}>{t.desc}</p>
          </div>
        </div>
        {readOnly ? (
          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: '#DCFCE7', color: '#166534' }}>
            Always On
          </span>
        ) : (
          <button
            onClick={() => void toggle(t.key)}
            disabled={saving === t.key || loading}
            title={on ? 'Click to disable' : 'Click to enable'}
            style={{
              width: 44, height: 24, borderRadius: 12, border: 'none',
              cursor: saving === t.key ? 'not-allowed' : 'pointer',
              background: on ? '#D4813A' : '#D1D5DB',
              transition: 'background 0.2s', position: 'relative', flexShrink: 0,
            }}
          >
            <span style={{
              position: 'absolute', top: 3, left: on ? 22 : 3,
              width: 18, height: 18, borderRadius: '50%', background: '#fff',
              transition: 'left 0.2s',
            }} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 640 }}>
      {error && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#3D2B1F', margin: '0 0 4px' }}>
          Customer SMS — Order Lifecycle
        </h3>
        <p style={{ fontSize: 13, color: '#9C8E7E', margin: '0 0 14px' }}>
          Control which order status changes trigger an SMS to the customer. Only fires if the customer has a registered phone number.
        </p>
        {loading ? (
          <p style={{ fontSize: 13, color: '#9C8E7E' }}>Loading…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ALWAYS_ON_TOGGLES.map((t) => <ToggleRow key={t.key} t={t} readOnly />)}
            {CUSTOMER_SMS_TOGGLES.map((t) => <ToggleRow key={t.key} t={t} />)}
          </div>
        )}
      </div>

      <div style={{ padding: '12px 16px', background: '#FFF7ED', border: '1px solid rgba(212,129,58,0.3)', borderRadius: 10 }}>
        <p style={{ margin: 0, fontSize: 12, color: '#9C8E7E', lineHeight: 1.6 }}>
          💡 <strong>Staff notifications</strong> (new order alerts, shift reminders, etc.) are configured separately under{' '}
          <strong>SMS Campaigns → Automations</strong>.
        </p>
      </div>
    </div>
  );
}

// ─── Delivery Availability sub-page ──────────────────────────────────────────
const WEEK_DAYS_DELIVERY = [
  { key: 'mon', label: 'Monday' }, { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' }, { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' }, { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
] as const;

type DayKey = typeof WEEK_DAYS_DELIVERY[number]['key'];

const EMPTY_SCHEDULE: Record<DayKey, DeliveryDayWindow> = {
  mon: { open: '11:00', close: '22:00', enabled: true },
  tue: { open: '11:00', close: '22:00', enabled: true },
  wed: { open: '11:00', close: '22:00', enabled: true },
  thu: { open: '11:00', close: '22:00', enabled: true },
  fri: { open: '11:00', close: '22:00', enabled: true },
  sat: { open: '11:00', close: '22:00', enabled: true },
  sun: { open: '11:00', close: '22:00', enabled: false },
};

function DeliverySettings() {
  const [status, setStatus] = useState<DeliveryGateStatus | null>(null);
  const [toggling, setToggling] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [schedule, setSchedule] = useState<Record<DayKey, DeliveryDayWindow>>(EMPTY_SCHEDULE);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDeliveryStatus().then((s) => {
      setStatus(s);
      setScheduleEnabled(s.schedule_active);
    }).catch((e: Error) => setError(e.message));
  }, []);

  const handleToggle = async (enabled: boolean) => {
    setToggling(true);
    setError(null);
    try {
      const res = await toggleDelivery(enabled);
      setStatus(res.delivery_status);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setToggling(false);
    }
  };

  const handleSaveSchedule = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = scheduleEnabled ? schedule : null;
      const res = await updateDeliverySchedule(payload);
      setStatus(res.delivery_status);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const updateDay = (day: DayKey, field: keyof DeliveryDayWindow, value: string | boolean) => {
    setSchedule((prev) => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  };

  const isOpen = status?.delivery_open ?? false;
  const acceptingFlag = status?.accepting_flag ?? true;

  return (
    <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {error && <p style={{ color: '#dc2626', fontSize: 13, margin: 0, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px' }}>{error}</p>}

      {/* Status banner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px', borderRadius: 12,
        background: isOpen ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.07)',
        border: `1.5px solid ${isOpen ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.2)'}`,
      }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: isOpen ? '#16A34A' : '#DC2626', flexShrink: 0, display: 'inline-block' }} />
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: isOpen ? '#15803D' : '#DC2626' }}>
          Delivery is currently <strong>{isOpen ? 'available' : 'unavailable'}</strong>
          {!isOpen && status?.next_delivery_window ? ` · Next window: ${new Date(status.next_delivery_window).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}
        </p>
      </div>

      {/* Manual toggle */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#1C1408' }}>Accept deliveries</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9C8E7E', lineHeight: 1.5 }}>
              When off, the delivery option is hidden at checkout. Customers can still order for takeaway.
              This overrides the schedule below.
            </p>
          </div>
          <button
            disabled={toggling}
            onClick={() => void handleToggle(!acceptingFlag)}
            style={{
              flexShrink: 0, width: 44, height: 24, borderRadius: 12, border: 'none', cursor: toggling ? 'wait' : 'pointer',
              background: acceptingFlag ? '#16A34A' : '#D1D5DB',
              position: 'relative', transition: 'background 0.2s',
            }}
          >
            <span style={{
              position: 'absolute', top: 3, left: acceptingFlag ? 23 : 3,
              width: 18, height: 18, borderRadius: '50%', background: '#fff',
              transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }} />
          </button>
        </div>
      </Card>

      {/* Schedule */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#1C1408' }}>Delivery hours schedule</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9C8E7E', lineHeight: 1.5 }}>
              Set per-day delivery windows separate from general ordering hours.
              When off, delivery is available all day (while the toggle above is on).
            </p>
          </div>
          <button
            onClick={() => setScheduleEnabled((v) => !v)}
            style={{
              flexShrink: 0, width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
              background: scheduleEnabled ? '#16A34A' : '#D1D5DB',
              position: 'relative', transition: 'background 0.2s',
            }}
          >
            <span style={{
              position: 'absolute', top: 3, left: scheduleEnabled ? 23 : 3,
              width: 18, height: 18, borderRadius: '50%', background: '#fff',
              transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }} />
          </button>
        </div>

        {scheduleEnabled && (
          <div style={{ border: '1.5px solid #E8E0D8', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
            {WEEK_DAYS_DELIVERY.map(({ key, label }, i) => {
              const day = schedule[key];
              return (
                <div key={key} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                  borderTop: i === 0 ? 'none' : '1px solid #F0EBE5',
                  background: day.enabled ? '#fff' : '#FAFAFA',
                }}>
                  <span style={{ width: 86, fontSize: 13, fontWeight: 600, color: '#1C1408', flexShrink: 0 }}>{label}</span>
                  {day.enabled ? (
                    <>
                      <input type="time" value={day.open}  onChange={(e) => updateDay(key, 'open',  e.target.value)}
                        style={{ width: 100, height: 30, padding: '0 8px', border: '1px solid #E8E0D8', borderRadius: 7, fontSize: 13, fontFamily: 'inherit' }} />
                      <span style={{ fontSize: 12, color: '#9C8E7E' }}>to</span>
                      <input type="time" value={day.close} onChange={(e) => updateDay(key, 'close', e.target.value)}
                        style={{ width: 100, height: 30, padding: '0 8px', border: '1px solid #E8E0D8', borderRadius: 7, fontSize: 13, fontFamily: 'inherit' }} />
                    </>
                  ) : (
                    <span style={{ flex: 1, fontSize: 12, color: '#9C8E7E', fontStyle: 'italic' }}>Closed</span>
                  )}
                  <button
                    onClick={() => updateDay(key, 'enabled', !day.enabled)}
                    style={{
                      marginLeft: 'auto', flexShrink: 0,
                      width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: day.enabled ? '#D4813A' : '#D1D5DB',
                      position: 'relative', transition: 'background 0.2s',
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: 2, left: day.enabled ? 18 : 2,
                      width: 16, height: 16, borderRadius: '50%', background: '#fff',
                      transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                    }} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <Button onClick={() => void handleSaveSchedule()} disabled={saving}>
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Schedule'}
          </Button>
          {scheduleEnabled && (
            <Button variant="secondary" onClick={() => { setScheduleEnabled(false); void updateDeliverySchedule(null).catch(() => null); }}>
              Clear Schedule
            </Button>
          )}
        </div>
      </Card>

      <div style={{ padding: '12px 16px', background: '#FFF7ED', border: '1px solid rgba(212,129,58,0.3)', borderRadius: 10 }}>
        <p style={{ margin: 0, fontSize: 12, color: '#9C8E7E', lineHeight: 1.6 }}>
          💡 When delivery is off or outside schedule, the order app shows an amber <strong>"Takeaway only"</strong> pill.
          Customers can still order — they just won't see the delivery option at checkout.
        </p>
      </div>
    </div>
  );
}

// ─── Main SettingsPage ────────────────────────────────────────────────────────
export function SettingsPage() {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Settings — Bake & Grill Admin';
  }, []);

  if (active) {
    const card = HUB_CARDS.find((c) => c.id === active) ?? HUB_CARDS[0];
    return (
      <div className="animate-fade-in">
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: 14 }}>
          <button
            onClick={() => setActive(null)}
            style={{ color: '#9C8E7E', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, padding: 0 }}
            onMouseOver={(e) => (e.currentTarget.style.color = '#D4813A')}
            onMouseOut={(e) => (e.currentTarget.style.color = '#9C8E7E')}
          >
            Settings
          </button>
          <span style={{ color: '#9C8E7E' }}>›</span>
          <span style={{ fontWeight: 600, color: '#1C1408' }}>{card.label}</span>
        </div>

        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1C1408', margin: 0 }}>{card.label}</h1>
          <p style={{ fontSize: 14, color: '#9C8E7E', marginTop: 4 }}>{card.desc}</p>
        </div>

        {active === 'website'        && <WebsiteSettings />}
        {active === 'permissions'    && <PermissionsSettings />}
        {active === 'devices'        && <DevicesSettings />}
        {active === 'notifications'  && <NotificationsSettings />}
        {active === 'integrations'   && <IntegrationsSettings />}
        {active === 'delivery'       && <DeliverySettings />}
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1C1408', margin: 0 }}>Settings</h1>
        <p style={{ fontSize: 14, color: '#9C8E7E', marginTop: 4 }}>Manage your business settings, permissions, and integrations</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        {HUB_CARDS.map(({ id, icon: Icon, label, desc }) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            style={{
              textAlign: 'left', padding: 20,
              background: '#fff', border: '1.5px solid #E8E0D8',
              borderRadius: 14, boxShadow: '0 1px 2px rgba(28,20,8,0.05)',
              cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s',
              fontFamily: 'inherit',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = 'rgba(212,129,58,0.4)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(28,20,8,0.08)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = '#E8E0D8';
              e.currentTarget.style.boxShadow = '0 1px 2px rgba(28,20,8,0.05)';
            }}
          >
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(212,129,58,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D4813A', marginBottom: 12 }}>
              <Icon size={20} />
            </div>
            <p style={{ fontWeight: 700, color: '#1C1408', fontSize: 14, margin: '0 0 4px' }}>{label}</p>
            <p style={{ fontSize: 12, color: '#9C8E7E', lineHeight: 1.5, margin: 0 }}>{desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
