import { useEffect, useState } from 'react';
import { getReservations, updateReservationStatus, type AdminReservation } from '../api';
import { Badge, Btn, DateInput, EmptyState, ErrorMsg, PageHeader, Pagination, Spinner, TableCard, TD, TH } from '../components/Layout';
import { usePageTitle } from '../hooks/usePageTitle';

const STATUS_COLOR: Record<string, string> = {
  pending:   'yellow',
  confirmed: 'green',
  seated:    'blue',
  completed: 'gray',
  cancelled: 'red',
  no_show:   'gray',
};

const NEXT_STATUSES: Record<string, string[]> = {
  pending:   ['confirmed', 'cancelled'],
  confirmed: ['seated', 'no_show', 'cancelled'],
  seated:    ['completed'],
  completed: [],
  cancelled: [],
  no_show:   [],
};

export function ReservationsPage() {
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
    setLoading(true); setError('');
    try {
      const res = await getReservations({ date: dateFilter || undefined, status: statusFilter || undefined, page });
      setReservations(res.data);
      setLastPage(res.meta.last_page);
      setTotal(res.meta.total);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [dateFilter, statusFilter, page]);

  const handleStatus = async (id: number, status: string) => {
    try {
      const res = await updateReservationStatus(id, status);
      setReservations((prev) => prev.map((r) => r.id === id ? res.reservation : r));
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <>
      <PageHeader
        title="Reservations"
        subtitle={`${total} total reservations`}
      />
      {error && <ErrorMsg message={error} />}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20, alignItems: 'flex-end' }}>
        <DateInput value={dateFilter} onChange={(v) => { setDateFilter(v); setPage(1); }} label="Date" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#6B5D4F', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</label>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            style={{ height: 36, padding: '0 10px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#1C1408', outline: 'none', cursor: 'pointer' }}
          >
            <option value="">All Statuses</option>
            {['pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'].map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
            ))}
          </select>
        </div>
        {(dateFilter || statusFilter) && (
          <Btn variant="secondary" small onClick={() => { setDateFilter(''); setStatusFilter(''); setPage(1); }}>
            Clear
          </Btn>
        )}
      </div>

      {loading ? <Spinner /> : reservations.length === 0 ? (
        <TableCard><EmptyState message="No reservations found." /></TableCard>
      ) : (
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                {['#', 'Guest', 'Party', 'Date', 'Time', 'Table', 'Status', 'Actions'].map((h) => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reservations.map((r) => (
                <tr key={r.id}>
                  <td style={{ ...TD, color: '#9C8E7E', fontSize: 12 }}>{r.id}</td>
                  <td style={TD}>
                    <div style={{ fontWeight: 600, color: '#1C1408' }}>{r.customer_name}</div>
                    <div style={{ fontSize: 12, color: '#9C8E7E' }}>{r.customer_phone}</div>
                    {r.notes && (
                      <div style={{ fontSize: 11, color: '#9C8E7E', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                        {r.notes}
                      </div>
                    )}
                  </td>
                  <td style={{ ...TD, textAlign: 'center', fontWeight: 700 }}>{r.party_size}</td>
                  <td style={{ ...TD, whiteSpace: 'nowrap' }}>{r.date}</td>
                  <td style={{ ...TD, whiteSpace: 'nowrap' }}>{r.time_slot}</td>
                  <td style={TD}>{r.table?.name ?? '—'}</td>
                  <td style={TD}>
                    <Badge label={r.status.replace('_', ' ')} color={STATUS_COLOR[r.status] ?? 'gray'} />
                  </td>
                  <td style={TD}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {NEXT_STATUSES[r.status]?.map((ns) => (
                        <Btn
                          key={ns}
                          small
                          variant={ns === 'cancelled' || ns === 'no_show' ? 'danger' : 'secondary'}
                          onClick={() => handleStatus(r.id, ns)}
                        >
                          {ns.replace('_', ' ')}
                        </Btn>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} totalPages={lastPage} onChange={setPage} />
        </TableCard>
      )}
    </>
  );
}

export default ReservationsPage;
