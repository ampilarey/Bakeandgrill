// "Message us" on the order page (iruali import plan, feature 9): "please add
// extra sauce", "I'm running late". Open while the order is and for two days
// after it is done; staff reply from the order and the customer is texted.
import { useEffect, useState } from 'react';
import { Camera, MessageSquare, X } from 'lucide-react';
import { getOrderMessages, sendOrderMessage, type OrderMessage } from '../api';
import { useLanguage } from '../context/LanguageContext';

const MAX = 1000;

export function OrderMessages({ token }: { token: string }) {
  const { t } = useLanguage();
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => getOrderMessages(token)
    .then((r) => { setMessages(r.messages ?? []); setCanWrite(Boolean(r.can_write)); })
    .catch(() => {})
    .finally(() => setLoaded(true));
  useEffect(() => { void load(); }, [token]);

  if (!loaded || (!canWrite && messages.length === 0)) return null;

  const send = async () => {
    setBusy(true); setError('');
    try {
      await sendOrderMessage(token, text.trim(), photo);
      setText(''); setPhoto(null); setOpen(false);
      await load();
    } catch (e) {
      setError((e as Error).message || t('orderMsg.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="order-messages" style={{ margin: '1rem 0', padding: '0.9rem 1rem', border: '1px solid var(--color-border)', borderRadius: 14, background: 'var(--color-surface)' }}>
      <p style={{ margin: '0 0 0.5rem', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text)' }}>
        <MessageSquare size={16} aria-hidden /> {t('orderMsg.title')}
      </p>
      {messages.length > 0 && (
        <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
          {messages.map((m) => (
            <div key={m.id} style={{
              justifySelf: m.from === 'customer' ? 'end' : 'start', maxWidth: '85%', padding: '8px 10px', borderRadius: 12, fontSize: 14,
              background: m.from === 'customer' ? 'var(--color-surface-alt)' : 'var(--color-bg)', border: '1px solid var(--color-border)',
            }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 2 }}>
                {m.from === 'customer' ? t('orderMsg.you') : t('orderMsg.shop')} · {new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </div>
              <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: 'var(--color-text)' }}>{m.body}</div>
              {m.photo_url && <img src={m.photo_url} alt="" style={{ marginTop: 6, maxWidth: 160, borderRadius: 8, display: 'block' }} />}
            </div>
          ))}
        </div>
      )}
      {canWrite && (open ? (
        <div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX))}
            rows={3}
            maxLength={MAX}
            placeholder={t('orderMsg.placeholder')}
            aria-label={t('orderMsg.title')}
            data-testid="order-message-text"
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--color-border)', fontSize: 16, background: 'var(--color-surface)', color: 'var(--color-text)', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            {photo ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--color-text-muted)' }}>
                {photo.name}
                <button type="button" aria-label={t('review.photo_remove')} onClick={() => setPhoto(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--color-text-muted)' }}><X size={14} aria-hidden /></button>
              </span>
            ) : (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                <Camera size={14} aria-hidden /> {t('orderMsg.photo')}
                <input type="file" accept="image/*" style={{ display: 'none' }} data-testid="order-message-photo" onChange={(e) => { setPhoto(e.target.files?.[0] ?? null); e.target.value = ''; }} />
              </label>
            )}
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || text.trim() === ''}
              data-testid="order-message-send"
              style={{ marginLeft: 'auto', padding: '8px 16px', minHeight: 36, borderRadius: 10, border: 'none', background: 'var(--color-primary)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', opacity: busy || text.trim() === '' ? 0.6 : 1 }}
            >
              {t('orderMsg.send')}
            </button>
          </div>
          {error && <p role="alert" style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-danger)' }}>{error}</p>}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="order-message-open"
          style={{ padding: '8px 14px', minHeight: 36, borderRadius: 10, border: '1.5px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {t('orderMsg.open')}
        </button>
      ))}
      <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--color-text-muted)' }}>{t('orderMsg.hint')}</p>
    </div>
  );
}
