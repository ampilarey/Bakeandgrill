import { useEffect, useState } from 'react';
import { getReservations, updateReservationStatus, type AdminReservation } from '../api';
import { usePageTitle } from '../hooks/usePageTitle';

const STATUS_COLORS: Record<string, string> = {
  pending:   '#FEF3C7',
  confirmed: '#D1FAE5',
  seated:    '#DBEAFE',
  completed: '#F3F4F6',
  cancelled: '#FEE2E2',
  no_show:   '#E5E7EB',
};
const STATUS_TEXT: Record<string, string> = {
  pending:   '#92400E',
  confirmed: '#065F46',
  seated:    '#1E40AF',
  completed: '#374151',
  cancelled: '#B91C1C',
  no_show:   '#6B7280',
};

const NEXT_STATUSES: Record<string, string[]> = {
  pending:   ['confirmed', 'cancelled'],
  confirmed: ['seated', 'no_show', 'cancelled'],
  seated:    ['completed'],
  completed: [],
  cancelled: [],
  no_show:   [],
};

export default function ReservationsPage() {
    usePageTitle('Reservations');
  const [reservations, setReservations] = useState<AdminReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getReservations({ date: dateFilter || undefined, status: statusFilter || undefined, page });
      setReservations(res.data);
      setLastPage(res.meta.last_page);
      setTotal(res.meta.total);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [dateFilter, statusFilter, page]);

  const handleStatus = async (id: number, status: string) => {
    try {
      const res = await updateReservationStatus(id, status);
      setReservations(prev => prev.map(r => r.id === id ? res.reservation : r));
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px' }}>Reservations</h1>
        <p style={{ color: '#6B7280', margin: 0 }}>{total} total</p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <input
          type="date"
          value={dateFilter}
          onChange={e => { setDateFilter(e.target.value); setPage(1); }}
          style={inputStyle}
          placeholder="Filter by date"
        />
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          style={inputStyle}
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="seated">Seated</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="no_show">No-show</option>
        </select>
        <button onClick={() => { setDateFilter(''); setStatusFilter(''); setPage(1); }} style={clearBtnStyle}>
          Clear filters
        </button>
      </div>

      {error && <div style={errorStyle}>{error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>Loading…</div>
      ) : reservations.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>No reservations found.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E5E7EB' }}>
                {['#', 'Guest', 'Party', 'Date', 'Time', 'Table', 'Status', 'Actions'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reservations.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={tdStyle}>{r.id}</td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600 }}>{r.customer_name}</div>
                    <div style={{ fontSize: 12, color: '#6B7280' }}>{r.customer_phone}</div>
                    {r.notes && <div style={{ fontSize: 11, color: '#9CA3AF', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.notes}</div>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' as const }}>{r.party_size}</td>
                  <td style={tdStyle}>{r.date}</td>
                  <td style={tdStyle}>{r.time_slot}</td>
                  <td style={tdStyle}>{r.table?.name ?? '—'}</td>
                  <td style={tdStyle}>
                    <span style={{
                      background: STATUS_COLORS[r.status] ?? '#F3F4F6',
                      color:      STATUS_TEXT[r.status]   ?? '#374151',
                      padding: '3px 10px',
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}>
                      {r.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {NEXT_STATUSES[r.status]?.map(ns => (
                        <button
                          key={ns}
                          onClick={() => handleStatus(r.id, ns)}
                          style={actionBtnStyle}
                        >
                          {ns.replace('_', ' ')}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {lastPage > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={pageBtnStyle}>← Prev</button>
          <span style={{ padding: '6px 12px', fontSize: 14 }}>{page} / {lastPage}</span>
          <button disabled={page >= lastPage} onClick={() => setPage(p => p + 1)} style={pageBtnStyle}>Next →</button>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = { padding: '8px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 14 };
const clearBtnStyle: React.CSSProperties = { padding: '8px 14px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 14, cursor: 'pointer', background: 'white' };
const errorStyle: React.CSSProperties = { background: '#FEE2E2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 16 };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: 12, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase' as const, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '12px', fontSize: 14, verticalAlign: 'top' };
const actionBtnStyle: React.CSSProperties = { padding: '4px 10px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: 'white', whiteSpace: 'nowrap' };
const pageBtnStyle: React.CSSProperties = { padding: '6px 14px', border: '1px solid #E5E7EB', borderRadius: 8, cursor: 'pointer', fontSize: 14, background: 'white' };
