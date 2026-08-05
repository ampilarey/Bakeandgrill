import { useState, useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { RefreshCw, AlertTriangle, CheckCircle2, Save } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import { PageHeader, PageShell } from '../components/SharedUI';
import { ServiceChargeSettings } from './SettingsPage/ServiceChargeSettings';
import { PaymentCommissionSettings } from './SettingsPage/PaymentCommissionSettings';
import {
  getOnlineOrderingStatus,
  toggleOnlineOrdering,
  setOnlineOrderingOverride,
  updateOnlineOrderingSchedule,
  updateOrderForTomorrowCutoff,
  getFeatureGates,
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
  type FeatureGateStatus,
} from '../api';
import { OrderingControlTabs } from '../components/OrderingControlTabs';
import { FeatureGateCard } from './OnlineOrderingPage/FeatureGateCard';
import {
  DAYS,
  DEFAULT_SCHEDULE,
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

type PageSection = 'channels' | 'features' | 'slots-fees' | 'events';

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
  schedule: 'Outside scheduled hours',
  override_active: 'Force-open override is active',
};

function resolveSection(sectionParam: string | null): PageSection {
  if (sectionParam === 'events') return 'events';
  if (sectionParam === 'features') return 'features';
  if (sectionParam === 'pickup' || sectionParam === 'fees' || sectionParam === 'slots-fees') {
    return 'slots-fees';
  }
  // Legacy ?section=gates → channels
  return 'channels';
}

export default function OnlineOrderingPage() {
  usePageTitle('Ordering Control');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionParam = searchParams.get('section');
  const section = resolveSection(sectionParam);

  const setSection = (next: PageSection) => {
    if (next === 'channels') {
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
  const [feeError, setFeeError] = useState('');

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
  const [tomorrowCutoff, setTomorrowCutoff] = useState('20:00');
  const [tomorrowCutoffSaving, setTomorrowCutoffSaving] = useState(false);
  const [featureGates, setFeatureGates] = useState<Record<string, FeatureGateStatus> | null>(null);

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = () => {
    setLoading(true);
    setError('');
    getOnlineOrderingStatus()
      .then((s) => {
        setStatus(s);
        if (s.order_for_tomorrow?.cutoff) {
          setTomorrowCutoff(s.order_for_tomorrow.cutoff);
        }
        // Always sync — clear the input when the server has no override.
        setOverrideUntil(toDatetimeLocal(s.override_until));
      })
      .catch(() => setError('Failed to load online ordering status.'))
      .finally(() => setLoading(false));
  };

  const loadCateringGate = () => {
    getCateringOrderingStatus()
      .then((s) => {
        setCateringStatus(s);
        setCateringOverrideUntil(toDatetimeLocal(s.override_until));
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
      // tomorrowCutoff comes only from GET /ordering/status (avoids dual-source race).
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
      .then(({ settings }) => { setFeeSettings(settings); setFeeError(''); })
      .catch(() => setFeeError('Could not load packaging fee settings.'));
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
    const iso = safeIsoFromLocal(cateringOverrideUntil);
    if (!iso) {
      showToast('Pick a valid override end time.', 'err');
      return;
    }
    setCateringSavingOverride(true);
    try {
      const { status: next } = await setCateringOrderingOverride(iso);
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
    setScheduleSaving(true);

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
      await Promise.all([
        updateSiteSettings({ business_hours: JSON.stringify(businessHours) }),
        updateOnlineOrderingSchedule(preset),
      ]);
      const res = await getOnlineOrderingStatus();
      setStatus(res);
      showToast('Ramadan hours saved to business hours and online ordering schedule.');
    } catch {
      showToast('Failed to save Ramadan preset. Try again.', 'err');
    } finally {
      setScheduleSaving(false);
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
    setScheduleSaving(true);

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
      await Promise.all([
        updateSiteSettings({ business_hours: JSON.stringify(businessHours) }),
        updateOnlineOrderingSchedule(preset),
      ]);
      const res = await getOnlineOrderingStatus();
      setStatus(res);
      showToast('Eid hours saved to business hours and online ordering schedule.');
    } catch {
      showToast('Failed to save Eid preset. Try again.', 'err');
    } finally {
      setScheduleSaving(false);
    }
  };

  const saveSchedule = async () => {
    setScheduleSaving(true);
    try {
      const res = await updateOnlineOrderingSchedule(schedule);
      if (res.status) setStatus(res.status);
      showToast('Schedule saved.');
    } catch {
      showToast('Failed to save schedule.', 'err');
    } finally {
      setScheduleSaving(false);
    }
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

  useEffect(() => {
    if (section !== 'features' && section !== 'channels') return;
    if (featureGates) return;
    getFeatureGates()
      .then(({ gates }) => setFeatureGates(gates))
      .catch(() => { /* section hidden until loaded */ });
  }, [section, featureGates]);

  const saveTomorrowCutoff = async () => {
    if (!/^\d{1,2}:\d{2}$/.test(tomorrowCutoff.trim())) {
      showToast('Use HH:mm (24-hour), e.g. 20:00.', 'err');
      return;
    }
    setTomorrowCutoffSaving(true);
    try {
      const res = await updateOrderForTomorrowCutoff(tomorrowCutoff.trim());
      setTomorrowCutoff(res.order_for_tomorrow_cutoff);
      if (res.status) setStatus(res.status);
      showToast('Tomorrow cutoff saved.');
    } catch {
      showToast('Failed to save tomorrow cutoff.', 'err');
    } finally {
      setTomorrowCutoffSaving(false);
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

  const statusChips = [
    {
      id: 'online',
      label: 'Online',
      open: status ? status.open : null,
      onClick: () => setSection('channels'),
    },
    {
      id: 'delivery',
      label: 'Delivery',
      open: status ? Boolean(status.delivery_available) : null,
      onClick: () => { void navigate('/delivery-settings'); },
    },
    {
      id: 'tomorrow',
      label: 'Tomorrow',
      open: status?.order_for_tomorrow ? status.order_for_tomorrow.open !== false : null,
      onClick: () => setSection('features'),
    },
    {
      id: 'dine_in',
      label: 'Eat here',
      open: status?.dine_in_preorder ? status.dine_in_preorder.open !== false : (featureGates?.dine_in_preorder?.open ?? null),
      onClick: () => setSection('features'),
    },
    {
      id: 'reservations',
      label: 'Reservations',
      open: status?.reservations ? status.reservations.open !== false : (featureGates?.reservations?.open ?? null),
      onClick: () => setSection('features'),
    },
    {
      id: 'gift_cards',
      label: 'Gift cards',
      open: status?.gift_cards ? status.gift_cards.open !== false : (featureGates?.gift_card_purchase?.open ?? null),
      onClick: () => setSection('features'),
    },
    {
      id: 'preorder',
      label: 'Pre-order',
      open: cateringStatus ? cateringStatus.open : null,
      onClick: () => setSection('events'),
    },
  ];

  return (
    <PageShell>
    <div className="ordering-page">
      <PageHeader section="Manage"
        title="Ordering Control Center"
        subtitle="One place for online, delivery, pre-order, and feature gates"
      />
      <OrderingControlTabs />

      <StatusChipStrip chips={statusChips} />

      {toastBanner}

      {section === 'channels' && (<>
      {loading && !status && (
        <p style={{ color: '#9C8575', fontSize: 14, marginBottom: 16 }}>Loading online channel…</p>
      )}
      {error && (
        <div className="oc-card" style={S.card}>
          <p style={{ color: 'var(--color-danger-strong)', fontSize: 14, margin: 0 }}>{error}</p>
          <button type="button" style={{ ...S.btnSecondary, marginTop: 12 }} onClick={load}>
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      )}
      {status && (<>
      <GateStatusCard
        open={status.open}
        openText="Accepting online orders"
        closedText="Online ordering closed"
        reason={status.reason}
        reasonLabels={REASON_LABELS}
        onRefresh={load}
        switchRow={{
          on: status.master_switch,
          toggling,
          titleOn: 'Online ordering is ON',
          titleOff: 'Online ordering is OFF',
          helpOn: <>Customers can place pickup orders online. Delivery also needs Delivery to be on — open the <Link to="/delivery-settings" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Delivery</Link> tab above.</>,
          helpOff: 'All online pickup/delivery orders are blocked. POS is unaffected.',
          onToggle: () => void handleToggle(),
        }}
        override={{
          value: overrideUntil,
          onChange: setOverrideUntil,
          activeUntil: status.override_until,
          saving: savingOverride,
          onSet: () => void handleSetOverride(),
          onClear: () => void handleClearOverride(),
          help: 'Force the online channel open until a specific time, ignoring the switch and schedule. Useful for promotions outside normal hours.',
        }}
        testId="online-channel-gate"
      />

      {/* Daily Schedule Editor */}
      <div className="oc-card" style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: '0.5rem' }}>
          <p style={{ ...S.sectionTitle, marginBottom: 0 }}>Daily Schedule</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...S.btnSecondary, fontSize: 12, padding: '5px 10px', minHeight: 36 }} onClick={() => setSchedule((prev) => withAllDays(prev, true))}>All open</button>
            <button style={{ ...S.btnSecondary, fontSize: 12, padding: '5px 10px', minHeight: 36 }} onClick={() => setSchedule((prev) => withAllDays(prev, false))}>All closed</button>
          </div>
        </div>
        <p style={{ fontSize: 12, color: '#9C8575', marginBottom: 14 }}>
          Online ordering will automatically open and close at these times each day.
        </p>

        {scheduleLoading ? (
          <p style={{ color: '#9C8575', fontSize: 13 }}>Loading schedule…</p>
        ) : (
          <ScheduleEditor schedule={schedule} onChange={setSchedule} />
        )}

        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="oc-btn-block" style={S.btnPrimary} onClick={saveSchedule} disabled={scheduleSaving}>
            <Save size={14} />
            {scheduleSaving ? 'Saving…' : 'Save Schedule'}
          </button>
          <button type="button" className="oc-btn-block" style={S.btnSecondary} onClick={() => void applyRamadanPreset()}>
            Apply Ramadan preset (business hours + 5pm–1am online)
          </button>
          <button type="button" className="oc-btn-block" style={S.btnSecondary} onClick={() => void applyEidPreset()}>
            Apply Eid preset (10am–11pm)
          </button>
        </div>
      </div>

      </>)}
      </>)}

      {section === 'features' && (<>
      <div className="oc-card" style={S.card} data-testid="order-for-tomorrow-cutoff">
        <p style={S.sectionTitle}>Collect tomorrow — cutoff time</p>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
          After this time, “tomorrow” at checkout means the day after. Before it, tomorrow means the next calendar day.
          Default is 20:00. Raise to 23:59 to keep calendar tomorrow until nearly midnight.
        </p>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 140 }}>
            <label style={S.label}>Cutoff (HH:mm)</label>
            <input
              type="time"
              style={S.input}
              value={tomorrowCutoff}
              onChange={(e) => setTomorrowCutoff(e.target.value)}
              data-testid="tomorrow-cutoff-input"
            />
          </div>
          <button
            type="button"
            style={S.btnPrimary}
            onClick={() => void saveTomorrowCutoff()}
            disabled={tomorrowCutoffSaving}
          >
            <Save size={14} />
            {tomorrowCutoffSaving ? 'Saving…' : 'Save cutoff'}
          </button>
          {status?.order_for_tomorrow?.collect_tomorrow_date && (
            <p style={{ ...S.reasonNote, margin: 0 }}>
              Customers can currently choose collect on {status.order_for_tomorrow.collect_tomorrow_date}.
            </p>
          )}
        </div>
      </div>

      <p style={{ ...S.sectionTitle, marginTop: '0.5rem' }}>Feature switches &amp; schedules</p>
      <p style={{ fontSize: 12, color: '#9C8575', margin: '-6px 0 12px' }}>
        Tap a feature to edit its weekly schedule or force it open.
      </p>
      {!featureGates && (
        <p style={{ color: '#9C8575', fontSize: 13 }}>Loading features…</p>
      )}
      {featureGates &&
        ['order_for_tomorrow', 'dine_in_preorder', 'reservations', 'gift_card_purchase']
          .map((key) => featureGates[key])
          .filter((g): g is FeatureGateStatus => Boolean(g))
          .map((gate) => (
            <FeatureGateCard
              key={gate.key}
              gate={gate}
              onChanged={(fresh) => setFeatureGates((prev) => ({ ...(prev ?? {}), [fresh.key]: fresh }))}
              onToast={showToast}
            />
          ))}
      </>)}

      {section === 'slots-fees' && (<>
      <div className="oc-card" style={S.card}>
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
          <div className="oc-form-grid">
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
            <button type="button" className="oc-btn-block" style={S.btnPrimary} onClick={() => void savePickupSlots()} disabled={pickupSaving}>
              <Save size={14} />
              {pickupSaving ? 'Saving…' : 'Save pickup slots'}
            </button>
          </div>
        </div>
      {feeError && (
        <div className="oc-card" style={S.card}>
          <p style={{ color: 'var(--color-danger-strong)', fontSize: 13, margin: 0 }}>{feeError}</p>
        </div>
      )}

      {feeSettings && (
        <div className="oc-card" style={S.card}>
          <p style={S.sectionTitle}>Order fees & limits</p>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-muted)' }}>
            Packaging is set per menu item. This page only controls the receipt label, small-order fee, and order caps.
          </p>
          <div className="oc-form-grid">
            <div>
              <label style={S.label}>Packaging label</label>
              <input style={S.input} value={feeSettings.packaging_label} onChange={(e) => setFeeSettings({ ...feeSettings, packaging_label: e.target.value })} />
            </div>
            <div>
              <label style={S.label}>Max orders / 15 min</label>
              <input style={S.input} type="number" min={0} max={500} value={feeSettings.ordering_max_per_15min} onChange={(e) => setFeeSettings({ ...feeSettings, ordering_max_per_15min: parseInt(e.target.value, 10) || 0 })} />
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-muted)' }}>0 = unlimited</p>
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, lineHeight: 1.4 }}>
              <input type="checkbox" checked={feeSettings.small_order_enabled} onChange={(e) => setFeeSettings({ ...feeSettings, small_order_enabled: e.target.checked })} style={{ marginTop: 2 }} />
              Small-order fee below threshold
            </label>
            <div>
              <label style={S.label}>Small-order threshold (MVR)</label>
              <input style={S.input} type="number" min={0} value={feeSettings.small_order_threshold_mvr} onChange={(e) => setFeeSettings({ ...feeSettings, small_order_threshold_mvr: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <label style={S.label}>Small-order fee (MVR)</label>
              <input style={S.input} type="number" min={0} value={feeSettings.small_order_amount_mvr} onChange={(e) => setFeeSettings({ ...feeSettings, small_order_amount_mvr: parseFloat(e.target.value) || 0 })} />
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <button className="oc-btn-block" style={S.btnPrimary} onClick={() => void saveFeeSettings()} disabled={feeSaving}>
              {feeSaving ? 'Saving…' : 'Save fees & limits'}
            </button>
          </div>
        </div>
      )}

      <div className="oc-card" style={S.card}>
        <p style={S.sectionTitle}>Service charge</p>
        <div className="oc-nested-settings">
          <ServiceChargeSettings />
        </div>
      </div>

      <div className="oc-card" style={S.card}>
        <p style={S.sectionTitle}>Payment commission</p>
        <div className="oc-nested-settings">
          <PaymentCommissionSettings />
        </div>
      </div>

      </>)}

      {section === 'events' && (<>
      <GateStatusCard
        open={Boolean(cateringStatus?.open)}
        openText="Accepting pre-orders"
        closedText="Not accepting pre-orders"
        reason={cateringStatus?.reason}
        reasonLabels={REASON_LABELS}
        onRefresh={loadCateringGate}
        switchRow={{
          on: Boolean(cateringStatus?.master_switch),
          toggling: cateringToggling,
          titleOn: 'Pre-order is ON',
          titleOff: 'Pre-order is OFF',
          helpOn: 'Customers can submit new event / pre-order requests.',
          helpOff: 'New customer requests are blocked. Existing quotes and admin tools stay available.',
          onToggle: () => void handleCateringToggle(),
        }}
        override={{
          value: cateringOverrideUntil,
          onChange: setCateringOverrideUntil,
          activeUntil: cateringStatus?.override_until,
          saving: cateringSavingOverride,
          onSet: () => void handleCateringSetOverride(),
          onClear: () => void handleCateringClearOverride(),
          help: 'Force pre-order open until a specific time, ignoring the switch and schedule.',
        }}
        testId="catering-preorder-gate"
      />

      <div className="oc-card" style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: '0.5rem' }}>
          <p style={{ ...S.sectionTitle, marginBottom: 0 }}>Pre-order schedule</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={{ ...S.btnSecondary, fontSize: 12, padding: '5px 10px', minHeight: 36 }} onClick={() => setCateringSchedule((prev) => withAllDays(prev, true))}>All open</button>
            <button type="button" style={{ ...S.btnSecondary, fontSize: 12, padding: '5px 10px', minHeight: 36 }} onClick={() => setCateringSchedule((prev) => withAllDays(prev, false))}>All closed</button>
          </div>
        </div>
        <p style={{ fontSize: 12, color: '#9C8575', marginBottom: 14 }}>
          Optional. Leave cleared for always-open when the master switch is ON. Independent from online ordering hours.
        </p>
        <ScheduleEditor
          schedule={cateringSchedule}
          onChange={setCateringSchedule}
          newWindow={{ open: '10:00', close: '18:00' }}
        />
        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="oc-btn-block" style={S.btnPrimary} onClick={() => void saveCateringSchedule()} disabled={cateringScheduleSaving}>
            <Save size={14} />
            {cateringScheduleSaving ? 'Saving…' : 'Save pre-order schedule'}
          </button>
          <button type="button" className="oc-btn-block" style={S.btnSecondary} onClick={() => void clearCateringSchedule()} disabled={cateringScheduleSaving}>
            Clear schedule
          </button>
        </div>
      </div>

      <div className="oc-card" style={S.card} data-testid="catering-events-settings">
        <p style={S.sectionTitle}>Notifications & lead time</p>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          Notify fallbacks when no event staff are online, lead time for new requests, and quote link validity.
          Appoint handlers via Roles & Permissions → <code>events.manage</code>.
        </p>
        <div className="oc-form-grid">
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
          <button type="button" className="oc-btn-block" style={S.btnPrimary} onClick={() => void saveCateringSettings()} disabled={cateringSaving}>
            <Save size={14} />
            {cateringSaving ? 'Saving…' : 'Save catering settings'}
          </button>
        </div>
      </div>
      </>)}

    </div>

    </PageShell>
  );
}
