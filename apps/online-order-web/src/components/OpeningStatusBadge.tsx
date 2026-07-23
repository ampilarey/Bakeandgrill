import type { OnlineOrderingStatus } from '../api';
import { useLanguage } from '../context/LanguageContext';
import { useSiteSettingsContext } from '../context/SiteSettingsContext';

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

/** ISO 8601 datetime → "HH:MM", or '' if unparseable */
function toHHMM(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

/** ISO 8601 datetime → "9:00 PM", or '' if unparseable */
function to12h(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
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
 * Returns '' when the value cannot be parsed (avoids "Closes NaN:NaN").
 */
function fmtWindow(iso: string | null | undefined, use12h: boolean): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const timeStr = use12h ? to12h(iso) : toHHMM(iso);
    if (!timeStr) return '';
    const sameDay = d.toDateString() === new Date().toDateString();
    return sameDay ? timeStr : `${timeStr} ${d.toLocaleDateString('en-US', { weekday: 'short' })}`;
  } catch {
    return '';
  }
}

/**
 * Content override when non-empty; otherwise i18n (keeps EN/DV working).
 */
function contentOrI18n(
  contentValue: string,
  i18nValue: string,
): string {
  const trimmed = contentValue.trim();
  return trimmed !== '' ? trimmed : i18nValue;
}

/**
 * Pill badge — timeline from the online ordering gate API; wording from Content Studio
 * (`order_hours_*`) with i18n fallback when empty.
 */
export function OpeningStatusBadge({
  open, reason, currentClose, nextOpenWindow, timeDisplay = '24h', className = '', style,
}: Omit<Props, 'closedDetail'> & { closedDetail?: string | null }) {
  const { t } = useLanguage();
  const { text } = useSiteSettingsContext();
  const use12h = timeDisplay === '12h';
  let label: string;

  if (open) {
    const closeStr = currentClose ? fmtWindow(currentClose, use12h) : '';
    if (closeStr) {
      const tpl = contentOrI18n(
        text('order_hours_open_closes', ''),
        t('status.open_closes'),
      );
      label = tpl.replace('{time}', closeStr);
    } else {
      label = contentOrI18n(text('order_hours_open', ''), t('status.open'));
    }
  } else if (reason === 'schedule') {
    const nextStr = nextOpenWindow ? fmtWindow(nextOpenWindow, use12h) : '';
    if (nextStr) {
      const tpl = contentOrI18n(
        text('order_hours_closed_opens', ''),
        t('status.closed_opens'),
      );
      label = tpl.replace('{time}', nextStr);
    } else {
      label = contentOrI18n(text('order_hours_closed', ''), t('status.closed'));
    }
  } else {
    label = contentOrI18n(text('order_hours_closed', ''), t('status.closed'));
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
