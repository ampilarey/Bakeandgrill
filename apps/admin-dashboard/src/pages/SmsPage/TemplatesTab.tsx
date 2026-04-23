import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Eye, Lock } from 'lucide-react';
import {
  fetchSmsTemplates, createSmsTemplate, updateSmsTemplate, deleteSmsTemplate,
  previewSmsTemplateById, type SmsTemplate,
} from '../../api';
import { Badge, Btn, Card, EmptyState, Input, Modal, ModalActions, Spinner } from '../../components/Layout';

type TemplateForm = {
  name: string;
  body: string;
  type: 'order_notification' | 'schedule_reminder' | 'duty_reminder' | 'custom';
  description: string;
};

const EMPTY_FORM: TemplateForm = { name: '', body: '', type: 'custom', description: '' };

const TYPE_COLORS: Record<string, string> = {
  order_notification: 'blue',
  schedule_reminder: 'green',
  duty_reminder: 'orange',
  custom: 'gray',
};

function charCount(body: string): { chars: number; segments: number; encoding: string } {
  const isUnicode = /[^\u0000-\u007F\u00A0-\u00FF\u20AC\u0391-\u03C9]/.test(body);
  const chars = body.length;
  const limit = isUnicode ? 70 : 160;
  const segments = chars === 0 ? 0 : Math.ceil(chars / limit);
  return { chars, segments, encoding: isUnicode ? 'Unicode' : 'GSM-7' };
}

export function TemplatesTab() {
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editTemplate, setEditTemplate] = useState<SmsTemplate | null>(null);
  const [form, setForm] = useState<TemplateForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ templateId: number; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchSmsTemplates();
      setTemplates(res.templates);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openModal = (t?: SmsTemplate) => {
    setEditTemplate(t ?? null);
    setForm(t ? { name: t.name, body: t.body, type: t.type, description: t.description ?? '' } : EMPTY_FORM);
    setError('');
    setModal(true);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      if (editTemplate) {
        await updateSmsTemplate(editTemplate.id, form);
      } else {
        await createSmsTemplate(form);
      }
      setModal(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async (t: SmsTemplate) => {
    if (t.is_system) return;
    if (!confirm(`Delete template "${t.name}"?`)) return;
    await deleteSmsTemplate(t.id);
    await load();
  };

  const doPreview = async (t: SmsTemplate) => {
    try {
      const res = await previewSmsTemplateById(t.id);
      setPreview({ templateId: t.id, text: res.preview });
    } catch {
      setPreview({ templateId: t.id, text: t.body });
    }
  };

  const info = charCount(form.body);

  if (loading) return <Spinner />;

  return (
    <>
      <Btn onClick={() => openModal()} style={{ marginBottom: 16 }}>
        <Plus size={14} style={{ marginRight: 5, verticalAlign: 'middle' }} />New Template
      </Btn>

      {templates.length === 0 ? (
        <EmptyState message="No templates yet." />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {templates.map(t => (
            <Card key={t.id} style={{ padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</span>
                    <Badge label={t.type.replace(/_/g, ' ')} color={TYPE_COLORS[t.type] ?? 'gray'} />
                    {t.is_system && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#9C8E7E' }}>
                        <Lock size={10} />System
                      </span>
                    )}
                  </div>
                  {t.description && <div style={{ color: '#9C8E7E', fontSize: 12, marginBottom: 6 }}>{t.description}</div>}
                  <div style={{ background: '#F5F0EA', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#3B2A1A', fontFamily: 'monospace', lineHeight: 1.5 }}>
                    {t.body || <em style={{ color: '#9C8E7E' }}>Empty template</em>}
                  </div>
                  {t.variables && t.variables.length > 0 && (
                    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {t.variables.map(v => (
                        <span key={v.name} style={{ background: '#E8E0D8', borderRadius: 4, padding: '2px 7px', fontSize: 11, color: '#6B5D4F' }} title={v.description}>
                          {`{{${v.name}}}`}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, marginLeft: 12 }}>
                  <Btn variant="ghost" onClick={() => doPreview(t)}><Eye size={13} /></Btn>
                  <Btn variant="ghost" onClick={() => openModal(t)}><Pencil size={13} /></Btn>
                  {!t.is_system && (
                    <Btn variant="ghost" onClick={() => doDelete(t)}><Trash2 size={13} /></Btn>
                  )}
                </div>
              </div>
              {preview?.templateId === t.id && (
                <div style={{ marginTop: 10, background: '#fff', border: '1px solid #D4813A', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#3B2A1A' }}>
                  <strong style={{ fontSize: 11, color: '#D4813A' }}>PREVIEW:</strong> {preview.text}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {modal && (
        <Modal title={editTemplate ? 'Edit Template' : 'New Template'} onClose={() => setModal(false)}>
          <div style={{ display: 'grid', gap: 12 }}>
            {error && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>{error}</div>}
            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F', display: 'block', marginBottom: 4 }}>Template Name *</label>
                <Input value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="e.g. Shift Reminder" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F', display: 'block', marginBottom: 4 }}>Type</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as TemplateForm['type'] }))}
                  style={{ width: '100%', border: '1px solid #E8E0D8', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit' }}>
                  <option value="order_notification">Order Notification</option>
                  <option value="schedule_reminder">Schedule Reminder</option>
                  <option value="duty_reminder">Duty Reminder</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F', display: 'block', marginBottom: 4 }}>Description</label>
              <Input value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} placeholder="What is this template used for?" />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F' }}>Message Body *</label>
                <span style={{ fontSize: 11, color: info.segments > 1 ? '#ef4444' : '#9C8E7E' }}>
                  {info.chars} chars · {info.segments} segment{info.segments !== 1 ? 's' : ''} · {info.encoding}
                </span>
              </div>
              <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                rows={4} placeholder={'Use {{variable_name}} for dynamic values\ne.g. Order #{{order_number}} is ready.'}
                style={{ width: '100%', border: '1px solid #E8E0D8', borderRadius: 8, padding: '10px 12px', fontSize: 13, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }} />
              <div style={{ fontSize: 11, color: '#9C8E7E', marginTop: 4 }}>Use {'{{variable}}'} syntax for dynamic values.</div>
            </div>
          </div>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn onClick={save} disabled={saving || !form.name || !form.body}>
              {saving ? 'Saving…' : editTemplate ? 'Save Changes' : 'Create Template'}
            </Btn>
          </ModalActions>
        </Modal>
      )}
    </>
  );
}
