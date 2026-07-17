import { useLanguage } from '../context/LanguageContext';
import { useOrderMode, type OrderMode } from '../context/OrderModeContext';

type Props = {
  deliveryBlocked?: boolean;
  onModeChange?: (mode: OrderMode) => void;
};

/**
 * Pickup / Delivery segmented control — reads/writes OrderModeContext.
 */
export function OrderModeToggle({ deliveryBlocked = false, onModeChange }: Props) {
  const { t } = useLanguage();
  const { mode, setMode } = useOrderMode();

  const select = (next: OrderMode) => {
    if (next === 'delivery' && deliveryBlocked) return;
    if (next === mode) return;
    setMode(next);
    onModeChange?.(next);
  };

  return (
    <div
      className="order-mode-toggle"
      role="group"
      aria-label={t('nav.menu')}
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
        const disabled = id === 'delivery' && deliveryBlocked;
        return (
          <button
            key={id}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => select(id)}
            style={{
              minHeight: 36,
              padding: '0.35rem 1rem',
              border: 'none',
              borderRadius: 999,
              fontFamily: 'inherit',
              fontWeight: 700,
              fontSize: '0.8125rem',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.45 : 1,
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
