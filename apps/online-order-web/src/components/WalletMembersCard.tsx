// Account → Wallet → "Family wallet" (phase 4, owner 2026-10-21): share the
// wallet with up to four people by phone, who pay from it at the counter and
// in the order app when their own wallet is empty; take one off again. For
// someone a wallet is shared with, the card says whose it is and offers to
// leave. Money in always goes to the wallet of the person adding it; a
// member can neither top the shared one up nor take money out.
import { useEffect, useState, type CSSProperties } from 'react';
import { Users } from 'lucide-react';
import { addWalletMember, getWalletMembers, leaveSharedWallet, removeWalletMember, type WalletMembersState } from '../api';
import { useLanguage } from '../context/LanguageContext';

export function WalletMembersCard({ onChanged }: { onChanged?: () => void }) {
  const { t } = useLanguage();
  const [state, setState] = useState<WalletMembersState | null>(null);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let live = true;
    getWalletMembers().then((s) => { if (live) setState(s); }).catch(() => { if (live) setState(null); });
    return () => { live = false; };
  }, []);

  if (!state) return null;

  const run = async (work: () => Promise<WalletMembersState & { message?: string }>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const next = await work();
      setState({ members: next.members, max: next.max, shares_wallet_of: next.shares_wallet_of });
      if (next.message) setNotice(next.message);
      onChanged?.();
    } catch (e) {
      setError((e as Error).message || t('wallet.family_error'));
    } finally {
      setBusy(false);
    }
  };

  const shared = state.shares_wallet_of;
  const full = state.members.length >= state.max;

  return (
    <div data-testid="wallet-family" style={card}>
      <p style={title}><Users size={16} aria-hidden /> {t('wallet.family_title')}</p>
      {shared ? (
        <>
          <p style={hint} data-testid="wallet-family-member-hint">
            {t('wallet.family_member_hint').replace('{name}', shared.name).replace('{balance}', shared.balance_mvr.toFixed(2))}
          </p>
          <button
            type="button"
            onClick={() => run(leaveSharedWallet)}
            disabled={busy}
            style={{ ...linkBtn, opacity: busy ? 0.6 : 1 }}
            data-testid="wallet-family-leave"
          >
            {t('wallet.family_leave').replace('{name}', shared.name)}
          </button>
        </>
      ) : (
        <>
          <p style={hint}>{t('wallet.family_hint_owner').replace('{max}', String(state.max))}</p>
          {state.members.length > 0 && (
            <ul style={{ listStyle: 'none', margin: '0 0 10px', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }} data-testid="wallet-family-list">
              {state.members.map((m) => (
                <li key={m.id} style={row}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{m.name}</span>
                    <span style={{ color: 'var(--color-text-muted)', fontSize: 12, marginInlineStart: 8 }}>{m.phone}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => run(() => removeWalletMember(m.id))}
                    disabled={busy}
                    style={{ ...linkBtn, opacity: busy ? 0.6 : 1 }}
                    data-testid={`wallet-family-remove-${m.id}`}
                  >
                    {t('wallet.family_remove')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {full ? (
            <p style={hint} data-testid="wallet-family-full">{t('wallet.family_full').replace('{max}', String(state.max))}</p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const typed = phone.trim();
                if (typed === '') return;
                run(() => addWalletMember(typed)).then(() => setPhone(''));
              }}
              style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
            >
              <label style={{ flex: '1 1 160px', minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 4 }}>{t('wallet.family_add_label')}</span>
                <input
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="7XXXXXX"
                  style={input}
                  data-testid="wallet-family-phone"
                />
              </label>
              <button
                type="submit"
                disabled={busy || phone.trim() === ''}
                style={{ ...btn, opacity: busy || phone.trim() === '' ? 0.6 : 1 }}
                data-testid="wallet-family-add"
              >
                {t('wallet.family_add')}
              </button>
            </form>
          )}
        </>
      )}
      {notice && <p role="status" style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--color-success)' }} data-testid="wallet-family-notice">{notice}</p>}
      {error && <p role="alert" style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--color-danger)' }} data-testid="wallet-family-error">{error}</p>}
    </div>
  );
}

const card: CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 14,
  padding: '0.9rem 1rem',
  background: 'var(--color-surface)',
  marginBottom: 12,
};
const title: CSSProperties = {
  margin: '0 0 6px', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text)',
};
const hint: CSSProperties = { margin: '0 0 8px', fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.45 };
const row: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 14,
  padding: '6px 0', borderBottom: '1px solid var(--color-border-light, var(--color-border))',
};
const input: CSSProperties = {
  width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '0 12px', borderRadius: 10,
  border: '1.5px solid var(--color-border)', fontSize: 16, background: 'var(--color-surface)', color: 'var(--color-text)', fontFamily: 'inherit',
};
const btn: CSSProperties = {
  alignSelf: 'flex-end', minHeight: 44, padding: '0 16px', borderRadius: 10, border: 'none',
  background: 'var(--color-primary)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit',
};
const linkBtn: CSSProperties = {
  background: 'none', border: 'none', padding: '6px 0', color: 'var(--color-primary)', fontWeight: 700, fontSize: 13,
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
};
