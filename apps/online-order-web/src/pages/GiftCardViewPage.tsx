import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import { useLanguage } from '../context/LanguageContext';
import { PageHeader } from '../components/shell/PageHeader';
import { API_BASE_URL } from '../api/client';

/**
 * FIX 8g — map HTTP status + optional payload `status` field to a
 * customer-safe explanation. Never render `body.message` verbatim so we
 * don't leak internal delivery-window / retry hints to end users.
 */
export function friendlyGiftCardViewError(
  httpStatus: number,
  bodyStatus: string | null | undefined,
  t: (key: string) => string,
): string {
  const s = (bodyStatus ?? '').toLowerCase();
  if (s === 'expired' || httpStatus === 410) {
    return 'This gift card link has expired. Ask the sender to resend, or contact the restaurant.';
  }
  if (s === 'cancelled') {
    return 'This gift card has been cancelled. Please contact the restaurant.';
  }
  if (s === 'depleted') {
    return 'This gift card has been fully redeemed.';
  }
  if (httpStatus >= 500) {
    return 'We couldn\u2019t load your gift card right now. Please try again in a moment.';
  }
  // 400 / 404 / unknown → generic
  return t('gift.view_invalid');
}

type ViewPayload = {
  code: string;
  masked_code: string;
  amount: number;
  current_balance: number;
  status: string;
  expires_at: string | null;
  order_number: string | null;
  from?: string | null;
  personal_note?: string | null;
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
        const body = await res.json().catch(() => ({})) as {
          message?: string;
          status?: string;
        } & Partial<ViewPayload>;
        if (!res.ok) {
          // FIX 8g: never surface `body.message` verbatim — it may leak
          // internal state (e.g. "Delivery window expired. Contact the
          // restaurant with your order number.") that scares customers.
          // Log it for support, then show a friendly mapped string.
          if (body?.message) {
            // eslint-disable-next-line no-console
            console.log('[gift-card view] server message:', body.message);
          }
          const friendly = friendlyGiftCardViewError(res.status, body?.status, t);
          const err = new Error(friendly);
          throw err;
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
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const expiresLabel = data?.expires_at
    ? t('gift.balance_expires').replace(
        '{date}',
        new Date(data.expires_at).toLocaleDateString(undefined, { dateStyle: 'medium' }),
      )
    : null;

  return (
    <div style={pageWrap}>
      <PageHeader title={t('gift.view_title')} />
      <div style={contentWrap}>
        {loading && (
          <div style={skeletonCard} aria-busy="true" aria-label={t('common.loading')}>
            <div className="skeleton" style={{ height: 14, width: '40%', borderRadius: 6 }} />
            <div className="skeleton" style={{ height: 40, width: '55%', borderRadius: 8, marginTop: 20 }} />
            <div className="skeleton" style={{ height: 16, width: '35%', borderRadius: 6, marginTop: 12 }} />
          </div>
        )}

        {error && !loading && (
          <div style={errorBox} role="alert">
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--color-error)' }}>
              {t('gift.view_title')}
            </p>
            <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--color-text)', lineHeight: 1.45 }}>
              {error}
            </p>
          </div>
        )}

        {data && !loading && (
          <>
            <div style={previewCard}>
              <div style={previewTop}>
                <span style={previewBrand}>{t('gift.preview_brand')}</span>
                <span style={previewTag}>{t('gift.preview_gift')}</span>
              </div>
              <p style={previewAmount}>
                MVR {Number(data.current_balance).toFixed(0)}
              </p>
              <p style={previewBalanceLabel}>{t('gift.view_balance')}</p>
              {data.from ? (
                <p style={previewFrom}>{data.from}</p>
              ) : null}
              {data.personal_note ? (
                <p style={previewNote}>{data.personal_note}</p>
              ) : null}
              {expiresLabel ? (
                <p style={previewMeta}>{expiresLabel}</p>
              ) : null}
              {data.order_number ? (
                <p style={previewMeta}>{data.order_number}</p>
              ) : null}
            </div>

            <section style={codeSection}>
              <p style={codeLabel}>{t('gift.view_code_label')}</p>
              <button
                type="button"
                onClick={() => void copyCode()}
                style={codeBlock}
                aria-label={t('gift.copy_code')}
              >
                <span style={codeText}>{data.code}</span>
                <span style={copyChip}>
                  {copied ? t('gift.code_copied') : t('gift.copy_code')}
                </span>
              </button>
              <p style={hintStyle}>{t('gift.view_hint')}</p>
            </section>

            <div style={actions}>
              <Link to="/menu" style={primaryBtn}>{t('gift.view_redeem')}</Link>
              <p style={counterHint}>{t('gift.view_counter')}</p>
              <Link to="/gift-cards" style={secondaryBtn}>{t('gift.back_hub')}</Link>
            </div>
          </>
        )}

        {error && !loading && (
          <div style={actions}>
            <Link to="/gift-cards" style={primaryBtn}>{t('gift.back_hub')}</Link>
            <Link to="/menu" style={secondaryBtn}>{t('gift.order_food')}</Link>
          </div>
        )}
      </div>
    </div>
  );
}

const pageWrap: CSSProperties = {
  maxWidth: 560,
  margin: '0 auto',
  padding: '0 0 2rem',
};

const contentWrap: CSSProperties = {
  padding: '0 var(--page-gutter)',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

const skeletonCard: CSSProperties = {
  borderRadius: 20,
  padding: '1.25rem 1.35rem',
  background: 'var(--color-surface-alt)',
  border: '1.5px solid var(--color-border)',
  minHeight: 160,
};

const errorBox: CSSProperties = {
  borderRadius: 16,
  padding: '1.1rem 1.15rem',
  background: 'var(--color-error-bg)',
  border: '1.5px solid rgba(220, 38, 38, 0.25)',
};

const previewCard: CSSProperties = {
  borderRadius: 20,
  padding: '1.35rem 1.4rem',
  background: 'linear-gradient(145deg, #2A1E0C 0%, #4A3420 55%, #6B4423 100%)',
  color: '#FFFDF9',
  boxShadow: '0 12px 28px rgba(42, 30, 12, 0.18)',
};

const previewTop: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  marginBottom: 18,
};

const previewBrand: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

const previewTag: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  opacity: 0.7,
};

const previewAmount: CSSProperties = {
  margin: 0,
  fontSize: 40,
  fontWeight: 900,
  lineHeight: 1,
  letterSpacing: '-0.02em',
  color: '#F5C48A',
};

const previewBalanceLabel: CSSProperties = {
  margin: '6px 0 0',
  fontSize: 12,
  fontWeight: 600,
  opacity: 0.65,
};

const previewFrom: CSSProperties = {
  margin: '14px 0 0',
  fontSize: 16,
  fontWeight: 700,
};

const previewNote: CSSProperties = {
  margin: '10px 0 0',
  fontSize: 14,
  fontStyle: 'italic',
  lineHeight: 1.45,
  opacity: 0.88,
};

const previewMeta: CSSProperties = {
  margin: '10px 0 0',
  fontSize: 12,
  fontWeight: 600,
  opacity: 0.5,
};

const codeSection: CSSProperties = {
  border: '1.5px solid var(--color-border)',
  borderRadius: 16,
  background: 'var(--color-surface)',
  padding: '1rem 1.1rem',
};

const codeLabel: CSSProperties = {
  margin: '0 0 10px',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--color-text-muted)',
};

const codeBlock: CSSProperties = {
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 12,
  padding: '1.1rem 1rem',
  borderRadius: 14,
  border: '1.5px dashed var(--color-primary)',
  background: 'var(--color-primary-light)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  minHeight: 88,
};

const codeText: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: 18,
  fontWeight: 800,
  letterSpacing: '0.1em',
  color: 'var(--color-primary-hover)',
  wordBreak: 'break-all',
  lineHeight: 1.35,
  textAlign: 'center',
};

const copyChip: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 36,
  padding: '6px 14px',
  borderRadius: 999,
  background: 'var(--color-primary)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
};

const hintStyle: CSSProperties = {
  margin: '12px 0 0',
  fontSize: 13,
  color: 'var(--color-text-muted)',
  lineHeight: 1.45,
  textAlign: 'center',
};

const actions: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

const counterHint: CSSProperties = {
  margin: 0,
  textAlign: 'center',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--color-text-muted)',
  lineHeight: 1.4,
};

const primaryBtn: CSSProperties = {
  display: 'block',
  textAlign: 'center',
  padding: '14px 16px',
  borderRadius: 14,
  background: 'var(--color-primary)',
  color: '#fff',
  fontWeight: 700,
  textDecoration: 'none',
  fontSize: 16,
  minHeight: 48,
  boxSizing: 'border-box',
};

const secondaryBtn: CSSProperties = {
  display: 'block',
  textAlign: 'center',
  padding: '12px 16px',
  borderRadius: 14,
  background: 'transparent',
  color: 'var(--color-primary)',
  border: '1.5px solid var(--color-primary)',
  fontWeight: 700,
  textDecoration: 'none',
  fontSize: 15,
  minHeight: 48,
  boxSizing: 'border-box',
};

export default GiftCardViewPage;
