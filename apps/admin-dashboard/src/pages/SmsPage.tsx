import { useEffect, useState } from 'react';
import {
  fetchSmsLogs, fetchSmsLogStats, fetchSmsCampaigns,
  createSmsCampaign, sendSmsCampaign, cancelSmsCampaign,
  previewSmsCampaign,
  type SmsLog, type SmsCampaign,
} from '../api';
import {
  Badge, Btn, Card, EmptyState, ErrorMsg, Input,
  PageHeader, Select, Spinner, statColor,
} from '../components/Layout';

type Tab = 'logs' | 'campaigns';

function LogsTab() {
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [stats, setStats] = useState<{ total: number; sent: number; failed: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [logsRes, statsRes] = await Promise.all([
        fetchSmsLogs({ type: typeFilter || undefined, status: statusFilter || undefined }),
        fetchSmsLogStats(),
      ]);
      setLogs(logsRes.data);
      setStats(statsRes);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [typeFilter, statusFilter]);

  return (
    <>
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
          <StatCard label="Total SMS" value={stats.total} color="#0ea5e9" />
          <StatCard label="Sent" value={stats.sent} color="#22c55e" />
          <StatCard label="Failed" value={stats.failed} color="#ef4444" />
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
        <Card><EmptyState message="No SMS logs found." /></Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['To', 'Type', 'Status', 'Message', 'Segments', 'Cost', 'Sent At'].map((h) => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>{l.to}</td>
                  <td style={{ padding: '10px 14px' }}><Badge label={l.type} color="blue" /></td>
                  <td style={{ padding: '10px 14px' }}><Badge label={l.status} color={statColor(l.status)} /></td>
                  <td style={{ padding: '10px 14px', color: '#475569', maxWidth: 200 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {l.message}
                    </span>
                    {l.error_message && <span style={{ color: '#ef4444', fontSize: 11 }}>{l.error_message}</span>}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#64748b', textAlign: 'center' }}>{l.segments}</td>
                  <td style={{ padding: '10px 14px', color: '#0ea5e9', fontWeight: 600 }}>MVR {l.cost_estimate_mvr}</td>
                  <td style={{ padding: '10px 14px', color: '#94a3b8', fontSize: 11 }}>
                    {l.sent_at ? new Date(l.sent_at).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
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
  const segments = charCount <= 160 ? 1 : Math.ceil(charCount / 153);

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
        <Card><EmptyState message="No campaigns yet." /></Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Name', 'Status', 'Recipients', 'Sent', 'Cost', 'Created', ''].map((h) => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{c.name}</td>
                  <td style={{ padding: '12px 16px' }}><Badge label={c.status} color={statColor(c.status)} /></td>
                  <td style={{ padding: '12px 16px', color: '#475569' }}>{c.total_recipients}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ color: '#22c55e' }}>{c.sent_count}</span>
                    {c.failed_count > 0 && <span style={{ color: '#ef4444', marginLeft: 4 }}>/ {c.failed_count} failed</span>}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#0ea5e9', fontWeight: 600 }}>
                    MVR {c.total_cost_mvr ?? '—'}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: 12 }}>
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {c.status === 'draft' && (
                        <Btn small onClick={() => handleSend(c.id)} style={{ background: '#22c55e', color: '#fff', border: 'none' }}>
                          Send
                        </Btn>
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
        </Card>
      )}
    </>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value.toLocaleString()}</div>
      <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{label}</div>
    </Card>
  );
}

export function SmsPage() {
  const [tab, setTab] = useState<Tab>('logs');

  return (
    <>
      <PageHeader title="SMS" subtitle="Logs and bulk campaigns" />
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid #e2e8f0' }}>
        {([['logs', 'Audit Logs'], ['campaigns', 'Campaigns']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '10px 20px', fontSize: 14, fontWeight: tab === t ? 700 : 400,
            color: tab === t ? '#0ea5e9' : '#64748b',
            background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: tab === t ? '2px solid #0ea5e9' : '2px solid transparent',
            marginBottom: -2,
          }}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'logs' ? <LogsTab /> : <CampaignsTab />}
    </>
  );
}
