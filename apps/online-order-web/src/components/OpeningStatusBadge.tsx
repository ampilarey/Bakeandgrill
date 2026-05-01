import type { OpeningHoursStatus } from '../api';

type Props = {
  open: boolean;
  today?: OpeningHoursStatus['today'];
  reason?: OpeningHoursStatus['reason'];
  nextOpenWindow?: OpeningHoursStatus['next_open_window'];
  closedDetail?: string | null;
  timeDisplay?: '24h' | '12h';
  className?: string;
  style?: React.CSSProperties;
};

/** HH:MM schedule string → "HH:MM" */
function fmt24h(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** HH:MM schedule string → "9:00 PM" */
function fmt12h(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** ISO 8601 datetime → "9:00 PM" or "9:00 PM Mon" if not today */
function fmtNextWindow(iso: string | null | undefined, fmt: (t: string | null) => string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
      ? fmt(timeStr)
      : `${fmt(timeStr)} ${d.toLocaleDateString('en-US', { weekday: 'short' })}`;
  } catch {
    return '';
  }
}

/**
 * Pill badge matching the main-site hero design.
 *
 * Open:   dark-green pill, pulsing dot, "We're open · Closes HH:MM"
 * Closed: dark-red pill, static dot
 *   - master switch off → "Online ordering is currently closed"
 *   - outside schedule  → "Closed · Opens HH:MM [day]"
 *   - fallback          → "Online ordering is currently closed"
 */
export function OpeningStatusBadge({
  open, today, reason, nextOpenWindow, closedDetail, timeDisplay = '24h', className = '', style,
}: Props) {
  const fmtTime = timeDisplay === '12h' ? fmt12h : fmt24h;
  let label: string;

  if (open) {
    label = "We're open";
    if (today?.close) label += ` · Closes ${fmtTime(today.close)}`;
  } else {
    if (reason === 'master_switch_off') {
      // Master switch is off — don't show schedule times, they are irrelevant
      label = closedDetail ?? 'Online ordering is currently closed';
    } else if (reason === 'schedule' || (!reason && today && !today.closed && today.open)) {
      // Closed by schedule — show when it opens next
      const next = fmtNextWindow(nextOpenWindow, fmtTime);
      label = next ? `Closed · Opens ${next}` : 'Online ordering is currently closed';
    } else {
      label = closedDetail ?? 'Online ordering is currently closed';
    }
  }

  return (
    <span
      className={`opening-status-badge ${open ? 'open' : 'closed'} ${className}`.trim()}
      style={style}
      role="status"
      aria-label={label}
    >
      <span className="opening-status-dot" />
      {label}
    </span>
  );
}
