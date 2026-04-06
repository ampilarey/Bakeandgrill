import { useEffect, useState } from 'react';
import {
  fetchSmsPromotions, createSmsPromotion, updateSmsPromotion,
  deleteSmsPromotion, previewSmsPromotion, type SmsPromotion,
} from '../../api';
import { Badge, Btn, Card, ConfirmDialog, EmptyState, ErrorMsg, Input, Select, TableCard, TD, TH, statColor, useConfirmDialog } from '../../components/Layout';

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
  return { segments, charsPerSeg, remaining: charsPerSeg - used };
}

const EMPTY_FORM = { name: '', message: '', promotion_code: '', trigger_type: 'manual', is_active: true };

export function PromotionsTab() {
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
      setPromos(res.promotions ?? []);
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
      const res = await previewSmsPromotion({ message: form.message, trigger_type: form.trigger_type });
      setPreview(res);
    } catch (e) { setError((e as Error).message); } finally {
      setPreviewing(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.message.trim()) return;
    setSaving(true);
    setError('');
    try {
      if (editId !== null) {
        await updateSmsPromotion(editId, { name: form.name, message: form.message, promotion_code: form.promotion_code || null, is_active: form.is_active });
        showToast('Promotion updated.');
      } else {
        await createSmsPromotion({ name: form.name, message: form.message, promotion_code: form.promotion_code || null, trigger_type: form.trigger_type, is_active: form.is_active });
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
        try { await deleteSmsPromotion(p.id); showToast('Promotion deleted.'); void load(); }
        catch (e) { setError((e as Error).message); }
      },
    });
  };

  const handleToggle = async (p: SmsPromotion) => {
    try { await updateSmsPromotion(p.id, { is_active: !p.is_active }); void load(); }
    catch (e) { setError((e as Error).message); }
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
            <Select options={TRIGGER_TYPES} value={form.trigger_type} onChange={(val) => setForm({ ...form, trigger_type: val })} style={{ width: '100%' }} />
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
                  <td style={TD}><Badge label={p.is_active ? 'Active' : 'Inactive'} color={statColor(p.is_active ? 'success' : 'default')} /></td>
                  <td style={TD}><span style={{ fontSize: 13 }}>{p.total_sent.toLocaleString()}</span></td>
                  <td style={TD}><span style={{ fontSize: 13 }}>{parseFloat(p.total_cost_mvr).toFixed(2)}</span></td>
                  <td style={TD}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Btn small variant="secondary" onClick={() => handleToggle(p)}>{p.is_active ? 'Pause' : 'Activate'}</Btn>
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
