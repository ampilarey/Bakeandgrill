import type { OpeningHoursStatus } from '../api';

type Props = {
  /** Whether the venue is currently open */
  open: boolean;
  /** Today's schedule object from the API */
  today?: OpeningHoursStatus['today'];
  /** Optional extra context when closed (closure reason / generic message) */
  closedDetail?: string | null;
  /** Blade hero uses 24h times; use 12h for compact menu bar if preferred */
  timeDisplay?: '24h' | '12h';
  /** Additional class names (e.g. for positioning context) */
  className?: string;
  style?: React.CSSProperties;
};

/** "HH:MM" or "HH:MM:SS" → 24h "HH:MM" (matches Blade hero: Closes 23:59) */
function fmt24h(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Normalise "HH:MM" or "HH:MM:SS" → 12-hour with am/pm  e.g. "9:00 PM" */
function fmt12h(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * Pill badge matching the main-site hero "We're open · Closes HH:MM" design.
 *
 * Open state:  dark-green pill, pulsing lime dot, "We're open · Closes HH:MM"
 * Closed state: dark-red pill, static pink dot, "Closed now · Opens HH:MM"
 */
export function OpeningStatusBadge({ open, today, closedDetail, timeDisplay = '24h', className = '', style }: Props) {
  const fmtTime = timeDisplay === '12h' ? fmt12h : fmt24h;
  let label: string;
  if (open) {
    label = 'We\'re open';
    if (today?.close) label += ` · Closes ${fmtTime(today.close)}`;
  } else {
    label = 'Closed now';
    if (today && !today.closed && today.open) {
      label += ` · Opens ${fmtTime(today.open)}`;
    } else if (closedDetail) {
      // Trim to keep pill compact
      const short = closedDetail.length > 40 ? closedDetail.slice(0, 38) + '…' : closedDetail;
      label += ` · ${short}`;
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
