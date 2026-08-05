import { Sheet } from './ui/Sheet';
import { useLanguage } from '../context/LanguageContext';
import type { OrderDay } from '../context/OrderDayContext';

type Props = {
  open: boolean;
  /** The day the customer is trying to switch to. */
  targetDay: OrderDay;
  /** Cart lines that would be removed by the switch. */
  removeCount: number;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Asks before a manual Today/Tomorrow switch removes cart items — nothing is
 * dropped silently. Automatic flips (shop closed → tomorrow) keep the toast
 * prune since those items cannot be ordered anyway.
 */
export function DaySwitchConfirmSheet({ open, targetDay, removeCount, onConfirm, onCancel }: Props) {
  const { t } = useLanguage();

  const title = t(targetDay === 'tomorrow' ? 'daySwitch.title_tomorrow' : 'daySwitch.title_today');
  const bodyKey = targetDay === 'tomorrow'
    ? (removeCount === 1 ? 'daySwitch.body_tomorrow_one' : 'daySwitch.body_tomorrow_many')
    : (removeCount === 1 ? 'daySwitch.body_today_one' : 'daySwitch.body_today_many');

  return (
    <Sheet open={open} onClose={onCancel} title={title}>
      <div style={{ padding: '0 var(--page-gutter) 1.1rem' }} data-testid="day-switch-confirm">
        <p style={{ margin: '0 0 1.1rem', fontSize: '0.95rem', lineHeight: 1.55, color: 'var(--color-text)' }}>
          {t(bodyKey).replace('{n}', String(removeCount))}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <button
            type="button"
            data-testid="day-switch-confirm-yes"
            onClick={onConfirm}
            style={{
              minHeight: 48,
              padding: '0.8rem 1rem',
              borderRadius: 14,
              border: 'none',
              background: 'var(--color-primary)',
              color: '#fff',
              fontSize: '0.95rem',
              fontWeight: 800,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {t('daySwitch.confirm').replace('{n}', String(removeCount))}
          </button>
          <button
            type="button"
            data-testid="day-switch-confirm-no"
            onClick={onCancel}
            style={{
              minHeight: 48,
              padding: '0.8rem 1rem',
              borderRadius: 14,
              border: '1.5px solid var(--color-border)',
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {t('daySwitch.cancel')}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
