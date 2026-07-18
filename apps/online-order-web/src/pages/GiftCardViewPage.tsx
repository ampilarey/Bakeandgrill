import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import { useLanguage } from '../context/LanguageContext';
import { PageHeader } from '../components/shell/PageHeader';
import { API_BASE_URL } from '../api/client';

type ViewPayload = {
  code: string;
  masked_code: string;
  amount: number;
  current_balance: number;
  status: string;
  expires_at: string | null;
  order_number: string | null;
};

/**
 * Public page opened from the gift-card SMS "View your card" link.
 * No login required — access is via the one-time view token (48h).
 */
export function GiftCardViewPage() {
  const { t } = useLanguage();
  usePageTitle(t('gift.view_title'));
  const { token } = useParams<{ token: string }>();

  const [data, setData] = useState<ViewPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token) {
      setError(t('gift.view_invalid'));
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetch(`${API_BASE_URL}/gift-cards/view/${encodeURIComponent(token)}`, {
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({})) as { message?: string } & Partial<ViewPayload>;
        if (!res.ok) {
          throw new Error(body.message || t('gift.view_invalid'));
        }
        return body as ViewPayload;
      })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message || t('gift.view_invalid'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [token, t]);

  const copyCode = async () => {
    if (!data?.code) return;
    try {
      await navigator.clipboard.writeText(data.code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 0 2rem' }}>
      <PageHeader title={t('gift.view_title')} />
      <div style={{ padding: '0 var(--page-gutter)', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loading && (
          <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-muted)' }}>{t('common.loading')}…</p>
        )}

        {error && !loading && (
          <p style={{ margin: 0, fontSize: 14, color: 'var(--color-error, #dc2626)', lineHeight: 1.45 }}>
            {error}
          </p>
        )}

        {data && !loading && (
          <div
            style={{
              background: 'var(--color-surface-alt)',
              border: '1px solid var(--color-border)',
              borderRadius: 16,
              padding: 20,
              textAlign: 'center',
            }}
          >
            <p style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800 }}>{t('gift.ready')}</p>
            {data.order_number && (
              <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-muted)' }}>
                {data.order_number}
              </p>
            )}
            <p style={{ margin: '0 0 4px', fontFamily: 'monospace', fontSize: 20, letterSpacing: '0.08em', color: 'var(--color-primary)', fontWeight: 700 }}>
              {data.code}
            </p>
            <p style={{ margin: '8px 0 0', fontSize: 15, fontWeight: 700 }}>
              MVR {Number(data.current_balance).toFixed(2)}
            </p>
            {data.expires_at && (
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
                {t('gift.balance_expires').replace(
                  '{date}',
                  new Date(data.expires_at).toLocaleDateString(undefined, { dateStyle: 'medium' }),
                )}
              </p>
            )}
            <button type="button" onClick={() => void copyCode()} style={copyBtn}>
              {copied ? t('gift.code_copied') : t('gift.copy_code')}
            </button>
            <p style={{ margin: '14px 0 0', fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.45 }}>
              {t('gift.view_hint')}
            </p>
          </div>
        )}

        <Link to="/gift-cards" style={linkBtn}>{t('gift.back_hub')}</Link>
        <Link to="/menu" style={{ ...linkBtn, background: 'transparent', color: 'var(--color-primary)', border: '1.5px solid var(--color-primary)' }}>
          {t('gift.order_food')}
        </Link>
      </div>
    </div>
  );
}

const copyBtn: CSSProperties = {
  marginTop: 14,
  padding: '10px 14px',
  borderRadius: 10,
  border: '1.5px solid var(--color-primary)',
  background: 'transparent',
  color: 'var(--color-primary)',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
  minHeight: 44,
};

const linkBtn: CSSProperties = {
  display: 'block',
  textAlign: 'center',
  padding: '12px 16px',
  borderRadius: 12,
  background: 'var(--color-primary)',
  color: '#fff',
  fontWeight: 700,
  textDecoration: 'none',
  fontSize: 15,
};

export default GiftCardViewPage;
