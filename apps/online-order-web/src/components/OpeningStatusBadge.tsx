import type { OnlineOrderingStatus } from '../api';

type Props = {
  open: boolean;
  reason?: OnlineOrderingStatus['reason'];
  /** ISO 8601 end of the active window — used for "Closes X:XX PM" when open */
  currentClose?: string | null;
  /** ISO 8601 start of the next window — used for "Opens X:XX PM" when closed */
  nextOpenWindow?: string | null;
  /** Explicit message to show when closed (e.g. from gate API) */
  closedDetail?: string | null;
  timeDisplay?: '24h' | '12h';
  className?: string;
  style?: React.CSSProperties;
};

/** ISO 8601 datetime → "HH:MM" */
function toHHMM(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

/** ISO 8601 datetime → "9:00 PM" */
function to12h(iso: string): string {
  try {
    const d = new Date(iso);
    const h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  } catch {
    return '';
  }
}

/**
 * Formats an ISO 8601 datetime as a time string.
 * Appends the weekday abbreviation if not today (e.g. "6:00 PM Mon").
 */
function fmtWindow(iso: string | null | undefined, use12h: boolean): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const timeStr = use12h ? to12h(iso) : toHHMM(iso);
    const sameDay = d.toDateString() === new Date().toDateString();
    return sameDay ? timeStr : `${timeStr} ${d.toLocaleDateString('en-US', { weekday: 'short' })}`;
  } catch {
    return '';
  }
}

/**
 * Pill badge — single source of truth is the online ordering gate API.
 *
 * Open:   "We're open · Closes 10:30 PM"
 * Closed by schedule: "Closed · Opens 6:00 PM" (or "6:00 PM Mon" if next day)
 * Closed by master switch / no schedule: "Online ordering is currently closed"
 */
export function OpeningStatusBadge({
  open, reason, currentClose, nextOpenWindow, closedDetail, timeDisplay = '24h', className = '', style,
}: Props) {
  const use12h = timeDisplay === '12h';
  let label: string;

  if (open) {
    label = "We're open";
    const closeStr = currentClose ? fmtWindow(currentClose, use12h) : '';
    if (closeStr) label += ` · Closes ${closeStr}`;
  } else {
    if (reason === 'schedule') {
      const nextStr = nextOpenWindow ? fmtWindow(nextOpenWindow, use12h) : '';
      label = nextStr ? `Online ordering closed · Opens ${nextStr}` : 'Online ordering is currently closed';
    } else {
      // master_switch_off, override shouldn't close, or unknown — show generic / explicit message
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
