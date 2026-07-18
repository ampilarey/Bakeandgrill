import { useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/shell/PageHeader';
import { AuthBlock } from '../components/AuthBlock';
import { purchaseGiftCard } from '../api/promotions';

const PRESETS = [100, 200, 500];

export function BuyGiftCardPage() {
  usePageTitle('Buy Gift Card');
  const { t } = useLanguage();
  const { isAuthenticated, authReady } = useAuth();
  const navigate = useNavigate();

  const [amount, setAmount] = useState<number | null>(200);
  const [customAmount, setCustomAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const resolvedAmount = customAmount.trim()
    ? parseFloat(customAmount)
    : (amount ?? NaN);

  const handlePay = async () => {
    if (!Number.isFinite(resolvedAmount) || resolvedAmount < 50) {
      setError(t('gift.err_amount'));
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
        <PageHeader title={t('gift.title')} onBack={() => void navigate(-1)} />
        <div style={{ padding: '0 var(--page-gutter)' }}>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 16 }}>
            {t('gift.sign_in')}
          </p>
          <AuthBlock onSuccess={() => undefined} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 0 2rem' }}>
      <PageHeader title={t('gift.title')} onBack={() => void navigate(-1)} />
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

        <label>
          <span style={labelStyle}>{t('gift.phone')}</span>
          <input
            type="tel"
            placeholder="7XXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={inputStyle}
          />
        </label>

        <label>
          <span style={labelStyle}>{t('gift.email')}</span>
          <input
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
        </label>

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

        <Link to="/account" style={{ fontSize: 13, color: 'var(--color-primary)', fontWeight: 600 }}>
          {t('gift.back_account')}
        </Link>
      </div>
    </div>
  );
}

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

const chipStyle: CSSProperties = {
  padding: '10px 16px',
  borderRadius: 12,
  border: '1.5px solid var(--color-border)',
  cursor: 'pointer',
  fontSize: 14,
  fontFamily: 'inherit',
};

export default BuyGiftCardPage;
