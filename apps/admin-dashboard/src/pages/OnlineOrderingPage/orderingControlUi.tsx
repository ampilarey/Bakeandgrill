import { useState, type CSSProperties, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Lock, RefreshCw, Unlock } from 'lucide-react';

export const DAYS = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
] as const;

export type DayKey = (typeof DAYS)[number]['key'];
export type TimeWindow = { open: string; close: string };
export type DaySchedule = { enabled: boolean; windows: TimeWindow[] };
export type Schedule = Record<DayKey, DaySchedule>;

export const DEFAULT_SCHEDULE: Schedule = Object.fromEntries(
  DAYS.map(({ key }) => [key, { enabled: true, windows: [{ open: '10:00', close: '22:00' }] }]),
) as Schedule;

export const S = {
  card: {
    background: '#FDFAF7',
    border: '1px solid var(--color-border)',
    borderRadius: 16,
    padding: '1.5rem',
    marginBottom: '1.25rem',
  } as CSSProperties,
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
    minHeight: 44,
  },
  label: {
    display: 'block' as const,
    fontSize: 13,
    fontWeight: 600 as const,
    color: 'var(--color-text-secondary)',
    marginBottom: 4,
  },
  btnPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 16px',
    borderRadius: 10,
    border: 'none',
    background: 'var(--color-primary)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 44,
  } as CSSProperties,
  btnSecondary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 16px',
    borderRadius: 10,
    border: '1.5px solid var(--color-border)',
    background: 'var(--color-surface)',
    color: '#4A3728',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 44,
  } as CSSProperties,
  btnDanger: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 16px',
    borderRadius: 10,
    border: 'none',
    background: 'var(--color-danger)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 44,
  } as CSSProperties,
  statusOpen: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: '#D1FAE5',
    color: '#065F46',
    border: '1px solid #A7F3D0',
    borderRadius: 20,
    padding: '4px 12px',
    fontSize: 13,
    fontWeight: 700,
    maxWidth: '100%',
    flexWrap: 'wrap' as const,
  } as CSSProperties,
  statusClosed: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: 'var(--color-danger-bg)',
    color: 'var(--color-danger-strong)',
    border: '1px solid #FECACA',
    borderRadius: 20,
    padding: '4px 12px',
    fontSize: 13,
    fontWeight: 700,
    maxWidth: '100%',
    flexWrap: 'wrap' as const,
  } as CSSProperties,
  reasonNote: {
    fontSize: 12,
    color: 'var(--color-text-muted)',
    marginTop: 6,
  },
  toggleTrack: (on: boolean): CSSProperties => ({
    display: 'inline-block',
    position: 'relative',
    width: 48,
    height: 28,
    borderRadius: 14,
    background: on ? 'var(--color-primary)' : '#D1C9BE',
    transition: 'background 0.2s',
    cursor: 'pointer',
    flexShrink: 0,
  }),
  toggleThumb: (on: boolean): CSSProperties => ({
    position: 'absolute',
    top: 4,
    left: on ? 24 : 4,
    width: 20,
    height: 20,
    borderRadius: '50%',
    background: 'var(--color-surface)',
    boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
    transition: 'left 0.2s',
  }),
};

/** ISO → datetime-local value in the browser's local zone. */
export function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local → ISO, or null if empty/invalid. */
export function safeIsoFromLocal(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function parseSchedule(raw: string): Schedule {
  try {
    const parsed = JSON.parse(raw);
    const result = { ...DEFAULT_SCHEDULE };
    for (const { key } of DAYS) {
      const val = parsed[key];
      if (!val) continue;
      if (Array.isArray(val)) {
        result[key] = {
          enabled: true,
          windows: val.map((w: { open?: string; close?: string }) => ({
            open: w.open ?? '10:00',
            close: w.close ?? '22:00',
          })),
        };
      } else if (typeof val === 'object') {
        result[key] = {
          enabled: val.enabled !== false,
          windows: val.windows
            ? val.windows.map((w: { open: string; close: string }) => ({ open: w.open, close: w.close }))
            : [{ open: val.open ?? '10:00', close: val.close ?? '22:00' }],
        };
      }
    }
    return result;
  } catch {
    return DEFAULT_SCHEDULE;
  }
}

type ForceOpenProps = {
  label?: string;
  help?: string;
  value: string;
  onChange: (v: string) => void;
  activeUntil?: string | null;
  saving?: boolean;
  onSet: () => void;
  onClear: () => void;
};

/** Shared force-open override editor used by online, catering, and feature gates. */
export function ForceOpenOverride({
  label = 'Force-open until (ignores switch + schedule)',
  help,
  value,
  onChange,
  activeUntil,
  saving = false,
  onSet,
  onClear,
}: ForceOpenProps) {
  return (
    <div>
      {help ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
          {help}
        </p>
      ) : null}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={S.label}>{label}</label>
          <input
            type="datetime-local"
            style={S.input}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
        <button type="button" style={S.btnPrimary} onClick={onSet} disabled={saving || !value.trim()}>
          <Unlock size={14} />
          {saving ? 'Saving…' : 'Set'}
        </button>
        {activeUntil ? (
          <button type="button" style={S.btnSecondary} onClick={onClear} disabled={saving}>
            <Lock size={14} />
            Clear
          </button>
        ) : null}
      </div>
      {activeUntil ? (
        <p style={{ ...S.reasonNote, color: 'var(--color-primary)', fontWeight: 600 }}>
          Active until {new Date(activeUntil).toLocaleString()}
        </p>
      ) : null}
    </div>
  );
}

export type StatusChip = {
  id: string;
  label: string;
  open: boolean | null;
  onClick?: () => void;
};

export type StatusChipGroup = {
  id: string;
  label: string;
  chips: StatusChip[];
};

function StatusChipButton({ chip, groupLabel }: { chip: StatusChip; groupLabel?: string }) {
  const unknown = chip.open === null;
  const style: CSSProperties = unknown
    ? {
        ...S.statusClosed,
        background: '#F5F0EB',
        color: 'var(--color-text-muted)',
        border: '1px solid var(--color-border)',
        cursor: chip.onClick ? 'pointer' : 'default',
      }
    : {
        ...(chip.open ? S.statusOpen : S.statusClosed),
        cursor: chip.onClick ? 'pointer' : 'default',
      };
  const Tag = chip.onClick ? 'button' : 'span';
  const stateLabel = unknown ? 'loading' : chip.open ? 'open' : 'closed';
  const fullLabel = groupLabel ? `${groupLabel} ${chip.label}` : chip.label;
  return (
    <Tag
      type={chip.onClick ? 'button' : undefined}
      onClick={chip.onClick}
      style={{ ...style, padding: '4px 12px', minHeight: 32 }}
      aria-label={`${fullLabel}: ${stateLabel}`}
      title={`${fullLabel}: ${stateLabel}`}
      data-testid={`status-chip-${chip.id}`}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: unknown ? '#C4B5A5' : chip.open ? '#10B981' : '#EF4444',
          flexShrink: 0,
        }}
      />
      {chip.label}
    </Tag>
  );
}

/**
 * Open/closed overview for Ordering Control.
 * Prefer grouped rows (Today / Tomorrow / Other) so per-mode gates read clearly.
 */
export function StatusChipStrip({
  groups,
  chips,
}: {
  groups?: StatusChipGroup[];
  /** @deprecated Prefer `groups` — kept for simple one-row strips. */
  chips?: StatusChip[];
}) {
  if (groups && groups.length > 0) {
    return (
      <div className="oc-status-overview" data-testid="ordering-status-overview">
        {groups.map((group) => (
          <div key={group.id} className="oc-status-group" data-testid={`status-group-${group.id}`}>
            <span className="oc-status-group-label">{group.label}</span>
            <div className="oc-chip-strip">
              {group.chips.map((chip) => (
                <StatusChipButton key={chip.id} chip={chip} groupLabel={group.label} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="oc-chip-strip" data-testid="ordering-status-overview">
      {(chips ?? []).map((chip) => (
        <StatusChipButton key={chip.id} chip={chip} />
      ))}
    </div>
  );
}

export function MasterSwitchRow({
  on,
  toggling,
  titleOn,
  titleOff,
  helpOn,
  helpOff,
  onToggle,
}: {
  on: boolean;
  toggling: boolean;
  titleOn: string;
  titleOff: string;
  helpOn: ReactNode;
  helpOff: ReactNode;
  onToggle: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <button
        style={S.toggleTrack(on)}
        onClick={onToggle}
        disabled={toggling}
        role="switch"
        aria-checked={on}
        aria-label={on ? titleOn : titleOff}
      >
        <span style={S.toggleThumb(on)} />
      </button>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>
          {toggling ? 'Updating…' : on ? titleOn : titleOff}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2, lineHeight: 1.45 }}>
          {on ? helpOn : helpOff}
        </div>
      </div>
    </div>
  );
}

/** Divider-topped expandable row used to tuck advanced controls out of the way. */
export function Collapsible({
  title,
  children,
  defaultOpen = false,
  testId,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  testId?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 14 }} data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '10px 0',
          minHeight: 44,
          fontFamily: 'inherit',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>{title}</span>
        <ChevronDown
          size={16}
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', color: 'var(--color-text-muted)', flexShrink: 0 }}
        />
      </button>
      {open ? <div style={{ paddingBottom: 6 }}>{children}</div> : null}
    </div>
  );
}

type GateStatusCardProps = {
  open: boolean;
  openText: string;
  closedText: string;
  reason?: string | null;
  reasonLabels?: Record<string, string>;
  extraStatus?: ReactNode;
  onRefresh: () => void;
  switchRow: {
    on: boolean;
    toggling: boolean;
    titleOn: string;
    titleOff: string;
    helpOn: ReactNode;
    helpOff: ReactNode;
    onToggle: () => void;
  };
  override: {
    value: string;
    onChange: (v: string) => void;
    activeUntil?: string | null;
    saving?: boolean;
    onSet: () => void;
    onClear: () => void;
    help?: string;
  };
  testId?: string;
};

/**
 * One card that answers "is it open, why, and how do I change that":
 * status pill + refresh, master switch, and a tucked-away force-open override.
 */
export function GateStatusCard({
  open,
  openText,
  closedText,
  reason,
  reasonLabels = {},
  extraStatus,
  onRefresh,
  switchRow,
  override,
  testId,
}: GateStatusCardProps) {
  return (
    <div className="oc-card" style={S.card} data-testid={testId}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <span style={open ? S.statusOpen : S.statusClosed}>
            {open ? <CheckCircle2 size={14} style={{ flexShrink: 0 }} /> : <AlertTriangle size={14} style={{ flexShrink: 0 }} />}
            {open ? openText : closedText}
          </span>
          {!open && reason ? (
            <p style={S.reasonNote}>Reason: {reasonLabels[reason] ?? reason}</p>
          ) : null}
          {override.activeUntil ? (
            <p style={{ ...S.reasonNote, color: 'var(--color-primary)', fontWeight: 600 }}>
              Force-open until {new Date(override.activeUntil).toLocaleString()}
            </p>
          ) : null}
          {extraStatus}
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onRefresh}
          aria-label="Refresh status"
          title="Refresh status"
          style={{
            ...S.btnSecondary,
            padding: 8,
            minHeight: 36,
            minWidth: 36,
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <div style={{ marginTop: 14 }}>
        <MasterSwitchRow {...switchRow} />
      </div>

      <Collapsible
        title="Force open temporarily"
        defaultOpen={Boolean(override.activeUntil)}
      >
        <ForceOpenOverride
          help={override.help}
          value={override.value}
          onChange={override.onChange}
          activeUntil={override.activeUntil}
          saving={override.saving}
          onSet={override.onSet}
          onClear={override.onClear}
        />
      </Collapsible>
    </div>
  );
}

/** Immutable helper — returns a copy of the schedule with every day toggled. */
export function withAllDays(schedule: Schedule, enabled: boolean): Schedule {
  return Object.fromEntries(
    DAYS.map(({ key }) => [key, { ...schedule[key], enabled }]),
  ) as Schedule;
}

/**
 * Shared weekly schedule editor (day toggles + time windows).
 * Used by online ordering, pre-order, and delivery so all three look and
 * behave identically — and pick up the mobile layout classes in one place.
 */
export function ScheduleEditor({
  schedule,
  onChange,
  newWindow = { open: '18:00', close: '22:00' },
}: {
  schedule: Schedule;
  onChange: (next: Schedule) => void;
  newWindow?: TimeWindow;
}) {
  const setDay = (day: DayKey, d: DaySchedule) => onChange({ ...schedule, [day]: d });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {DAYS.map(({ key, label }) => {
        const day = schedule[key];
        return (
          <div
            key={key}
            className={`oc-day${day.enabled ? '' : ' oc-day--closed'}`}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: day.enabled ? 8 : 0 }}>
              <button
                type="button"
                style={S.toggleTrack(day.enabled)}
                onClick={() => setDay(key, { ...day, enabled: !day.enabled })}
                role="switch"
                aria-checked={day.enabled}
                aria-label={label}
              >
                <span style={S.toggleThumb(day.enabled)} />
              </button>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{label}</span>
              {!day.enabled && <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Closed all day</span>}
            </div>

            {day.enabled && (
              <div className="oc-day-windows">
                {day.windows.map((win, idx) => (
                  <div key={idx} className="oc-window-row">
                    <div className="oc-time-field">
                      <label htmlFor={`oc-${key}-open-${idx}`}>Open</label>
                      <div className="oc-time-box">
                        <input
                          id={`oc-${key}-open-${idx}`}
                          type="time"
                          value={win.open}
                          onChange={(e) => setDay(key, {
                            ...day,
                            windows: day.windows.map((w, i) => (i === idx ? { ...w, open: e.target.value } : w)),
                          })}
                        />
                      </div>
                    </div>
                    <div className="oc-time-field">
                      <label htmlFor={`oc-${key}-close-${idx}`}>Close</label>
                      <div className="oc-time-box">
                        <input
                          id={`oc-${key}-close-${idx}`}
                          type="time"
                          value={win.close}
                          onChange={(e) => setDay(key, {
                            ...day,
                            windows: day.windows.map((w, i) => (i === idx ? { ...w, close: e.target.value } : w)),
                          })}
                        />
                      </div>
                    </div>
                    {day.windows.length > 1 && (
                      <button
                        type="button"
                        className="icon-button oc-window-remove"
                        onClick={() => setDay(key, { ...day, windows: day.windows.filter((_, i) => i !== idx) })}
                        aria-label={`Remove window ${idx + 1} from ${label}`}
                        title="Remove this window"
                      >×</button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="oc-add-window"
                  onClick={() => setDay(key, { ...day, windows: [...day.windows, { ...newWindow }] })}
                >
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
