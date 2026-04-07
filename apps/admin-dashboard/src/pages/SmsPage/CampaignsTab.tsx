import { useEffect, useState } from 'react';
import {
  fetchSmsCampaigns, previewSmsCampaign, createSmsCampaign,
  sendSmsCampaign, cancelSmsCampaign, type SmsCampaign,
} from '../../api';
import { Badge, Btn, Card, ConfirmDialog, EmptyState, ErrorMsg, Input, Spinner, TableCard, TD, TH, statColor, useConfirmDialog } from '../../components/Layout';
import { smsSegmentInfo } from '../../utils/smsSegments';

export function CampaignsTab() {
  const [campaigns, setCampaigns] = useState<SmsCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);
  const { state: dlg, ask, close: closeDlg } = useConfirmDialog();

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

  const handleSend = (id: number) => {
    ask({
      title: 'Send Campaign',
      message: 'Send this campaign to all recipients? This cannot be undone.',
      confirmLabel: 'Send',
      onConfirm: async () => {
        setActionId(id);
        try { await sendSmsCampaign(id); await load(); }
        catch (e) { setError((e as Error).message); }
        finally { setActionId(null); }
      },
    });
  };

  const handleCancel = (id: number) => {
    ask({
      title: 'Cancel Campaign',
      message: 'Cancel this campaign? It will not be sent.',
      confirmLabel: 'Cancel Campaign',
      danger: true,
      onConfirm: async () => {
        setActionId(id);
        try { await cancelSmsCampaign(id); await load(); }
        catch (e) { setError((e as Error).message); }
        finally { setActionId(null); }
      },
    });
  };

  const segInfo  = smsSegmentInfo(message);
  const segments = segInfo.segments;

  return (
    <>
      <ConfirmDialog state={dlg} close={closeDlg} />
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
              <span style={{ fontSize: 11, color: segments > 1 ? '#ef4444' : '#94a3b8' }}>
                {message.length} chars · {segments} segment{segments > 1 ? 's' : ''}
                {segInfo.isUnicode && <span style={{ color: '#F59E0B', fontWeight: 600, marginLeft: 6 }}>Unicode</span>}
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
                  <td style={{ ...TD, color: '#D4813A', fontWeight: 600 }}>MVR {c.total_cost_mvr ?? '—'}</td>
                  <td style={{ ...TD, color: '#9C8E7E', fontSize: 12 }}>{new Date(c.created_at).toLocaleDateString()}</td>
                  <td style={TD}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {c.status === 'draft' && (
                        <Btn small onClick={() => handleSend(c.id)} disabled={actionId === c.id}>
                          {actionId === c.id ? 'Sending…' : 'Send'}
                        </Btn>
                      )}
                      {['draft', 'sending'].includes(c.status) && (
                        <Btn small variant="danger" onClick={() => handleCancel(c.id)} disabled={actionId === c.id}>
                          Cancel
                        </Btn>
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
