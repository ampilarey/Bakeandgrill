import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, Save } from 'lucide-react';
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

export type ModeGateSchedule = Record<
  string,
  { open?: string; close?: string; enabled?: boolean; windows?: { open: string; close: string }[] }
> | null;

function gateScheduleToDays(schedule: ModeGateSchedule): Schedule {
  if (!schedule) {
    return {
      ...DEFAULT_SCHEDULE,
      ...Object.fromEntries(
        DAYS.map(({ key }) => [key, { enabled: false, windows: [{ open: '10:00', close: '22:00' }] }]),
      ),
    } as Schedule;
  }
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

/**
 * Collapsible gate row matching Features tab cards:
 * chevron + label + Available/Off badge + toggle; expand for schedule + force-open.
 */
export function ModeGateCard({
  testId,
  label,
  description,
  enabled,
  open,
  schedule,
  overrideUntil: overrideUntilIso,
  onToggle,
  onSaveSchedule,
  onSetOverride,
  footer,
  onToast,
}: {
  testId: string;
  label: string;
  description: string;
  enabled: boolean;
  open: boolean;
  schedule: ModeGateSchedule;
  overrideUntil: string | null;
  onToggle: (nextEnabled: boolean) => Promise<void>;
  onSaveSchedule: (schedule: ReturnType<typeof daysToPayload>) => Promise<void>;
  onSetOverride: (iso: string | null) => Promise<void>;
  footer?: ReactNode;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [days, setDays] = useState<Schedule>(() => gateScheduleToDays(schedule));
  const [useSchedule, setUseSchedule] = useState<boolean>(() => schedule != null);
  const [overrideUntil, setOverrideUntil] = useState(() => toDatetimeLocal(overrideUntilIso));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDays(gateScheduleToDays(schedule));
    setUseSchedule(schedule != null);
    setOverrideUntil(toDatetimeLocal(overrideUntilIso));
  }, [schedule, overrideUntilIso]);

  const run = async (fn: () => Promise<void>, okMsg: string) => {
    setSaving(true);
    try {
      await fn();
      onToast(okMsg);
    } catch {
      onToast(`Failed to update ${label}.`, 'err');
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
    void run(
      () => onSaveSchedule(daysToPayload(days, useSchedule)),
      useSchedule ? `${label} schedule saved.` : `${label} schedule cleared.`,
    );
  };

  const scheduled = schedule != null;
  const forced = Boolean(overrideUntilIso);

  return (
    <div className="oc-card" style={S.card} data-testid={testId}>
      <div className="oc-feature-head" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          data-testid={`${testId}-expand`}
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
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
          <span style={{ ...S.sectionTitle, marginBottom: 0 }}>{label}</span>
          <span style={{ ...(open ? S.statusOpen : S.statusClosed), padding: '2px 10px', fontSize: 12 }}>
            {open ? 'Available now' : 'Off right now'}
          </span>
        </button>
        <button
          style={S.toggleTrack(enabled)}
          onClick={() => void run(
            () => onToggle(!enabled),
            `${label} turned ${enabled ? 'OFF' : 'ON'}.`,
          )}
          disabled={saving}
          role="switch"
          aria-checked={enabled}
          aria-label={`Toggle ${label}`}
          data-testid={`${testId}-toggle`}
        >
          <span style={S.toggleThumb(enabled)} />
        </button>
      </div>
      {!expanded && (scheduled || forced) && (
        <p style={{ ...S.reasonNote, marginTop: 8 }}>
          {[
            scheduled ? 'Weekly schedule active' : null,
            forced && overrideUntilIso
              ? `forced open until ${new Date(overrideUntilIso).toLocaleString()}`
              : null,
          ].filter(Boolean).join(' · ')}
        </p>
      )}

      {expanded && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 14px', lineHeight: 1.5 }}>
            {description}
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
            activeUntil={overrideUntilIso}
            saving={saving}
            onSet={() => {
              const iso = safeIsoFromLocal(overrideUntil);
              if (!iso) {
                onToast('Pick a valid date and time first.', 'err');
                return;
              }
              void run(() => onSetOverride(iso), `${label} forced open.`);
            }}
            onClear={() => {
              setOverrideUntil('');
              void run(() => onSetOverride(null), 'Override cleared.');
            }}
          />

          {footer ? <div style={{ marginTop: 14 }}>{footer}</div> : null}
        </div>
      )}
    </div>
  );
}
