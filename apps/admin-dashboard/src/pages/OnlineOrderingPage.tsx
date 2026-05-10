import { useState, useEffect } from 'react';
import { Power, RefreshCw, Lock, Unlock, AlertTriangle, CheckCircle2, Save } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import { PageHeader } from '../components/SharedUI';
import {
  getOnlineOrderingStatus,
  toggleOnlineOrdering,
  setOnlineOrderingOverride,
  getSiteSettings,
  updateSiteSettings,
  type OnlineOrderingGateStatus,
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
  DAYS.map(({ key }) => [key, { enabled: true, windows: [{ open: '10:00', close: '22:00' }] }])
) as Schedule;

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

function serializeSchedule(schedule: Schedule): string {
  const out: Record<string, { enabled: boolean; windows: TimeWindow[] }> = {};
  for (const { key } of DAYS) out[key] = schedule[key];
  return JSON.stringify(out);
}

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
  row: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const },
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

const REASON_LABELS: Record<string, string> = {
  master_switch_off: 'Master switch is off',
  schedule:          'Outside scheduled hours',
  override_active:   'Force-open override is active',
};

export default function OnlineOrderingPage() {
  usePageTitle('Online Ordering');

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

  useEffect(() => { load(); }, []);

  useEffect(() => {
    getSiteSettings().then(({ settings }) => {
      const raw = Object.values(settings).flat().find((s: any) => s.key === 'online_ordering_schedule')?.value ?? '';
      if (raw) setSchedule(parseSchedule(raw));
    }).finally(() => setScheduleLoading(false));
  }, []);

  const saveSchedule = async () => {
    setScheduleSaving(true);
    try {
      await updateSiteSettings({ online_ordering_schedule: serializeSchedule(schedule) });
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

  if (loading) {
    return (
      <div style={{ padding: '2rem' }}>
        <PageHeader title="Online Ordering" />
        <p style={{ color: '#9C8575', fontSize: 14 }}>Loading…</p>
      </div>
    );
  }

  if (error || !status) {
    return (
      <div style={{ padding: '2rem' }}>
        <PageHeader title="Online Ordering" />
        <p style={{ color: '#DC2626', fontSize: 14 }}>{error || 'Status unavailable.'}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 680 }}>
      <PageHeader title="Online Ordering" subtitle="Control whether the store accepts online orders" />

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
              <p style={{ ...S.reasonNote, color: '#D4813A', fontWeight: 600 }}>
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
        <p style={{ fontSize: 13, color: '#6B5D4F', marginBottom: 12, lineHeight: 1.5 }}>
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
                  border: `1px solid ${day.enabled ? '#E8E0D8' : '#DDD5CB'}`,
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

        <div style={{ marginTop: 16 }}>
          <button style={S.btnPrimary} onClick={saveSchedule} disabled={scheduleSaving}>
            <Save size={14} />
            {scheduleSaving ? 'Saving…' : 'Save Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}
