import { useEffect, useState } from 'react';
import {
  fetchSmsPromotions, previewSmsPromotion, sendSmsPromotion, type SmsPromotion,
} from '../../api';
import {
  Badge, Btn, Card, ConfirmDialog, EmptyState, ErrorMsg, Input, TableCard, TD, TH, statColor, useConfirmDialog,
} from '../../components/SharedUI';
import { smsCharCount } from '../../utils/smsCharCount';

const SEGMENT_OPTIONS = [
  { value: 'all',       label: 'All customers' },
  { value: 'active',    label: 'Active customers only' },
  { value: 'loyal',     label: 'Customers with 3+ orders' },
  { value: 'recent',    label: 'Ordered in last 30 days' },
  { value: 'inactive',  label: 'Inactive 60+ days' },
];

const SEGMENT_FILTERS: Record<string, Record<string, unknown>> = {
  all:      { active_only: false },
  active:   { active_only: true },
  loyal:    { active_only: true, min_orders: 3 },
  recent:   { active_only: true, last_order_days: 30 },
  inactive: { active_only: true, last_order_days: 9999, include_opted_out: false },
};

const EMPTY_FORM = { name: '', message: '', segment: 'active' };

export function PromotionsTab() {
  const { state: dlg, ask: askConfirm, close: closeDlg } = useConfirmDialog();
  const [history, setHistory] = useState<SmsPromotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<{ recipient_count: number; estimated_cost_mvr?: string; total_cost_mvr?: number; cost_mvr?: number } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchSmsPromotions();
      // Backend returns paginated object; extract .data array
      const data = (res.promotions as unknown as { data?: SmsPromotion[] })?.data ?? (res.promotions as unknown as SmsPromotion[]);
      setHistory(Array.isArray(data) ? data : []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const msgInfo = smsCharCount(form.message);

  const handlePreview = async () => {
    if (!form.message.trim()) return;
    setPreviewing(true);
    setPreview(null);
    setError('');
    try {
      const filters = SEGMENT_FILTERS[form.segment] ?? SEGMENT_FILTERS.active;
      const res = await previewSmsPromotion({ message: form.message, filters });
      // Backend returns { estimate: { recipient_count, cost_mvr, total_cost_mvr, ... } }
      const est = (res as unknown as { estimate?: typeof preview }).estimate ?? res;
      setPreview(est as typeof preview);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreviewing(false);
    }
  };

  const handleSend = () => {
    if (!form.message.trim()) return;
    const recipientCount = preview?.recipient_count;
    askConfirm({
      title: 'Send SMS Blast',
      message: `Send this message to ${recipientCount ? recipientCount.toLocaleString() : 'the selected'} recipient${recipientCount === 1 ? '' : 's'}? This cannot be undone.`,
      confirmLabel: 'Send Now',
      danger: false,
      onConfirm: async () => {
        setSending(true);
        setError('');
        try {
          const filters = SEGMENT_FILTERS[form.segment] ?? SEGMENT_FILTERS.active;
          await sendSmsPromotion({ message: form.message, name: form.name || undefined, filters });
          showToast('SMS blast queued successfully.');
          setShowForm(false);
          setForm(EMPTY_FORM);
          setPreview(null);
          void load();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setSending(false);
        }
      },
    });
  };

  const totalCostMvr = (p: typeof preview) => {
    if (!p) return null;
    if (typeof p.total_cost_mvr === 'number') return p.total_cost_mvr.toFixed(2);
    if (p.estimated_cost_mvr) return parseFloat(p.estimated_cost_mvr).toFixed(2);
    if (p.cost_mvr && p.recipient_count) return (p.cost_mvr * p.recipient_count).toFixed(2);
    return null;
  };

  return (
    <>
      <ConfirmDialog state={dlg} close={closeDlg} />
      {toast && (
        <div style={{ background: 'var(--color-success-bg)', color: 'var(--color-success-strong)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: '0.875rem' }}>
          {toast}
        </div>
      )}
      {error && <ErrorMsg message={error} />}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Btn onClick={() => { setShowForm(true); setForm(EMPTY_FORM); setPreview(null); setError(''); }}>
          + New SMS Blast
        </Btn>
      </div>

      {showForm && (
        <Card style={{ padding: 24, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>
            New SMS Blast
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }} className="form-grid-2">
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Name / Label (optional)</label>
              <Input value={form.name} onChange={(val) => setForm({ ...form, name: val })} placeholder="e.g. Weekend special" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Audience</label>
              <select
                value={form.segment}
                onChange={(e) => { setForm({ ...form, segment: e.target.value }); setPreview(null); }}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 13, fontFamily: 'inherit', background: 'var(--color-surface)' }}
              >
                {SEGMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Message *</label>
            <textarea
              value={form.message}
              onChange={(e) => { setForm({ ...form, message: e.target.value }); setPreview(null); }}
              rows={4}
              maxLength={480}
              placeholder="Hi, here's an exclusive offer from Bake & Grill…"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
              <span>{form.message.length} chars</span>
              <span>{msgInfo.segments} segment{msgInfo.segments !== 1 ? 's' : ''} ({msgInfo.charsPerSeg} chars/seg)</span>
              <span>{msgInfo.remaining} remaining</span>
              {msgInfo.isUnicode && <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>Unicode (70/seg)</span>}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <Btn small variant="secondary" onClick={handlePreview} disabled={previewing || !form.message.trim()}>
              {previewing ? 'Estimating…' : 'Estimate Reach & Cost'}
            </Btn>
            {preview && (
              <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--color-bg)', borderRadius: 8, fontSize: 13 }}>
                <strong>{(preview.recipient_count ?? 0).toLocaleString()}</strong> recipient{(preview.recipient_count ?? 0) !== 1 ? 's' : ''}
                {totalCostMvr(preview) && <> · Est. cost: <strong>MVR {totalCostMvr(preview)}</strong></>}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <Btn onClick={handleSend} disabled={sending || !form.message.trim() || !preview}>
              {sending ? 'Sending…' : preview ? '📤 Send Blast' : 'Estimate first'}
            </Btn>
            <Btn variant="secondary" onClick={() => { setShowForm(false); setPreview(null); }}>Cancel</Btn>
          </div>
        </Card>
      )}

      <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: 'var(--color-text-secondary)' }}>Past Blasts</h4>
      {loading ? (
        <Card><EmptyState message="Loading history…" /></Card>
      ) : history.length === 0 ? (
        <Card><EmptyState message="No SMS blasts sent yet." /></Card>
      ) : (
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>Name / Message</th>
                <th style={TH}>Status</th>
                <th style={TH}>Recipients</th>
                <th style={TH}>Date</th>
              </tr>
            </thead>
            <tbody>
              {history.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                  <td style={TD}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text)' }}>{p.name ?? '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.message}</div>
                  </td>
                  <td style={TD}>
                    <Badge
                      label={p.is_active !== undefined ? (p.is_active ? 'Active' : 'Done') : String((p as unknown as { status?: string }).status ?? '—')}
                      color={statColor(p.is_active ? 'success' : 'default')}
                    />
                  </td>
                  <td style={TD}><span style={{ fontSize: 13 }}>{(p.total_sent ?? 0).toLocaleString()}</span></td>
                  <td style={TD}><span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{new Date(p.created_at).toLocaleDateString()}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}
    </>
  );
}
