import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, Shield, Link2, Bell, Truck, ShoppingBag } from 'lucide-react';
import { Button, Card } from '../components/ui';
import { WebsiteSettings } from './SettingsPage/WebsiteSettingsSubPage';
import { PermissionsSettings } from './SettingsPage/PermissionsSettingsSubPage';
import {
  getSiteSettings, updateSiteSettings,
  getDeliveryStatus, toggleDelivery, updateDeliverySchedule,
  getOnlineOrderingStatus, toggleOnlineOrdering, setOnlineOrderingOverride, updateOnlineOrderingSchedule,
} from '../api';
import type { DeliveryGateStatus, OnlineOrderingGateStatus } from '../api';

// ─── Sub-page cards ───────────────────────────────────────────────────────────
const HUB_CARDS = [
  { id: 'website',       icon: Globe,        label: 'Website Settings',      desc: 'Hero slides, homepage content, contact info, branding & SEO' },
  { id: 'permissions',   icon: Shield,       label: 'Roles & Permissions',   desc: 'Manage role defaults and per-user overrides' },
  // Devices intentionally NOT a Settings sub-page: the top-level
  // /devices route owns the full device management UX (pre-provision,
  // enable/disable, rename). Having both routes was the source of
  // ADM-016: cashiers ended up on a stub list that lacked the actions
  // they expected.
  { id: 'notifications', icon: Bell,         label: 'Notifications',         desc: 'Customer SMS alerts for order status changes' },
  { id: 'integrations',  icon: Link2,        label: 'Integrations',          desc: 'Xero, Webhooks, SMS provider' },
  { id: 'ordering',      icon: ShoppingBag,  label: 'Online Ordering',       desc: 'Toggle online ordering on/off and set per-day ordering hours schedule' },
  { id: 'delivery',      icon: Truck,        label: 'Delivery Availability', desc: 'Toggle delivery on/off and set delivery hours separately from ordering hours' },
];

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

// ─── Shared multi-window schedule editor ─────────────────────────────────────
type DaySchedule = { enabled: boolean; windows: { open: string; close: string }[] };
type ScheduleMap = Record<string, DaySchedule>;

const WEEK_DAYS = [
  { key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' }, { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' }, { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
] as const;

const DEFAULT_WINDOW = { open: '11:00', close: '22:00' };

function makeDefaultSchedule(defaultOpen = '11:00', defaultClose = '22:00'): ScheduleMap {
  return Object.fromEntries(
    WEEK_DAYS.map(({ key }) => [key, { enabled: true, windows: [{ open: defaultOpen, close: defaultClose }] }]),
  );
}

function ScheduleEditor({ schedule, onChange }: { schedule: ScheduleMap; onChange: (s: ScheduleMap) => void }) {
  const setDay = (day: string, patch: Partial<DaySchedule>) =>
    onChange({ ...schedule, [day]: { ...schedule[day], ...patch } });

  const setWindow = (day: string, idx: number, field: 'open' | 'close', val: string) => {
    const wins = [...schedule[day].windows];
    wins[idx] = { ...wins[idx], [field]: val };
    setDay(day, { windows: wins });
  };

  const addWindow = (day: string) =>
    setDay(day, { windows: [...schedule[day].windows, { ...DEFAULT_WINDOW }] });

  const removeWindow = (day: string, idx: number) => {
    const wins = schedule[day].windows.filter((_, i) => i !== idx);
    setDay(day, { windows: wins.length ? wins : [{ ...DEFAULT_WINDOW }] });
  };

  return (
    <div style={{ border: '1.5px solid #E8E0D8', borderRadius: 10, overflow: 'hidden' }}>
      {WEEK_DAYS.map(({ key, label }, di) => {
        const day = schedule[key] ?? { enabled: true, windows: [{ ...DEFAULT_WINDOW }] };
        return (
          <div key={key} style={{
            borderTop: di === 0 ? 'none' : '1px solid #F0EBE5',
            background: day.enabled ? '#fff' : '#FAFAFA',
          }}>
            {/* Day header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px' }}>
              <span style={{ width: 36, fontSize: 13, fontWeight: 700, color: '#1C1408', flexShrink: 0 }}>{label}</span>
              {day.enabled ? (
                <span style={{ flex: 1, fontSize: 11, color: '#9C8E7E' }}>
                  {day.windows.length} window{day.windows.length !== 1 ? 's' : ''}
                </span>
              ) : (
                <span style={{ flex: 1, fontSize: 12, color: '#9C8E7E', fontStyle: 'italic' }}>Closed</span>
              )}
              {/* Day enabled toggle */}
              <button
                onClick={() => setDay(key, { enabled: !day.enabled })}
                style={{
                  flexShrink: 0, width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: day.enabled ? '#D4813A' : '#D1D5DB', position: 'relative', transition: 'background 0.2s',
                }}
              >
                <span style={{
                  position: 'absolute', top: 2, left: day.enabled ? 18 : 2,
                  width: 16, height: 16, borderRadius: '50%', background: '#fff',
                  transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                }} />
              </button>
            </div>

            {/* Windows */}
            {day.enabled && day.windows.map((win, wi) => (
              <div key={wi} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 14px 5px 50px',
                background: wi % 2 === 0 ? '#FAFAF8' : '#F5F0EB',
              }}>
                <input type="time" value={win.open} onChange={(e) => setWindow(key, wi, 'open', e.target.value)}
                  style={{ width: 95, height: 28, padding: '0 7px', border: '1px solid #E8E0D8', borderRadius: 7, fontSize: 13, fontFamily: 'inherit' }} />
                <span style={{ fontSize: 12, color: '#9C8E7E' }}>–</span>
                <input type="time" value={win.close} onChange={(e) => setWindow(key, wi, 'close', e.target.value)}
                  style={{ width: 95, height: 28, padding: '0 7px', border: '1px solid #E8E0D8', borderRadius: 7, fontSize: 13, fontFamily: 'inherit' }} />
                <button onClick={() => removeWindow(key, wi)}
                  style={{ marginLeft: 4, width: 22, height: 22, borderRadius: '50%', border: '1px solid #E8E0D8', background: '#fff', cursor: 'pointer', fontSize: 14, lineHeight: '20px', color: '#9C8E7E', flexShrink: 0 }}>
                  ×
                </button>
              </div>
            ))}

            {/* Add window button */}
            {day.enabled && (
              <div style={{ padding: '4px 14px 8px 50px' }}>
                <button onClick={() => addWindow(key)}
                  style={{ fontSize: 11, fontWeight: 600, color: '#D4813A', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  + Add window
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Online Ordering sub-page ─────────────────────────────────────────────────
function OnlineOrderingSettings() {
  const [status, setStatus] = useState<OnlineOrderingGateStatus | null>(null);
  const [toggling, setToggling] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleMap>(makeDefaultSchedule('07:00', '22:00'));
  const [overrideUntil, setOverrideUntil] = useState('');
  const [savingSched, setSavingSched] = useState(false);
  const [savedSched, setSavedSched] = useState(false);
  const [savingOverride, setSavingOverride] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOnlineOrderingStatus().then((s) => {
      setStatus(s);
      setScheduleEnabled(s.schedule_active);
      if (s.override_until) setOverrideUntil(s.override_until.slice(0, 16));
    }).catch((e: Error) => setError(e.message));
  }, []);

  const handleToggle = async (enabled: boolean) => {
    setToggling(true); setError(null);
    try { const res = await toggleOnlineOrdering(enabled); setStatus(res.status); }
    catch (e: unknown) { setError((e as Error).message); }
    finally { setToggling(false); }
  };

  const handleSaveSchedule = async () => {
    setSavingSched(true); setError(null);
    try {
      const res = await updateOnlineOrderingSchedule(scheduleEnabled ? schedule : null);
      setStatus(res.status);
      setSavedSched(true); setTimeout(() => setSavedSched(false), 2500);
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setSavingSched(false); }
  };

  const handleSaveOverride = async (clear = false) => {
    setSavingOverride(true); setError(null);
    try {
      await setOnlineOrderingOverride(clear ? null : (overrideUntil || null));
      const fresh = await getOnlineOrderingStatus();
      setStatus(fresh);
      if (clear) setOverrideUntil('');
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setSavingOverride(false); }
  };

  const isOpen = status?.open ?? false;
  const masterOn = status?.master_switch ?? true;
  const overrideActive = status?.override_active ?? false;
  const fmtTime = (iso: string | null | undefined) => {
    if (!iso) return '';
    return new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const Toggle = ({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) => (
    <button disabled={disabled} onClick={onClick} style={{
      flexShrink: 0, width: 44, height: 24, borderRadius: 12, border: 'none',
      cursor: disabled ? 'wait' : 'pointer', background: on ? '#16A34A' : '#D1D5DB',
      position: 'relative', transition: 'background 0.2s',
    }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
    </button>
  );

  return (
    <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {error && <p style={{ color: '#dc2626', fontSize: 13, margin: 0, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px' }}>{error}</p>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, background: isOpen ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.07)', border: `1.5px solid ${isOpen ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.2)'}` }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: isOpen ? '#16A34A' : '#DC2626', flexShrink: 0, display: 'inline-block' }} />
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: isOpen ? '#15803D' : '#DC2626' }}>
          Online ordering is currently <strong>{isOpen ? 'open' : 'closed'}</strong>
          {isOpen && status?.current_close ? ` · Closes ${fmtTime(status.current_close)}` : ''}
          {!isOpen && status?.next_open_window ? ` · Opens ${fmtTime(status.next_open_window)}` : ''}
          {overrideActive ? ' · Force-open override active' : ''}
        </p>
      </div>

      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#1C1408' }}>Accept online orders</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9C8E7E', lineHeight: 1.5 }}>Master switch — when off, all online ordering is blocked entirely regardless of schedule.</p>
          </div>
          <Toggle on={masterOn} onClick={() => void handleToggle(!masterOn)} disabled={toggling} />
        </div>
      </Card>

      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: scheduleEnabled ? 16 : 0 }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#1C1408' }}>Ordering hours schedule</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9C8E7E', lineHeight: 1.5 }}>Auto open/close each day. Supports multiple windows per day (e.g. lunch + dinner). Off = open all day.</p>
          </div>
          <Toggle on={scheduleEnabled} onClick={() => setScheduleEnabled(v => !v)} />
        </div>
        {scheduleEnabled && <div style={{ marginBottom: 16 }}><ScheduleEditor schedule={schedule} onChange={setSchedule} /></div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <Button onClick={() => void handleSaveSchedule()} disabled={savingSched}>
            {savingSched ? 'Saving…' : savedSched ? '✓ Saved' : 'Save Schedule'}
          </Button>
          {scheduleEnabled && <Button variant="secondary" onClick={() => { setScheduleEnabled(false); void updateOnlineOrderingSchedule(null).catch(() => null); }}>Clear Schedule</Button>}
        </div>
      </Card>

      <Card>
        <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 14, color: '#1C1408' }}>Force-open override</p>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: '#9C8E7E', lineHeight: 1.5 }}>Force ordering open until a datetime — overrides master switch AND schedule. Leave blank to clear.</p>
        {overrideActive && <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 600, color: '#D4813A' }}>⚡ Override active until {fmtTime(status?.override_until ?? null)}</p>}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="datetime-local" value={overrideUntil} onChange={(e) => setOverrideUntil(e.target.value)}
            style={{ height: 34, padding: '0 10px', border: '1.5px solid #E8E0D8', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', flex: 1, minWidth: 200 }} />
          <Button onClick={() => void handleSaveOverride()} disabled={savingOverride}>{savingOverride ? 'Saving…' : overrideActive ? 'Update' : 'Set Override'}</Button>
          {overrideActive && <Button variant="secondary" onClick={() => void handleSaveOverride(true)}>Clear</Button>}
        </div>
      </Card>

      <div style={{ padding: '12px 16px', background: '#FFF7ED', border: '1px solid rgba(212,129,58,0.3)', borderRadius: 10 }}>
        <p style={{ margin: 0, fontSize: 12, color: '#9C8E7E', lineHeight: 1.6 }}>💡 Changes take effect immediately. The order app status pill reflects the current state in real time.</p>
      </div>
    </div>
  );
}

// ─── Delivery Availability sub-page ──────────────────────────────────────────
function DeliverySettings() {
  const [status, setStatus] = useState<DeliveryGateStatus | null>(null);
  const [toggling, setToggling] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleMap>(makeDefaultSchedule('11:00', '22:00'));
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
    setToggling(true); setError(null);
    try { const res = await toggleDelivery(enabled); setStatus(res.delivery_status); }
    catch (e: unknown) { setError((e as Error).message); }
    finally { setToggling(false); }
  };

  const handleSaveSchedule = async () => {
    setSaving(true); setError(null);
    try {
      const res = await updateDeliverySchedule(scheduleEnabled ? schedule : null);
      setStatus(res.delivery_status);
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const isOpen = status?.delivery_open ?? false;
  const acceptingFlag = status?.accepting_flag ?? true;

  const Toggle = ({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) => (
    <button disabled={disabled} onClick={onClick} style={{
      flexShrink: 0, width: 44, height: 24, borderRadius: 12, border: 'none',
      cursor: disabled ? 'wait' : 'pointer', background: on ? '#16A34A' : '#D1D5DB',
      position: 'relative', transition: 'background 0.2s',
    }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
    </button>
  );

  return (
    <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {error && <p style={{ color: '#dc2626', fontSize: 13, margin: 0, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px' }}>{error}</p>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, background: isOpen ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.07)', border: `1.5px solid ${isOpen ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.2)'}` }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: isOpen ? '#16A34A' : '#DC2626', flexShrink: 0, display: 'inline-block' }} />
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: isOpen ? '#15803D' : '#DC2626' }}>
          Delivery is currently <strong>{isOpen ? 'available' : 'unavailable'}</strong>
          {!isOpen && status?.next_delivery_window ? ` · Next window: ${new Date(status.next_delivery_window).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}
        </p>
      </div>

      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#1C1408' }}>Accept deliveries</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9C8E7E', lineHeight: 1.5 }}>When off, delivery is hidden at checkout. Customers can still order for takeaway. Overrides schedule.</p>
          </div>
          <Toggle on={acceptingFlag} onClick={() => void handleToggle(!acceptingFlag)} disabled={toggling} />
        </div>
      </Card>

      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: scheduleEnabled ? 16 : 0 }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#1C1408' }}>Delivery hours schedule</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9C8E7E', lineHeight: 1.5 }}>Set per-day delivery windows separate from ordering hours. Supports multiple windows per day. Off = available all day.</p>
          </div>
          <Toggle on={scheduleEnabled} onClick={() => setScheduleEnabled(v => !v)} />
        </div>
        {scheduleEnabled && <div style={{ marginBottom: 16 }}><ScheduleEditor schedule={schedule} onChange={setSchedule} /></div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <Button onClick={() => void handleSaveSchedule()} disabled={saving}>
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Schedule'}
          </Button>
          {scheduleEnabled && <Button variant="secondary" onClick={() => { setScheduleEnabled(false); void updateDeliverySchedule(null).catch(() => null); }}>Clear Schedule</Button>}
        </div>
      </Card>

      <div style={{ padding: '12px 16px', background: '#FFF7ED', border: '1px solid rgba(212,129,58,0.3)', borderRadius: 10 }}>
        <p style={{ margin: 0, fontSize: 12, color: '#9C8E7E', lineHeight: 1.6 }}>
          💡 When delivery is off or outside schedule, the order app shows an amber <strong>"Takeaway only"</strong> pill. Customers can still place takeaway orders.
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
        {active === 'notifications'  && <NotificationsSettings />}
        {active === 'integrations'   && <IntegrationsSettings />}
        {active === 'ordering'       && <OnlineOrderingSettings />}
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
