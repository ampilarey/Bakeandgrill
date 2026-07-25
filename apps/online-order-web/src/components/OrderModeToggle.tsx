import { useLanguage } from '../context/LanguageContext';
import { useOrderMode, type OrderMode } from '../context/OrderModeContext';

type Props = {
  deliveryBlocked?: boolean;
  pickupBlocked?: boolean;
  onModeChange?: (mode: OrderMode) => void;
  /** Called when user taps a blocked mode (toast). Buttons stay enabled for feedback. */
  onBlockedTap?: (mode: 'pickup' | 'delivery') => void;
};

/**
 * Pickup / Delivery segmented control — reads/writes OrderModeContext.
 * Blocked modes stay tappable so we can show a toast (do not hard-disable).
 */
export function OrderModeToggle({
  deliveryBlocked = false,
  pickupBlocked = false,
  onModeChange,
  onBlockedTap,
}: Props) {
  const { t } = useLanguage();
  const { mode, setMode } = useOrderMode();

  const select = (next: OrderMode) => {
    if (next === 'delivery' && deliveryBlocked) {
      onBlockedTap?.('delivery');
      return;
    }
    if (next === 'pickup' && pickupBlocked) {
      onBlockedTap?.('pickup');
      return;
    }
    if (next === mode) return;
    setMode(next);
    onModeChange?.(next);
  };

  return (
    <div
      className="order-mode-toggle"
      role="group"
      aria-label={t('mode.toggle_aria')}
      style={{
        display: 'inline-flex',
        padding: 3,
        borderRadius: 999,
        background: 'var(--color-surface-alt)',
        border: '1px solid var(--color-border)',
      }}
    >
      {([
        { id: 'pickup' as const, label: t('mode.pickup') },
        { id: 'delivery' as const, label: t('mode.delivery') },
      ]).map(({ id, label }) => {
        const active = mode === id;
        const blocked = (id === 'delivery' && deliveryBlocked) || (id === 'pickup' && pickupBlocked);
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            aria-disabled={blocked || undefined}
            data-blocked={blocked ? 'true' : undefined}
            onClick={() => select(id)}
            style={{
              minHeight: 44,
              padding: '0.4rem 1.1rem',
              border: 'none',
              borderRadius: 999,
              fontFamily: 'inherit',
              fontWeight: 700,
              fontSize: '0.8125rem',
              cursor: 'pointer',
              opacity: blocked && !active ? 0.55 : 1,
              background: active ? 'var(--color-primary)' : 'transparent',
              color: active ? '#fff' : 'var(--color-text-muted)',
              transition: 'background var(--duration-micro) var(--ease-out), color var(--duration-micro) var(--ease-out)',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
