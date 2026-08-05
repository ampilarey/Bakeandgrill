import { useLanguage } from '../context/LanguageContext';
import { useOrderDay, type OrderDay } from '../context/OrderDayContext';
import { formatShortDateLabel, formatTomorrowDateLabel } from '../utils/collectOn';

type Props = {
  /** API-provided collect-tomorrow date (Y-m-d) — falls back to local tomorrow. */
  tomorrowDate?: string | null;
  /** Shop closed → today cannot be ordered. */
  todayBlocked?: boolean;
  /** No pre-orderable items → tomorrow cannot be ordered. */
  tomorrowBlocked?: boolean;
  /** Fires after the day actually changes by tap (not on blocked taps). */
  onDaySelect?: (day: OrderDay) => void;
  /** Called when user taps a blocked day (toast). Buttons stay tappable for feedback. */
  onBlockedTap?: (day: OrderDay) => void;
};

/**
 * Today / Tomorrow segmented control with real dates — reads/writes OrderDayContext.
 * Day comes first in the menu because it decides what's orderable; the
 * pickup/delivery choice lives in the mode chip + sheet next to it.
 */
export function OrderDayToggle({
  tomorrowDate,
  todayBlocked = false,
  tomorrowBlocked = false,
  onDaySelect,
  onBlockedTap,
}: Props) {
  const { t } = useLanguage();
  const { day, setDay } = useOrderDay();

  const select = (next: OrderDay) => {
    if ((next === 'today' && todayBlocked) || (next === 'tomorrow' && tomorrowBlocked)) {
      onBlockedTap?.(next);
      return;
    }
    setDay(next);
    onDaySelect?.(next);
  };

  const segments: Array<{ id: OrderDay; label: string; date: string; blocked: boolean }> = [
    {
      id: 'today',
      label: t('day.today'),
      date: formatShortDateLabel(new Date()),
      blocked: todayBlocked,
    },
    {
      id: 'tomorrow',
      label: t('day.tomorrow'),
      date: formatTomorrowDateLabel(tomorrowDate),
      blocked: tomorrowBlocked,
    },
  ];

  return (
    <div
      className="order-day-toggle"
      role="group"
      aria-label={t('day.toggle_aria')}
    >
      {segments.map(({ id, label, date, blocked }) => {
        const active = day === id;
        return (
          <button
            key={id}
            type="button"
            data-testid={`order-day-${id}`}
            aria-pressed={active}
            aria-disabled={blocked || undefined}
            data-blocked={blocked ? 'true' : undefined}
            onClick={() => select(id)}
            className={`order-day-toggle__btn${active ? ' is-active' : ''}`}
            style={blocked && !active ? { opacity: 0.5 } : undefined}
          >
            <span className="order-day-toggle__label">{label}</span>
            <span className="order-day-toggle__date">{date}</span>
          </button>
        );
      })}
    </div>
  );
}
