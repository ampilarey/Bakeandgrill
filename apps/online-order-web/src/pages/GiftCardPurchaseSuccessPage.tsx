import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { PageHeader } from '../components/shell/PageHeader';
import { AuthBlock } from '../components/AuthBlock';
import { getGiftCardPurchaseStatus, resendGiftCardPurchaseDelivery } from '../api/promotions';

type Status = Awaited<ReturnType<typeof getGiftCardPurchaseStatus>>;

function deliveryOk(res: Status): boolean {
  return res.delivery?.sms_ok === true || res.delivery?.email_ok === true;
}

export function GiftCardPurchaseSuccessPage() {
  usePageTitle('Gift Card');
  const { t } = useLanguage();
  const { isAuthenticated, authReady, setAuth } = useAuth();
  const site = useSiteSettings();
  const [params] = useSearchParams();
  const orderId = Number(params.get('orderId') || 0);
  const paymentState = params.get('payment') || '';
  const waBase = site.business_whatsapp || 'https://wa.me/9609120011';

  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [resendBusy, setResendBusy] = useState<'sms' | 'email' | 'both' | null>(null);
  const [resendMsg, setResendMsg] = useState('');

  useEffect(() => {
    if (!authReady || !isAuthenticated || !orderId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    let tries = 0;
    // Longer window when return URL said CONFIRMED — server may still be issuing / re-delivering.
    const maxTries = paymentState === 'CONFIRMED' ? 20 : 12;

    const poll = async () => {
      try {
        const res = await getGiftCardPurchaseStatus(orderId);
        if (cancelled) return;
        setStatus(res);
        setError('');
        const done = res.issued && (deliveryOk(res) || !!res.code || tries >= maxTries);
        if (done) {
          setLoading(false);
          return;
        }
        if (tries < maxTries) {
          tries += 1;
          window.setTimeout(() => { void poll(); }, 1500);
        } else {
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setLoading(false);
        }
      }
    };

    void poll();
    return () => { cancelled = true; };
  }, [authReady, isAuthenticated, orderId, paymentState]);

  const handleResend = async (channel: 'sms' | 'email' | 'both') => {
    if (!orderId || resendBusy) return;
    setResendBusy(channel);
    setResendMsg('');
    try {
      const res = await resendGiftCardPurchaseDelivery(orderId, channel);
      setStatus((prev) => (prev ? {
        ...prev,
        delivery: res.delivery,
        code: res.code ?? (deliveryOk({ ...prev, delivery: res.delivery }) ? null : prev.code),
      } : prev));
      setResendMsg(t('gift.resend_ok'));
    } catch (e) {
      const body = (e as { body?: { code?: string; delivery?: Status['delivery']; message?: string } }).body;
      if (body?.delivery || body?.code) {
        setStatus((prev) => (prev ? {
          ...prev,
          delivery: body.delivery ?? prev.delivery,
          code: body.code ?? prev.code,
        } : prev));
      }
      setResendMsg(body?.message || (e as Error).message || t('gift.resend_fail'));
    } finally {
      setResendBusy(null);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setResendMsg(t('gift.code_copied'));
    } catch {
      setResendMsg(t('gift.code_copy_fail'));
    }
  };

  if (!authReady) return null;

  if (!isAuthenticated) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 0 2rem' }}>
        <PageHeader title={t('gift.success_title')} />
        <div style={{ padding: '0 var(--page-gutter)' }}>
          <AuthBlock onSuccess={(name) => setAuth(name)} />
        </div>
      </div>
    );
  }

  if (!orderId) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 var(--page-gutter) 2rem' }}>
        <PageHeader title={t('gift.success_title')} />
        <p style={{ color: 'var(--color-error, #dc2626)' }}>{t('gift.err_missing_order')}</p>
        <Link to="/gift-cards/buy">{t('gift.buy_again')}</Link>
      </div>
    );
  }

  const failed = paymentState && paymentState !== 'CONFIRMED' && !status?.issued;
  const delivery = status?.delivery;
  const canResend = delivery?.can_resend === true;
  const showSmsResend = canResend && !!delivery?.phone;
  const showEmailResend = canResend && !!delivery?.email;
  const deliveryFailed = !!status?.issued && !deliveryOk(status);
  const waHref = (() => {
    const orderNo = status?.order_number || String(orderId);
    const text = encodeURIComponent(
      `Hi, I bought a gift card (order ${orderNo}) but did not receive the full code. Please help.`,
    );
    const base = waBase.split('?')[0];
    return `${base}?text=${text}`;
  })();

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 0 2rem' }}>
      <PageHeader title={t('gift.success_title')} />
      <div style={{ padding: '0 var(--page-gutter)', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {failed && (
          <p style={{ margin: 0, color: 'var(--color-error, #dc2626)', fontSize: 14 }}>
            {t('gift.payment_not_confirmed')}
          </p>
        )}

        {loading && !status?.issued && (
          <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 14 }}>{t('gift.issuing')}</p>
        )}

        {error && <p style={{ margin: 0, color: 'var(--color-error, #dc2626)', fontSize: 13 }}>{error}</p>}

        {status?.issued && status.gift_card && (
          <div style={{
            background: 'var(--color-surface-alt)',
            border: '1px solid var(--color-border)',
            borderRadius: 16,
            padding: 20,
            textAlign: 'center',
          }}>
            <p style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: 'var(--color-text)' }}>
              {t('gift.ready')}
            </p>
            {status.code ? (
              <>
                <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                  {t('gift.code_on_screen')}
                </p>
                <p style={{ margin: '0 0 4px', fontFamily: 'monospace', fontSize: 20, letterSpacing: '0.08em', color: 'var(--color-primary)', fontWeight: 700 }}>
                  {status.code}
                </p>
                <button
                  type="button"
                  onClick={() => void copyCode(status.code!)}
                  style={{ ...resendBtn, marginTop: 8 }}
                >
                  {t('gift.copy_code')}
                </button>
              </>
            ) : (
              <p style={{ margin: '0 0 4px', fontFamily: 'monospace', fontSize: 20, letterSpacing: '0.08em', color: 'var(--color-primary)', fontWeight: 700 }}>
                {status.gift_card.masked_code}
              </p>
            )}
            <p style={{ margin: '8px 0 0', fontSize: 15, fontWeight: 700 }}>
              MVR {Number(status.gift_card.current_balance).toFixed(2)}
            </p>
            <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.45 }}>
              {status.code ? t('gift.code_on_screen_help') : deliveryMessage(status, t)}
            </p>

            {(showSmsResend || showEmailResend) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 16 }}>
                {showSmsResend && (
                  <button
                    type="button"
                    disabled={!!resendBusy}
                    onClick={() => void handleResend('sms')}
                    style={resendBtn}
                  >
                    {resendBusy === 'sms' ? '…' : t('gift.resend_sms')}
                  </button>
                )}
                {showEmailResend && (
                  <button
                    type="button"
                    disabled={!!resendBusy}
                    onClick={() => void handleResend('email')}
                    style={resendBtn}
                  >
                    {resendBusy === 'email' ? '…' : t('gift.resend_email')}
                  </button>
                )}
                {(showSmsResend || showEmailResend) && delivery?.phone && delivery?.email && (
                  <button
                    type="button"
                    disabled={!!resendBusy}
                    onClick={() => void handleResend('both')}
                    style={resendBtn}
                  >
                    {resendBusy === 'both' ? '…' : t('gift.resend_both')}
                  </button>
                )}
              </div>
            )}
            {resendMsg && (
              <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>{resendMsg}</p>
            )}
            {canResend && (
              <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
                {t('gift.resend_window')}
              </p>
            )}
            {deliveryFailed && (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...resendBtn, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 12, textDecoration: 'none' }}
              >
                {t('gift.whatsapp_help')}
              </a>
            )}
          </div>
        )}

        {!loading && !status?.issued && !failed && (
          <div
            style={{
              padding: '0.9rem 1rem',
              borderRadius: 14,
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-alt)',
            }}
          >
            <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text)', fontWeight: 700, lineHeight: 1.4 }}>
              {status?.payment_status === 'paid' || status?.status === 'paid' || status?.status === 'completed'
                ? t('gift.issuing_pending_title')
                : t('gift.payment_pending_title')}
            </p>
            <p style={{ margin: '0.45rem 0 0', fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.45 }}>
              {(status?.payment_status === 'paid' || status?.status === 'paid' || status?.status === 'completed'
                ? t('gift.issuing_pending_help')
                : t('gift.payment_pending_help')
              ).replace(
                '{order}',
                status?.order_number || String(orderId),
              )}
            </p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!status?.issued && (
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setError('');
                void getGiftCardPurchaseStatus(orderId)
                  .then((res) => {
                    setStatus(res);
                    setLoading(false);
                  })
                  .catch((e) => {
                    setError((e as Error).message);
                    setLoading(false);
                  });
              }}
              style={{ ...linkBtn, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {t('gift.retry_status')}
            </button>
          )}
          <Link to="/gift-cards" style={{ ...linkBtn, background: 'var(--color-surface)', color: 'var(--color-primary)', border: '1.5px solid var(--color-primary)' }}>
            {t('gift.back_hub')}
          </Link>
          <Link to="/menu" style={linkBtn}>{t('gift.order_food')}</Link>
          <Link to="/gift-cards/buy" style={{ ...linkBtn, background: 'transparent', color: 'var(--color-primary)', border: '1.5px solid var(--color-primary)' }}>
            {t('gift.buy_again')}
          </Link>
        </div>
      </div>
    </div>
  );
}

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

const resendBtn: CSSProperties = {
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

function deliveryMessage(
  status: Status,
  t: (key: string) => string,
): string {
  const d = status.delivery;
  const triedSms = d.phone != null && d.phone !== '';
  const triedEmail = d.email != null && d.email !== '';
  const smsOk = d.sms_ok === true;
  const emailOk = d.email_ok === true;
  const anyOk = smsOk || emailOk;
  const anyFail =
    (triedSms && d.sms_ok === false) || (triedEmail && d.email_ok === false);

  if (anyOk && !anyFail) {
    const dest = [smsOk ? d.phone : null, emailOk ? d.email : null]
      .filter(Boolean)
      .join(' / ');
    return t('gift.delivery_ok').replace('{dest}', dest || '—');
  }

  if (anyFail || (triedSms || triedEmail)) {
    const parts: string[] = [];
    if (triedSms) {
      parts.push(smsOk ? `SMS ✓ ${d.phone}` : `SMS ✗ ${d.phone}`);
    }
    if (triedEmail) {
      parts.push(emailOk ? `Email ✓ ${d.email}` : `Email ✗ ${d.email}`);
    }
    if (anyOk) {
      return t('gift.delivery_partial').replace('{detail}', parts.join(' · '));
    }
    return t('gift.delivery_failed').replace('{order}', status.order_number);
  }

  return t('gift.delivery_failed').replace('{order}', status.order_number);
}

export default GiftCardPurchaseSuccessPage;
