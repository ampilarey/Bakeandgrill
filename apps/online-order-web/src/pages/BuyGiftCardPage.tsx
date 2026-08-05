import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/shell/PageHeader';
import { AuthBlock } from '../components/AuthBlock';
import { StickyCtaBar } from '../components/ui/StickyCtaBar';
import { getCustomerMe } from '../api/auth';
import { purchaseGiftCard } from '../api/promotions';
import { fetchOnlineOrderingStatus } from '../api/menu';

const PRESETS = [100, 200, 500] as const;

export function BuyGiftCardPage() {
  usePageTitle('Buy Gift Card');
  const { t } = useLanguage();
  const { isAuthenticated, authReady, setAuth } = useAuth();
  const navigate = useNavigate();

  const [amount, setAmount] = useState<number | null>(200);
  const [customAmount, setCustomAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [senderName, setSenderName] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  /** Owner kill switch — older servers omit the flag (treat as open). */
  const [purchaseClosed, setPurchaseClosed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchOnlineOrderingStatus()
      .then((gate) => {
        if (!cancelled) setPurchaseClosed(gate.gift_cards?.open === false);
      })
      .catch(() => { /* keep open */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    let cancelled = false;
    void getCustomerMe()
      .then((res) => {
        if (cancelled) return;
        const name = (res.customer.name || '').trim();
        if (name) setSenderName((prev) => prev || name);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [authReady, isAuthenticated]);

  const resolvedAmount = customAmount.trim()
    ? parseFloat(customAmount)
    : (amount ?? NaN);
  // FIX 8d: whole-MVR only. Reject decimals client-side so the Pay
  // label matches what the server will actually charge — a "100.50"
  // in the custom input previously rendered "MVR 101" (toFixed(0)
  // rounds) and then failed server-side after redirecting to BML.
  const isWholeAmount = Number.isFinite(resolvedAmount) && Number.isInteger(resolvedAmount);
  const amountLabel = isWholeAmount && resolvedAmount > 0
    ? String(resolvedAmount)
    : '—';
  const fromPreview = anonymous
    ? 'Anonymous gift'
    : (senderName.trim() ? `From: ${senderName.trim()}` : 'From: …');

  const handlePay = async () => {
    if (
      !Number.isFinite(resolvedAmount)
      || !Number.isInteger(resolvedAmount)
      || resolvedAmount < 50
      || resolvedAmount > 5000
    ) {
      setError(t('gift.err_amount'));
      return;
    }
    if (!phone.trim() && !email.trim()) {
      setError(t('gift.err_contact'));
      return;
    }
    if (!anonymous && !senderName.trim()) {
      setError(t('gift.err_sender'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await purchaseGiftCard({
        amount: resolvedAmount,
        recipient_phone: phone.trim() || null,
        recipient_email: email.trim() || null,
        personal_note: note.trim() || null,
        sender_name: anonymous ? null : senderName.trim(),
        send_anonymously: anonymous,
      });
      if (res.payment_url) {
        window.location.href = res.payment_url;
        return;
      }
      void navigate(`/gift-cards/success?orderId=${res.order_id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!authReady) {
    return (
      <div style={{ padding: 'var(--page-gutter)' }}>
        <PageHeader title={t('gift.title')} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={pageWrap}>
        <PageHeader title={t('gift.title')} onBack={() => void navigate('/gift-cards')} />
        <div style={{ padding: '0 var(--page-gutter)' }}>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 16, lineHeight: 1.45 }}>
            {t('gift.sign_in')}
          </p>
          <AuthBlock onSuccess={(name) => setAuth(name)} />
        </div>
      </div>
    );
  }

  return (
    <div style={pageWrap}>
      <PageHeader title={t('gift.title')} onBack={() => void navigate('/gift-cards')} />

      <div style={contentWrap}>
        {/* Live preview — what the recipient’s message is about */}
        <div style={previewCard} aria-live="polite">
          <div style={previewTop}>
            <span style={previewBrand}>{t('gift.preview_brand')}</span>
            <span style={previewTag}>{t('gift.preview_gift')}</span>
          </div>
          <p style={previewAmount}>MVR {amountLabel}</p>
          <p style={previewFrom}>{fromPreview}</p>
          {note.trim() ? (
            <p style={previewNote}>{note.trim()}</p>
          ) : null}
          <p style={previewHint}>{t('gift.preview_code_hint')}</p>
        </div>

        <p style={introStyle}>{t('gift.intro')}</p>

        <Section title={t('gift.amount')}>
          <div style={presetGrid} role="group" aria-label={t('gift.amount')}>
            {PRESETS.map((p) => {
              const selected = !customAmount && amount === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => { setAmount(p); setCustomAmount(''); }}
                  style={{
                    ...presetBtn,
                    borderColor: selected ? 'var(--color-primary)' : 'var(--color-border)',
                    background: selected ? 'var(--color-primary)' : 'var(--color-surface)',
                    color: selected ? '#fff' : 'var(--color-text)',
                    fontWeight: selected ? 800 : 600,
                  }}
                  aria-pressed={selected}
                >
                  <span style={{ fontSize: 12, opacity: selected ? 0.9 : 0.65, fontWeight: 600 }}>MVR</span>
                  <span style={{ fontSize: 20, lineHeight: 1.1 }}>{p}</span>
                </button>
              );
            })}
          </div>
          <div style={customRow}>
            <span style={customPrefix}>MVR</span>
            <input
              type="number"
              min={50}
              max={5000}
              step="1"
              inputMode="numeric"
              placeholder={t('gift.custom_ph')}
              value={customAmount}
              onChange={(e) => { setCustomAmount(e.target.value); setAmount(null); }}
              style={customInput}
            />
          </div>
        </Section>

        <Section title={t('gift.recipient_section')} hint={t('gift.recipient_help')}>
          <label style={fieldLabel}>
            <span style={labelStyle}>{t('gift.phone')}</span>
            <input
              type="tel"
              placeholder="7XXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={inputStyle}
              autoComplete="tel"
            />
          </label>
          <label style={{ ...fieldLabel, marginBottom: 0 }}>
            <span style={labelStyle}>{t('gift.email')}</span>
            <input
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              autoComplete="email"
            />
          </label>
        </Section>

        <Section title={t('gift.sender_section')}>
          <div style={segmentWrap} role="group" aria-label={t('gift.sender_section')}>
            <button
              type="button"
              onClick={() => setAnonymous(false)}
              style={{
                ...segmentBtn,
                background: !anonymous ? 'var(--color-primary)' : 'transparent',
                color: !anonymous ? '#fff' : 'var(--color-text)',
                fontWeight: !anonymous ? 700 : 600,
              }}
              aria-pressed={!anonymous}
            >
              {t('gift.sender_named')}
            </button>
            <button
              type="button"
              onClick={() => setAnonymous(true)}
              style={{
                ...segmentBtn,
                background: anonymous ? 'var(--color-primary)' : 'transparent',
                color: anonymous ? '#fff' : 'var(--color-text)',
                fontWeight: anonymous ? 700 : 600,
              }}
              aria-pressed={anonymous}
            >
              {t('gift.sender_anon')}
            </button>
          </div>
          {!anonymous ? (
            <label style={{ ...fieldLabel, marginBottom: 0, marginTop: 12 }}>
              <span style={labelStyle}>{t('gift.sender_name')}</span>
              <input
                value={senderName}
                maxLength={80}
                placeholder={t('gift.sender_name_ph')}
                onChange={(e) => setSenderName(e.target.value)}
                style={inputStyle}
                autoComplete="name"
              />
            </label>
          ) : (
            <p style={hintStyle}>{t('gift.anonymous_help')}</p>
          )}
        </Section>

        <Section title={t('gift.note')}>
          <textarea
            value={note}
            maxLength={500}
            placeholder={t('gift.note_ph')}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            style={textareaStyle}
          />
        </Section>

        {error && (
          <p style={errorStyle} role="alert">{error}</p>
        )}

        <Link to="/gift-cards" style={backLink}>
          {t('gift.back_hub')}
        </Link>
      </div>

      <StickyCtaBar
        label={purchaseClosed
          ? 'Gift cards unavailable right now'
          : loading ? t('gift.paying') : t('gift.pay').replace('{amount}', amountLabel)}
        onClick={() => void handlePay()}
        loading={loading}
        disabled={loading || purchaseClosed}
        above={(
          <>
            {purchaseClosed && (
              <div className="banner banner-warning" style={{ marginBottom: 12 }} data-testid="gift-purchase-closed">
                <span className="banner-icon">🔒</span>
                <div>
                  <p className="banner-title">Gift card purchase is paused</p>
                  <p className="banner-sub">Please try again later or call us.</p>
                </div>
              </div>
            )}
            <p style={footnoteStyle}>{t('gift.footnote')}</p>
          </>
        )}
      />
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section style={sectionStyle}>
      <h2 style={sectionTitle}>{title}</h2>
      {hint ? <p style={sectionHint}>{hint}</p> : null}
      {children}
    </section>
  );
}

const pageWrap: CSSProperties = {
  maxWidth: 560,
  margin: '0 auto',
  padding: '0 0 0.5rem',
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100%',
};

const contentWrap: CSSProperties = {
  padding: '0 var(--page-gutter)',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  flex: 1,
};

const previewCard: CSSProperties = {
  marginTop: 4,
  borderRadius: 20,
  padding: '1.25rem 1.35rem',
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
  margin: '0 0 6px',
  fontSize: 36,
  fontWeight: 900,
  lineHeight: 1,
  letterSpacing: '-0.02em',
  color: '#F5C48A',
};

const previewFrom: CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 600,
  opacity: 0.95,
};

const previewNote: CSSProperties = {
  margin: '10px 0 0',
  fontSize: 14,
  fontStyle: 'italic',
  lineHeight: 1.4,
  opacity: 0.85,
};

const previewHint: CSSProperties = {
  margin: '16px 0 0',
  fontSize: 12,
  fontWeight: 600,
  opacity: 0.55,
};

const introStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: 'var(--color-text-muted)',
  lineHeight: 1.45,
};

const sectionStyle: CSSProperties = {
  border: '1.5px solid var(--color-border)',
  borderRadius: 16,
  background: 'var(--color-surface)',
  padding: '1rem 1.1rem',
};

const sectionTitle: CSSProperties = {
  margin: '0 0 4px',
  fontSize: 15,
  fontWeight: 800,
  color: 'var(--color-text)',
  letterSpacing: '-0.01em',
};

const sectionHint: CSSProperties = {
  margin: '0 0 12px',
  fontSize: 12,
  color: 'var(--color-text-muted)',
  lineHeight: 1.4,
};

const presetGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 8,
};

const presetBtn: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 2,
  minHeight: 64,
  padding: '10px 8px',
  borderRadius: 14,
  border: '1.5px solid var(--color-border)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background 0.15s var(--ease-out), border-color 0.15s var(--ease-out)',
};

const customRow: CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  marginTop: 10,
  borderRadius: 12,
  border: '1.5px solid var(--color-border)',
  overflow: 'hidden',
  background: 'var(--color-bg)',
};

const customPrefix: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '0 12px',
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--color-text-muted)',
  background: 'var(--color-surface-alt)',
  borderRight: '1.5px solid var(--color-border)',
};

const customInput: CSSProperties = {
  flex: 1,
  minWidth: 0,
  border: 'none',
  outline: 'none',
  padding: '12px 14px',
  fontSize: 15,
  fontFamily: 'inherit',
  background: 'transparent',
  color: 'var(--color-text)',
  minHeight: 48,
};

const fieldLabel: CSSProperties = {
  display: 'block',
  marginBottom: 12,
};

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--color-text-muted)',
  marginBottom: 6,
  letterSpacing: '0.02em',
};

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '12px 14px',
  borderRadius: 12,
  border: '1.5px solid var(--color-border)',
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  fontSize: 15,
  fontFamily: 'inherit',
  minHeight: 48,
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  resize: 'vertical',
  minHeight: 88,
  lineHeight: 1.45,
};

const segmentWrap: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 4,
  padding: 4,
  borderRadius: 12,
  background: 'var(--color-bg)',
  border: '1.5px solid var(--color-border)',
};

const segmentBtn: CSSProperties = {
  minHeight: 44,
  border: 'none',
  borderRadius: 10,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 13,
  padding: '8px 10px',
  transition: 'background 0.15s var(--ease-out)',
};

const hintStyle: CSSProperties = {
  margin: '12px 0 0',
  fontSize: 12,
  color: 'var(--color-text-muted)',
  lineHeight: 1.4,
};

const errorStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-error)',
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1.4,
  padding: '10px 12px',
  borderRadius: 12,
  background: 'var(--color-error-bg)',
};

const footnoteStyle: CSSProperties = {
  margin: '0 0 8px',
  fontSize: 12,
  color: 'var(--color-text-muted)',
  lineHeight: 1.4,
  textAlign: 'center',
};

const backLink: CSSProperties = {
  fontSize: 13,
  color: 'var(--color-primary)',
  fontWeight: 600,
  textAlign: 'center',
  padding: '4px 0 8px',
};

export default BuyGiftCardPage;
