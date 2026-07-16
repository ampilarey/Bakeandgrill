import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, RefreshCw } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import { PageHeader, TableCard, TH, TD, Btn, EmptyState, DateInput } from '../components/SharedUI';
import { fetchStaff } from '../api';
import {
  fetchAuditLogs,
  fetchAuditLogActions,
  formatAuditAction,
  type AuditLogRow,
} from '../api/pos-admin';
import { downloadCSV } from '../utils/csvExport';
import { today } from '../utils/dateHelpers';

function auditRecordPath(modelType: string, modelId: number | null | undefined): string | null {
  if (!modelId) return null;
  switch (modelType) {
    case 'Order':
      return `/orders?order=${modelId}`;
    case 'Invoice':
      return `/invoices?invoice=${modelId}`;
    case 'Expense':
      return `/expenses?expense=${modelId}`;
    case 'Purchase':
      return `/purchase-orders?search=${modelId}`;
    case 'Customer':
      return `/customers?customer=${modelId}`;
    default:
      return null;
  }
}

export default function ActivityPage() {
  usePageTitle('POS Activity');
  const navigate = useNavigate();

  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [staff, setStaff] = useState<{ id: number; name: string }[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [userId, setUserId] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [q, setQ] = useState('');

  const load = async (p = page) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchAuditLogs({
        page: p,
        per_page: 40,
        user_id: userId ? Number(userId) : undefined,
        action: action || undefined,
        from: from || undefined,
        to: to || undefined,
        q: q.trim() || undefined,
      });
      setLogs(res.data ?? []);
      setPage(res.current_page ?? p);
      setLastPage(res.last_page ?? 1);
      setTotal(res.total ?? 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff().then(({ staff: s }) => setStaff(s.map((u) => ({ id: u.id, name: u.name })))).catch(() => undefined);
    fetchAuditLogActions().then((r) => setActions(r.actions ?? [])).catch(() => undefined);
  }, []);

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, action, from, to]);

  const handleSearch = () => {
    setPage(1);
    void load(1);
  };

  const exportCsv = () => {
    downloadCSV('pos-activity', logs.map((row) => ({
      Time: row.created_at,
      Staff: row.user?.name ?? '',
      Action: formatAuditAction(row.action),
      Model: row.model_type,
      'Model ID': row.model_id ?? '',
      IP: row.ip_address ?? '',
    })));
  };

  return (
    <div>
      <PageHeader
        title="POS Activity"
        subtitle="Audit trail of cashier actions — voids, payments, shifts, devices"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="secondary" onClick={() => void load(page)}><RefreshCw size={14} /> Refresh</Btn>
            <Btn variant="secondary" onClick={exportCsv} disabled={logs.length === 0}><Download size={14} /> Export</Btn>
          </div>
        }
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <select value={userId} onChange={(e) => setUserId(e.target.value)} style={selectStyle}>
          <option value="">All staff</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={action} onChange={(e) => setAction(e.target.value)} style={{ ...selectStyle, minWidth: 180 }}>
          <option value="">All actions</option>
          {actions.map((a) => <option key={a} value={a}>{formatAuditAction(a)}</option>)}
        </select>
        <DateInput label="" value={from} onChange={setFrom} />
        <DateInput label="" value={to} onChange={setTo} />
        <input
          placeholder="Search action, model, staff…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          style={{ ...selectStyle, flex: 1, minWidth: 200 }}
        />
        <Btn onClick={handleSearch}>Filter</Btn>
      </div>

      {error && <p style={{ color: '#ef4444', marginBottom: 12 }}>{error}</p>}

      <TableCard>
        {loading && logs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9C8E7E' }}>Loading…</div>
        ) : logs.length === 0 ? (
          <EmptyState message="No activity found for these filters." />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={TH}>Time</th>
                <th style={TH}>Staff</th>
                <th style={TH}>Action</th>
                <th style={TH}>Record</th>
                <th style={TH}>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((row) => (
                <tr key={row.id} style={{ borderBottom: '1px solid #F0EBE5' }}>
                  <td style={TD}>{new Date(row.created_at).toLocaleString()}</td>
                  <td style={TD}>{row.user?.name ?? '—'}</td>
                  <td style={{ ...TD, fontWeight: 600 }}>{formatAuditAction(row.action)}</td>
                  <td style={TD}>
                    {row.model_type} #{row.model_id ?? '—'}
                    {(() => {
                      const path = auditRecordPath(row.model_type, row.model_id);
                      if (!path) return null;
                      return (
                        <button
                          type="button"
                          onClick={() => navigate(path)}
                          style={{ marginLeft: 8, fontSize: 11, color: '#D4813A', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                          View
                        </button>
                      );
                    })()}
                  </td>
                  <td style={{ ...TD, fontSize: 11, color: '#6B5D4F', maxWidth: 280 }}>
                    {detailSnippet(row)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>

      {lastPage > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <span style={{ fontSize: 13, color: '#9C8E7E' }}>{total} events · page {page} of {lastPage}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="secondary" disabled={page <= 1} onClick={() => void load(page - 1)}>Previous</Btn>
            <Btn variant="secondary" disabled={page >= lastPage} onClick={() => void load(page + 1)}>Next</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 10,
  border: '1.5px solid #E8E0D8',
  fontSize: 13,
  fontFamily: 'inherit',
  background: '#fff',
};

function detailSnippet(row: AuditLogRow): string {
  const nv = row.new_values ?? {};
  const meta = row.meta ?? {};
  if (typeof nv.reason === 'string') return nv.reason;
  if (typeof meta.reason === 'string') return meta.reason;
  if (typeof nv.phone === 'string') return `SMS → ${nv.phone}`;
  if (row.action.includes('shift')) {
    const v = nv.variance ?? nv.closing_cash;
    if (v != null) return `Variance / close: ${v}`;
  }
  return row.ip_address ? `IP ${row.ip_address}` : '';
}
