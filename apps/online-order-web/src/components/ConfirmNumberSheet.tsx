import { Sheet } from './ui/Sheet';
import { useLanguage } from '../context/LanguageContext';

type Props = {
  open: boolean;
  phone: string;
  onConfirm: () => void;
  onChange: () => void;
  onClose: () => void;
};

/**
 * "Is this your number?" before a guest places an order (owner, 2026-10-18): the
 * number was never checked with a code, so a slip sends the order updates to a
 * stranger. Reading it back catches the slip that typing it twice would not.
 */
export function ConfirmNumberSheet({ open, phone, onConfirm, onChange, onClose }: Props) {
  const { t } = useLanguage();

  return (
    <Sheet open={open} onClose={onClose} title={t('checkout.confirm_phone_title')}>
      <div style={{ padding: '0 var(--page-gutter) 1.1rem' }} data-testid="confirm-number">
        <p style={{ margin: '0 0 0.6rem', fontSize: '1.6rem', fontWeight: 800, letterSpacing: 1, color: 'var(--color-text)', textAlign: 'center' }} dir="ltr">
          {phone}
        </p>
        <p style={{ margin: '0 0 1.1rem', fontSize: '0.95rem', lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
          {t('checkout.confirm_phone_body').replace('{phone}', phone)}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <button type="button" data-testid="confirm-number-yes" onClick={onConfirm} style={{ ...btn, border: 'none', background: 'var(--color-primary)', color: 'var(--color-primary-contrast)', fontWeight: 800 }}>
            {t('checkout.confirm_phone_yes')}
          </button>
          <button type="button" data-testid="confirm-number-change" onClick={onChange} style={{ ...btn, border: '1.5px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontWeight: 700 }}>
            {t('checkout.confirm_phone_change')}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

const btn: React.CSSProperties = { minHeight: 48, padding: '0.8rem 1rem', borderRadius: 14, fontSize: '0.95rem', cursor: 'pointer', fontFamily: 'inherit' };
