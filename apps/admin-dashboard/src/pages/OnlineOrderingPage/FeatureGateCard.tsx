import { useEffect, useState } from 'react';
import { ChevronDown, Save } from 'lucide-react';
import { updateFeatureGate, type FeatureGateStatus } from '../../api';
import {
  DAYS,
  DEFAULT_SCHEDULE,
  ForceOpenOverride,
  S,
  ScheduleEditor,
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
  const [expanded, setExpanded] = useState(false);
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

  const scheduled = gate.schedule != null;
  const forced = Boolean(gate.override_until);

  return (
    <div className="oc-card" style={S.card} data-testid={`feature-gate-${gate.key}`}>
      {/* Collapsed header: everything you need at a glance + quick on/off */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          data-testid={`feature-gate-expand-${gate.key}`}
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            textAlign: 'left',
            fontFamily: 'inherit',
            minHeight: 44,
          }}
        >
          <ChevronDown
            size={16}
            style={{
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.15s',
              color: '#9C8575',
              flexShrink: 0,
            }}
          />
          <span style={{ ...S.sectionTitle, marginBottom: 0 }}>{gate.label}</span>
          <span style={{ ...(gate.open ? S.statusOpen : S.statusClosed), padding: '2px 10px', fontSize: 12 }}>
            {gate.open ? 'Available now' : 'Off right now'}
          </span>
        </button>
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
      </div>
      {!expanded && (scheduled || forced) && (
        <p style={{ ...S.reasonNote, marginTop: 8 }}>
          {[
            scheduled ? 'Weekly schedule active' : null,
            forced ? `forced open until ${new Date(gate.override_until as string).toLocaleString()}` : null,
          ].filter(Boolean).join(' · ')}
        </p>
      )}

      {expanded && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 14px', lineHeight: 1.5 }}>
            {gate.description}
          </p>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 10, minHeight: 44 }}>
            <input
              type="checkbox"
              checked={useSchedule}
              onChange={(e) => setUseSchedule(e.target.checked)}
            />
            Limit to a weekly schedule (unticked = available whenever it’s ON)
          </label>
          {useSchedule && (
            <div style={{ marginBottom: 10 }}>
              <ScheduleEditor schedule={days} onChange={setDays} />
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <button type="button" className="oc-btn-block" style={S.btnPrimary} onClick={saveSchedule} disabled={saving}>
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
      )}
    </div>
  );
}
