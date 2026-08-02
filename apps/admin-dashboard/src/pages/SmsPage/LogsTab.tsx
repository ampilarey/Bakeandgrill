import { useEffect, useState } from 'react';
import { fetchSmsLogs, fetchSmsLogStats, type SmsLog } from '../../api';
import { Badge, Btn, EmptyState, Select, Spinner, StatCard, TableCard, TD, TH, statColor } from '../../components/Layout';

export function LogsTab() {
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [stats, setStats] = useState<{ total: number; sent: number; failed: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [logsRes, statsRes] = await Promise.all([
        fetchSmsLogs({ type: typeFilter || undefined, status: statusFilter || undefined }),
        fetchSmsLogStats(),
      ]);
      setLogs(logsRes.data ?? []);
      setStats(statsRes);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [typeFilter, statusFilter]);

  return (
    <>
      {loadError && (
        <div style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger-strong)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: '0.875rem' }}>
          {loadError}
        </div>
      )}
      {stats && (
        <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
          <StatCard label="Total SMS" value={stats.total.toLocaleString()} accent="var(--color-primary)" />
          <StatCard label="Sent"      value={stats.sent.toLocaleString()}  accent="var(--color-success)" />
          <StatCard label="Failed"    value={stats.failed.toLocaleString()} accent="var(--color-danger)" />
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <Select value={typeFilter} onChange={setTypeFilter} options={[
          { value: '', label: 'All Types' },
          { value: 'otp', label: 'OTP' },
          { value: 'promotion', label: 'Promotion' },
          { value: 'campaign', label: 'Campaign' },
          { value: 'transactional', label: 'Transactional' },
        ]} style={{ width: 160 }} />
        <Select value={statusFilter} onChange={setStatusFilter} options={[
          { value: '', label: 'All Statuses' },
          { value: 'sent', label: 'Sent' },
          { value: 'failed', label: 'Failed' },
          { value: 'demo', label: 'Demo' },
        ]} style={{ width: 140 }} />
        <Btn variant="secondary" onClick={load}>↻ Refresh</Btn>
      </div>

      {loading && logs.length === 0 ? <Spinner /> : logs.length === 0 ? (
        <TableCard><EmptyState message="No SMS logs found." /></TableCard>
      ) : (
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['To', 'Type', 'Status', 'Message', 'Segments', 'Cost', 'Sent At'].map((h) => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td style={{ ...TD, fontWeight: 600 }}>{l.to}</td>
                  <td style={TD}><Badge label={l.type} color="blue" /></td>
                  <td style={TD}><Badge label={l.status} color={statColor(l.status)} /></td>
                  <td style={{ ...TD, color: 'var(--color-text-secondary)', maxWidth: 200 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {l.message}
                    </span>
                    {l.error_message && <span style={{ color: 'var(--color-danger)', fontSize: 11 }}>{l.error_message}</span>}
                  </td>
                  <td style={{ ...TD, color: 'var(--color-text-secondary)', textAlign: 'center' }}>{l.segments}</td>
                  <td style={{ ...TD, color: 'var(--color-primary)', fontWeight: 600 }}>MVR {l.cost_estimate_mvr}</td>
                  <td style={{ ...TD, color: 'var(--color-text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>
                    {l.sent_at ? new Date(l.sent_at).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}
    </>
  );
}
