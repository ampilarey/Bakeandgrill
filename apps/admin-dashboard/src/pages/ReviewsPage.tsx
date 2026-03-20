import { useState, useEffect } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  PageHeader, TableCard, TH, TD, Badge, Btn, Pagination, EmptyState,
} from '../components/SharedUI';
import { fetchAdminReviews, moderateReview, type Review } from '../api';
import { Star } from 'lucide-react';

function StarRating({ rating }: { rating: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <Star key={n} size={13} style={{ color: n <= rating ? '#f59e0b' : '#E8E0D8', fill: n <= rating ? '#f59e0b' : 'none' }} />
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
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [acting, setActing] = useState<number | null>(null);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetchAdminReviews({ status: statusFilter || undefined, page });
      setReviews(res.data);
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

  return (
    <div>
      <PageHeader title="Reviews & Ratings" />
      {error && <p style={{ color: '#ef4444', marginBottom: 16 }}>{error}</p>}

      {pending > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 16px', marginBottom: 20, fontSize: 13, color: '#92400e' }}>
          <strong>{pending}</strong> review{pending > 1 ? 's' : ''} pending moderation on this page.
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ height: 36, padding: '0 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#1C1408', cursor: 'pointer' }}
        >
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <TableCard>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Author', 'Rating', 'Comment', 'Item / Order', 'Status', 'Date', 'Actions'].map(h => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#9C8E7E' }}>Loading…</td></tr>
            ) : reviews.length === 0 ? (
              <tr><td colSpan={7}><EmptyState message="No reviews found." /></td></tr>
            ) : reviews.map(review => (
              <tr key={review.id}>
                <td style={{ ...TD, fontWeight: 600 }}>{review.author}</td>
                <td style={TD}><StarRating rating={review.rating} /></td>
                <td style={{ ...TD, maxWidth: 260 }}>
                  {review.comment
                    ? <span style={{ fontSize: 13, color: '#3D2B1F', wordBreak: 'break-word' }}>{review.comment.length > 120 ? review.comment.slice(0, 120) + '…' : review.comment}</span>
                    : <span style={{ color: '#9C8E7E', fontSize: 12 }}>No comment</span>}
                </td>
                <td style={{ ...TD, fontSize: 12 }}>
                  {review.item ? <span>{review.item.name}</span> : null}
                  {review.order ? <span style={{ color: '#9C8E7E' }}>{review.item ? ' · ' : ''}#{review.order.order_number}</span> : null}
                </td>
                <td style={TD}><Badge color={STATUS_COLOR[review.status] ?? 'gray'}>{review.status}</Badge></td>
                <td style={{ ...TD, color: '#9C8E7E', fontSize: 12 }}>{new Date(review.created_at).toLocaleDateString()}</td>
                <td style={TD}>
                  {review.status !== 'approved' && (
                    <Btn small onClick={() => handleModerate(review.id, 'approved')} disabled={acting === review.id} style={{ marginRight: 6 }}>
                      Approve
                    </Btn>
                  )}
                  {review.status !== 'rejected' && (
                    <Btn small variant="danger" onClick={() => handleModerate(review.id, 'rejected')} disabled={acting === review.id}>
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
    </div>
  );
}
