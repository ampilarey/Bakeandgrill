// Account → Wallet → "Add a gift card" (iruali import plan, feature 12): the
// card's whole balance moves into the wallet in one go. A gift card can still
// be spent straight at checkout instead.
import { useState } from 'react';
import { Gift } from 'lucide-react';
import { addGiftCardToWallet } from '../api';
import { useLanguage } from '../context/LanguageContext';

export function AddGiftCardToWallet({ onAdded }: { onAdded: () => void }) {
  const { t } = useLanguage();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const add = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await addGiftCardToWallet(code.trim());
      setCode('');
      setMsg({ ok: true, text: t('wallet.gift_added').replace('{amount}', (res.added_laar / 100).toFixed(2)) });
      onAdded();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message || t('wallet.gift_error') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="wallet-add-gift-card" style={{ border: '1px solid var(--color-border)', borderRadius: 14, padding: '0.9rem 1rem', background: 'var(--color-surface)', marginBottom: 12 }}>
      <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text)' }}>
        <Gift size={16} aria-hidden /> {t('wallet.add_gift')}
      </p>
      <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--color-text-muted)' }}>{t('wallet.add_gift_hint')}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder={t('gift.code_ph')}
          aria-label={t('gift.code_label')}
          data-testid="wallet-gift-code"
          style={{ flex: 1, minWidth: 0, minHeight: 44, padding: '0 12px', borderRadius: 10, border: '1.5px solid var(--color-border)', fontSize: 16, background: 'var(--color-surface)', color: 'var(--color-text)', fontFamily: 'inherit' }}
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={busy || code.trim().length < 6}
          data-testid="wallet-gift-add"
          style={{ padding: '0 16px', minHeight: 44, borderRadius: 10, border: 'none', background: 'var(--color-primary)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', opacity: busy || code.trim().length < 6 ? 0.6 : 1 }}
        >
          {t('wallet.add')}
        </button>
      </div>
      {msg && <p role="status" style={{ margin: '6px 0 0', fontSize: 13, color: msg.ok ? 'var(--color-success)' : 'var(--color-danger)' }}>{msg.text}</p>}
    </div>
  );
}
