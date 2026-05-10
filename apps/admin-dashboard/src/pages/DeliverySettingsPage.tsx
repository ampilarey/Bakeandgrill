import { useState, useEffect } from 'react';
import { Power, RefreshCw, Lock, Unlock, AlertTriangle, CheckCircle2, Save } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import { PageHeader } from '../components/SharedUI';
import {
  getDeliveryStatus,
  toggleDelivery,
  setDeliveryOverride,
  updateDeliverySchedule,
  type DeliveryGateStatus,
} from '../api';

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
  DAYS.map(({ key }) => [key, { enabled: true, windows: [{ open: '11:00', close: '22:00' }] }]),
) as Schedule;

const S = {
  card: {
    background: '#FDFAF7',
    border: '1px solid #E8E0D8',
    borderRadius: 16,
    padding: '1.5rem',
    marginBottom: '1.25rem',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: '#6B5D4F',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '1rem',
  },
  input: {
    width: '100%',
    padding: '9px 12px',
    border: '1.5px solid #E8E0D8',
    borderRadius: 10,
    fontSize: 13,
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  },
  label: {
    display: 'block' as const,
    fontSize: 13,
    fontWeight: 600 as const,
    color: '#6B5D4F',
    marginBottom: 4,
  },
  btnPrimary: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 16px', borderRadius: 10, border: 'none',
    background: '#D4813A', color: '#fff', fontSize: 13, fontWeight: 600,
    cursor: 'pointer',
  } as React.CSSProperties,
  btnSecondary: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 16px', borderRadius: 10,
    border: '1.5px solid #E8E0D8', background: '#fff',
    color: '#4A3728', fontSize: 13, fontWeight: 600,
    cursor: 'pointer',
  } as React.CSSProperties,
  btnDanger: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 16px', borderRadius: 10, border: 'none',
    background: '#DC2626', color: '#fff', fontSize: 13, fontWeight: 600,
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
    background: '#FEE2E2', color: '#991B1B',
    border: '1px solid #FECACA',
    borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 700,
  } as React.CSSProperties,
  reasonNote: {
    fontSize: 12, color: '#9C8575', marginTop: 6,
  },
  toggleTrack: (on: boolean): React.CSSProperties => ({
    display: 'inline-block', position: 'relative',
    width: 48, height: 26, borderRadius: 13,
    background: on ? '#D4813A' : '#D1C9BE',
    transition: 'background 0.2s',
    cursor: 'pointer', flexShrink: 0,
  }),
  toggleThumb: (on: boolean): React.CSSProperties => ({
    position: 'absolute', top: 3, left: on ? 26 : 3,
    width: 20, height: 20, borderRadius: '50%',
    background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
    transition: 'left 0.2s',
  }),
};

export default function DeliverySettingsPage() {
  usePageTitle('Delivery Settings');

  const [status, setStatus]         = useState<DeliveryGateStatus | null>(null);
  const [loading, setLoading]       = useState(true);
  const [toggling, setToggling]     = useState(false);
  const [overrideUntil, setOverrideUntil] = useState('');
  const [savingOverride, setSavingOverride] = useState(false);
  const [toast, setToast]           = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [error, setError]           = useState('');

  const [schedule, setSchedule]         = useState<Schedule>(DEFAULT_SCHEDULE);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleSaving, setScheduleSaving]   = useState(false);

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = () => {
    setLoading(true);
    getDeliveryStatus()
      .then((s) => {
        setStatus(s);
        setScheduleEnabled(s.schedule_active);
        if (s.override_until) {
          const d = new Date(s.override_until);
          const pad = (n: number) => String(n).padStart(2, '0');
          setOverrideUntil(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
        }
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
    setSavingOverride(true);
    try {
      const isoVal = overrideUntil ? new Date(overrideUntil).toISOString() : null;
      const res = await setDeliveryOverride(isoVal);
      setStatus(res.delivery_status);
      showToast(isoVal ? 'Force-open override set.' : 'Override cleared.');
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

  const toggleDayEnabled = (day: DayKey) => {
    setSchedule((prev) => ({ ...prev, [day]: { ...prev[day], enabled: !prev[day].enabled } }));
  };

  const updateWindow = (day: DayKey, idx: number, field: 'open' | 'close', value: string) => {
    setSchedule((prev) => {
      const windows = prev[day].windows.map((w, i) => (i === idx ? { ...w, [field]: value } : w));
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
      DAYS.map(({ key }) => [key, { ...prev[key], enabled }]),
    ) as Schedule);
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem' }}>
        <PageHeader title="Delivery Settings" />
        <p style={{ color: '#9C8575', fontSize: 14 }}>Loading…</p>
      </div>
    );
  }

  if (error || !status) {
    return (
      <div style={{ padding: '2rem' }}>
        <PageHeader title="Delivery Settings" />
        <p style={{ color: '#DC2626', fontSize: 14 }}>{error || 'Status unavailable.'}</p>
      </div>
    );
  }

  const isOpen = status.delivery_open;
  const overrideActive = status.override_active;

  return (
    <div style={{ padding: '1.5rem', maxWidth: 680 }}>
      <PageHeader
        title="Delivery Settings"
        subtitle="Control delivery availability — independent of online ordering hours"
      />

      {/* Toast */}
      {toast && (
        <div style={{
          marginBottom: '1rem', padding: '10px 16px', borderRadius: 10,
          background: toast.type === 'ok' ? '#D1FAE5' : '#FEE2E2',
          color: toast.type === 'ok' ? '#065F46' : '#991B1B',
          fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {toast.type === 'ok' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          {toast.msg}
        </div>
      )}

      {/* Status card */}
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#3D2B1F', marginBottom: 6 }}>Current Status</div>
            <span style={isOpen ? S.statusOpen : S.statusClosed}>
              {isOpen ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {isOpen ? 'Delivery available' : 'Delivery unavailable'}
            </span>
            {!isOpen && status.message && (
              <p style={S.reasonNote}>Reason: {status.message}</p>
            )}
            {overrideActive && status.override_until && (
              <p style={{ ...S.reasonNote, color: '#D4813A', fontWeight: 600 }}>
                ⚡ Force-open override active until {new Date(status.override_until).toLocaleString()}
              </p>
            )}
            {!isOpen && status.next_delivery_window && (
              <p style={S.reasonNote}>
                Next window: {new Date(status.next_delivery_window).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </p>
            )}
          </div>
          <button style={{ ...S.btnSecondary, fontSize: 12, padding: '6px 12px' }} onClick={load}>
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
      </div>

      {/* Master switch */}
      <div style={S.card}>
        <p style={S.sectionTitle}>Master Switch</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            style={S.toggleTrack(status.accepting_flag)}
            onClick={handleToggle}
            disabled={toggling}
            role="switch"
            aria-checked={status.accepting_flag}
            aria-label="Toggle delivery"
          >
            <span style={S.toggleThumb(status.accepting_flag)} />
          </button>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#3D2B1F' }}>
              {status.accepting_flag ? 'Delivery is ON' : 'Delivery is OFF'}
            </div>
            <div style={{ fontSize: 12, color: '#9C8575', marginTop: 2 }}>
              {status.accepting_flag
                ? 'Customers can select delivery at checkout (subject to schedule).'
                : 'Delivery is hidden at checkout. Customers can still order for takeaway.'}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <button
            style={status.accepting_flag ? S.btnDanger : S.btnPrimary}
            onClick={handleToggle}
            disabled={toggling}
          >
            <Power size={14} />
            {toggling ? 'Updating…' : status.accepting_flag ? 'Turn OFF delivery' : 'Turn ON delivery'}
          </button>
        </div>
      </div>

      {/* Force-open override */}
      <div style={S.card}>
        <p style={S.sectionTitle}>Force-open Override</p>
        <p style={{ fontSize: 13, color: '#6B5D4F', marginBottom: 12, lineHeight: 1.5 }}>
          Force delivery <strong>open</strong> until a specific time, ignoring the master switch and schedule.
          Useful for special delivery windows outside normal hours. Leave blank to deactivate.
        </p>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={S.label}>Override until</label>
            <input
              type="datetime-local"
              style={S.input}
              value={overrideUntil}
              onChange={(e) => setOverrideUntil(e.target.value)}
            />
          </div>
          <button style={S.btnPrimary} onClick={handleSetOverride} disabled={savingOverride || !overrideUntil}>
            <Unlock size={14} />
            {savingOverride ? 'Saving…' : overrideActive ? 'Update Override' : 'Set Override'}
          </button>
          {overrideActive && (
            <button style={S.btnSecondary} onClick={handleClearOverride} disabled={savingOverride}>
              <Lock size={14} />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Daily schedule editor */}
      <div style={S.card}>
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
            <span style={{ fontSize: 12, color: '#6B5D4F' }}>{scheduleEnabled ? 'Schedule on' : 'No schedule (all day)'}</span>
          </div>
        </div>

        {scheduleEnabled && (
          <>
            <p style={{ fontSize: 12, color: '#9C8575', marginBottom: 14 }}>
              Delivery will only be available during these windows. Supports multiple windows per day (e.g. lunch + dinner).
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button style={{ ...S.btnSecondary, fontSize: 12, padding: '5px 10px' }} onClick={() => setAllDays(true)}>All open</button>
              <button style={{ ...S.btnSecondary, fontSize: 12, padding: '5px 10px' }} onClick={() => setAllDays(false)}>All closed</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {DAYS.map(({ key, label }) => {
                const day = schedule[key];
                return (
                  <div key={key} style={{
                    padding: '10px 14px', borderRadius: 10,
                    background: day.enabled ? '#FDFAF7' : '#F5F0EB',
                    border: `1px solid ${day.enabled ? '#E8E0D8' : '#DDD5CB'}`,
                    opacity: day.enabled ? 1 : 0.65,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: day.enabled ? 8 : 0 }}>
                      <button
                        style={S.toggleTrack(day.enabled)}
                        onClick={() => toggleDayEnabled(key)}
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
                              <button
                                onClick={() => removeWindow(key, idx)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C0392B', fontSize: 16, lineHeight: 1, padding: '2px 4px' }}
                                title="Remove this window"
                              >×</button>
                            )}
                          </div>
                        ))}
                        <button
                          onClick={() => addWindow(key)}
                          style={{ alignSelf: 'flex-start', fontSize: 12, color: '#7B5E3A', background: 'none', border: '1px dashed #C2A87A', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', marginTop: 2 }}
                        >
                          + Add window
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div style={{ marginTop: 16 }}>
          <button style={S.btnPrimary} onClick={saveSchedule} disabled={scheduleSaving}>
            <Save size={14} />
            {scheduleSaving ? 'Saving…' : 'Save Schedule'}
          </button>
          {scheduleEnabled && (
            <button
              style={{ ...S.btnSecondary, marginLeft: 10 }}
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

      <div style={{
        padding: '12px 16px', background: '#FFF7ED',
        border: '1px solid rgba(212,129,58,0.3)', borderRadius: 10,
      }}>
        <p style={{ margin: 0, fontSize: 12, color: '#9C8575', lineHeight: 1.6 }}>
          💡 When delivery is off or outside schedule, the order app shows an amber <strong>"Takeaway only"</strong> pill at checkout.
          Customers can still place takeaway orders normally.
        </p>
      </div>
    </div>
  );
}
