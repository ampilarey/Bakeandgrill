// "This is a gift" at checkout (iruali import plan, feature 10): the receiver's
// name and phone and a short message. The kitchen slip says GIFT and carries
// no prices; a delivery goes to the receiver.
import { Gift } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export type GiftDraft = { on: boolean; name: string; phone: string; message: string };

const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '10px 12px', borderRadius: 10,
  border: '1.5px solid var(--color-border)', fontSize: 16, background: 'var(--color-surface)', color: 'var(--color-text)', fontFamily: 'inherit',
};

export function GiftOptions({ gift, onChange, delivery }: { gift: GiftDraft; onChange: (g: GiftDraft) => void; delivery: boolean }) {
  const { t } = useLanguage();
  return (
    <div data-testid="gift-options" style={{ border: '1px solid var(--color-border)', borderRadius: 14, padding: '0.85rem 1rem', background: 'var(--color-surface)' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14, color: 'var(--color-text)' }}>
        <input type="checkbox" checked={gift.on} onChange={(e) => onChange({ ...gift, on: e.target.checked })} data-testid="gift-toggle" />
        <Gift size={16} aria-hidden /> {t('giftOrder.toggle')}
      </label>
      {gift.on && (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <input style={input} value={gift.name} maxLength={100} onChange={(e) => onChange({ ...gift, name: e.target.value })} placeholder={t('giftOrder.name')} aria-label={t('giftOrder.name')} data-testid="gift-name" />
          <input style={input} value={gift.phone} inputMode="tel" maxLength={15} onChange={(e) => onChange({ ...gift, phone: e.target.value })} placeholder={t('giftOrder.phone')} aria-label={t('giftOrder.phone')} data-testid="gift-phone" />
          <textarea style={{ ...input, minHeight: 72 }} value={gift.message} maxLength={200} rows={2} onChange={(e) => onChange({ ...gift, message: e.target.value.slice(0, 200) })} placeholder={t('giftOrder.message')} aria-label={t('giftOrder.message')} data-testid="gift-message" />
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>{delivery ? t('giftOrder.hint_delivery') : t('giftOrder.hint_pickup')}</p>
        </div>
      )}
    </div>
  );
}
