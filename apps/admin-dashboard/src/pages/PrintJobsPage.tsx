import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RotateCcw, RefreshCw } from 'lucide-react';
import { fetchPrintJobs, retryPrintJob, type PrintJob } from '../api';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  Badge, Btn, Card, EmptyState, ErrorMsg, PageHeader, PageShell, Select, StatCard, TableCard, TD, TH, statColor,
} from '../components/SharedUI';

const STATUS_COLORS: Record<string, string> = {
  pending: 'warning',
  printed: 'success',
  failed:  'danger',
};

function JobTypeIcon({ type }: { type: string }) {
  return <span style={{ fontSize: 11, color: 'var(--color-text-muted)', background: 'var(--color-border-light)', padding: '2px 7px', borderRadius: 4, fontWeight: 600 }}>{(type ?? '').replace(/_/g, ' ').toUpperCase()}</span>;
}

function RetryCountBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span style={{ fontSize: 11, color: count >= 3 ? 'var(--color-danger-strong)' : 'var(--color-warning)', background: count >= 3 ? 'var(--color-danger-bg)' : 'var(--color-warning-bg)', padding: '2px 7px', borderRadius: 4, fontWeight: 600, marginLeft: 6 }}>
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
    total:   meta.total,
    pending: jobs.filter((j) => j.status === 'pending').length,
    failed:  jobs.filter((j) => j.status === 'failed').length,
    printed: jobs.filter((j) => j.status === 'printed').length,
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchPrintJobs({ status: statusFilter || undefined, page });
      setJobs(res.data ?? []);
      setMeta(res.meta ?? { current_page: 1, last_page: 1, total: 0 });
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
    const colors: Record<string, string> = { printed: 'var(--color-success)', failed: 'var(--color-danger)', pending: 'var(--color-warning)' };
    return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: colors[s] ?? 'var(--color-text-muted)' }} />;
  };

  return (
    <PageShell>
    <>
      <PageHeader section="System"
        title="Print Queue"
        subtitle="Monitor and retry print jobs"
        action={
          <Btn onClick={() => { setPage(1); void load(); }} variant="secondary">
            <RefreshCw size={14} style={{ marginRight: 6 }} />Refresh
          </Btn>
        }
      />

      {toast && (
        <div style={{ background: 'var(--color-success-bg)', color: 'var(--color-success-strong)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: '0.875rem' }}>
          {toast}
        </div>
      )}
      {error && <ErrorMsg message={error} />}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }} className="stat-grid">
        <StatCard label="Total Jobs"        value={String(meta.total)} />
        <StatCard label="Pending (page)"    value={String(stats.pending)} accent="var(--color-warning)" />
        <StatCard label="Failed (page)"     value={String(stats.failed)}  accent="var(--color-danger)" />
        <StatCard label="Printed (page)"    value={String(stats.printed)} accent="var(--color-success)" />
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
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{meta.total} job{meta.total !== 1 ? 's' : ''}</span>
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
                <th style={TH}>Order</th>
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
                <tr key={job.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                  <td style={TD}>
                    <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>#{job.id}</span>
                  </td>
                  <td style={TD}>
                    {job.order_id ? (
                      <Link to={`/orders?order=${job.order_id}`} style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none', fontSize: 13 }}>
                        #{job.order_number ?? job.order_id}
                      </Link>
                    ) : (
                      <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>—</span>
                    )}
                  </td>
                  <td style={TD}>
                    <JobTypeIcon type={job.type} />
                    <RetryCountBadge count={job.retry_count} />
                  </td>
                  <td style={TD}>
                    <span style={{ fontSize: 13 }}>{job.printer_name ?? <span style={{ color: 'var(--color-text-muted)' }}>Default</span>}</span>
                  </td>
                  <td style={TD}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {statusDot(job.status)}
                      <Badge label={job.status} color={statColor(STATUS_COLORS[job.status] ?? 'default')} />
                    </div>
                  </td>
                  <td style={TD}>
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{job.copies}</span>
                  </td>
                  <td style={{ ...TD, maxWidth: 200 }}>
                    {job.error_message ? (
                      <span style={{ fontSize: 12, color: 'var(--color-danger)', fontFamily: 'monospace', wordBreak: 'break-word' }}>{job.error_message}</span>
                    ) : (
                      <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>—</span>
                    )}
                  </td>
                  <td style={TD}>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      {new Date(job.created_at).toLocaleString('en-MV', { timeZone: 'Indian/Maldives' })}
                    </div>
                    {job.printed_at && (
                      <div style={{ fontSize: 11, color: 'var(--color-success)' }}>
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
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', padding: '6px 12px' }}>
                Page {meta.current_page} of {meta.last_page}
              </span>
              <Btn small variant="secondary" disabled={page === meta.last_page} onClick={() => setPage(page + 1)}>Next →</Btn>
            </div>
          )}
        </TableCard>
      )}
    </>

    </PageShell>
  );
}
