import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  PageHeader, PageShell, TableCard, TD, Badge, Btn, Pagination, EmptyState, StatCard, Modal, ModalActions,
} from '../components/SharedUI';
import { SortFilterHead, useSortFilter } from '../components/TableControls';
import { fetchAdminReviews, fetchReviewPhoto, moderateReview, replyToReview, type Review } from '../api';
import { Star, ChevronDown, ChevronUp, BadgeCheck, ThumbsUp } from 'lucide-react';

/** A review's photos as thumbnails, loaded through the staff route; a tap opens the full one (feature 6). */
function ReviewPhotos({ review }: { review: Review }) {
  const count = review.photos?.length ?? 0;
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [full, setFull] = useState<string | null>(null);
  useEffect(() => {
    if (count === 0) return;
    let live = true;
    const urls: string[] = [];
    Promise.all(Array.from({ length: count }, (_, n) => fetchReviewPhoto(review.id, n, true).then((b) => URL.createObjectURL(b)).catch(() => '')))
      .then((list) => { urls.push(...list); if (live) setThumbs(list); });
    return () => { live = false; urls.forEach((u) => u && URL.revokeObjectURL(u)); };
  }, [review.id, count]);
  useEffect(() => () => { if (full) URL.revokeObjectURL(full); }, [full]);
  if (count === 0) return null;
  const open = async (n: number) => {
    try { setFull(URL.createObjectURL(await fetchReviewPhoto(review.id, n))); } catch { /* the thumbnail stays */ }
  };
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }} data-testid={`review-photos-${review.id}`}>
      {thumbs.map((src, n) => (
        <button key={n} type="button" onClick={() => void open(n)} aria-label={`Photo ${n + 1}`} style={{ padding: 0, border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', width: 48, height: 48, background: 'var(--color-bg)', cursor: 'zoom-in' }}>
          {src && <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
        </button>
      ))}
      {full && (
        <Modal title="Review photo" onClose={() => setFull(null)} maxWidth={720}>
          <img src={full} alt="" style={{ width: '100%', borderRadius: 10, display: 'block', background: 'var(--color-backdrop)' }} />
        </Modal>
      )}
    </div>
  );
}

/** Admin → Reviews → Reply: shown under the review as "Reply from Bake & Grill". */
function ReplyModal({ review, onClose, onSaved }: { review: Review; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState(review.reply?.text ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async (value: string | null) => {
    setSaving(true); setError('');
    try { await replyToReview(review.id, value); onSaved(); onClose(); }
    catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };
  return (
    <Modal title={`Reply to ${review.author}`} onClose={onClose} maxWidth={520}>
      {review.comment && <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--color-text-secondary)' }}>“{review.comment}”</p>}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={1000}
        rows={5}
        data-testid="review-reply-text"
        aria-label="Reply"
        style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 14, fontFamily: 'inherit' }}
      />
      <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
        Everyone who reads the review sees it. {review.reply ? 'The customer was told about your first reply.' : 'The customer is told by SMS.'}
      </p>
      {error && <p style={{ color: 'var(--color-danger)', fontSize: 13 }}>{error}</p>}
      <ModalActions>
        {review.reply && <Btn variant="danger-outline" onClick={() => void save(null)} disabled={saving}>Remove reply</Btn>}
        <Btn variant="secondary" onClick={onClose} disabled={saving}>Cancel</Btn>
        <Btn onClick={() => void save(text.trim())} disabled={saving || text.trim() === ''}>Save reply</Btn>
      </ModalActions>
    </Modal>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <Star key={n} size={13} style={{ color: n <= rating ? 'var(--color-warning)' : 'var(--color-border)', fill: n <= rating ? 'var(--color-warning)' : 'none' }} />
      ))}
    </span>
  );
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'orange', approved: 'green', rejected: 'red',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

export default function ReviewsPage() {
  usePageTitle('Reviews');

  const [reviews, setReviews] = useState<Review[]>([]);
  const reviewCtl = useSortFilter(reviews, [
    { key: 'author', label: 'Author', get: (r) => r.author },
    { key: 'rating', label: 'Rating', kind: 'number', get: (r) => r.rating },
    { key: 'comment', label: 'Comment', get: (r) => r.comment },
    { key: 'about', label: 'Item / Order', get: (r) => [r.item?.name, r.order?.order_number].filter(Boolean).join(' ') },
    { key: 'status', label: 'Status', kind: 'select', get: (r) => r.status },
    { key: 'date', label: 'Date', get: (r) => r.created_at },
    { key: 'actions', label: 'Actions' },
  ], 'reviews');
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [acting, setActing] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [replying, setReplying] = useState<Review | null>(null);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetchAdminReviews({ status: statusFilter || undefined, page });
      setReviews(res.data ?? []);
      setMeta(res.meta);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [page, statusFilter]);

  const handleModerate = async (id: number, status: 'approved' | 'rejected') => {
    setActing(id);
    try { await moderateReview(id, status); void load(); }
    catch (e) { setError((e as Error).message); }
    finally { setActing(null); }
  };

  const pending = reviews.filter(r => r.status === 'pending').length;
  const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  return (
    <PageShell>
    <div>
      <PageHeader section="Customers & Marketing" title="Reviews & Ratings" />
      {error && <p style={{ color: 'var(--color-danger)', marginBottom: 16 }}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16, marginBottom: 20 }}>
        <StatCard label="Total (page)" value={String(meta.total)} accent="var(--color-primary)" />
        <StatCard label="Avg (this page)" value={reviews.length ? `${avgRating.toFixed(1)} ★` : '—'} accent="var(--color-warning)" />
        <StatCard label="Pending" value={String(pending)} accent={pending > 0 ? 'var(--color-warning)' : 'var(--color-success)'} />
      </div>

      {pending > 0 && (
        <div style={{ background: 'var(--color-warning-bg)', border: '1px solid color-mix(in srgb, var(--color-warning) 55%, transparent)', borderRadius: 10, padding: '10px 16px', marginBottom: 20, fontSize: 13, color: 'var(--color-warning-strong)' }}>
          <strong>{pending}</strong> review{pending > 1 ? 's' : ''} pending moderation on this page.
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ height: 36, padding: '0 12px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', background: 'var(--color-surface)', color: 'var(--color-text)', cursor: 'pointer' }}
        >
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <TableCard>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <SortFilterHead controls={reviewCtl} allRows={reviews} />
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>Loading…</td></tr>
            ) : reviews.length === 0 ? (
              <tr><td colSpan={7}><EmptyState message="No reviews found." /></td></tr>
            ) : reviewCtl.rows.map(review => (
              <tr key={review.id}>
                <td style={{ ...TD, fontWeight: 600 }}>{review.author}</td>
                <td style={TD}><StarRating rating={review.rating} /></td>
                <td style={{ ...TD, maxWidth: 260 }}>
                  {review.comment ? (
                    <div>
                      <span style={{ fontSize: 13, color: 'var(--color-text)', wordBreak: 'break-word' }}>
                        {expandedId === review.id ? review.comment : (review.comment.length > 100 ? review.comment.slice(0, 100) + '…' : review.comment)}
                      </span>
                      {review.comment.length > 100 && (
                        <button
                          onClick={() => setExpandedId(expandedId === review.id ? null : review.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', fontSize: 12, padding: 0, fontFamily: 'inherit' }}
                        >
                          {expandedId === review.id ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Read more</>}
                        </button>
                      )}
                    </div>
                  ) : <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>No comment</span>}
                  <ReviewPhotos review={review} />
                  {(review.verified || (review.helpful_count ?? 0) > 0) && (
                    <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 12, color: 'var(--color-text-secondary)', flexWrap: 'wrap' }}>
                      {review.verified && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><BadgeCheck size={13} aria-hidden /> Verified order</span>}
                      {(review.helpful_count ?? 0) > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><ThumbsUp size={12} aria-hidden /> {review.helpful_count} found it helpful</span>}
                    </div>
                  )}
                  {review.reply && (
                    <p data-testid={`review-reply-${review.id}`} style={{ margin: '6px 0 0', padding: '6px 8px', borderLeft: '3px solid var(--color-primary)', background: 'var(--color-bg)', fontSize: 12, color: 'var(--color-text)' }}>
                      <strong>Your reply:</strong> {review.reply.text}
                    </p>
                  )}
                </td>
                <td style={{ ...TD, fontSize: 12 }}>
                  {review.item ? <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>{review.item.name}</span> : null}
                  {review.order ? (
                    <Link
                      to={`/orders?order=${review.order.id}`}
                      style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none', display: 'block', marginTop: 2, fontSize: 12 }}
                    >
                      Order #{review.order.order_number}
                    </Link>
                  ) : null}
                  {!review.item && !review.order && <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                </td>
                <td style={TD}><Badge color={STATUS_COLOR[review.status] ?? 'gray'}>{review.status}</Badge></td>
                <td style={{ ...TD, color: 'var(--color-text-muted)', fontSize: 12 }}>{new Date(review.created_at).toLocaleDateString()}</td>
                <td style={TD}>
                  {review.status !== 'approved' && (
                    <Btn small onClick={() => handleModerate(review.id, 'approved')} disabled={acting === review.id} style={{ marginRight: 6 }}>
                      Approve
                    </Btn>
                  )}
                  <Btn small variant="secondary" onClick={() => setReplying(review)} style={{ marginRight: 6 }}>
                    {review.reply ? 'Edit reply' : 'Reply'}
                  </Btn>
                  {review.status !== 'rejected' && (
                    <Btn small variant="danger-outline" onClick={() => handleModerate(review.id, 'rejected')} disabled={acting === review.id}>
                      Reject
                    </Btn>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      <Pagination page={page} totalPages={meta.last_page} onChange={setPage} />
      {replying && <ReplyModal review={replying} onClose={() => setReplying(null)} onSaved={() => void load()} />}
    </div>

    </PageShell>
  );
}
