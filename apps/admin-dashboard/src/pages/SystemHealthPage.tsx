import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertTriangle, CheckCircle2, MessageSquare, Printer, RefreshCw, Server, Webhook } from 'lucide-react';
import { getSystemHealthDetailed, type SystemHealthDetailed } from '../api';
import { Card, ErrorMsg, PageHeader, SectionLabel, Spinner, StatCard } from '../components/Layout';
import { usePageTitle } from '../hooks/usePageTitle';

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-MV', { dateStyle: 'short', timeStyle: 'short' });
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
  const [data, setData] = useState<SystemHealthDetailed | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = () => {
    setLoading(true);
    setErr('');
    getSystemHealthDetailed()
      .then(setData)
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  const degraded = data?.status === 'degraded';

  return (
    <div>
      <PageHeader
        title="System Health"
        subtitle="Queue, payments, webhooks, SMS, and print-proxy status"
        action={
          <button
            type="button"
            onClick={load}
            disabled={loading}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 10, border: '1px solid #E8E0D8',
              background: '#fff', cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit',
              fontSize: 13, fontWeight: 600, color: '#1C1408',
            }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      {err && <ErrorMsg message={err} />}
      {loading && !data && <Spinner />}

      {data && (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20,
            padding: '12px 16px', borderRadius: 12,
            background: degraded ? '#FEF2F2' : '#F0FDF4',
            border: `1px solid ${degraded ? '#FECACA' : '#BBF7D0'}`,
          }}>
            {degraded ? <AlertTriangle size={20} color="#DC2626" /> : <CheckCircle2 size={20} color="#16A34A" />}
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: degraded ? '#991B1B' : '#166534' }}>
                {degraded ? 'Issues detected in the last 24 hours' : 'All systems nominal'}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6B5D4F' }}>
                Last checked {fmtTime(data.checked_at)}
              </p>
            </div>
          </div>

          {(data.alert_inbox?.length ?? 0) > 0 && (
            <>
              <SectionLabel>Alert inbox</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                {data.alert_inbox!.map((alert) => (
                  <Card key={alert.type} style={{ padding: '12px 16px', borderLeft: `4px solid ${alert.severity === 'critical' ? '#ef4444' : '#f59e0b'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#1C1408' }}>{alert.message}</p>
                        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9C8E7E' }}>{alert.count} item(s) · {alert.severity}</p>
                      </div>
                      {alert.link && (
                        <button
                          type="button"
                          onClick={() => navigate(alert.link!)}
                          style={{
                            padding: '6px 12px', borderRadius: 8, border: '1px solid #E8E0D8',
                            background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#D4813A',
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
              accent={data.failed_jobs_24h > 0 ? '#ef4444' : '#22c55e'}
              icon={Server}
            />
            <StatCard
              label="BML webhook failures"
              value={String(data.webhook_failures_24h)}
              sub="Potential missed payments"
              accent={data.webhook_failures_24h > 0 ? '#ef4444' : '#22c55e'}
              icon={Webhook}
            />
            <StatCard
              label="Stuck payments"
              value={String(data.payment_pending_stuck)}
              sub="payment_pending > 30 min"
              accent={data.payment_pending_stuck > 0 ? '#f59e0b' : '#22c55e'}
              icon={Activity}
            />
            <StatCard
              label="SMS failures"
              value={String(data.sms_failed_24h)}
              sub="Last 24 hours"
              accent={data.sms_failed_24h > 0 ? '#ef4444' : '#22c55e'}
              icon={MessageSquare}
            />
            <StatCard
              label="Print proxy"
              value={printProxyLabel(data.print_proxy_status, data.print_proxy_ok)}
              sub={data.print_proxy_status}
              accent={data.print_proxy_ok === false ? '#ef4444' : data.print_proxy_ok === true ? '#22c55e' : '#9C8E7E'}
              icon={Printer}
            />
            <StatCard
              label="Queue depth"
              value={String(data.queue_depth)}
              sub="Pending jobs"
              accent={data.queue_depth > 50 ? '#f59e0b' : '#0ea5e9'}
              icon={Server}
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
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, color: '#D4813A', fontFamily: 'inherit' }}
                      >
                        #{o.order_number}
                      </button>
                      <span style={{ color: '#6B5D4F' }}>
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
                      <div style={{ fontWeight: 600, color: '#1C1408' }}>{w.event_type ?? 'unknown event'}</div>
                      <div style={{ color: '#6B5D4F' }}>{w.error_message ?? 'No error message'}</div>
                      <div style={{ color: '#9C8E7E', fontSize: 12 }}>{fmtTime(w.created_at)}</div>
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.recent_failed_jobs.map((j) => (
                    <div key={j.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ fontWeight: 600 }}>{j.queue} · {j.connection}</span>
                      <span style={{ color: '#9C8E7E' }}>{fmtTime(j.failed_at)}</span>
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
                      <span style={{ color: row.stale ? '#DC2626' : '#16A34A' }}>
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
  );
}
