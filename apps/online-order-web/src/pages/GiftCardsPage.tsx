import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/shell/PageHeader';
import { AuthBlock } from '../components/AuthBlock';
import { fetchCustomerOrders } from '../api';
import type { Order } from '../api';
import { checkGiftCardBalance } from '../api/promotions';
import { isGiftCardOrder } from '../utils/giftCardOrder';

function ordersFromResponse(res: unknown): Order[] {
  if (Array.isArray(res)) return res as Order[];
  if (!res || typeof res !== 'object') return [];
  const o = res as Record<string, unknown>;
  const d = o.data;
  if (Array.isArray(d)) return d as Order[];
  if (d && typeof d === 'object') {
    const inner = (d as Record<string, unknown>).data;
    if (Array.isArray(inner)) return inner as Order[];
  }
  if (Array.isArray(o.orders)) return o.orders as Order[];
  return [];
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function purchaseStatusLabel(order: Order, t: (k: string) => string): string {
  if (order.status === 'completed' || order.payment_status === 'paid') {
    if (order.status === 'completed') return t('gift.history_ready');
    return t('gift.history_paid');
  }
  if (order.status === 'cancelled') return t('gift.history_cancelled');
  if (order.status === 'payment_pending' || order.payment_status === 'unpaid') {
    return t('gift.history_pending');
  }
  return order.status;
}

/**
 * Gift cards hub — bottom-nav destination.
 * Buy flow lives at /gift-cards/buy; balance check is inline (no login required).
 * Purchase history shows for signed-in customers.
 */
export function GiftCardsPage() {
  const { t } = useLanguage();
  usePageTitle(t('gift.hub_title'));
  const { isAuthenticated, authReady, setAuth } = useAuth();

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    masked_code: string;
    available_balance: number;
    held_balance: number;
    expires_at: string | null;
  } | null>(null);

  const [purchases, setPurchases] = useState<Order[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [showSignIn, setShowSignIn] = useState(false);

  useEffect(() => {
    if (!authReady) return;
    if (!isAuthenticated) {
      setPurchases([]);
      setHistoryLoading(false);
      setHistoryError('');
      return;
    }

    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError('');
    fetchCustomerOrders()
      .then((res) => {
        if (cancelled) return;
        const list = ordersFromResponse(res)
          .filter(isGiftCardOrder)
          .sort((a, b) => {
            const ta = new Date(a.created_at ?? 0).getTime();
            const tb = new Date(b.created_at ?? 0).getTime();
            return tb - ta;
          });
        setPurchases(list);
      })
      .catch(() => {
        if (!cancelled) setHistoryError(t('gift.history_fail'));
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => { cancelled = true; };
  }, [authReady, isAuthenticated, t]);

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
          <p style={{ ...cardTitle, marginBottom: 4 }}>{t('gift.history_title')}</p>
          <p style={{ ...cardSub, marginBottom: 12 }}>{t('gift.history_sub')}</p>

          {!authReady && (
            <div className="skeleton" style={{ height: 64, borderRadius: 12 }} />
          )}

          {authReady && !isAuthenticated && !showSignIn && (
            <button
              type="button"
              onClick={() => setShowSignIn(true)}
              style={{
                ...inputStyle,
                background: 'var(--color-surface-alt)',
                border: '1.5px solid var(--color-border)',
                fontWeight: 700,
                color: 'var(--color-primary)',
                cursor: 'pointer',
              }}
            >
              {t('gift.history_sign_in')}
            </button>
          )}

          {authReady && !isAuthenticated && showSignIn && (
            <AuthBlock onSuccess={(name) => { setAuth(name); setShowSignIn(false); }} />
          )}

          {authReady && isAuthenticated && historyLoading && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>
              {t('common.loading')}…
            </p>
          )}

          {authReady && isAuthenticated && historyError && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-error, #dc2626)' }}>
              {historyError}
            </p>
          )}

          {authReady && isAuthenticated && !historyLoading && !historyError && purchases.length === 0 && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
              {t('gift.history_empty')}
            </p>
          )}

          {authReady && isAuthenticated && purchases.length > 0 && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {purchases.map((order) => (
                <li key={order.id}>
                  <Link
                    to={`/gift-cards/success?orderId=${order.id}`}
                    style={historyRow}
                  >
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-dark)' }}>
                        {order.order_number ?? `#${order.id}`}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                        {fmtDate(order.created_at)} · {purchaseStatusLabel(order, t)}
                      </span>
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-primary)', whiteSpace: 'nowrap' }}>
                      MVR {Number(order.total).toFixed(2)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

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

const historyRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  padding: '12px 14px',
  background: 'var(--color-surface-alt)',
  borderRadius: 12,
  textDecoration: 'none',
  color: 'inherit',
  minHeight: 52,
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
