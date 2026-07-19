import { useEffect, useState } from 'react';
import {
  fetchSmsCampaigns, previewSmsCampaign, createSmsCampaign,
  sendSmsCampaign, cancelSmsCampaign, type SmsCampaign,
} from '../../api';
import { Badge, Btn, Card, ConfirmDialog, EmptyState, ErrorMsg, Input, Spinner, TableCard, TD, TH, statColor, useConfirmDialog } from '../../components/Layout';
import { smsCharCount } from '../../utils/smsCharCount';

type PreviewResult = {
  recipient_count: number;
  total_cost_mvr: string;
  ab_test_enabled?: boolean;
  ab_split?: { variant_a: number; variant_b: number };
};

type AudiencePreset = 'all' | 'vip_customers' | 'repeat_customers' | 'dormant_30d' | 'sms_opt_in';

type CampaignPrefill = {
  create?: boolean;
  segment?: string;
  message?: string;
};

const AUDIENCE_OPTIONS: Array<{ value: AudiencePreset; label: string }> = [
  { value: 'all', label: 'All SMS opt-in customers' },
  { value: 'vip_customers', label: 'VIP customers (spend segment)' },
  { value: 'repeat_customers', label: 'Repeat customers (2+ paid orders)' },
  { value: 'dormant_30d', label: 'Dormant 30+ days' },
  { value: 'sms_opt_in', label: 'SMS opt-in only' },
];

function audienceToCriteria(audience: AudiencePreset): Record<string, unknown> {
  if (audience === 'all') return { opted_in: true };
  return { segment: audience, opted_in: true };
}

export function CampaignsTab({ prefill }: { prefill?: CampaignPrefill } = {}) {
  const [campaigns, setCampaigns] = useState<SmsCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);
  const { state: dlg, ask, close: closeDlg } = useConfirmDialog();

  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [messageB, setMessageB] = useState('');
  const [abEnabled, setAbEnabled] = useState(false);
  const [abSplit, setAbSplit] = useState(50);
  const [audience, setAudience] = useState<AudiencePreset>('all');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setCreating(false);
    setName('');
    setMessage('');
    setMessageB('');
    setAbEnabled(false);
    setAbSplit(50);
    setAudience('all');
    setPreview(null);
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchSmsCampaigns();
      setCampaigns(res.data ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!prefill?.create && !prefill?.segment && !prefill?.message) return;
    setCreating(true);
    if (prefill.message) setMessage(prefill.message);
    const seg = prefill.segment || '';
    if (AUDIENCE_OPTIONS.some((o) => o.value === seg)) {
      setAudience(seg as AudiencePreset);
      setName((prev) => prev || `${AUDIENCE_OPTIONS.find((o) => o.value === seg)?.label ?? seg} campaign`);
    }
  }, [prefill?.create, prefill?.segment, prefill?.message]);

  const buildPayload = () => ({
    message,
    ...(abEnabled ? {
      ab_test_enabled: true,
      message_variant_b: messageB,
      ab_split_percent: abSplit,
    } : {}),
    target_criteria: audienceToCriteria(audience),
  });

  const handlePreview = async () => {
    if (!message || (abEnabled && !messageB)) return;
    setPreviewing(true);
    try {
      const res = await previewSmsCampaign(buildPayload());
      setPreview(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreviewing(false);
    }
  };

  const handleCreate = async () => {
    if (!name || !message || (abEnabled && !messageB)) return;
    setSaving(true);
    try {
      await createSmsCampaign({ name, ...buildPayload() });
      resetForm();
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

  const segA = smsCharCount(message);
  const segB = smsCharCount(messageB);

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
            <label style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F', display: 'block', marginBottom: 4 }}>Campaign Name</label>
            <Input value={name} onChange={setName} placeholder="e.g. Eid Special Offer" />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F', display: 'block', marginBottom: 4 }}>Audience</label>
            <select
              value={audience}
              onChange={(e) => { setAudience(e.target.value as AudiencePreset); setPreview(null); }}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid #E8E0D8', fontSize: 14, fontFamily: 'inherit' }}
            >
              {AUDIENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p style={{ fontSize: 12, color: '#9C8E7E', margin: '6px 0 0' }}>
              VIP uses the CRM spend segment (not loyalty Gold). Opted-out numbers are always excluded.
            </p>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#1C1408' }}>
            <input type="checkbox" checked={abEnabled} onChange={(e) => { setAbEnabled(e.target.checked); setPreview(null); }} />
            A/B test two message variants
          </label>

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F' }}>{abEnabled ? 'Variant A' : 'Message'}</label>
              <span style={{ fontSize: 11, color: segA.segments > 1 ? '#ef4444' : '#9C8E7E' }}>
                {segA.chars} chars · {segA.segments} segment{segA.segments > 1 ? 's' : ''}
                {segA.isUnicode && <span style={{ color: '#F59E0B', fontWeight: 600, marginLeft: 6 }}>Unicode</span>}
              </span>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your SMS message here…"
              rows={4}
              style={{ width: '100%', border: '1px solid #E8E0D8', borderRadius: 9, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }}
            />
          </div>

          {abEnabled && (
            <>
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F' }}>Variant B</label>
                  <span style={{ fontSize: 11, color: segB.segments > 1 ? '#ef4444' : '#9C8E7E' }}>
                    {segB.chars} chars · {segB.segments} segment{segB.segments > 1 ? 's' : ''}
                    {segB.isUnicode && <span style={{ color: '#F59E0B', fontWeight: 600, marginLeft: 6 }}>Unicode</span>}
                  </span>
                </div>
                <textarea
                  value={messageB}
                  onChange={(e) => setMessageB(e.target.value)}
                  placeholder="Alternative message to test…"
                  rows={4}
                  style={{ width: '100%', border: '1px solid #E8E0D8', borderRadius: 9, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F', display: 'block', marginBottom: 6 }}>
                  Split: {abSplit}% Variant A / {100 - abSplit}% Variant B
                </label>
                <input
                  type="range"
                  min={10}
                  max={90}
                  value={abSplit}
                  onChange={(e) => setAbSplit(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>
            </>
          )}

          {preview && (
            <div style={{ background: '#f0f9ff', borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#0369a1', marginBottom: preview.ab_split ? 6 : 0 }}>
                Preview: {preview.recipient_count} recipients · Est. MVR {preview.total_cost_mvr}
              </p>
              {preview.ab_split && (
                <p style={{ fontSize: 13, color: '#0369a1' }}>
                  Split → A: {preview.ab_split.variant_a} · B: {preview.ab_split.variant_b}
                </p>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Btn variant="secondary" onClick={handlePreview} disabled={previewing || !message || (abEnabled && !messageB)}>
              {previewing ? 'Checking…' : '👁 Preview Audience'}
            </Btn>
            <Btn onClick={handleCreate} disabled={saving || !name || !message || (abEnabled && !messageB)}>
              {saving ? 'Creating…' : 'Create Draft'}
            </Btn>
            <Btn variant="ghost" onClick={resetForm}>Cancel</Btn>
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
                {['Name', 'A/B', 'Status', 'Recipients', 'Sent', 'A/B Results', 'Cost', 'Created', ''].map((h) => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td style={{ ...TD, fontWeight: 600 }}>{c.name}</td>
                  <td style={TD}>
                    {c.ab_test_enabled
                      ? <Badge label={`${c.ab_split_percent ?? 50}/${100 - (c.ab_split_percent ?? 50)}`} color="#8b5cf6" />
                      : <span style={{ color: '#9C8E7E', fontSize: 12 }}>—</span>}
                  </td>
                  <td style={TD}><Badge label={c.status} color={statColor(c.status)} /></td>
                  <td style={{ ...TD, color: '#6B5D4F' }}>{c.total_recipients}</td>
                  <td style={TD}>
                    <span style={{ color: '#22c55e', fontWeight: 600 }}>{c.sent_count}</span>
                    {c.failed_count > 0 && <span style={{ color: '#ef4444', marginLeft: 4 }}>/ {c.failed_count} failed</span>}
                  </td>
                  <td style={{ ...TD, fontSize: 12, color: '#6B5D4F' }}>
                    {c.ab_test_enabled && c.ab_stats ? (
                      <div>
                        <div>A: {c.ab_stats.a.sent} sent ({c.ab_stats.a.delivery_rate}%)</div>
                        <div>B: {c.ab_stats.b.sent} sent ({c.ab_stats.b.delivery_rate}%)</div>
                      </div>
                    ) : '—'}
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
