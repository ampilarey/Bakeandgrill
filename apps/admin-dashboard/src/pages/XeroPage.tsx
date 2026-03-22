import { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw, CheckCircle, XCircle, Link, Unlink, FileText, Receipt } from 'lucide-react';
import {
  getXeroStatus, getXeroConnectUrl, disconnectXero, getXeroLogs,
  type XeroStatus, type XeroLog,
} from '../api';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  Badge, Btn, Card, EmptyState, ErrorMsg, PageHeader, StatCard, TableCard, TD, TH, statColor,
} from '../components/Layout';

function StatusCard({ status }: { status: XeroStatus | null }) {
  if (!status) return null;

  const isConnected = status.connected;
  return (
    <Card style={{ padding: 24, marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: isConnected ? '#DCFCE7' : '#FEE2E2',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {isConnected
              ? <CheckCircle size={28} style={{ color: '#16A34A' }} />
              : <XCircle size={28} style={{ color: '#DC2626' }} />}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: '#1C1408' }}>
              {isConnected ? 'Connected to Xero' : 'Not connected'}
            </div>
            {isConnected && status.organisation_name && (
              <div style={{ color: '#6B5D4F', fontSize: 14 }}>{status.organisation_name}</div>
            )}
            {isConnected && status.connected_at && (
              <div style={{ color: '#9C8E7E', fontSize: 12, marginTop: 2 }}>
                Connected {new Date(status.connected_at).toLocaleDateString()}
                {status.last_sync_at && ` · Last sync ${new Date(status.last_sync_at).toLocaleString('en-MV', { timeZone: 'Indian/Maldives' })}`}
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function XeroPage() {
  usePageTitle('Xero Integration');

  const [status, setStatus] = useState<XeroStatus | null>(null);
  const [logs, setLogs] = useState<XeroLog[]>([]);
  const [logMeta, setLogMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [logPage, setLogPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [disconnecting, setDisconnecting] = useState(false);
  const [connectingUrl, setConnectingUrl] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const loadStatus = async () => {
    try {
      const s = await getXeroStatus();
      setStatus(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await getXeroLogs({ page: logPage });
      setLogs(res.data);
      setLogMeta(res.meta);
    } catch (_) {
      // Non-fatal
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => { void loadStatus(); }, []);
  useEffect(() => { void loadLogs(); }, [logPage]);

  const handleConnect = async () => {
    setConnectingUrl(true);
    setError('');
    try {
      const { redirect_url } = await getXeroConnectUrl();
      window.location.href = redirect_url;
    } catch (e) {
      setError((e as Error).message);
      setConnectingUrl(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect from Xero? This will stop syncing invoices and expenses.')) return;
    setDisconnecting(true);
    setError('');
    try {
      await disconnectXero();
      showToast('Disconnected from Xero successfully.');
      void loadStatus();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDisconnecting(false);
    }
  };

  const logStatusColor = (s: string) => {
    if (s === 'success') return statColor('success');
    return statColor('danger');
  };

  const logEntityIcon = (type: string) => {
    if (type === 'invoice') return <FileText size={13} style={{ color: '#6B5D4F', marginRight: 4, verticalAlign: 'middle' }} />;
    if (type === 'expense') return <Receipt size={13} style={{ color: '#6B5D4F', marginRight: 4, verticalAlign: 'middle' }} />;
    return null;
  };

  return (
    <>
      <PageHeader
        title="Xero Integration"
        subtitle="Sync invoices and expenses with your Xero accounting software"
        action={
          <Btn onClick={() => { void loadStatus(); void loadLogs(); }} variant="secondary">
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

      {loading ? (
        <Card><EmptyState message="Checking Xero connection…" /></Card>
      ) : (
        <>
          <StatusCard status={status} />

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }} className="stat-grid">
            <StatCard label="Total Syncs" value={String(logMeta.total)} />
            <StatCard label="Successful"  value={String(logs.filter((l) => l.status === 'success').length)} accent="#22C55E" />
            <StatCard label="Failed"      value={String(logs.filter((l) => l.status === 'failed').length)}  accent="#EF4444" />
          </div>

          {/* Connect / Disconnect actions */}
          <Card style={{ padding: 24, marginBottom: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#1C1408' }}>Connection</h3>
            {status?.connected ? (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Btn variant="danger" onClick={handleDisconnect} disabled={disconnecting}>
                  <Unlink size={14} style={{ marginRight: 6 }} />
                  {disconnecting ? 'Disconnecting…' : 'Disconnect from Xero'}
                </Btn>
                <a
                  href="https://go.xero.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#F8F6F3', border: '1px solid #E8E0D8', borderRadius: 8, fontSize: 13, color: '#6B5D4F', cursor: 'pointer', textDecoration: 'none', fontWeight: 500 }}
                >
                  <ExternalLink size={13} />Open Xero
                </a>
              </div>
            ) : (
              <div>
                <p style={{ margin: '0 0 16px', fontSize: 14, color: '#6B5D4F' }}>
                  Connect your Xero account to automatically sync invoices and expenses for accounting purposes.
                </p>
                <Btn onClick={handleConnect} disabled={connectingUrl}>
                  <Link size={14} style={{ marginRight: 6 }} />
                  {connectingUrl ? 'Redirecting to Xero…' : 'Connect to Xero'}
                </Btn>
              </div>
            )}
          </Card>

          {/* How to use */}
          {status?.connected && (
            <Card style={{ padding: 24, marginBottom: 24, background: '#F8F6F3', border: '1px solid #E8E0D8' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#1C1408' }}>How to Sync</h3>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: '#6B5D4F', lineHeight: 1.8 }}>
                <li>Go to <strong>Invoices</strong> page → open any invoice → click <em>"Push to Xero"</em></li>
                <li>Go to <strong>Expenses</strong> page → open any expense → click <em>"Push to Xero"</em></li>
                <li>Synced items appear in your Xero organisation under the matching account</li>
              </ul>
            </Card>
          )}

          {/* Sync log */}
          <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: '#1C1408' }}>Sync Log</h3>
          {logsLoading ? (
            <Card><EmptyState message="Loading logs…" /></Card>
          ) : logs.length === 0 ? (
            <Card><EmptyState message="No sync activity yet." /></Card>
          ) : (
            <TableCard>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={TH}>Time</th>
                    <th style={TH}>Action</th>
                    <th style={TH}>Entity</th>
                    <th style={TH}>Status</th>
                    <th style={TH}>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: '1px solid #F0EBE5' }}>
                      <td style={TD}>
                        <span style={{ fontSize: 12, color: '#6B5D4F' }}>
                          {new Date(log.created_at).toLocaleString('en-MV', { timeZone: 'Indian/Maldives' })}
                        </span>
                      </td>
                      <td style={TD}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#1C1408' }}>
                          {log.action.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={TD}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          {logEntityIcon(log.entity_type)}
                          <span style={{ fontSize: 13, color: '#6B5D4F', textTransform: 'capitalize' }}>
                            {log.entity_type}
                            {log.entity_id ? ` #${log.entity_id}` : ''}
                          </span>
                        </div>
                      </td>
                      <td style={TD}>
                        <Badge label={log.status} color={logStatusColor(log.status)} />
                      </td>
                      <td style={{ ...TD, maxWidth: 280 }}>
                        <span style={{ fontSize: 12, color: log.status === 'failed' ? '#EF4444' : '#6B5D4F', wordBreak: 'break-word' }}>
                          {log.message ?? '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {logMeta.last_page > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '16px 0' }}>
                  <Btn small variant="secondary" disabled={logPage === 1} onClick={() => setLogPage(logPage - 1)}>← Prev</Btn>
                  <span style={{ fontSize: 13, color: '#6B5D4F', padding: '6px 12px' }}>
                    Page {logMeta.current_page} of {logMeta.last_page}
                  </span>
                  <Btn small variant="secondary" disabled={logPage === logMeta.last_page} onClick={() => setLogPage(logPage + 1)}>Next →</Btn>
                </div>
              )}
            </TableCard>
          )}
        </>
      )}
    </>
  );
}
