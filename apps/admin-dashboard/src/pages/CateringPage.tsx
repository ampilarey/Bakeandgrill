import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CATERING_STATUSES,
  fetchCateringRequests,
  updateCateringRequest,
  type CateringRequestRow,
} from '../api/catering';
import { PageHeader, Btn, EmptyState } from '../components/SharedUI';
import { usePageTitle } from '../hooks/usePageTitle';

export function CateringPage() {
  usePageTitle('Catering');
  const [rows, setRows] = useState<CateringRequestRow[]>([]);
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Record<number, { quoted_amount: string; staff_notes: string; pos_order_id: string }>>({});

  const load = () => {
    setLoading(true);
    setError('');
    fetchCateringRequests({ page, status })
      .then((res) => {
        setRows(res.data ?? []);
        setLastPage(res.meta?.last_page ?? 1);
        const next: typeof drafts = {};
        for (const row of res.data ?? []) {
          next[row.id] = {
            quoted_amount: row.quoted_amount != null ? String(row.quoted_amount) : '',
            staff_notes: row.staff_notes ?? '',
            pos_order_id: row.pos_order_id != null ? String(row.pos_order_id) : '',
          };
        }
        setDrafts(next);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page, status]);

  const save = async (id: number, patch: Parameters<typeof updateCateringRequest>[1]) => {
    try {
      const { request } = await updateCateringRequest(id, patch);
      setRows((prev) => prev.map((r) => (r.id === id ? request : r)));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Catering requests"
        subtitle="Inquiry → quote → confirm. Ring confirmed jobs through POS with a manual discount."
      />

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
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
        <Btn onClick={() => load()}>Refresh</Btn>
      </div>

      {error && <p style={{ color: '#b91c1c', fontSize: 13 }}>{error}</p>}
      {loading ? (
        <p style={{ color: '#9C8E7E' }}>Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState message="No catering requests yet." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map((row) => {
            const draft = drafts[row.id] ?? { quoted_amount: '', staff_notes: '', pos_order_id: '' };
            return (
              <div
                key={row.id}
                style={{
                  background: '#fff',
                  border: '1px solid #E8E0D8',
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>
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
                    </div>
                  </div>
                  <select
                    value={row.status}
                    onChange={(e) => void save(row.id, { status: e.target.value })}
                    style={{ minHeight: 44, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px' }}
                  >
                    {CATERING_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                {row.notes && (
                  <p style={{ margin: '10px 0 0', fontSize: 13, color: '#5C4E3E' }}>{row.notes}</p>
                )}

                {row.interested_item_names?.length > 0 && (
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: '#9C8E7E' }}>
                    Interested: {row.interested_item_names.map((i) => i.name).join(', ')}
                  </p>
                )}

                <div className="form-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 12 }}>
                  <label style={{ fontSize: 12, color: '#9C8E7E' }}>
                    Quoted amount (MVR)
                    <input
                      style={{ display: 'block', width: '100%', minHeight: 44, marginTop: 4, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px' }}
                      value={draft.quoted_amount}
                      onChange={(e) => setDrafts((d) => ({ ...d, [row.id]: { ...draft, quoted_amount: e.target.value } }))}
                      onBlur={() => {
                        const n = draft.quoted_amount === '' ? null : parseFloat(draft.quoted_amount);
                        void save(row.id, { quoted_amount: n != null && Number.isFinite(n) ? n : null });
                      }}
                    />
                  </label>
                  <label style={{ fontSize: 12, color: '#9C8E7E' }}>
                    POS order ID
                    <input
                      style={{ display: 'block', width: '100%', minHeight: 44, marginTop: 4, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px' }}
                      value={draft.pos_order_id}
                      onChange={(e) => setDrafts((d) => ({ ...d, [row.id]: { ...draft, pos_order_id: e.target.value } }))}
                      onBlur={() => {
                        const n = draft.pos_order_id === '' ? null : parseInt(draft.pos_order_id, 10);
                        void save(row.id, { pos_order_id: n != null && Number.isFinite(n) ? n : null });
                      }}
                    />
                  </label>
                  <div style={{ fontSize: 12, color: '#9C8E7E', paddingTop: 22 }}>
                    {row.pos_order_id != null ? (
                      <Link to={`/orders?highlight=${row.pos_order_id}`}>Open order #{row.pos_order_id}</Link>
                    ) : (
                      'No POS order linked'
                    )}
                  </div>
                </div>

                <label style={{ display: 'block', fontSize: 12, color: '#9C8E7E', marginTop: 10 }}>
                  Staff notes
                  <textarea
                    style={{ display: 'block', width: '100%', minHeight: 72, marginTop: 4, borderRadius: 8, border: '1px solid #E8E0D8', padding: 10 }}
                    value={draft.staff_notes}
                    onChange={(e) => setDrafts((d) => ({ ...d, [row.id]: { ...draft, staff_notes: e.target.value } }))}
                    onBlur={() => void save(row.id, { staff_notes: draft.staff_notes || null })}
                  />
                </label>
              </div>
            );
          })}
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
