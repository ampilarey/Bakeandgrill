import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Power, RefreshCw, Lock, Unlock, AlertTriangle, CheckCircle2, Save } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import { PageHeader, PageShell } from '../components/SharedUI';
import { ServiceChargeSettings } from './SettingsPage/ServiceChargeSettings';
import { PaymentCommissionSettings } from './SettingsPage/PaymentCommissionSettings';
import {
  getOnlineOrderingStatus,
  toggleOnlineOrdering,
  setOnlineOrderingOverride,
  updateOnlineOrderingSchedule,
  getCateringOrderingStatus,
  toggleCateringOrdering,
  setCateringOrderingOverride,
  updateCateringOrderingSchedule,
  getSiteSettings,
  updateSiteSettings,
  getPackagingFeeSettings,
  updatePackagingFeeSettings,
  type OnlineOrderingGateStatus,
  type CateringOrderingGateStatus,
  type PackagingFeeSettings,
} from '../api';
import { OrderingControlTabs } from '../components/OrderingControlTabs';

const DAYS = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
] as const;

type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
type TimeWindow = { open: string; close: string };
type DaySchedule = { enabled: boolean; windows: TimeWindow[] };
type Schedule = Record<DayKey, DaySchedule>;

const DEFAULT_SCHEDULE: Schedule = Object.fromEntries(
  DAYS.map(({ key }) => [key, { enabled: true, windows: [{ open: '10:00', close: '22:00' }] }])
) as Schedule;

/** Online-ordering sub-tabs only — Pre-order is a top-level Ordering Control tab. */
const PAGE_SECTIONS = [
  { id: 'gates', label: 'Gates & Schedule' },
  { id: 'pickup', label: 'Pickup Slots' },
  { id: 'fees', label: 'Fees' },
] as const;

type PageSection = (typeof PAGE_SECTIONS)[number]['id'] | 'events';

const sectionTabStyle = (active: boolean): React.CSSProperties => ({
  padding: '7px 14px',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: active ? 700 : 500,
  background: active ? 'var(--color-surface)' : 'transparent',
  color: active ? 'var(--color-text)' : 'var(--color-text-secondary)',
  boxShadow: active ? '0 1px 3px rgba(28,20,8,0.08)' : 'none',
});

function parseSchedule(raw: string): Schedule {
  try {
    const parsed = JSON.parse(raw);
    const result = { ...DEFAULT_SCHEDULE };
    for (const { key } of DAYS) {
      const val = parsed[key];
      if (!val) continue;
      // Array of windows format
      if (Array.isArray(val)) {
        result[key] = { enabled: true, windows: val.map((w: any) => ({ open: w.open ?? '10:00', close: w.close ?? '22:00' })) };
      } else if (typeof val === 'object') {
        result[key] = {
          enabled: val.enabled !== false,
          windows: val.windows
            ? val.windows.map((w: any) => ({ open: w.open, close: w.close }))
            : [{ open: val.open ?? '10:00', close: val.close ?? '22:00' }],
        };
      }
    }
    return result;
  } catch {
    return DEFAULT_SCHEDULE;
  }
}

const S = {
  card: {
    background: '#FDFAF7',
    border: '1px solid var(--color-border)',
    borderRadius: 16,
    padding: '1.5rem',
    marginBottom: '1.25rem',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '1rem',
  },
  input: {
    width: '100%',
    padding: '9px 12px',
    border: '1.5px solid var(--color-border)',
    borderRadius: 10,
    fontSize: 13,
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  },
  label: {
    display: 'block' as const,
    fontSize: 13,
    fontWeight: 600 as const,
    color: 'var(--color-text-secondary)',
    marginBottom: 4,
  },
  row: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const },
  btnPrimary: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 16px', borderRadius: 10, border: 'none',
    background: 'var(--color-primary)', color: '#fff', fontSize: 13, fontWeight: 600,
    cursor: 'pointer',
  } as React.CSSProperties,
  btnSecondary: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 16px', borderRadius: 10,
    border: '1.5px solid var(--color-border)', background: 'var(--color-surface)',
    color: '#4A3728', fontSize: 13, fontWeight: 600,
    cursor: 'pointer',
  } as React.CSSProperties,
  btnDanger: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 16px', borderRadius: 10, border: 'none',
    background: 'var(--color-danger)', color: '#fff', fontSize: 13, fontWeight: 600,
    cursor: 'pointer',
  } as React.CSSProperties,
  statusOpen: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: '#D1FAE5', color: '#065F46',
    border: '1px solid #A7F3D0',
    borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 700,
  } as React.CSSProperties,
  statusClosed: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'var(--color-danger-bg)', color: 'var(--color-danger-strong)',
    border: '1px solid #FECACA',
    borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 700,
  } as React.CSSProperties,
  reasonNote: {
    fontSize: 12, color: '#9C8575', marginTop: 6,
  },
  toggleTrack: (on: boolean): React.CSSProperties => ({
    display: 'inline-block', position: 'relative',
    width: 48, height: 26, borderRadius: 13,
    background: on ? 'var(--color-primary)' : '#D1C9BE',
    transition: 'background 0.2s',
    cursor: 'pointer', flexShrink: 0,
  }),
  toggleThumb: (on: boolean): React.CSSProperties => ({
    position: 'absolute', top: 3, left: on ? 26 : 3,
    width: 20, height: 20, borderRadius: '50%',
    background: 'var(--color-surface)', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
    transition: 'left 0.2s',
  }),
};

const DEFAULT_RAMADAN_BUSINESS_HOURS: Record<string, string> = {
  mon: '4:00 PM – 11:00 PM',
  tue: '4:00 PM – 11:00 PM',
  wed: '4:00 PM – 11:00 PM',
  thu: '4:00 PM – 11:00 PM',
  fri: '4:00 PM – 11:00 PM',
  sat: '4:00 PM – 11:00 PM',
  sun: '4:00 PM – 11:00 PM',
};

const DEFAULT_EID_BUSINESS_HOURS: Record<string, string> = {
  mon: '10:00 AM – 11:00 PM',
  tue: '10:00 AM – 11:00 PM',
  wed: '10:00 AM – 11:00 PM',
  thu: '10:00 AM – 11:00 PM',
  fri: '10:00 AM – 11:00 PM',
  sat: '10:00 AM – 11:00 PM',
  sun: '10:00 AM – 11:00 PM',
};

const REASON_LABELS: Record<string, string> = {
  master_switch_off: 'Master switch is off',
  schedule:          'Outside scheduled hours',
  override_active:   'Force-open override is active',
};

export default function OnlineOrderingPage() {
  usePageTitle('Ordering Control');
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionParam = searchParams.get('section');
  const section: PageSection =
    sectionParam === 'fees' || sectionParam === 'pickup' || sectionParam === 'events'
      ? sectionParam
      : 'gates';

  const setSection = (next: PageSection) => {
    if (next === 'gates') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ section: next }, { replace: true });
    }
  };

  const [status, setStatus]       = useState<OnlineOrderingGateStatus | null>(null);
  const [loading, setLoading]     = useState(true);
  const [toggling, setToggling]   = useState(false);
  const [overrideUntil, setOverrideUntil] = useState('');
  const [savingOverride, setSavingOverride] = useState(false);
  const [toast, setToast]         = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [error, setError]         = useState('');

  const [schedule, setSchedule]     = useState<Schedule>(DEFAULT_SCHEDULE);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleSaving, setScheduleSaving]   = useState(false);

  const [feeSettings, setFeeSettings] = useState<PackagingFeeSettings | null>(null);
  const [feeSaving, setFeeSaving] = useState(false);

  const [pickupEnabled, setPickupEnabled] = useState(true);
  const [pickupMinutes, setPickupMinutes] = useState('30');
  const [pickupCapacity, setPickupCapacity] = useState('8');
  const [pickupSaving, setPickupSaving] = useState(false);

  const [cateringNotifyPhone, setCateringNotifyPhone] = useState('');
  const [cateringNotifyEmail, setCateringNotifyEmail] = useState('');
  const [cateringMinLeadHours, setCateringMinLeadHours] = useState('24');
  const [cateringQuoteValidDays, setCateringQuoteValidDays] = useState('7');
  const [cateringQuoteMinHours, setCateringQuoteMinHours] = useState('24');
  const [cateringReminderEnabled, setCateringReminderEnabled] = useState(true);
  const [cateringSaving, setCateringSaving] = useState(false);
  const [cateringClosedMessage, setCateringClosedMessage] = useState(
    'Pre-order is currently closed. Please check back during accepting hours.',
  );
  const [cateringStatus, setCateringStatus] = useState<CateringOrderingGateStatus | null>(null);
  const [cateringToggling, setCateringToggling] = useState(false);
  const [cateringOverrideUntil, setCateringOverrideUntil] = useState('');
  const [cateringSavingOverride, setCateringSavingOverride] = useState(false);
  const [cateringSchedule, setCateringSchedule] = useState<Schedule>(DEFAULT_SCHEDULE);
  const [cateringScheduleSaving, setCateringScheduleSaving] = useState(false);

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = () => {
    setLoading(true);
    getOnlineOrderingStatus()
      .then((s) => {
        setStatus(s);
        if (s.override_until) {
          // Convert ISO datetime to local datetime-local input value (must use local parts, not UTC)
          const d = new Date(s.override_until);
          const pad = (n: number) => String(n).padStart(2, '0');
          const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
          setOverrideUntil(local);
        }
      })
      .catch(() => setError('Failed to load online ordering status.'))
      .finally(() => setLoading(false));
  };

  const loadCateringGate = () => {
    getCateringOrderingStatus()
      .then((s) => {
        setCateringStatus(s);
        if (s.override_until) {
          const d = new Date(s.override_until);
          const pad = (n: number) => String(n).padStart(2, '0');
          setCateringOverrideUntil(
            `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
          );
        } else {
          setCateringOverrideUntil('');
        }
      })
      .catch(() => { /* optional until migration runs */ });
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { loadCateringGate(); }, []);

  useEffect(() => {
    getSiteSettings().then(({ settings }) => {
      const flat = Object.values(settings).flat() as Array<{ key: string; value: string }>;
      const byKey = (k: string) => flat.find((s) => s.key === k)?.value;
      const raw = byKey('online_ordering_schedule') ?? '';
      if (raw) setSchedule(parseSchedule(raw));
      const cateringRaw = byKey('catering_ordering_schedule') ?? '';
      if (cateringRaw) setCateringSchedule(parseSchedule(cateringRaw));
      const closedMsg = byKey('catering_ordering_closed_message');
      if (closedMsg) setCateringClosedMessage(closedMsg);
      const enabled = byKey('pickup_slots_enabled');
      if (enabled !== undefined) setPickupEnabled(enabled === '1' || enabled === 'true');
      const minutes = byKey('pickup_slot_minutes');
      if (minutes) setPickupMinutes(minutes);
      const capacity = byKey('pickup_slot_capacity');
      if (capacity) setPickupCapacity(capacity);
      setCateringNotifyPhone(byKey('catering_notify_phone') ?? '');
      setCateringNotifyEmail(byKey('catering_notify_email') ?? '');
      setCateringMinLeadHours(byKey('catering_min_lead_hours') ?? '24');
      setCateringQuoteValidDays(byKey('catering_quote_valid_days') ?? '7');
      setCateringQuoteMinHours(byKey('catering_quote_min_hours_before_event') ?? '24');
      const reminder = byKey('catering_reminder_enabled');
      if (reminder !== undefined) {
        setCateringReminderEnabled(reminder === '1' || reminder === 'true');
      }
    }).finally(() => setScheduleLoading(false));
    getPackagingFeeSettings()
      .then(({ settings }) => setFeeSettings(settings))
      .catch(() => { /* optional */ });
  }, []);

  const savePickupSlots = async () => {
    const minutes = parseInt(pickupMinutes, 10);
    const capacity = parseInt(pickupCapacity, 10);
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 240) {
      showToast('Slot length must be 5–240 minutes.', 'err');
      return;
    }
    if (!Number.isFinite(capacity) || capacity < 1 || capacity > 200) {
      showToast('Slot capacity must be 1–200.', 'err');
      return;
    }
    setPickupSaving(true);
    try {
      await updateSiteSettings({
        pickup_slots_enabled: pickupEnabled ? '1' : '0',
        pickup_slot_minutes: String(minutes),
        pickup_slot_capacity: String(capacity),
      });
      showToast('Pickup slots saved.');
    } catch {
      showToast('Failed to save pickup slots.', 'err');
    } finally {
      setPickupSaving(false);
    }
  };

  const saveFeeSettings = async () => {
    if (!feeSettings) return;
    setFeeSaving(true);
    try {
      const { settings } = await updatePackagingFeeSettings(feeSettings);
      setFeeSettings(settings);
      showToast('Fees & order cap saved.');
    } catch {
      showToast('Failed to save fee settings.', 'err');
    } finally {
      setFeeSaving(false);
    }
  };

  const handleCateringToggle = async () => {
    if (!cateringStatus) return;
    setCateringToggling(true);
    try {
      const { status: next } = await toggleCateringOrdering(!cateringStatus.master_switch);
      setCateringStatus(next);
      showToast(next.master_switch ? 'Pre-order is ON.' : 'Pre-order is OFF.');
    } catch {
      showToast('Failed to toggle pre-order.', 'err');
    } finally {
      setCateringToggling(false);
    }
  };

  const handleCateringSetOverride = async () => {
    if (!cateringOverrideUntil) {
      showToast('Pick an override end time.', 'err');
      return;
    }
    setCateringSavingOverride(true);
    try {
      const { status: next } = await setCateringOrderingOverride(new Date(cateringOverrideUntil).toISOString());
      setCateringStatus(next);
      showToast('Pre-order force-open override set.');
    } catch {
      showToast('Failed to set override.', 'err');
    } finally {
      setCateringSavingOverride(false);
    }
  };

  const handleCateringClearOverride = async () => {
    setCateringSavingOverride(true);
    try {
      const { status: next } = await setCateringOrderingOverride(null);
      setCateringStatus(next);
      setCateringOverrideUntil('');
      showToast('Pre-order override cleared.');
    } catch {
      showToast('Failed to clear override.', 'err');
    } finally {
      setCateringSavingOverride(false);
    }
  };

  const saveCateringSchedule = async () => {
    setCateringScheduleSaving(true);
    try {
      const { status: next } = await updateCateringOrderingSchedule(cateringSchedule);
      setCateringStatus(next);
      showToast('Pre-order schedule saved.');
    } catch {
      showToast('Failed to save pre-order schedule.', 'err');
    } finally {
      setCateringScheduleSaving(false);
    }
  };

  const clearCateringSchedule = async () => {
    setCateringScheduleSaving(true);
    try {
      const { status: next } = await updateCateringOrderingSchedule(null);
      setCateringStatus(next);
      setCateringSchedule(DEFAULT_SCHEDULE);
      showToast('Pre-order schedule cleared (always open when ON).');
    } catch {
      showToast('Failed to clear schedule.', 'err');
    } finally {
      setCateringScheduleSaving(false);
    }
  };

  const saveCateringSettings = async () => {
    const lead = parseInt(cateringMinLeadHours, 10);
    const validDays = parseInt(cateringQuoteValidDays, 10);
    const minHours = parseInt(cateringQuoteMinHours, 10);
    if (!Number.isFinite(lead) || lead < 0 || lead > 720) {
      showToast('Min lead hours must be 0–720.', 'err');
      return;
    }
    if (!Number.isFinite(validDays) || validDays < 1 || validDays > 60) {
      showToast('Quote valid days must be 1–60.', 'err');
      return;
    }
    if (!Number.isFinite(minHours) || minHours < 0 || minHours > 168) {
      showToast('Quote cutoff hours must be 0–168.', 'err');
      return;
    }
    setCateringSaving(true);
    try {
      await updateSiteSettings({
        catering_notify_phone: cateringNotifyPhone.trim(),
        catering_notify_email: cateringNotifyEmail.trim(),
        catering_min_lead_hours: String(lead),
        catering_quote_valid_days: String(validDays),
        catering_quote_min_hours_before_event: String(minHours),
        catering_reminder_enabled: cateringReminderEnabled ? '1' : '0',
        catering_ordering_closed_message: cateringClosedMessage.trim()
          || 'Pre-order is currently closed. Please check back during accepting hours.',
      });
      showToast('Catering & events settings saved.');
      loadCateringGate();
    } catch {
      showToast('Failed to save catering settings.', 'err');
    } finally {
      setCateringSaving(false);
    }
  };

  const applyRamadanPreset = async () => {
    const preset: Schedule = Object.fromEntries(
      DAYS.map(({ key }) => [key, {
        enabled: true,
        windows: [{ open: '17:00', close: '01:00' }],
      }]),
    ) as Schedule;
    setSchedule(preset);

    let businessHours = DEFAULT_RAMADAN_BUSINESS_HOURS;
    try {
      const { settings } = await getSiteSettings();
      const rawPreset = Object.values(settings).flat().find((s: { key: string }) => s.key === 'ramadan_hours_preset')?.value;
      if (rawPreset) {
        const parsed = JSON.parse(rawPreset) as Record<string, string>;
        if (parsed && typeof parsed === 'object') businessHours = { ...DEFAULT_RAMADAN_BUSINESS_HOURS, ...parsed };
      }
    } catch { /* use default */ }

    try {
      await updateSiteSettings({ business_hours: JSON.stringify(businessHours) });
      showToast('Ramadan hours applied to business hours and online schedule — save schedule to persist ordering windows.');
    } catch {
      showToast('Schedule updated locally; failed to save business hours.', 'err');
    }
  };

  const applyEidPreset = async () => {
    const preset: Schedule = Object.fromEntries(
      DAYS.map(({ key }) => [key, {
        enabled: true,
        windows: [{ open: '10:00', close: '23:00' }],
      }]),
    ) as Schedule;
    setSchedule(preset);

    let businessHours = DEFAULT_EID_BUSINESS_HOURS;
    try {
      const { settings } = await getSiteSettings();
      const rawPreset = Object.values(settings).flat().find((s: { key: string }) => s.key === 'eid_hours_preset')?.value;
      if (rawPreset) {
        const parsed = JSON.parse(rawPreset) as Record<string, string>;
        if (parsed && typeof parsed === 'object') businessHours = { ...DEFAULT_EID_BUSINESS_HOURS, ...parsed };
      }
    } catch { /* use default */ }

    try {
      await updateSiteSettings({ business_hours: JSON.stringify(businessHours) });
      showToast('Eid hours applied — save schedule to persist ordering windows.');
    } catch {
      showToast('Schedule updated locally; failed to save business hours.', 'err');
    }
  };

  const saveSchedule = async () => {
    setScheduleSaving(true);
    try {
      await updateOnlineOrderingSchedule(schedule);
      showToast('Schedule saved.');
    } catch {
      showToast('Failed to save schedule.', 'err');
    } finally {
      setScheduleSaving(false);
    }
  };

  const toggleDayEnabled = (day: DayKey) => {
    setSchedule((prev) => ({ ...prev, [day]: { ...prev[day], enabled: !prev[day].enabled } }));
  };

  const updateWindow = (day: DayKey, idx: number, field: 'open' | 'close', value: string) => {
    setSchedule((prev) => {
      const windows = prev[day].windows.map((w, i) => i === idx ? { ...w, [field]: value } : w);
      return { ...prev, [day]: { ...prev[day], windows } };
    });
  };

  const addWindow = (day: DayKey) => {
    setSchedule((prev) => ({
      ...prev,
      [day]: { ...prev[day], windows: [...prev[day].windows, { open: '18:00', close: '22:00' }] },
    }));
  };

  const removeWindow = (day: DayKey, idx: number) => {
    setSchedule((prev) => ({
      ...prev,
      [day]: { ...prev[day], windows: prev[day].windows.filter((_, i) => i !== idx) },
    }));
  };

  const setAllDays = (enabled: boolean) => {
    setSchedule((prev) => Object.fromEntries(
      DAYS.map(({ key }) => [key, { ...prev[key], enabled }])
    ) as Schedule);
  };

  const toggleCateringDayEnabled = (day: DayKey) => {
    setCateringSchedule((prev) => ({ ...prev, [day]: { ...prev[day], enabled: !prev[day].enabled } }));
  };

  const updateCateringWindow = (day: DayKey, idx: number, field: 'open' | 'close', value: string) => {
    setCateringSchedule((prev) => {
      const windows = prev[day].windows.map((w, i) => (i === idx ? { ...w, [field]: value } : w));
      return { ...prev, [day]: { ...prev[day], windows } };
    });
  };

  const addCateringWindow = (day: DayKey) => {
    setCateringSchedule((prev) => ({
      ...prev,
      [day]: { ...prev[day], windows: [...prev[day].windows, { open: '10:00', close: '18:00' }] },
    }));
  };

  const removeCateringWindow = (day: DayKey, idx: number) => {
    setCateringSchedule((prev) => ({
      ...prev,
      [day]: { ...prev[day], windows: prev[day].windows.filter((_, i) => i !== idx) },
    }));
  };

  const setAllCateringDays = (enabled: boolean) => {
    setCateringSchedule((prev) => Object.fromEntries(
      DAYS.map(({ key }) => [key, { ...prev[key], enabled }]),
    ) as Schedule);
  };

  const handleToggle = async () => {
    if (!status) return;
    const next = !status.master_switch;
    setToggling(true);
    try {
      await toggleOnlineOrdering(next);
      showToast(`Online ordering ${next ? 'enabled' : 'disabled'}.`);
      load();
    } catch {
      showToast('Failed to update. Try again.', 'err');
    } finally {
      setToggling(false);
    }
  };

  const handleSetOverride = async () => {
    if (!overrideUntil) {
      showToast('Please pick a date and time first.', 'err');
      return;
    }
    setSavingOverride(true);
    try {
      const isoVal = new Date(overrideUntil).toISOString();
      await setOnlineOrderingOverride(isoVal);
      showToast('Force-open override set.');
      load();
    } catch {
      showToast('Failed to save override.', 'err');
    } finally {
      setSavingOverride(false);
    }
  };

  const handleClearOverride = async () => {
    setSavingOverride(true);
    try {
      await setOnlineOrderingOverride(null);
      setOverrideUntil('');
      showToast('Override cleared.');
      load();
    } catch {
      showToast('Failed to clear override.', 'err');
    } finally {
      setSavingOverride(false);
    }
  };

  const toastBanner = toast ? (
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
  ) : null;

  if (section === 'events') {
    return (
      <PageShell>
        <div style={{ padding: '1.5rem', maxWidth: 680 }}>
          <PageHeader section="Manage"
            title="Ordering Control Center"
            subtitle="Turn pre-order / event requests on or off, set accepting hours, and quote settings"
          />
          <OrderingControlTabs />
          {toastBanner}
          <>
        <div style={S.card} data-testid="catering-preorder-gate">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <p style={S.sectionTitle}>Pre-order gate</p>
              <span style={cateringStatus?.open ? S.statusOpen : S.statusClosed}>
                {cateringStatus?.open ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                {cateringStatus?.open ? 'Accepting pre-orders' : 'Not accepting pre-orders'}
              </span>
              {cateringStatus && !cateringStatus.open && cateringStatus.reason && (
                <p style={S.reasonNote}>
                  Reason: {REASON_LABELS[cateringStatus.reason] ?? cateringStatus.reason}
                </p>
              )}
              {cateringStatus?.override_until && (
                <p style={{ ...S.reasonNote, color: 'var(--color-primary)', fontWeight: 600 }}>
                  Force-open until {new Date(cateringStatus.override_until).toLocaleString()}
                </p>
              )}
            </div>
            <button style={{ ...S.btnSecondary, fontSize: 12, padding: '6px 12px' }} onClick={loadCateringGate} type="button">
              <RefreshCw size={13} />
              Refresh
            </button>
          </div>
        </div>

        <div style={S.card}>
          <p style={S.sectionTitle}>Master Switch</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              type="button"
              style={S.toggleTrack(!!cateringStatus?.master_switch)}
              onClick={() => void handleCateringToggle()}
              disabled={cateringToggling || !cateringStatus}
              aria-label="Toggle pre-order"
              role="switch"
              aria-checked={!!cateringStatus?.master_switch}
            >
              <span style={S.toggleThumb(!!cateringStatus?.master_switch)} />
            </button>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#3D2B1F' }}>
                {cateringStatus?.master_switch ? 'Pre-order is ON' : 'Pre-order is OFF'}
              </div>
              <div style={{ fontSize: 12, color: '#9C8575', marginTop: 2 }}>
                {cateringStatus?.master_switch
                  ? 'Customers can submit new event / pre-order requests.'
                  : 'New customer requests are blocked. Existing quotes and admin tools stay available.'}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              style={cateringStatus?.master_switch ? S.btnDanger : S.btnPrimary}
              onClick={() => void handleCateringToggle()}
              disabled={cateringToggling || !cateringStatus}
            >
              <Power size={14} />
              {cateringToggling
                ? 'Updating…'
                : cateringStatus?.master_switch
                  ? 'Turn OFF pre-order'
                  : 'Turn ON pre-order'}
            </button>
          </div>
        </div>

        <div style={S.card}>
          <p style={S.sectionTitle}>Force-open Override</p>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
            Force pre-order <strong>open</strong> until a specific time, ignoring the schedule.
          </p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={S.label}>Override until</label>
              <input
                type="datetime-local"
                style={S.input}
                value={cateringOverrideUntil}
                onChange={(e) => setCateringOverrideUntil(e.target.value)}
              />
            </div>
            <button type="button" style={S.btnPrimary} onClick={() => void handleCateringSetOverride()} disabled={cateringSavingOverride}>
              <Unlock size={14} />
              {cateringSavingOverride ? 'Saving…' : 'Set Override'}
            </button>
            {cateringStatus?.override_until && (
              <button type="button" style={S.btnSecondary} onClick={() => void handleCateringClearOverride()} disabled={cateringSavingOverride}>
                <Lock size={14} />
                Clear
              </button>
            )}
          </div>
        </div>

        <div style={S.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: '1rem' }}>
            <p style={{ ...S.sectionTitle, marginBottom: 0 }}>Pre-order schedule</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={{ ...S.btnSecondary, fontSize: 12, padding: '5px 10px' }} onClick={() => setAllCateringDays(true)}>All open</button>
              <button type="button" style={{ ...S.btnSecondary, fontSize: 12, padding: '5px 10px' }} onClick={() => setAllCateringDays(false)}>All closed</button>
            </div>
          </div>
          <p style={{ fontSize: 12, color: '#9C8575', marginBottom: 14 }}>
            Optional. Leave cleared for always-open when the master switch is ON. Independent from online ordering hours.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {DAYS.map(({ key, label }) => {
              const day = cateringSchedule[key];
              return (
                <div key={key} style={{
                  padding: '10px 14px', borderRadius: 10,
                  background: day.enabled ? '#FDFAF7' : '#F5F0EB',
                  border: `1px solid ${day.enabled ? 'var(--color-border)' : '#DDD5CB'}`,
                  opacity: day.enabled ? 1 : 0.65,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: day.enabled ? 8 : 0 }}>
                    <button
                      type="button"
                      style={S.toggleTrack(day.enabled)}
                      onClick={() => toggleCateringDayEnabled(key)}
                      role="switch"
                      aria-checked={day.enabled}
                      aria-label={label}
                    >
                      <span style={S.toggleThumb(day.enabled)} />
                    </button>
                    <span style={{ width: 88, fontSize: 13, fontWeight: 600, color: '#3D2B1F' }}>{label}</span>
                    {!day.enabled && <span style={{ fontSize: 12, color: '#9C8575' }}>Closed all day</span>}
                  </div>
                  {day.enabled && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 50 }}>
                      {day.windows.map((win, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <label style={{ fontSize: 12, color: '#9C8575', width: 36 }}>Open</label>
                            <input type="time" value={win.open}
                              onChange={(e) => updateCateringWindow(key, idx, 'open', e.target.value)}
                              style={{ ...S.input, width: 110, padding: '5px 8px' }} />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <label style={{ fontSize: 12, color: '#9C8575', width: 36 }}>Close</label>
                            <input type="time" value={win.close}
                              onChange={(e) => updateCateringWindow(key, idx, 'close', e.target.value)}
                              style={{ ...S.input, width: 110, padding: '5px 8px' }} />
                          </div>
                          {day.windows.length > 1 && (
                            <button type="button" onClick={() => removeCateringWindow(key, idx)}
                              aria-label={`Remove window ${idx + 1}`}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C0392B', fontSize: 16, lineHeight: 1, padding: '2px 4px' }}>×</button>
                          )}
                        </div>
                      ))}
                      <button type="button" onClick={() => addCateringWindow(key)}
                        style={{ alignSelf: 'flex-start', fontSize: 12, color: '#7B5E3A', background: 'none', border: '1px dashed #C2A87A', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', marginTop: 2 }}>
                        + Add window
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={S.btnPrimary} onClick={() => void saveCateringSchedule()} disabled={cateringScheduleSaving}>
              <Save size={14} />
              {cateringScheduleSaving ? 'Saving…' : 'Save pre-order schedule'}
            </button>
            <button type="button" style={S.btnSecondary} onClick={() => void clearCateringSchedule()} disabled={cateringScheduleSaving}>
              Clear schedule
            </button>
          </div>
        </div>

        <div style={S.card} data-testid="catering-events-settings">
          <p style={S.sectionTitle}>Notifications & lead time</p>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            Notify fallbacks when no event staff are online, lead time for new requests, and quote link validity.
            Appoint handlers via Roles & Permissions → <code>events.manage</code>.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={S.label}>Closed message</label>
              <input
                style={S.input}
                value={cateringClosedMessage}
                onChange={(e) => setCateringClosedMessage(e.target.value)}
                placeholder="Shown when pre-order is closed"
              />
            </div>
            <div>
              <label style={S.label}>Notify phone (fallback)</label>
              <input
                style={S.input}
                value={cateringNotifyPhone}
                onChange={(e) => setCateringNotifyPhone(e.target.value)}
                placeholder="7XXXXXX"
              />
            </div>
            <div>
              <label style={S.label}>Notify email (fallback)</label>
              <input
                style={S.input}
                type="email"
                value={cateringNotifyEmail}
                onChange={(e) => setCateringNotifyEmail(e.target.value)}
                placeholder="events@…"
              />
            </div>
            <div>
              <label style={S.label}>Min lead hours</label>
              <input
                style={S.input}
                type="number"
                min={0}
                max={720}
                value={cateringMinLeadHours}
                onChange={(e) => setCateringMinLeadHours(e.target.value)}
              />
            </div>
            <div>
              <label style={S.label}>Quote valid (days)</label>
              <input
                style={S.input}
                type="number"
                min={1}
                max={60}
                value={cateringQuoteValidDays}
                onChange={(e) => setCateringQuoteValidDays(e.target.value)}
              />
            </div>
            <div>
              <label style={S.label}>Quote cutoff before event (hours)</label>
              <input
                style={S.input}
                type="number"
                min={0}
                max={168}
                value={cateringQuoteMinHours}
                onChange={(e) => setCateringQuoteMinHours(e.target.value)}
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, minHeight: 44 }}>
              <input
                type="checkbox"
                data-testid="catering-reminder-toggle"
                checked={cateringReminderEnabled}
                onChange={(e) => setCateringReminderEnabled(e.target.checked)}
              />
              Day-before event reminders
            </label>
          </div>
          <div style={{ marginTop: 16 }}>
            <button type="button" style={S.btnPrimary} onClick={() => void saveCateringSettings()} disabled={cateringSaving}>
              <Save size={14} />
              {cateringSaving ? 'Saving…' : 'Save catering settings'}
            </button>
          </div>
        </div>
          </>
        </div>
      </PageShell>
    );
  }

  if (loading) {
    return (
      <PageShell>
        <div style={{ padding: '2rem' }}>
          <PageHeader section="Manage" title="Ordering Control" />
          <OrderingControlTabs />
          <p style={{ color: '#9C8575', fontSize: 14 }}>Loading…</p>
        </div>
      </PageShell>
    );
  }

  if (error || !status) {
    return (
      <PageShell>
        <div style={{ padding: '2rem' }}>
          <PageHeader section="Manage" title="Ordering Control" />
          <OrderingControlTabs />
          <p style={{ color: 'var(--color-danger-strong)', fontSize: 14 }}>{error || 'Status unavailable.'}</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
    <div style={{ padding: '1.5rem', maxWidth: 680 }}>
      <PageHeader section="Manage"
        title="Ordering Control Center"
        subtitle="Online ordering gates, schedules, fees, and limits"
      />
      <OrderingControlTabs />

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#F5F0EB', borderRadius: 10, padding: 4, width: 'fit-content', flexWrap: 'wrap' }}>
        {PAGE_SECTIONS.map(({ id, label }) => (
          <button key={id} type="button" style={sectionTabStyle(section === id)} onClick={() => setSection(id)}>
            {label}
          </button>
        ))}
      </div>

      {toastBanner}

      {section === 'gates' && (<>
      {/* Status badge + quick status */}
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#3D2B1F', marginBottom: 6 }}>
              Current Status
            </div>
            <span style={status.open ? S.statusOpen : S.statusClosed}>
              {status.open ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {status.open ? 'Accepting orders' : 'Not accepting orders'}
            </span>
            {!status.open && status.reason && (
              <p style={S.reasonNote}>
                Reason: {REASON_LABELS[status.reason] ?? status.reason}
              </p>
            )}
            {status.override_until && (
              <p style={{ ...S.reasonNote, color: 'var(--color-primary)', fontWeight: 600 }}>
                Force-open override active until {new Date(status.override_until).toLocaleString()}
              </p>
            )}
          </div>
          <button
            style={{ ...S.btnSecondary, fontSize: 12, padding: '6px 12px' }}
            onClick={load}
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
      </div>

      {/* Master Switch */}
      <div style={S.card}>
        <p style={S.sectionTitle}>Master Switch</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            style={S.toggleTrack(status.master_switch)}
            onClick={handleToggle}
            disabled={toggling}
            aria-label="Toggle online ordering"
            role="switch"
            aria-checked={status.master_switch}
          >
            <span style={S.toggleThumb(status.master_switch)} />
          </button>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#3D2B1F' }}>
              {status.master_switch ? 'Online ordering is ON' : 'Online ordering is OFF'}
            </div>
            <div style={{ fontSize: 12, color: '#9C8575', marginTop: 2 }}>
              {status.master_switch
                ? 'Customers can place pickup and delivery orders.'
                : 'All online orders are blocked. POS is unaffected.'}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <button
            style={status.master_switch ? S.btnDanger : S.btnPrimary}
            onClick={handleToggle}
            disabled={toggling}
          >
            <Power size={14} />
            {toggling ? 'Updating…' : status.master_switch ? 'Turn OFF online ordering' : 'Turn ON online ordering'}
          </button>
        </div>
      </div>

      {/* Force-open Override */}
      <div style={S.card}>
        <p style={S.sectionTitle}>Force-open Override</p>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
          Force online ordering <strong>open</strong> until a specific time, ignoring the schedule.
          Useful for running promotions outside normal hours. Leave blank to deactivate.
        </p>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={S.label}>Override until</label>
            <input
              type="datetime-local"
              style={S.input}
              value={overrideUntil}
              onChange={(e) => setOverrideUntil(e.target.value)}
              onInput={(e) => setOverrideUntil((e.target as HTMLInputElement).value)}
            />
          </div>
          <button
            style={S.btnPrimary}
            onClick={handleSetOverride}
            disabled={savingOverride}
          >
            <Unlock size={14} />
            {savingOverride ? 'Saving…' : 'Set Override'}
          </button>
          {status.override_until && (
            <button
              style={S.btnSecondary}
              onClick={handleClearOverride}
              disabled={savingOverride}
            >
              <Lock size={14} />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Daily Schedule Editor */}
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: '1rem' }}>
          <p style={{ ...S.sectionTitle, marginBottom: 0 }}>Daily Schedule</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...S.btnSecondary, fontSize: 12, padding: '5px 10px' }} onClick={() => setAllDays(true)}>All open</button>
            <button style={{ ...S.btnSecondary, fontSize: 12, padding: '5px 10px' }} onClick={() => setAllDays(false)}>All closed</button>
          </div>
        </div>
        <p style={{ fontSize: 12, color: '#9C8575', marginBottom: 14 }}>
          Online ordering will automatically open and close at these times each day.
        </p>

        {scheduleLoading ? (
          <p style={{ color: '#9C8575', fontSize: 13 }}>Loading schedule…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {DAYS.map(({ key, label }) => {
              const day = schedule[key];
              return (
                <div key={key} style={{
                  padding: '10px 14px', borderRadius: 10,
                  background: day.enabled ? '#FDFAF7' : '#F5F0EB',
                  border: `1px solid ${day.enabled ? 'var(--color-border)' : '#DDD5CB'}`,
                  opacity: day.enabled ? 1 : 0.65,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: day.enabled ? 8 : 0 }}>
                    <button
                      style={S.toggleTrack(day.enabled)}
                      onClick={() => toggleDayEnabled(key)}
                      role="switch" aria-checked={day.enabled} aria-label={label}
                    >
                      <span style={S.toggleThumb(day.enabled)} />
                    </button>
                    <span style={{ width: 88, fontSize: 13, fontWeight: 600, color: '#3D2B1F' }}>{label}</span>
                    {!day.enabled && <span style={{ fontSize: 12, color: '#9C8575' }}>Closed all day</span>}
                  </div>

                  {day.enabled && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 50 }}>
                      {day.windows.map((win, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <label style={{ fontSize: 12, color: '#9C8575', width: 36 }}>Open</label>
                            <input type="time" value={win.open}
                              onChange={(e) => updateWindow(key, idx, 'open', e.target.value)}
                              style={{ ...S.input, width: 110, padding: '5px 8px' }} />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <label style={{ fontSize: 12, color: '#9C8575', width: 36 }}>Close</label>
                            <input type="time" value={win.close}
                              onChange={(e) => updateWindow(key, idx, 'close', e.target.value)}
                              style={{ ...S.input, width: 110, padding: '5px 8px' }} />
                          </div>
                          {day.windows.length > 1 && (
                            <button onClick={() => removeWindow(key, idx)}
                              aria-label={`Remove window ${idx + 1} from ${key}`}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C0392B', fontSize: 16, lineHeight: 1, padding: '2px 4px' }}
                              title="Remove this window">×</button>
                          )}
                        </div>
                      ))}
                      <button onClick={() => addWindow(key)}
                        style={{ alignSelf: 'flex-start', fontSize: 12, color: '#7B5E3A', background: 'none', border: '1px dashed #C2A87A', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', marginTop: 2 }}>
                        + Add window
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={S.btnPrimary} onClick={saveSchedule} disabled={scheduleSaving}>
            <Save size={14} />
            {scheduleSaving ? 'Saving…' : 'Save Schedule'}
          </button>
          <button type="button" style={S.btnSecondary} onClick={() => void applyRamadanPreset()}>
            Apply Ramadan preset (business hours + 5pm–1am online)
          </button>
          <button type="button" style={S.btnSecondary} onClick={() => void applyEidPreset()}>
            Apply Eid preset (10am–11pm)
          </button>
        </div>
      </div>
      </>)}

      {section === 'pickup' && (
        <div style={S.card}>
          <p style={S.sectionTitle}>Pickup time slots</p>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
            When enabled, online pickup checkout offers timed windows. Capacity limits how many
            orders can book each slot. POS dine-in is unaffected.
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, fontSize: 14, fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={pickupEnabled}
              onChange={(e) => setPickupEnabled(e.target.checked)}
            />
            Enable pickup slots
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div>
              <label style={S.label}>Slot length (minutes)</label>
              <input
                style={S.input}
                type="number"
                min={5}
                max={240}
                value={pickupMinutes}
                onChange={(e) => setPickupMinutes(e.target.value)}
                disabled={!pickupEnabled}
              />
            </div>
            <div>
              <label style={S.label}>Orders per slot</label>
              <input
                style={S.input}
                type="number"
                min={1}
                max={200}
                value={pickupCapacity}
                onChange={(e) => setPickupCapacity(e.target.value)}
                disabled={!pickupEnabled}
              />
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <button type="button" style={S.btnPrimary} onClick={() => void savePickupSlots()} disabled={pickupSaving}>
              <Save size={14} />
              {pickupSaving ? 'Saving…' : 'Save pickup slots'}
            </button>
          </div>
        </div>
      )}

      {section === 'fees' && (<>
      {feeSettings && (
        <div style={S.card}>
          <p style={S.sectionTitle}>Order fees & limits</p>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-muted)' }}>
            Packaging is set per menu item. This page only controls the receipt label, small-order fee, and order caps.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <div>
              <label style={S.label}>Packaging label</label>
              <input style={S.input} value={feeSettings.packaging_label} onChange={(e) => setFeeSettings({ ...feeSettings, packaging_label: e.target.value })} />
            </div>
            <div>
              <label style={S.label}>Max orders / 15 min (0 = unlimited)</label>
              <input style={S.input} type="number" min={0} max={500} value={feeSettings.ordering_max_per_15min} onChange={(e) => setFeeSettings({ ...feeSettings, ordering_max_per_15min: parseInt(e.target.value, 10) || 0 })} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={feeSettings.small_order_enabled} onChange={(e) => setFeeSettings({ ...feeSettings, small_order_enabled: e.target.checked })} />
              Small-order fee below threshold
            </label>
            <div>
              <label style={S.label}>Small order threshold (MVR)</label>
              <input style={S.input} type="number" min={0} value={feeSettings.small_order_threshold_mvr} onChange={(e) => setFeeSettings({ ...feeSettings, small_order_threshold_mvr: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <label style={S.label}>Small order fee (MVR)</label>
              <input style={S.input} type="number" min={0} value={feeSettings.small_order_amount_mvr} onChange={(e) => setFeeSettings({ ...feeSettings, small_order_amount_mvr: parseFloat(e.target.value) || 0 })} />
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <button style={S.btnPrimary} onClick={() => void saveFeeSettings()} disabled={feeSaving}>
              {feeSaving ? 'Saving…' : 'Save fees & limits'}
            </button>
          </div>
        </div>
      )}

      <div style={S.card}>
        <p style={S.sectionTitle}>Service charge</p>
        <ServiceChargeSettings />
      </div>

      <div style={S.card}>
        <p style={S.sectionTitle}>Payment commission (BML / card)</p>
        <PaymentCommissionSettings />
      </div>
      </>)}

    </div>

    </PageShell>
  );
}
