import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/shell/PageHeader';
import { AuthBlock } from '../components/AuthBlock';
import { getCustomerMe } from '../api/auth';
import { purchaseGiftCard } from '../api/promotions';

const PRESETS = [100, 200, 500];

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

  const handlePay = async () => {
    if (!Number.isFinite(resolvedAmount) || resolvedAmount < 50 || resolvedAmount > 5000) {
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
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 0 2rem' }}>
        <PageHeader title={t('gift.title')} onBack={() => void navigate('/gift-cards')} />
        <div style={{ padding: '0 var(--page-gutter)' }}>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 16 }}>
            {t('gift.sign_in')}
          </p>
          <AuthBlock onSuccess={(name) => setAuth(name)} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 0 2rem' }}>
      <PageHeader title={t('gift.title')} onBack={() => void navigate('/gift-cards')} />
      <div style={{ padding: '0 var(--page-gutter)', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.45 }}>
          {t('gift.intro')}
        </p>

        <div>
          <p style={labelStyle}>{t('gift.amount')}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => { setAmount(p); setCustomAmount(''); }}
                style={{
                  ...chipStyle,
                  borderColor: !customAmount && amount === p ? 'var(--color-primary)' : 'var(--color-border)',
                  background: !customAmount && amount === p ? 'var(--color-primary-light, #FEF3E8)' : 'var(--color-surface)',
                  color: !customAmount && amount === p ? 'var(--color-primary)' : 'var(--color-text)',
                  fontWeight: !customAmount && amount === p ? 700 : 600,
                }}
              >
                MVR {p}
              </button>
            ))}
          </div>
          <input
            type="number"
            min={50}
            max={5000}
            step="1"
            placeholder={t('gift.custom_ph')}
            value={customAmount}
            onChange={(e) => { setCustomAmount(e.target.value); setAmount(null); }}
            style={{ ...inputStyle, marginTop: 10 }}
          />
        </div>

        <div>
          <p style={labelStyle}>{t('gift.recipient_section')}</p>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
            {t('gift.recipient_help')}
          </p>
          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={labelStyle}>{t('gift.phone')}</span>
            <input
              type="tel"
              placeholder="7XXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'block' }}>
            <span style={labelStyle}>{t('gift.email')}</span>
            <input
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />
          </label>
        </div>

        <div>
          <p style={labelStyle}>{t('gift.sender_section')}</p>
          <label style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            marginBottom: 12,
            cursor: 'pointer',
            fontSize: 14,
            color: 'var(--color-text)',
            lineHeight: 1.4,
          }}>
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
              style={{ marginTop: 3, width: 18, height: 18, flexShrink: 0 }}
            />
            <span>{t('gift.send_anonymous')}</span>
          </label>
          {!anonymous && (
            <label>
              <span style={labelStyle}>{t('gift.sender_name')}</span>
              <input
                value={senderName}
                maxLength={80}
                placeholder={t('gift.sender_name_ph')}
                onChange={(e) => setSenderName(e.target.value)}
                style={inputStyle}
              />
            </label>
          )}
          {anonymous && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
              {t('gift.anonymous_help')}
            </p>
          )}
        </div>

        <label>
          <span style={labelStyle}>{t('gift.note')}</span>
          <input
            value={note}
            maxLength={500}
            placeholder={t('gift.note_ph')}
            onChange={(e) => setNote(e.target.value)}
            style={inputStyle}
          />
        </label>

        {error && <p style={{ margin: 0, color: 'var(--color-error, #dc2626)', fontSize: 13 }}>{error}</p>}

        <button
          type="button"
          onClick={() => void handlePay()}
          disabled={loading}
          style={{
            ...inputStyle,
            background: 'var(--color-primary)',
            color: '#fff',
            border: 'none',
            fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? t('gift.paying') : t('gift.pay').replace('{amount}', Number.isFinite(resolvedAmount) ? resolvedAmount.toFixed(0) : '—')}
        </button>

        <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
          {t('gift.footnote')}
        </p>

        <Link to="/gift-cards" style={{ fontSize: 13, color: 'var(--color-primary)', fontWeight: 600 }}>
          {t('gift.back_hub')}
        </Link>
      </div>
    </div>
  );
}

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--color-text)',
  marginBottom: 6,
};

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '12px 14px',
  borderRadius: 12,
  border: '1.5px solid var(--color-border)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  fontSize: 15,
  fontFamily: 'inherit',
  minHeight: 48,
};

const chipStyle: CSSProperties = {
  padding: '10px 14px',
  borderRadius: 999,
  border: '1.5px solid var(--color-border)',
  background: 'var(--color-surface)',
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
  minHeight: 44,
};

export default BuyGiftCardPage;
