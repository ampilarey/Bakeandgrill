import { useEffect, useState } from 'react';
import { RotateCcw, RefreshCw } from 'lucide-react';
import { fetchPrintJobs, retryPrintJob, type PrintJob } from '../api';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  Badge, Btn, Card, EmptyState, ErrorMsg, PageHeader, Select,
  StatCard, TableCard, TD, TH, statColor,
} from '../components/Layout';

const STATUS_COLORS: Record<string, string> = {
  pending: 'warning',
  printed: 'success',
  failed:  'danger',
};

function JobTypeIcon({ type }: { type: string }) {
  return <span style={{ fontSize: 11, color: '#9C8E7E', background: '#F0EBE5', padding: '2px 7px', borderRadius: 4, fontWeight: 600 }}>{type.replace(/_/g, ' ').toUpperCase()}</span>;
}

function RetryCountBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span style={{ fontSize: 11, color: count >= 3 ? '#DC2626' : '#F59E0B', background: count >= 3 ? '#FEE2E2' : '#FEF3C7', padding: '2px 7px', borderRadius: 4, fontWeight: 600, marginLeft: 6 }}>
      {count}x retried
    </span>
  );
}

export default function PrintJobsPage() {
  usePageTitle('Print Queue');

  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [toast, setToast] = useState('');

  const stats = {
    total:   jobs.length,
    pending: jobs.filter((j) => j.status === 'pending').length,
    failed:  jobs.filter((j) => j.status === 'failed').length,
    printed: jobs.filter((j) => j.status === 'printed').length,
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchPrintJobs({ status: statusFilter || undefined, page });
      setJobs(res.data);
      setMeta(res.meta);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [statusFilter, page]);

  const handleRetry = async (id: number) => {
    setRetryingId(id);
    try {
      await retryPrintJob(id);
      setToast('Print job queued for retry.');
      void load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRetryingId(null);
      setTimeout(() => setToast(''), 3000);
    }
  };

  const statusDot = (s: string) => {
    const colors: Record<string, string> = { printed: '#22C55E', failed: '#EF4444', pending: '#F59E0B' };
    return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: colors[s] ?? '#9C8E7E' }} />;
  };

  return (
    <>
      <PageHeader
        title="Print Queue"
        subtitle="Monitor and retry print jobs"
        action={
          <Btn onClick={() => { setPage(1); void load(); }} variant="secondary">
            <RefreshCw size={14} style={{ marginRight: 6 }} />Refresh
          </Btn>
        }
      />

      {toast && (
        <div style={{ background: '#DCFCE7', color: '#166534', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: '0.875rem' }}>
          {toast}
        </div>
      )}
      {error && <ErrorMsg message={error} />}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }} className="stat-grid">
        <StatCard label="Total Jobs" value={String(meta.total)} />
        <StatCard label="Pending"    value={String(stats.pending)} accent="#F59E0B" />
        <StatCard label="Failed"     value={String(stats.failed)}  accent="#EF4444" />
        <StatCard label="Printed"    value={String(stats.printed)} accent="#22C55E" />
      </div>

      {/* Filter */}
      <Card style={{ padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
        <Select
          options={[
            { value: '',        label: 'All Statuses' },
            { value: 'pending', label: 'Pending' },
            { value: 'printed', label: 'Printed' },
            { value: 'failed',  label: 'Failed' },
          ]}
          value={statusFilter}
          onChange={(val) => { setStatusFilter(val); setPage(1); }}
          style={{ width: 160 }}
        />
        <span style={{ fontSize: 13, color: '#9C8E7E' }}>{meta.total} job{meta.total !== 1 ? 's' : ''}</span>
      </Card>

      {/* Table */}
      {loading ? (
        <Card><EmptyState message="Loading print jobs…" /></Card>
      ) : jobs.length === 0 ? (
        <Card><EmptyState message="No print jobs found." /></Card>
      ) : (
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>ID</th>
                <th style={TH}>Type</th>
                <th style={TH}>Printer</th>
                <th style={TH}>Status</th>
                <th style={TH}>Copies</th>
                <th style={TH}>Error</th>
                <th style={TH}>Created</th>
                <th style={TH}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} style={{ borderBottom: '1px solid #F0EBE5' }}>
                  <td style={TD}>
                    <span style={{ fontWeight: 600, color: '#1C1408' }}>#{job.id}</span>
                  </td>
                  <td style={TD}>
                    <JobTypeIcon type={job.type} />
                    <RetryCountBadge count={job.retry_count} />
                  </td>
                  <td style={TD}>
                    <span style={{ fontSize: 13 }}>{job.printer_name ?? <span style={{ color: '#9C8E7E' }}>Default</span>}</span>
                  </td>
                  <td style={TD}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {statusDot(job.status)}
                      <Badge label={job.status} color={statColor(STATUS_COLORS[job.status] ?? 'default')} />
                    </div>
                  </td>
                  <td style={TD}>
                    <span style={{ fontSize: 13, color: '#6B5D4F' }}>{job.copies}</span>
                  </td>
                  <td style={{ ...TD, maxWidth: 200 }}>
                    {job.error_message ? (
                      <span style={{ fontSize: 12, color: '#EF4444', fontFamily: 'monospace', wordBreak: 'break-word' }}>{job.error_message}</span>
                    ) : (
                      <span style={{ color: '#9C8E7E', fontSize: 12 }}>—</span>
                    )}
                  </td>
                  <td style={TD}>
                    <div style={{ fontSize: 12, color: '#6B5D4F' }}>
                      {new Date(job.created_at).toLocaleString('en-MV', { timeZone: 'Indian/Maldives' })}
                    </div>
                    {job.printed_at && (
                      <div style={{ fontSize: 11, color: '#22C55E' }}>
                        Printed {new Date(job.printed_at).toLocaleString('en-MV', { timeZone: 'Indian/Maldives' })}
                      </div>
                    )}
                  </td>
                  <td style={TD}>
                    {(job.status === 'failed' || job.status === 'pending') && (
                      <Btn
                        small
                        variant="secondary"
                        onClick={() => void handleRetry(job.id)}
                        disabled={retryingId === job.id}
                      >
                        <RotateCcw size={12} style={{ marginRight: 4 }} />
                        {retryingId === job.id ? 'Retrying…' : 'Retry'}
                      </Btn>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {meta.last_page > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '16px 0' }}>
              <Btn small variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>← Prev</Btn>
              <span style={{ fontSize: 13, color: '#6B5D4F', padding: '6px 12px' }}>
                Page {meta.current_page} of {meta.last_page}
              </span>
              <Btn small variant="secondary" disabled={page === meta.last_page} onClick={() => setPage(page + 1)}>Next →</Btn>
            </div>
          )}
        </TableCard>
      )}
    </>
  );
}
