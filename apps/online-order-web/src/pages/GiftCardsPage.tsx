import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import { useLanguage } from '../context/LanguageContext';
import { PageHeader } from '../components/shell/PageHeader';
import { checkGiftCardBalance } from '../api/promotions';

/**
 * Gift cards hub — bottom-nav destination.
 * Buy flow lives at /gift-cards/buy; balance check is inline (no login required).
 */
export function GiftCardsPage() {
  const { t } = useLanguage();
  usePageTitle(t('gift.hub_title'));

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    masked_code: string;
    available_balance: number;
    held_balance: number;
    expires_at: string | null;
  } | null>(null);

  const handleCheck = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError(t('gift.err_code'));
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await checkGiftCardBalance(trimmed);
      setResult({
        masked_code: res.masked_code,
        available_balance: res.available_balance,
        held_balance: res.held_balance,
        expires_at: res.expires_at,
      });
    } catch (e) {
      setError((e as Error).message || t('gift.err_balance'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 0 2rem' }}>
      <PageHeader title={t('gift.hub_title')} />
      <div style={{ padding: '0 var(--page-gutter)', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.45 }}>
          {t('gift.hub_intro')}
        </p>

        <Link to="/gift-cards/buy" style={cardLink}>
          <span style={{ fontSize: 28, lineHeight: 1 }} aria-hidden>🎁</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={cardTitle}>{t('gift.hub_buy')}</span>
            <span style={cardSub}>{t('gift.hub_buy_sub')}</span>
          </span>
          <span style={cardChevron} aria-hidden>→</span>
        </Link>

        <section
          style={{
            border: '1.5px solid var(--color-border)',
            borderRadius: 16,
            background: 'var(--color-surface)',
            padding: '1rem 1.1rem',
          }}
        >
          <p style={{ ...cardTitle, marginBottom: 4 }}>{t('gift.hub_balance')}</p>
          <p style={{ ...cardSub, marginBottom: 12 }}>{t('gift.hub_balance_sub')}</p>

          <label>
            <span style={labelStyle}>{t('gift.code_label')}</span>
            <input
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder={t('gift.code_ph')}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setError('');
                setResult(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCheck();
              }}
              style={inputStyle}
            />
          </label>

          <button
            type="button"
            onClick={() => void handleCheck()}
            disabled={loading || !code.trim()}
            style={{
              ...inputStyle,
              marginTop: 10,
              background: 'var(--color-primary)',
              color: '#fff',
              border: 'none',
              fontWeight: 700,
              cursor: loading || !code.trim() ? 'not-allowed' : 'pointer',
              opacity: loading || !code.trim() ? 0.7 : 1,
            }}
          >
            {loading ? t('gift.checking') : t('gift.check_balance')}
          </button>

          {error && (
            <p style={{ margin: '10px 0 0', color: 'var(--color-error, #dc2626)', fontSize: 13 }}>
              {error}
            </p>
          )}

          {result && (
            <div
              style={{
                marginTop: 12,
                padding: '0.85rem 1rem',
                borderRadius: 12,
                background: 'var(--color-surface-alt)',
                border: '1px solid var(--color-border)',
              }}
            >
              <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>
                {t('gift.balance_code').replace('{code}', result.masked_code)}
              </p>
              <p style={{ margin: '0.35rem 0 0', fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-primary)' }}>
                MVR {Number(result.available_balance).toFixed(2)}
              </p>
              {result.held_balance > 0 && (
                <p style={{ margin: '0.25rem 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {t('gift.balance_held').replace('{amount}', Number(result.held_balance).toFixed(2))}
                </p>
              )}
              {result.expires_at && (
                <p style={{ margin: '0.25rem 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {t('gift.balance_expires').replace(
                    '{date}',
                    new Date(result.expires_at).toLocaleDateString(undefined, { dateStyle: 'medium' }),
                  )}
                </p>
              )}
              <p style={{ margin: '0.65rem 0 0', fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                {t('gift.balance_hint')}
              </p>
            </div>
          )}
        </section>

        <Link
          to="/account"
          style={{ fontSize: 13, color: 'var(--color-primary)', fontWeight: 600, alignSelf: 'flex-start' }}
        >
          {t('gift.open_account')}
        </Link>
      </div>
    </div>
  );
}

const cardLink: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '1rem 1.1rem',
  borderRadius: 16,
  border: '1.5px solid var(--color-border)',
  background: 'var(--color-surface)',
  textDecoration: 'none',
  color: 'inherit',
  minHeight: 72,
};

const cardTitle: CSSProperties = {
  display: 'block',
  fontSize: '1rem',
  fontWeight: 800,
  color: 'var(--color-dark)',
  lineHeight: 1.25,
};

const cardSub: CSSProperties = {
  display: 'block',
  marginTop: 2,
  fontSize: 13,
  color: 'var(--color-text-muted)',
  lineHeight: 1.4,
};

const cardChevron: CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: 'var(--color-primary)',
};

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--color-text-muted)',
  marginBottom: 6,
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '11px 14px',
  border: '1.5px solid var(--color-border)',
  borderRadius: 12,
  fontSize: 15,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
};

export default GiftCardsPage;
