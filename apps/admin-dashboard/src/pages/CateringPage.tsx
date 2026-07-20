import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CATERING_STATUSES,
  fetchCateringRequests,
  type CateringRequestRow,
} from '../api/catering';
import { PageHeader, Btn, EmptyState } from '../components/SharedUI';
import { usePageTitle } from '../hooks/usePageTitle';

export function CateringPage() {
  usePageTitle('Events & Catering');
  const [rows, setRows] = useState<CateringRequestRow[]>([]);
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    fetchCateringRequests({ page, status, q: search, assigned_to_me: assignedToMe })
      .then((res) => {
        setRows(res.data ?? []);
        setLastPage(res.meta?.last_page ?? 1);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page, status, search, assignedToMe]);

  return (
    <div>
      <PageHeader
        title="Events & Catering"
        subtitle="Event orders, quotes & catering pipeline"
      />

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          data-testid="pipeline-search"
          placeholder="Search name or phone…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setPage(1);
              setSearch(q.trim());
            }
          }}
          style={{ minHeight: 44, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 12px', minWidth: 200 }}
        />
        <Btn onClick={() => { setPage(1); setSearch(q.trim()); }}>Search</Btn>
        <select
          value={status}
          onChange={(e) => { setPage(1); setStatus(e.target.value); }}
          style={{ minHeight: 44, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 12px' }}
        >
          <option value="all">All statuses</option>
          {CATERING_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, minHeight: 44 }}>
          <input
            data-testid="assigned-to-me"
            type="checkbox"
            checked={assignedToMe}
            onChange={(e) => { setPage(1); setAssignedToMe(e.target.checked); }}
          />
          Assigned to me
        </label>
        <Btn onClick={() => load()}>Refresh</Btn>
      </div>

      {error && <p style={{ color: '#b91c1c', fontSize: 13 }}>{error}</p>}
      {loading ? (
        <p style={{ color: '#9C8E7E' }}>Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState message="No event / catering requests yet." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map((row) => (
            <Link
              key={row.id}
              to={`/catering/${row.id}`}
              data-testid={`catering-row-${row.id}`}
              style={{
                background: '#fff',
                border: '1px solid #E8E0D8',
                borderRadius: 12,
                padding: 16,
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>
                    {row.reference ? `${row.reference} · ` : ''}
                    {row.contact_name}
                    {row.company ? ` · ${row.company}` : ''}
                  </div>
                  <div style={{ fontSize: 13, color: '#9C8E7E', marginTop: 4 }}>
                    {row.phone}
                    {row.email ? ` · ${row.email}` : ''}
                    {' · '}
                    {(row.occasion ?? 'other').replace('_', ' ')}
                    {row.event_date ? ` · ${row.event_date}` : ''}
                    {row.headcount != null ? ` · ${row.headcount} guests` : ''}
                    {(row.lines_count ?? 0) > 0
                      ? ` · ${row.lines_count} lines${(row.custom_lines_count ?? 0) > 0 ? ` (${row.custom_lines_count} custom)` : ''}`
                      : ''}
                    {row.handled_by_name ? ` · ${row.handled_by_name}` : ' · Unassigned'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '4px 10px',
                    borderRadius: 8,
                    background: '#F5F0EB',
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: 'capitalize',
                  }}
                  >
                    {row.status.replace('_', ' ')}
                  </span>
                  {row.has_live_quote && (
                    <div style={{ fontSize: 11, color: '#B45309', marginTop: 6, fontWeight: 700 }}>
                      Quote v{row.quote_version ?? 1}
                      {row.quote_expires_at
                        ? ` · exp ${new Date(row.quote_expires_at).toLocaleDateString()}`
                        : ''}
                    </div>
                  )}
                </div>
              </div>
              {row.dietary_notes && (
                <p style={{ margin: '10px 0 0', fontSize: 12, color: '#92400E', background: '#FFFBEB', padding: 8, borderRadius: 8 }}>
                  Dietary: {row.dietary_notes}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}

      {lastPage > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <Btn disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Btn>
          <span style={{ alignSelf: 'center', fontSize: 13, color: '#9C8E7E' }}>Page {page} / {lastPage}</span>
          <Btn disabled={page >= lastPage} onClick={() => setPage((p) => p + 1)}>Next</Btn>
        </div>
      )}
    </div>
  );
}
