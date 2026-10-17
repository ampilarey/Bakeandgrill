// A dish's reviews in the item sheet: stars, photos, the verified mark, Helpful
// and the restaurant's reply (iruali import plan, feature 6).
import { useState } from 'react';
import { BadgeCheck, ThumbsUp } from 'lucide-react';
import { markReviewHelpful, type ItemReview } from '../api';
import { API_ORIGIN } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export function ItemReviewList({ reviews }: { reviews: ItemReview[] }) {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [voted, setVoted] = useState<Record<number, boolean>>({});
  const [note, setNote] = useState<{ id: number; text: string } | null>(null);

  const helpful = async (rv: ItemReview) => {
    if (!isAuthenticated) { setNote({ id: rv.id, text: t('review.helpful_sign_in') }); return; }
    setVoted((v) => ({ ...v, [rv.id]: true }));
    try {
      const res = await markReviewHelpful(rv.id);
      setCounts((c) => ({ ...c, [rv.id]: res.helpful_count }));
    } catch (e) {
      setVoted((v) => ({ ...v, [rv.id]: false }));
      setNote({ id: rv.id, text: (e as Error).message });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }} data-testid="item-reviews">
      {reviews.map((rv) => {
        const count = counts[rv.id] ?? rv.helpful_count ?? 0;
        return (
          <div key={rv.id} style={{ background: 'var(--color-surface-alt)', borderRadius: 10, padding: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} style={{ fontSize: 11, color: i < rv.rating ? '#F59E0B' : 'var(--color-border)' }}>★</span>
              ))}
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 4 }}>
                {new Date(rv.created_at).toLocaleDateString()}
              </span>
              {rv.verified && (
                <span data-testid={`review-verified-${rv.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: 'var(--color-success)' }}>
                  <BadgeCheck size={12} aria-hidden /> {t('review.verified')}
                </span>
              )}
            </div>
            {rv.comment && <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>{rv.comment}</p>}
            {(rv.photos?.length ?? 0) > 0 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                {rv.photos!.map((p, n) => (
                  <a key={n} href={`${API_ORIGIN}${p.url}`} target="_blank" rel="noopener noreferrer" aria-label={t('review.photo_n').replace('{n}', String(n + 1))}>
                    <img src={`${API_ORIGIN}${p.thumb_url}`} alt="" loading="lazy" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                  </a>
                ))}
              </div>
            )}
            {rv.reply && (
              <div data-testid={`review-reply-${rv.id}`} style={{ marginTop: 8, padding: '0.5rem 0.65rem', borderLeft: '3px solid var(--color-primary)', background: 'var(--color-surface)', borderRadius: '0 8px 8px 0' }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--color-primary)' }}>{t('review.reply_from')}</p>
                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--color-text)', lineHeight: 1.4 }}>{rv.reply.text}</p>
              </div>
            )}
            <button
              type="button"
              onClick={() => void helpful(rv)}
              disabled={voted[rv.id]}
              aria-pressed={Boolean(voted[rv.id])}
              data-testid={`review-helpful-${rv.id}`}
              style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', minHeight: 32, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: voted[rv.id] ? 'var(--color-primary)' : 'var(--color-text-muted)', fontSize: 12, fontWeight: 600, cursor: voted[rv.id] ? 'default' : 'pointer', fontFamily: 'inherit' }}
            >
              <ThumbsUp size={12} aria-hidden /> {t('review.helpful')}{count > 0 ? ` · ${count}` : ''}
            </button>
            {note?.id === rv.id && <p role="status" style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-muted)' }}>{note.text}</p>}
          </div>
        );
      })}
    </div>
  );
}
