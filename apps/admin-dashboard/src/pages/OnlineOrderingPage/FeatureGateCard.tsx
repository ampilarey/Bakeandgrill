import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { updateFeatureGate, type FeatureGateStatus } from '../../api';
import {
  DAYS,
  DEFAULT_SCHEDULE,
  ForceOpenOverride,
  S,
  type DayKey,
  type Schedule,
  parseSchedule,
  safeIsoFromLocal,
  toDatetimeLocal,
} from './orderingControlUi';

function gateScheduleToDays(schedule: FeatureGateStatus['schedule']): Schedule {
  if (!schedule) return { ...DEFAULT_SCHEDULE, ...Object.fromEntries(
    DAYS.map(({ key }) => [key, { enabled: false, windows: [{ open: '10:00', close: '22:00' }] }]),
  ) } as Schedule;
  // Reuse the same parser as online schedule (supports multi-window).
  return parseSchedule(JSON.stringify(schedule));
}

function daysToPayload(days: Schedule, useSchedule: boolean) {
  if (!useSchedule) return null;
  const enabledDays = DAYS.filter(({ key }) => days[key].enabled);
  if (enabledDays.length === 0) return null;
  return Object.fromEntries(
    enabledDays.map(({ key }) => [
      key,
      { enabled: true, windows: days[key].windows },
    ]),
  );
}

export function FeatureGateCard({
  gate,
  onChanged,
  onToast,
}: {
  gate: FeatureGateStatus;
  onChanged: (g: FeatureGateStatus) => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}) {
  const [days, setDays] = useState<Schedule>(() => gateScheduleToDays(gate.schedule));
  const [useSchedule, setUseSchedule] = useState<boolean>(() => gate.schedule != null);
  const [overrideUntil, setOverrideUntil] = useState(() => toDatetimeLocal(gate.override_until));
  const [saving, setSaving] = useState(false);

  // Keep local editors in sync when parent refreshes the gate from the server.
  useEffect(() => {
    setDays(gateScheduleToDays(gate.schedule));
    setUseSchedule(gate.schedule != null);
    setOverrideUntil(toDatetimeLocal(gate.override_until));
  }, [gate]);

  const patch = async (body: Parameters<typeof updateFeatureGate>[1], okMsg: string) => {
    setSaving(true);
    try {
      const { gate: fresh } = await updateFeatureGate(gate.key, body);
      onChanged(fresh);
      onToast(okMsg);
    } catch {
      onToast(`Failed to update ${gate.label}.`, 'err');
    } finally {
      setSaving(false);
    }
  };

  const saveSchedule = () => {
    const enabledDays = DAYS.filter(({ key }) => days[key].enabled);
    if (useSchedule && enabledDays.length === 0) {
      onToast('Tick at least one day, or untick “Limit to a weekly schedule”.', 'err');
      return;
    }
    void patch(
      { schedule: daysToPayload(days, useSchedule) },
      useSchedule ? `${gate.label} schedule saved.` : `${gate.label} schedule cleared.`,
    );
  };

  const updateWindow = (day: DayKey, idx: number, field: 'open' | 'close', value: string) => {
    setDays((prev) => {
      const windows = prev[day].windows.map((w, i) => (i === idx ? { ...w, [field]: value } : w));
      return { ...prev, [day]: { ...prev[day], windows } };
    });
  };

  return (
    <div style={S.card} data-testid={`feature-gate-${gate.key}`}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <p style={{ ...S.sectionTitle, marginBottom: 0 }}>{gate.label}</p>
        <span style={gate.open ? S.statusOpen : S.statusClosed}>
          {gate.open ? 'Available now' : 'Off right now'}
        </span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '10px 0 14px', lineHeight: 1.5 }}>
        {gate.description}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <button
          style={S.toggleTrack(gate.enabled)}
          onClick={() => void patch({ enabled: !gate.enabled }, `${gate.label} turned ${gate.enabled ? 'OFF' : 'ON'}.`)}
          disabled={saving}
          role="switch"
          aria-checked={gate.enabled}
          aria-label={`Toggle ${gate.label}`}
          data-testid={`feature-gate-toggle-${gate.key}`}
        >
          <span style={S.toggleThumb(gate.enabled)} />
        </button>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>
          {gate.enabled ? 'ON' : 'OFF'}
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 10 }}>
        <input
          type="checkbox"
          checked={useSchedule}
          onChange={(e) => setUseSchedule(e.target.checked)}
        />
        Limit to a weekly schedule (unticked = available whenever it’s ON)
      </label>
      {useSchedule && (
        <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
          {DAYS.map(({ key, label }) => (
            <div key={key} style={{ display: 'grid', gap: 6 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={days[key].enabled}
                  onChange={(e) => setDays((d) => ({ ...d, [key]: { ...d[key], enabled: e.target.checked } }))}
                />
                {label}
              </label>
              {days[key].enabled &&
                days[key].windows.map((win, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingLeft: 22 }}>
                    <input
                      type="time"
                      value={win.open}
                      onChange={(e) => updateWindow(key, idx, 'open', e.target.value)}
                      style={{ ...S.input, width: 120, padding: '5px 8px' }}
                    />
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>to</span>
                    <input
                      type="time"
                      value={win.close}
                      onChange={(e) => updateWindow(key, idx, 'close', e.target.value)}
                      style={{ ...S.input, width: 120, padding: '5px 8px' }}
                    />
                    {days[key].windows.length > 1 && (
                      <button
                        type="button"
                        style={{ ...S.btnSecondary, padding: '4px 10px', minHeight: 32, fontSize: 12 }}
                        onClick={() =>
                          setDays((d) => ({
                            ...d,
                            [key]: { ...d[key], windows: d[key].windows.filter((_, i) => i !== idx) },
                          }))
                        }
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              {days[key].enabled && (
                <button
                  type="button"
                  style={{ ...S.btnSecondary, padding: '4px 10px', minHeight: 32, fontSize: 12, marginLeft: 22, width: 'fit-content' }}
                  onClick={() =>
                    setDays((d) => ({
                      ...d,
                      [key]: { ...d[key], windows: [...d[key].windows, { open: '18:00', close: '22:00' }] },
                    }))
                  }
                >
                  + Add window
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <button type="button" style={S.btnPrimary} onClick={saveSchedule} disabled={saving}>
          <Save size={14} />
          {saving ? 'Saving…' : 'Save schedule'}
        </button>
      </div>

      <ForceOpenOverride
        value={overrideUntil}
        onChange={setOverrideUntil}
        activeUntil={gate.override_until}
        saving={saving}
        onSet={() => {
          const iso = safeIsoFromLocal(overrideUntil);
          if (!iso) {
            onToast('Pick a valid date and time first.', 'err');
            return;
          }
          void patch({ override_until: iso }, `${gate.label} forced open.`);
        }}
        onClear={() => {
          setOverrideUntil('');
          void patch({ override_until: null }, 'Override cleared.');
        }}
      />
    </div>
  );
}
