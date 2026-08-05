import type { CSSProperties, ReactNode } from 'react';
import { Lock, Unlock } from 'lucide-react';

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
    padding: '4px 14px',
    fontSize: 13,
    fontWeight: 700,
  } as CSSProperties,
  statusClosed: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: 'var(--color-danger-bg)',
    color: 'var(--color-danger-strong)',
    border: '1px solid #FECACA',
    borderRadius: 20,
    padding: '4px 14px',
    fontSize: 13,
    fontWeight: 700,
  } as CSSProperties,
  reasonNote: {
    fontSize: 12,
    color: '#9C8575',
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

/** Compact open/closed strip for the Ordering Control hub. */
export function StatusChipStrip({ chips }: { chips: StatusChip[] }) {
  return (
    <div
      data-testid="ordering-status-overview"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: '1.25rem',
      }}
    >
      {chips.map((chip) => {
        const unknown = chip.open === null;
        const style: CSSProperties = unknown
          ? {
              ...S.statusClosed,
              background: '#F5F0EB',
              color: '#9C8575',
              border: '1px solid var(--color-border)',
              cursor: chip.onClick ? 'pointer' : 'default',
            }
          : {
              ...(chip.open ? S.statusOpen : S.statusClosed),
              cursor: chip.onClick ? 'pointer' : 'default',
            };
        const Tag = chip.onClick ? 'button' : 'span';
        return (
          <Tag
            key={chip.id}
            type={chip.onClick ? 'button' : undefined}
            onClick={chip.onClick}
            style={style}
            data-testid={`status-chip-${chip.id}`}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: unknown ? '#C4B5A5' : chip.open ? '#10B981' : '#EF4444',
                flexShrink: 0,
              }}
            />
            {chip.label}
            {' · '}
            {unknown ? '…' : chip.open ? 'Open' : 'Closed'}
          </Tag>
        );
      })}
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
        <div style={{ fontSize: 14, fontWeight: 700, color: '#3D2B1F' }}>
          {toggling ? 'Updating…' : on ? titleOn : titleOff}
        </div>
        <div style={{ fontSize: 12, color: '#9C8575', marginTop: 2, lineHeight: 1.45 }}>
          {on ? helpOn : helpOff}
        </div>
      </div>
    </div>
  );
}
