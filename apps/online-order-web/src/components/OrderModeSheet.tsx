import { Sheet } from './ui/Sheet';
import { useLanguage } from '../context/LanguageContext';
import { useOrderMode, type OrderMode } from '../context/OrderModeContext';
import { useOrderDay } from '../context/OrderDayContext';
import { formatTomorrowDateLabel } from '../utils/collectOn';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Delivery cannot be ordered for today (window closed / paused). */
  deliveryBlockedToday?: boolean;
  /** Gate-provided reason shown under a dimmed delivery card. */
  deliveryBlockedReason?: string | null;
  /** Pickup service paused entirely. */
  pickupBlocked?: boolean;
  /** Prepaid dine-in ("Eat here") enabled by the owner and shop open. */
  dineInAvailable?: boolean;
  /** API collect-tomorrow date for the context line. */
  tomorrowDate?: string | null;
};

/**
 * "How do you want your order?" bottom sheet (centered card on desktop via
 * the shared Sheet styles). Tomorrow orders always offer delivery — a driver
 * can be arranged in advance — so the today-window block does not apply.
 */
export function OrderModeSheet({
  open,
  onClose,
  deliveryBlockedToday = false,
  deliveryBlockedReason,
  pickupBlocked = false,
  dineInAvailable = false,
  tomorrowDate,
}: Props) {
  const { t } = useLanguage();
  const { mode, setMode, modeConfirmed } = useOrderMode();
  const { day } = useOrderDay();

  const deliveryBlocked = day === 'today' && deliveryBlockedToday;

  const choose = (next: OrderMode) => {
    setMode(next);
    onClose();
  };

  const options: Array<{
    id: OrderMode;
    icon: string;
    label: string;
    sub: string;
    blocked: boolean;
    blockedNote: string | null;
  }> = [
    {
      id: 'pickup',
      icon: '🥡',
      label: t('mode.pickup'),
      sub: t('modeSheet.pickup_sub'),
      blocked: pickupBlocked,
      blockedNote: pickupBlocked ? t('modeSheet.pickup_unavailable') : null,
    },
    {
      id: 'delivery',
      icon: '🛵',
      label: t('mode.delivery'),
      sub: day === 'tomorrow' ? t('modeSheet.delivery_tomorrow_ok') : t('modeSheet.delivery_sub'),
      blocked: deliveryBlocked,
      blockedNote: deliveryBlocked
        ? (deliveryBlockedReason?.trim() || t('modeSheet.delivery_unavailable'))
        : null,
    },
    // Prepaid dine-in: today only — the table hold and kitchen timing are same-day.
    ...(dineInAvailable
      ? [{
          id: 'dine_in' as const,
          icon: '🍽️',
          label: 'Eat here',
          sub: 'Table reserved — food ready when you arrive',
          blocked: day === 'tomorrow',
          blockedNote: day === 'tomorrow' ? 'Eat here is for today only' : null,
        }]
      : []),
  ];

  return (
    <Sheet open={open} onClose={onClose} title={t('modeSheet.title')}>
      <div className="mode-sheet">
        <p className="mode-sheet__context">
          {day === 'tomorrow'
            ? t('modeSheet.for_tomorrow').replace('{date}', formatTomorrowDateLabel(tomorrowDate))
            : t('modeSheet.for_today')}
        </p>
        <div className="mode-sheet__options">
          {options.map((opt) => {
            const active = modeConfirmed && mode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                data-testid={`mode-sheet-${opt.id}`}
                onClick={() => { if (!opt.blocked) choose(opt.id); }}
                aria-pressed={active}
                aria-disabled={opt.blocked || undefined}
                data-blocked={opt.blocked ? 'true' : undefined}
                className={`mode-sheet__option${active ? ' is-active' : ''}${opt.blocked ? ' is-blocked' : ''}`}
              >
                <span className="mode-sheet__icon" aria-hidden="true">{opt.icon}</span>
                <span className="mode-sheet__text">
                  <span className="mode-sheet__label">{opt.label}</span>
                  <span className="mode-sheet__sub">{opt.blockedNote ?? opt.sub}</span>
                </span>
                {active && <span className="mode-sheet__check" aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}
