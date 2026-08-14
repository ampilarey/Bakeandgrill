import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertTriangle, CheckCircle2, Database, HardDrive, MessageSquare, Printer, RefreshCw, Server, Webhook } from 'lucide-react';
import {
  forgetFailedJob,
  getCloneLiveToTestStatus,
  getSystemHealthDetailed,
  retryFailedJob,
  startCloneLiveToTest,
  type CloneLiveToTestStatus,
  type SystemHealthDetailed,
} from '../api';
import { Card, ErrorMsg, PageHeader, PageShell, SectionLabel, Spinner, StatCard } from '../components/Layout';
import { usePageTitle } from '../hooks/usePageTitle';
import { useCurrentUserPermissions } from '../hooks/usePermissions';

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-MV', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtDeployWhen(iso: string | null | undefined): string {
  if (!iso || iso === 'unknown') return 'unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-MV', { dateStyle: 'medium', timeStyle: 'short' });
}

function printProxyLabel(status: string, ok: boolean | null): string {
  if (status === 'not_configured') return 'Not configured';
  if (ok === true) return 'Reachable';
  if (status === 'unreachable') return 'Unreachable';
  return status;
}

export function SystemHealthPage() {
  usePageTitle('System Health');
  const navigate = useNavigate();
  const { user } = useCurrentUserPermissions();
  const isOwner = user?.role === 'owner';
  const [data, setData] = useState<SystemHealthDetailed | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [jobBusy, setJobBusy] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState('');
  const [cloneInfo, setCloneInfo] = useState<CloneLiveToTestStatus | null>(null);
  const [cloneBusy, setCloneBusy] = useState(false);
  const [cloneConfirm, setCloneConfirm] = useState('');

  const load = () => {
    setLoading(true);
    setErr('');
    getSystemHealthDetailed()
      .then(setData)
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  };

  const loadClone = () => {
    if (!isOwner) return;
    getCloneLiveToTestStatus()
      .then(setCloneInfo)
      .catch(() => setCloneInfo(null));
  };

  const handleClone = async () => {
    if (cloneConfirm.trim() !== 'CLONE FROM LIVE') {
      setErr('Type CLONE FROM LIVE exactly to confirm.');
      return;
    }
    if (!window.confirm(
      'This overwrites the TEST database with LIVE data and replaces TEST photos. TEST .env is kept. Continue?',
    )) {
      return;
    }
    setCloneBusy(true);
    setErr('');
    setActionMsg('');
    try {
      const res = await startCloneLiveToTest();
      setActionMsg(res.message);
      setCloneConfirm('');
      loadClone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setCloneBusy(false);
    }
  };

  const handleRetry = async (uuid: string) => {
    setJobBusy(uuid);
    setActionMsg('');
    try {
      await retryFailedJob(uuid);
      setActionMsg('Job queued for retry.');
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setJobBusy(null);
    }
  };

  const handleForget = async (uuid: string) => {
    if (!window.confirm('Discard this failed job permanently?')) return;
    setJobBusy(uuid);
    setActionMsg('');
    try {
      await forgetFailedJob(uuid);
      setActionMsg('Failed job discarded.');
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setJobBusy(null);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    loadClone();
  }, [isOwner]);

  useEffect(() => {
    if (!cloneInfo?.running) return;
    const t = setInterval(loadClone, 5_000);
    return () => clearInterval(t);
  }, [cloneInfo?.running]);

  const degraded = data?.status === 'degraded';
  const showClone = isOwner && cloneInfo?.available === true;

  return (
    <PageShell>
    <div>
      <PageHeader section="System"
        title="System Health"
        subtitle="Redis, queue, payments, webhooks, SMS, and print-proxy status"
        action={
          <button
            type="button"
            onClick={load}
            disabled={loading}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 10, border: '1px solid var(--color-border)',
              background: 'var(--color-surface)', cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit',
              fontSize: 13, fontWeight: 600, color: 'var(--color-text)',
            }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      {err && <ErrorMsg message={err} />}
      {actionMsg && (
        <p style={{ color: 'var(--color-success-strong)', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{actionMsg}</p>
      )}
      {loading && !data && <Spinner />}

      {showClone && (
        <Card data-testid="clone-live-to-test" style={{ marginBottom: 20, padding: 16, borderColor: 'var(--color-warning)' }}>
          <SectionLabel>TEST data from LIVE</SectionLabel>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.45 }}>
            Overwrite this TEST database and photos with a fresh copy from production.
            TEST settings (.env) stay unchanged. Takes a few minutes.
          </p>
          {cloneInfo?.status?.message && (
            <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--color-text-muted)' }}>
              Status: <strong style={{ color: 'var(--color-text)' }}>{cloneInfo.status.state}</strong>
              {cloneInfo.status.message ? ` — ${cloneInfo.status.message}` : ''}
              {cloneInfo.running ? ' (running…)' : ''}
            </p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <input
              type="text"
              value={cloneConfirm}
              onChange={(e) => setCloneConfirm(e.target.value)}
              placeholder='Type CLONE FROM LIVE'
              disabled={cloneBusy || !!cloneInfo?.running}
              aria-label="Confirm clone phrase"
              style={{
                minHeight: 44, flex: '1 1 220px', padding: '8px 12px', borderRadius: 10,
                border: '1px solid var(--color-border)', background: 'var(--color-surface)',
                color: 'var(--color-text)', fontFamily: 'inherit', fontSize: 13,
              }}
            />
            <button
              type="button"
              data-testid="clone-live-to-test-btn"
              onClick={() => { void handleClone(); }}
              disabled={cloneBusy || !!cloneInfo?.running || cloneConfirm.trim() !== 'CLONE FROM LIVE'}
              style={{
                minHeight: 44, padding: '8px 16px', borderRadius: 10, border: 'none',
                background: 'var(--color-primary)', color: '#fff', fontWeight: 700, fontSize: 13,
                fontFamily: 'inherit', cursor: cloneBusy || cloneInfo?.running ? 'wait' : 'pointer',
                opacity: cloneBusy || cloneInfo?.running || cloneConfirm.trim() !== 'CLONE FROM LIVE' ? 0.55 : 1,
              }}
            >
              {cloneInfo?.running ? 'Cloning…' : cloneBusy ? 'Starting…' : 'Clone LIVE → TEST'}
            </button>
          </div>
          {cloneInfo?.log_tail ? (
            <pre
              data-testid="clone-live-to-test-log"
              style={{
                marginTop: 12, maxHeight: 160, overflow: 'auto', fontSize: 11, lineHeight: 1.4,
                padding: 10, borderRadius: 8, border: '1px solid var(--color-border)',
                background: 'var(--color-bg)', color: 'var(--color-text-muted)', whiteSpace: 'pre-wrap',
              }}
            >
              {cloneInfo.log_tail}
            </pre>
          ) : null}
        </Card>
      )}

      {data && (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20,
            padding: '12px 16px', borderRadius: 12,
            background: degraded ? 'var(--color-danger-bg)' : '#F0FDF4',
            border: `1px solid ${degraded ? '#FECACA' : '#BBF7D0'}`,
          }}>
            {degraded ? <AlertTriangle size={20} color="var(--color-danger-strong)" /> : <CheckCircle2 size={20} color="var(--color-success-strong)" />}
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: degraded ? 'var(--color-danger-strong)' : 'var(--color-success-strong)' }}>
                {degraded ? 'Issues detected in the last 24 hours' : 'All systems nominal'}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                Last checked {fmtTime(data.checked_at)}
              </p>
              <p
                data-testid="deploy-stamp"
                style={{ margin: '6px 0 0', fontSize: 13, fontWeight: 600, color: 'var(--color-text)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
              >
                Running {data.deploy?.commit_short || 'unknown'} on {data.deploy?.branch || 'unknown'}, deployed {fmtDeployWhen(data.deploy?.deployed_at)}
              </p>
            </div>
          </div>

          {(data.alert_inbox?.length ?? 0) > 0 && (
            <>
              <SectionLabel>Alert inbox</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                {data.alert_inbox!.map((alert) => (
                  <Card key={alert.type} style={{ padding: '12px 16px', borderLeft: `4px solid ${alert.severity === 'critical' ? 'var(--color-danger)' : 'var(--color-warning)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: 'var(--color-text)' }}>{alert.message}</p>
                        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>{alert.count} item(s) · {alert.severity}</p>
                      </div>
                      {alert.link && (
                        <button
                          type="button"
                          onClick={() => navigate(alert.link!)}
                          style={{
                            padding: '6px 12px', borderRadius: 8, border: '1px solid var(--color-border)',
                            background: 'var(--color-surface)', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--color-primary)',
                          }}
                        >
                          Review →
                        </button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}

          <SectionLabel>Signals (24h)</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
            <StatCard
              label="Failed jobs"
              value={String(data.failed_jobs_24h)}
              sub={data.failed_jobs_24h > 0 ? 'Check queue worker' : 'None'}
              accent={data.failed_jobs_24h > 0 ? 'var(--color-danger)' : 'var(--color-success)'}
              icon={Server}
            />
            <StatCard
              label="BML webhook failures"
              value={String(data.webhook_failures_24h)}
              sub="Potential missed payments"
              accent={data.webhook_failures_24h > 0 ? 'var(--color-danger)' : 'var(--color-success)'}
              icon={Webhook}
            />
            <StatCard
              label="Stuck payments"
              value={String(data.payment_pending_stuck)}
              sub="payment_pending > 30 min"
              accent={data.payment_pending_stuck > 0 ? 'var(--color-warning)' : 'var(--color-success)'}
              icon={Activity}
            />
            <StatCard
              label="SMS failures"
              value={String(data.sms_failed_24h)}
              sub="Last 24 hours"
              accent={data.sms_failed_24h > 0 ? 'var(--color-danger)' : 'var(--color-success)'}
              icon={MessageSquare}
            />
            <StatCard
              label="Redis"
              value={data.redis?.status === 'up' ? 'Up' : data.redis?.status === 'degraded' ? 'Degraded' : data.redis ? 'Down' : '—'}
              sub={
                data.redis?.latency_ms != null
                  ? `${data.redis.latency_ms} ms`
                  : (data.redis?.error ? data.redis.error.slice(0, 40) : 'Not checked')
              }
              accent={
                data.redis?.status === 'down' ? 'var(--color-danger)'
                  : data.redis?.status === 'degraded' ? 'var(--color-warning)'
                    : data.redis?.status === 'up' ? 'var(--color-success)'
                      : 'var(--color-text-muted)'
              }
              icon={Database}
            />
            <StatCard
              label="Print proxy"
              value={printProxyLabel(data.print_proxy_status, data.print_proxy_ok)}
              sub={data.print_proxy_status}
              accent={data.print_proxy_ok === false ? 'var(--color-danger)' : data.print_proxy_ok === true ? 'var(--color-success)' : 'var(--color-text-muted)'}
              icon={Printer}
            />
            <StatCard
              label="Queue depth"
              value={String(data.queue_depth)}
              sub="Pending jobs"
              accent={data.queue_depth > 50 ? 'var(--color-warning)' : '#0ea5e9'}
              icon={Server}
            />
            <StatCard
              label="Disk free"
              value={
                data.disk?.free_percent != null
                  ? `${data.disk.free_percent}%`
                  : '—'
              }
              sub={
                data.disk?.free_gb != null
                  ? `${data.disk.free_gb} GB free`
                  : 'Unavailable'
              }
              accent={
                data.disk?.ok === false ? 'var(--color-danger)'
                  : data.disk?.ok === true ? 'var(--color-success)'
                    : 'var(--color-text-muted)'
              }
              icon={HardDrive}
            />
          </div>

          {data.stuck_payment_pending_orders.length > 0 && (
            <>
              <SectionLabel>Stuck payment_pending orders</SectionLabel>
              <Card style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.stuck_payment_pending_orders.map((o) => (
                    <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <button
                        type="button"
                        onClick={() => navigate(`/orders?order=${o.id}`)}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, color: 'var(--color-primary)', fontFamily: 'inherit' }}
                      >
                        #{o.order_number}
                      </button>
                      <span style={{ color: 'var(--color-text-secondary)' }}>
                        MVR {o.total.toFixed(2)} · {fmtTime(o.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}

          {data.recent_webhook_failures.length > 0 && (
            <>
              <SectionLabel>Recent BML webhook failures</SectionLabel>
              <Card style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {data.recent_webhook_failures.map((w) => (
                    <div key={w.id} style={{ fontSize: 13 }}>
                      <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>{w.event_type ?? 'unknown event'}</div>
                      <div style={{ color: 'var(--color-text-secondary)' }}>{w.error_message ?? 'No error message'}</div>
                      <div style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{fmtTime(w.created_at)}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}

          {data.recent_failed_jobs.length > 0 && (
            <>
              <SectionLabel>Recent failed queue jobs</SectionLabel>
              <Card>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {data.recent_failed_jobs.map((j) => (
                    <div key={j.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600 }}>{j.queue} · {j.connection}</span>
                        <span style={{ color: 'var(--color-text-muted)' }}>{fmtTime(j.failed_at)}</span>
                      </div>
                      {j.exception_snippet && (
                        <div style={{ color: 'var(--color-text-secondary)', fontSize: 12, fontFamily: 'monospace' }}>
                          {j.exception_snippet}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          disabled={jobBusy === j.uuid}
                          onClick={() => void handleRetry(j.uuid)}
                          style={{
                            padding: '5px 10px', borderRadius: 8, border: '1px solid var(--color-border)',
                            background: 'var(--color-surface)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                            color: 'var(--color-primary)', fontFamily: 'inherit',
                          }}
                        >
                          {jobBusy === j.uuid ? '…' : 'Retry'}
                        </button>
                        <button
                          type="button"
                          disabled={jobBusy === j.uuid}
                          onClick={() => void handleForget(j.uuid)}
                          style={{
                            padding: '5px 10px', borderRadius: 8, border: '1px solid #FECACA',
                            background: 'var(--color-danger-bg)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                            color: 'var(--color-danger-strong)', fontFamily: 'inherit',
                          }}
                        >
                          Discard
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}

          {(data.scheduler_last_runs?.length ?? 0) > 0 && (
            <>
              <SectionLabel>Scheduled task last runs</SectionLabel>
              <Card>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(data.scheduler_last_runs ?? []).map((row) => (
                    <div key={row.command} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{row.command}</span>
                      <span style={{ color: row.stale ? 'var(--color-danger-strong)' : 'var(--color-success-strong)' }}>
                        {row.last_run ? fmtTime(row.last_run) : 'Never recorded'}
                        {row.stale && row.last_run ? ' · stale' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}
        </>
      )}
    </div>

    </PageShell>
  );
}
