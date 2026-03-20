import { useState, useEffect } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  PageHeader, TableCard, TH, TD, Badge, Btn, Modal, ModalActions, Input, Pagination, EmptyState,
} from '../components/SharedUI';
import { fetchSpecials, createSpecial, updateSpecial, deleteSpecial, fetchAdminItems, type DailySpecial, type MenuItem } from '../api';
import { Pencil, Trash2 } from 'lucide-react';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type SpecialForm = {
  item_id: number | '';
  badge_label: string;
  special_price: string;
  discount_pct: string;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  days_of_week: number[];
  max_quantity: string;
  description: string;
  is_active: boolean;
};

const today = () => new Date().toISOString().slice(0, 10);

const BLANK: SpecialForm = {
  item_id: '', badge_label: '', special_price: '', discount_pct: '',
  start_date: today(), end_date: today(), start_time: '', end_time: '',
  days_of_week: [], max_quantity: '', description: '', is_active: true,
};

export default function SpecialsPage() {
  usePageTitle('Daily Specials');

  const [specials, setSpecials] = useState<DailySpecial[]>([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DailySpecial | null>(null);
  const [form, setForm] = useState<SpecialForm>(BLANK);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetchSpecials({ page });
      setSpecials(res.data); setMeta(res.meta);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [page]);
  useEffect(() => { fetchAdminItems({ per_page: 200 }).then(r => setItems(r.data)).catch(() => {}); }, []);

  const openCreate = () => {
    setEditing(null); setForm({ ...BLANK, start_date: today(), end_date: today() });
    setFormError(''); setModalOpen(true);
  };

  const openEdit = (s: DailySpecial) => {
    setEditing(s);
    setForm({
      item_id: s.item_id,
      badge_label: s.badge_label ?? '',
      special_price: s.special_price != null ? String(s.special_price) : '',
      discount_pct: s.discount_pct != null ? String(s.discount_pct) : '',
      start_date: s.start_date,
      end_date: s.end_date,
      start_time: s.start_time ?? '',
      end_time: s.end_time ?? '',
      days_of_week: s.days_of_week ?? [],
      max_quantity: s.max_quantity != null ? String(s.max_quantity) : '',
      description: s.description ?? '',
      is_active: s.is_active,
    });
    setFormError(''); setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.item_id) { setFormError('Select a menu item.'); return; }
    if (!form.start_date || !form.end_date) { setFormError('Start and end dates are required.'); return; }
    setSaving(true); setFormError('');
    try {
      const payload = {
        item_id: Number(form.item_id),
        badge_label: form.badge_label || undefined,
        special_price: form.special_price ? parseFloat(form.special_price) : undefined,
        discount_pct: form.discount_pct ? parseInt(form.discount_pct, 10) : undefined,
        start_date: form.start_date,
        end_date: form.end_date,
        start_time: form.start_time || undefined,
        end_time: form.end_time || undefined,
        days_of_week: form.days_of_week.length > 0 ? form.days_of_week : undefined,
        max_quantity: form.max_quantity ? parseInt(form.max_quantity, 10) : undefined,
        description: form.description || undefined,
        is_active: form.is_active,
      };
      if (editing) { await updateSpecial(editing.id, payload); }
      else { await createSpecial(payload); }
      setModalOpen(false); void load();
    } catch (e) { setFormError((e as Error).message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this special?')) return;
    try { await deleteSpecial(id); void load(); }
    catch (e) { setError((e as Error).message); }
  };

  const toggleDay = (day: number) => {
    setForm(f => ({
      ...f,
      days_of_week: f.days_of_week.includes(day)
        ? f.days_of_week.filter(d => d !== day)
        : [...f.days_of_week, day].sort((a, b) => a - b),
    }));
  };

  const todayStr = today();
  const activeCount = specials.filter(s => s.is_active && s.start_date <= todayStr && s.end_date >= todayStr).length;

  return (
    <div>
      <PageHeader title="Daily Specials" action={<Btn onClick={openCreate}>+ Add Special</Btn>} />
      {error && <p style={{ color: '#ef4444', marginBottom: 16 }}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#fff', border: '1px solid #E8E0D8', borderRadius: 12, padding: '16px 20px' }}>
          <p style={{ fontSize: 12, color: '#9C8E7E', margin: '0 0 4px', fontWeight: 600 }}>TOTAL SPECIALS</p>
          <p style={{ fontSize: 22, fontWeight: 800, color: '#1C1408', margin: 0 }}>{meta.total}</p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E8E0D8', borderRadius: 12, padding: '16px 20px' }}>
          <p style={{ fontSize: 12, color: '#9C8E7E', margin: '0 0 4px', fontWeight: 600 }}>ACTIVE TODAY</p>
          <p style={{ fontSize: 22, fontWeight: 800, color: '#22c55e', margin: 0 }}>{activeCount}</p>
        </div>
      </div>

      <TableCard>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Item', 'Badge', 'Price', 'Dates', 'Days', 'Status', 'Sold', 'Actions'].map(h => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#9C8E7E' }}>Loading…</td></tr>
            ) : specials.length === 0 ? (
              <tr><td colSpan={8}><EmptyState message="No specials yet. Add one to get started." /></td></tr>
            ) : specials.map(s => (
              <tr key={s.id}>
                <td style={{ ...TD, fontWeight: 600 }}>
                  {s.item_image && <img src={s.item_image} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover', marginRight: 8, verticalAlign: 'middle' }} />}
                  {s.item_name}
                </td>
                <td style={TD}><Badge color="orange">{s.badge_label}</Badge></td>
                <td style={{ ...TD, fontSize: 13 }}>
                  {s.effective_price != null ? (
                    <>
                      <span style={{ fontWeight: 700, color: '#D4813A' }}>MVR {s.effective_price.toFixed(2)}</span>
                      {s.original_price != null && s.effective_price < s.original_price && (
                        <span style={{ color: '#9C8E7E', textDecoration: 'line-through', fontSize: 11, marginLeft: 4 }}>MVR {s.original_price.toFixed(2)}</span>
                      )}
                    </>
                  ) : '—'}
                </td>
                <td style={{ ...TD, fontSize: 12, color: '#6B5D4F' }}>{s.start_date} → {s.end_date}</td>
                <td style={{ ...TD, fontSize: 12 }}>
                  {s.days_of_week?.length ? s.days_of_week.map(d => DAY_NAMES[d]).join(', ') : <span style={{ color: '#9C8E7E' }}>All days</span>}
                </td>
                <td style={TD}><Badge color={s.is_active ? 'green' : 'gray'}>{s.is_active ? 'Active' : 'Inactive'}</Badge></td>
                <td style={TD}>{s.sold_count}</td>
                <td style={TD}>
                  <Btn small variant="secondary" onClick={() => openEdit(s)} style={{ marginRight: 6 }}><Pencil size={12} /></Btn>
                  <Btn small variant="danger" onClick={() => handleDelete(s.id)}><Trash2 size={12} /></Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      <Pagination page={page} totalPages={meta.last_page} onChange={setPage} />

      {modalOpen && (
        <Modal title={editing ? 'Edit Special' : 'Add Special'} onClose={() => setModalOpen(false)} maxWidth={520}>
          {formError && <p style={{ color: '#ef4444', marginBottom: 12 }}>{formError}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>Menu Item *</span>
              <select value={form.item_id} onChange={e => setForm(f => ({ ...f, item_id: Number(e.target.value) }))}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #E8E0D8', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}>
                <option value="">Select item…</option>
                {items.map(item => <option key={item.id} value={item.id}>{item.name} (MVR {parseFloat(String(item.base_price)).toFixed(2)})</option>)}
              </select>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>Special Price (MVR)</span>
                <Input type="number" min="0" step="0.01" placeholder="e.g. 39.00" value={form.special_price} onChange={v => setForm(f => ({ ...f, special_price: v }))} />
              </label>
              <label>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>Discount %</span>
                <Input type="number" min="1" max="100" placeholder="e.g. 20" value={form.discount_pct} onChange={v => setForm(f => ({ ...f, discount_pct: v }))} />
              </label>
            </div>
            <label>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>Badge Label</span>
              <Input placeholder="e.g. Chef's Special" value={form.badge_label} onChange={v => setForm(f => ({ ...f, badge_label: v }))} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>Start Date *</span>
                <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit' }} />
              </label>
              <label>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>End Date *</span>
                <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit' }} />
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>Start Time</span>
                <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit' }} />
              </label>
              <label>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>End Time</span>
                <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit' }} />
              </label>
            </div>
            <div>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 8 }}>
                Active Days <span style={{ color: '#9C8E7E', fontWeight: 400 }}>(empty = all days)</span>
              </span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {DAY_NAMES.map((name, i) => {
                  const active = form.days_of_week.includes(i);
                  return (
                    <button key={i} type="button" onClick={() => toggleDay(i)} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${active ? '#D4813A' : '#E8E0D8'}`, background: active ? 'rgba(212,129,58,0.12)' : '#fff', color: active ? '#D4813A' : '#6B5D4F', fontFamily: 'inherit' }}>{name}</button>
                  );
                })}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>Max Quantity</span>
                <Input type="number" min="1" placeholder="Unlimited" value={form.max_quantity} onChange={v => setForm(f => ({ ...f, max_quantity: v }))} />
              </label>
              <div style={{ display: 'flex', alignItems: 'center', paddingTop: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} style={{ width: 16, height: 16 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#6B5D4F' }}>Active</span>
                </label>
              </div>
            </div>
            <label>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>Description</span>
              <textarea placeholder="Optional…" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #E8E0D8', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
            </label>
          </div>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Btn>
            <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : editing ? 'Update' : 'Create'}</Btn>
          </ModalActions>
        </Modal>
      )}
    </div>
  );
}
