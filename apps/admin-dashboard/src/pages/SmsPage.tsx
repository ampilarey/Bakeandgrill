import { useEffect, useState } from 'react';
import {
  fetchSmsLogs, fetchSmsLogStats, fetchSmsCampaigns,
  createSmsCampaign, sendSmsCampaign, cancelSmsCampaign,
  previewSmsCampaign,
  type SmsLog, type SmsCampaign,
} from '../api';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  Badge, Btn, Card, EmptyState, ErrorMsg, Input,
  PageHeader, Select, Spinner, StatCard, TableCard, TD, TH, statColor,
} from '../components/Layout';

type Tab = 'logs' | 'campaigns';

function LogsTab() {
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
      setLogs(logsRes.data);
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
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: '0.875rem' }}>
          {loadError}
        </div>
      )}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
          <StatCard label="Total SMS" value={stats.total.toLocaleString()} accent="#D4813A" />
          <StatCard label="Sent"      value={stats.sent.toLocaleString()}  accent="#22c55e" />
          <StatCard label="Failed"    value={stats.failed.toLocaleString()} accent="#ef4444" />
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
                  <td style={{ ...TD, color: '#6B5D4F', maxWidth: 200 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {l.message}
                    </span>
                    {l.error_message && <span style={{ color: '#ef4444', fontSize: 11 }}>{l.error_message}</span>}
                  </td>
                  <td style={{ ...TD, color: '#6B5D4F', textAlign: 'center' }}>{l.segments}</td>
                  <td style={{ ...TD, color: '#D4813A', fontWeight: 600 }}>MVR {l.cost_estimate_mvr}</td>
                  <td style={{ ...TD, color: '#9C8E7E', fontSize: 11, whiteSpace: 'nowrap' }}>
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

function CampaignsTab() {
  const [campaigns, setCampaigns] = useState<SmsCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  // Create form state
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<{ recipient_count: number; estimated_cost_mvr: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchSmsCampaigns();
      setCampaigns(res.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handlePreview = async () => {
    if (!message) return;
    setPreviewing(true);
    try {
      const res = await previewSmsCampaign({ message, criteria: {} });
      setPreview(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreviewing(false);
    }
  };

  const handleCreate = async () => {
    if (!name || !message) return;
    setSaving(true);
    try {
      await createSmsCampaign({ name, message, criteria: {} });
      setCreating(false);
      setName('');
      setMessage('');
      setPreview(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async (id: number) => {
    if (!confirm('Send this campaign to all recipients?')) return;
    try {
      await sendSmsCampaign(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleCancel = async (id: number) => {
    if (!confirm('Cancel this campaign?')) return;
    try {
      await cancelSmsCampaign(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const charCount = message.length;
  // Detect if the message contains non-GSM7 characters (Thaana, emoji, etc.)
  // GSM-7: single segment = 160 chars, multipart = 153 chars per segment
  // Unicode (UCS-2): single segment = 70 chars, multipart = 67 chars per segment
  const isUnicode = /[^\u0000-\u007F\u00A0-\u00FF\u20AC\u0160\u0161\u017D\u017E\u0152\u0153\u0178]/.test(message);
  const singleLimit = isUnicode ? 70 : 160;
  const multiLimit  = isUnicode ? 67 : 153;
  const segments = charCount <= singleLimit ? 1 : Math.ceil(charCount / multiLimit);

  return (
    <>
      {error && <ErrorMsg message={error} />}

      {!creating && (
        <Btn onClick={() => setCreating(true)} style={{ marginBottom: 20 }}>+ New Campaign</Btn>
      )}

      {creating && (
        <Card style={{ marginBottom: 24 }}>
          <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>New SMS Campaign</h3>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Campaign Name</label>
            <Input value={name} onChange={setName} placeholder="e.g. Eid Special Offer" />
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Message</label>
              <span style={{ fontSize: 11, color: charCount > 160 ? '#ef4444' : '#94a3b8' }}>
                {charCount} chars · {segments} segment{segments > 1 ? 's' : ''}
              </span>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your SMS message here…"
              rows={4}
              style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 9, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }}
            />
          </div>

          {preview && (
            <div style={{ background: '#f0f9ff', borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#0369a1' }}>
                Preview: {preview.recipient_count} recipients · Est. MVR {preview.estimated_cost_mvr}
              </p>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <Btn variant="secondary" onClick={handlePreview} disabled={previewing || !message}>
              {previewing ? 'Checking…' : '👁 Preview Audience'}
            </Btn>
            <Btn onClick={handleCreate} disabled={saving || !name || !message}>
              {saving ? 'Creating…' : 'Create Draft'}
            </Btn>
            <Btn variant="ghost" onClick={() => { setCreating(false); setPreview(null); }}>Cancel</Btn>
          </div>
        </Card>
      )}

      {loading && campaigns.length === 0 ? <Spinner /> : campaigns.length === 0 ? (
        <TableCard><EmptyState message="No campaigns yet." /></TableCard>
      ) : (
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                {['Name', 'Status', 'Recipients', 'Sent', 'Cost', 'Created', ''].map((h) => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td style={{ ...TD, fontWeight: 600 }}>{c.name}</td>
                  <td style={TD}><Badge label={c.status} color={statColor(c.status)} /></td>
                  <td style={{ ...TD, color: '#6B5D4F' }}>{c.total_recipients}</td>
                  <td style={TD}>
                    <span style={{ color: '#22c55e', fontWeight: 600 }}>{c.sent_count}</span>
                    {c.failed_count > 0 && <span style={{ color: '#ef4444', marginLeft: 4 }}>/ {c.failed_count} failed</span>}
                  </td>
                  <td style={{ ...TD, color: '#D4813A', fontWeight: 600 }}>
                    MVR {c.total_cost_mvr ?? '—'}
                  </td>
                  <td style={{ ...TD, color: '#9C8E7E', fontSize: 12 }}>
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                  <td style={TD}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {c.status === 'draft' && (
                        <Btn small onClick={() => handleSend(c.id)}>Send</Btn>
                      )}
                      {['draft', 'sending'].includes(c.status) && (
                        <Btn small variant="danger" onClick={() => handleCancel(c.id)}>Cancel</Btn>
                      )}
                    </div>
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

export function SmsPage() {
    usePageTitle('SMS');
  const [tab, setTab] = useState<Tab>('logs');

  return (
    <>
      <PageHeader title="SMS" subtitle="Logs and bulk campaigns" />
      <div style={{ display: 'flex', marginBottom: 20, borderBottom: '2px solid #E8E0D8' }}>
        {([['logs', 'Audit Logs'], ['campaigns', 'Campaigns']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '10px 20px', fontSize: 14, fontWeight: tab === t ? 700 : 500,
            color: tab === t ? '#D4813A' : '#9C8E7E',
            background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            borderBottom: tab === t ? '2px solid #D4813A' : '2px solid transparent',
            marginBottom: -2, transition: 'color 0.15s',
          }}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'logs' ? <LogsTab /> : <CampaignsTab />}
    </>
  );
}
