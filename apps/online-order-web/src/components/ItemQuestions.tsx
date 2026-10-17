// "Ask a question" about a dish, and the answered ones, in the item sheet
// (iruali import plan, feature 7). Questions wait for staff; the customer is
// texted when one is answered.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircleQuestion } from 'lucide-react';
import { askItemQuestion, getItemQuestions, type ItemQuestion } from '../api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

const MAX = 300;

export function ItemQuestions({ itemId }: { itemId: number }) {
  const { t } = useLanguage();
  const { isAuthenticated, authReady } = useAuth();
  const [questions, setQuestions] = useState<ItemQuestion[]>([]);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    getItemQuestions(itemId).then((r) => { if (live) setQuestions(r.questions ?? []); }).catch(() => {});
    return () => { live = false; };
  }, [itemId]);

  const send = async () => {
    setBusy(true); setMsg(null);
    try {
      await askItemQuestion(itemId, text.trim());
      setText(''); setOpen(false);
      setMsg({ ok: true, text: t('question.thanks') });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message || t('question.error') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="item-questions" style={{ marginTop: '1.25rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
      <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-dark)', margin: '0 0 0.6rem' }}>{t('question.title')}</p>
      {questions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '0.75rem' }}>
          {questions.map((q) => (
            <div key={q.id} style={{ background: 'var(--color-surface-alt)', borderRadius: 10, padding: '0.7rem 0.75rem' }}>
              <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text)', overflowWrap: 'anywhere' }}>{q.question}</p>
              {q.answer && <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>{q.answer}</p>}
              {q.allergy_note && <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text)' }}>{t('question.allergy')}</p>}
            </div>
          ))}
        </div>
      )}
      {msg && <p role="status" style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: msg.ok ? 'var(--color-success)' : 'var(--color-danger)' }}>{msg.text}</p>}
      {!authReady ? null : !isAuthenticated ? (
        <Link to="/account" data-testid="question-sign-in" style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-primary)' }}>{t('question.sign_in')}</Link>
      ) : open ? (
        <div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX))}
            rows={3}
            maxLength={MAX}
            placeholder={t('question.placeholder')}
            aria-label={t('question.ask')}
            data-testid="question-text"
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--color-border)', fontSize: 16, background: 'var(--color-surface)', color: 'var(--color-text)', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{text.length}/{MAX}</span>
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || text.trim().length < 3}
              data-testid="question-send"
              style={{ padding: '8px 16px', minHeight: 36, borderRadius: 10, border: 'none', background: 'var(--color-primary)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', opacity: busy || text.trim().length < 3 ? 0.6 : 1 }}
            >
              {t('question.send')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { setOpen(true); setMsg(null); }}
          data-testid="question-ask"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', minHeight: 36, borderRadius: 10, border: '1.5px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          <MessageCircleQuestion size={15} aria-hidden /> {t('question.ask')}
        </button>
      )}
    </div>
  );
}
