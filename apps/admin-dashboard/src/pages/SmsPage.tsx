import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import {
  fetchSmsLogs, fetchSmsLogStats, fetchSmsCampaigns,
  createSmsCampaign, sendSmsCampaign, cancelSmsCampaign,
  previewSmsCampaign,
  fetchSmsPromotions, createSmsPromotion, updateSmsPromotion, deleteSmsPromotion,
  type SmsLog, type SmsCampaign, type SmsPromotion,
} from '../api';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  Badge, Btn, Card, ConfirmDialog, EmptyState, ErrorMsg, Input,
  PageHeader, Select, Spinner, StatCard, TableCard, TD, TH, statColor,
  useConfirmDialog,
} from '../components/Layout';

type Tab = 'logs' | 'campaigns' | 'promotions';

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
  const [actionId, setActionId] = useState<number | null>(null);
  const { state: dlg, ask, close: closeDlg } = useConfirmDialog();

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

  const handleSend = (id: number) => {
    ask({
      title: 'Send Campaign',
      message: 'Send this campaign to all recipients? This cannot be undone.',
      confirmLabel: 'Send',
      onConfirm: async () => {
        setActionId(id);
        try {
          await sendSmsCampaign(id);
          await load();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setActionId(null);
        }
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
        try {
          await cancelSmsCampaign(id);
          await load();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setActionId(null);
        }
      },
    });
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
              <span style={{ fontSize: 11, color: charCount > (isUnicode ? 70 : 160) ? '#ef4444' : '#94a3b8' }}>
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

// ── SMS Promotions Tab ────────────────────────────────────────────────────────

const TRIGGER_TYPES = [
  { value: 'birthday',         label: 'Birthday (day of)' },
  { value: 'signup',           label: 'After signup' },
  { value: 'first_order',      label: 'After first order' },
  { value: 'points_milestone', label: 'Points milestone' },
  { value: 'inactive',         label: 'Re-engage inactive customers' },
  { value: 'manual',           label: 'Manual / one-time send' },
];

function isNonGsm(text: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[^\x00-\x7F\u00C0-\u00FF£$@¡¿]/.test(text);
}

function segmentInfo(msg: string): { segments: number; charsPerSeg: number; remaining: number } {
  const unicode = isNonGsm(msg);
  const charsPerSeg = unicode ? 70 : 160;
  const segments = Math.max(1, Math.ceil(msg.length / charsPerSeg));
  const used = msg.length % charsPerSeg || charsPerSeg;
  const remaining = charsPerSeg - used;
  return { segments, charsPerSeg, remaining };
}

const EMPTY_FORM = { name: '', message: '', promotion_code: '', trigger_type: 'manual', is_active: true };

function PromotionsTab() {
  const [promos, setPromos] = useState<SmsPromotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ recipient_count: number; sample: string[]; estimated_cost_mvr: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const { state: dlg, ask: askConfirm, close: closeDlg } = useConfirmDialog();

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchSmsPromotions();
      setPromos(res.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const msgInfo = segmentInfo(form.message);

  const handlePreview = async () => {
    if (!form.message.trim()) return;
    setPreviewing(true);
    setPreview(null);
    try {
      const res = await import('../api').then((m) =>
        m.previewSmsPromotion({ message: form.message, trigger_type: form.trigger_type })
      );
      setPreview(res);
    } catch (_) { /* ignore */ } finally {
      setPreviewing(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.message.trim()) return;
    setSaving(true);
    setError('');
    try {
      if (editId !== null) {
        await updateSmsPromotion(editId, {
          name: form.name,
          message: form.message,
          promotion_code: form.promotion_code || null,
          is_active: form.is_active,
        });
        showToast('Promotion updated.');
      } else {
        await createSmsPromotion({
          name: form.name,
          message: form.message,
          promotion_code: form.promotion_code || null,
          trigger_type: form.trigger_type,
          is_active: form.is_active,
        });
        showToast('Promotion created.');
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
      setEditId(null);
      setPreview(null);
      void load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (p: SmsPromotion) => {
    setEditId(p.id);
    setForm({ name: p.name, message: p.message, promotion_code: p.promotion_code ?? '', trigger_type: p.trigger_type, is_active: p.is_active });
    setPreview(null);
    setShowForm(true);
  };

  const handleDelete = (p: SmsPromotion) => {
    askConfirm({
      message: `Delete "${p.name}"? This cannot be undone.`,
      title: 'Delete Promotion',
      danger: true,
      onConfirm: async () => {
        try {
          await deleteSmsPromotion(p.id);
          showToast('Promotion deleted.');
          void load();
        } catch (e) {
          setError((e as Error).message);
        }
      },
    });
  };

  const handleToggle = async (p: SmsPromotion) => {
    try {
      await updateSmsPromotion(p.id, { is_active: !p.is_active });
      void load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <ConfirmDialog state={dlg} close={closeDlg} />
      {toast && (
        <div style={{ background: '#DCFCE7', color: '#166534', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: '0.875rem' }}>
          {toast}
        </div>
      )}
      {error && <ErrorMsg message={error} />}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Btn onClick={() => { setShowForm(true); setEditId(null); setForm(EMPTY_FORM); setPreview(null); }}>
          + New Promotion
        </Btn>
      </div>

      {/* Create / Edit form */}
      {showForm && (
        <Card style={{ padding: 24, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#1C1408' }}>
            {editId !== null ? 'Edit Promotion' : 'New SMS Promotion'}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }} className="form-grid-2">
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F', display: 'block', marginBottom: 4 }}>Name *</label>
              <Input value={form.name} onChange={(val) => setForm({ ...form, name: val })} placeholder="e.g. Birthday discount" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F', display: 'block', marginBottom: 4 }}>Promo Code (optional)</label>
              <Input value={form.promotion_code} onChange={(val) => setForm({ ...form, promotion_code: val })} placeholder="e.g. BDAY20" />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F', display: 'block', marginBottom: 4 }}>Trigger</label>
            <Select
              options={TRIGGER_TYPES}
              value={form.trigger_type}
              onChange={(val) => setForm({ ...form, trigger_type: val })}
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F', display: 'block', marginBottom: 4 }}>Message *</label>
            <textarea
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              rows={4}
              maxLength={640}
              placeholder="Hi {name}, here's an exclusive offer just for you…"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E8E0D8', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#9C8E7E', marginTop: 4 }}>
              <span>{form.message.length} chars</span>
              <span>{msgInfo.segments} segment{msgInfo.segments !== 1 ? 's' : ''} ({msgInfo.charsPerSeg} chars/seg)</span>
              <span>{msgInfo.remaining} remaining in segment</span>
              {isNonGsm(form.message) && <span style={{ color: '#F59E0B', fontWeight: 600 }}>Unicode (70/seg)</span>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <input type="checkbox" id="promo-active" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            <label htmlFor="promo-active" style={{ fontSize: 13, color: '#6B5D4F', cursor: 'pointer' }}>Active (send automatically on trigger)</label>
          </div>

          {/* Preview */}
          {form.trigger_type !== 'manual' && (
            <div style={{ marginBottom: 16 }}>
              <Btn small variant="secondary" onClick={handlePreview} disabled={previewing || !form.message.trim()}>
                {previewing ? 'Estimating…' : 'Estimate Recipients'}
              </Btn>
              {preview && (
                <div style={{ marginTop: 10, padding: '10px 14px', background: '#F8F6F3', borderRadius: 8, fontSize: 13 }}>
                  <strong>{preview.recipient_count}</strong> recipient{preview.recipient_count !== 1 ? 's' : ''} · Est. cost: <strong>MVR {preview.estimated_cost_mvr}</strong>
                  {preview.sample.length > 0 && (
                    <div style={{ marginTop: 6, color: '#9C8E7E', fontSize: 12 }}>
                      Sample: {preview.sample.slice(0, 3).join(', ')}{preview.sample.length > 3 ? ' …' : ''}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <Btn onClick={handleSubmit} disabled={saving || !form.name.trim() || !form.message.trim()}>
              {saving ? 'Saving…' : editId !== null ? 'Update' : 'Create'}
            </Btn>
            <Btn variant="secondary" onClick={() => { setShowForm(false); setEditId(null); setPreview(null); }}>Cancel</Btn>
          </div>
        </Card>
      )}

      {/* List */}
      {loading ? (
        <Card><EmptyState message="Loading promotions…" /></Card>
      ) : promos.length === 0 ? (
        <Card><EmptyState message="No SMS promotions yet. Create your first promotion above." /></Card>
      ) : (
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>Name</th>
                <th style={TH}>Trigger</th>
                <th style={TH}>Code</th>
                <th style={TH}>Status</th>
                <th style={TH}>Sent</th>
                <th style={TH}>Cost (MVR)</th>
                <th style={TH}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {promos.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #F0EBE5' }}>
                  <td style={TD}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#1C1408' }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: '#9C8E7E', marginTop: 2, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.message}</div>
                  </td>
                  <td style={TD}>
                    <span style={{ fontSize: 12, background: '#EEE9E3', color: '#6B5D4F', padding: '2px 7px', borderRadius: 4, fontWeight: 600 }}>
                      {TRIGGER_TYPES.find((t) => t.value === p.trigger_type)?.label ?? p.trigger_type}
                    </span>
                  </td>
                  <td style={TD}>
                    {p.promotion_code
                      ? <code style={{ fontSize: 12, background: '#F0EBE5', padding: '2px 6px', borderRadius: 4 }}>{p.promotion_code}</code>
                      : <span style={{ color: '#9C8E7E', fontSize: 12 }}>—</span>
                    }
                  </td>
                  <td style={TD}>
                    <Badge label={p.is_active ? 'Active' : 'Inactive'} color={statColor(p.is_active ? 'success' : 'default')} />
                  </td>
                  <td style={TD}><span style={{ fontSize: 13 }}>{p.total_sent.toLocaleString()}</span></td>
                  <td style={TD}><span style={{ fontSize: 13 }}>{parseFloat(p.total_cost_mvr).toFixed(2)}</span></td>
                  <td style={TD}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Btn small variant="secondary" onClick={() => handleToggle(p)}>
                        {p.is_active ? 'Pause' : 'Activate'}
                      </Btn>
                      <Btn small variant="secondary" onClick={() => handleEdit(p)}>Edit</Btn>
                      <Btn small variant="danger" onClick={() => handleDelete(p)}>Delete</Btn>
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
      <PageHeader title="SMS" subtitle="Logs, bulk campaigns, and automated promotions" />
      <div style={{ display: 'flex', marginBottom: 20, borderBottom: '2px solid #E8E0D8' }}>
        {([['logs', 'Audit Logs'], ['campaigns', 'Campaigns'], ['promotions', 'Promotions']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '10px 20px', fontSize: 14, fontWeight: tab === t ? 700 : 500,
            color: tab === t ? '#D4813A' : '#9C8E7E',
            background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            borderBottom: tab === t ? '2px solid #D4813A' : '2px solid transparent',
            marginBottom: -2, transition: 'color 0.15s',
          }}>
            {t === 'promotions' && <Zap size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />}
            {label}
          </button>
        ))}
      </div>
      {tab === 'logs' && <LogsTab />}
      {tab === 'campaigns' && <CampaignsTab />}
      {tab === 'promotions' && <PromotionsTab />}
    </>
  );
}
