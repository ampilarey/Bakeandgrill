import { useEffect, useState } from 'react';
import {
  fetchPromotions, createPromotion, updatePromotion, deletePromotion,
  type Promotion, type PromotionPayload,
} from '../api';
import {
  Badge, Btn, Card, EmptyState, ErrorMsg, Input,
  PageHeader, Select, Spinner,
} from '../components/Layout';

const EMPTY: PromotionPayload = {
  name: '', code: '', type: 'fixed', discount_value: 0,
  scope: 'order', min_order_laar: null, max_uses: null,
  stackable: false, is_active: true, starts_at: null, expires_at: null,
};

function PromotionForm({
  initial, onSave, onCancel,
}: {
  initial: PromotionPayload;
  onSave: (data: PromotionPayload) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<PromotionPayload>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = <K extends keyof PromotionPayload>(k: K, v: PromotionPayload[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // discount_value: for 'fixed' type, displayed in MVR (we multiply by 100 to store as laari)
  // for 'percentage', stored as-is (e.g. 20 = 20%)
  const discountDisplay = form.type === 'fixed'
    ? String((form.discount_value / 100).toFixed(2))
    : String(form.discount_value);

  const handleDiscountChange = (v: string) => {
    const n = parseFloat(v) || 0;
    set('discount_value', form.type === 'fixed' ? Math.round(n * 100) : n);
  };

  const minOrderDisplay = form.min_order_laar != null
    ? String((form.min_order_laar / 100).toFixed(2))
    : '';

  const handleMinOrderChange = (v: string) => {
    set('min_order_laar', v ? Math.round(parseFloat(v) * 100) : null);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.code.trim()) { setError('Name and code are required.'); return; }
    if (form.discount_value <= 0) { setError('Discount value must be greater than 0.'); return; }
    if (form.type === 'percentage' && form.discount_value > 100) { setError('Percentage discount cannot exceed 100%.'); return; }
    if (form.starts_at && form.expires_at && form.starts_at >= form.expires_at) {
      setError('Expiry date must be after start date.'); return;
    }
    setError('');
    setLoading(true);
    try { await onSave(form); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {error && <ErrorMsg message={error} />}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Promo Name">
          <Input value={form.name} onChange={(v) => set('name', v)} placeholder="e.g. Ramadan Special" />
        </Field>
        <Field label="Code">
          <Input value={form.code} onChange={(v) => set('code', v.toUpperCase())} placeholder="e.g. RAMADAN20" />
        </Field>
        <Field label="Discount Type">
          <Select
            value={form.type}
            onChange={(v) => set('type', v as 'fixed' | 'percentage')}
            options={[{ value: 'fixed', label: 'Fixed Amount (MVR)' }, { value: 'percentage', label: 'Percentage (%)' }]}
          />
        </Field>
        <Field label={`Discount Value (${form.type === 'percentage' ? '%' : 'MVR'})`}>
          <Input
            value={discountDisplay}
            onChange={handleDiscountChange}
            type="number"
          />
        </Field>
        <Field label="Min Order Amount (MVR)">
          <Input
            value={minOrderDisplay}
            onChange={handleMinOrderChange}
            type="number" placeholder="No minimum"
          />
        </Field>
        <Field label="Max Uses">
          <Input
            value={form.max_uses != null ? String(form.max_uses) : ''}
            onChange={(v) => set('max_uses', v ? parseInt(v) : null)}
            type="number" placeholder="Unlimited"
          />
        </Field>
        <Field label="Starts At">
          <Input value={form.starts_at ?? ''} onChange={(v) => set('starts_at', v || null)} type="datetime-local" />
        </Field>
        <Field label="Expires At">
          <Input value={form.expires_at ?? ''} onChange={(v) => set('expires_at', v || null)} type="datetime-local" />
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
          Active
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.stackable} onChange={(e) => set('stackable', e.target.checked)} />
          Stackable
        </label>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
        <Btn onClick={handleSave} disabled={loading}>{loading ? 'Saving…' : 'Save Promo'}</Btn>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

function formatDiscount(p: Promotion): string {
  if (p.type === 'percentage') return `${p.discount_value}%`;
  if (p.type === 'fixed') return `MVR ${(p.discount_value / 100).toFixed(2)}`;
  return p.type;
}

export function PromotionsPage() {
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchPromotions();
      setPromos(res.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleCreate = async (data: PromotionPayload) => {
    await createPromotion(data);
    setCreating(false);
    await load();
  };

  const handleUpdate = async (data: PromotionPayload) => {
    if (!editing) return;
    await updatePromotion(editing.id, data);
    setEditing(null);
    await load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this promotion?')) return;
    await deletePromotion(id);
    await load();
  };

  const handleToggle = async (p: Promotion) => {
    await updatePromotion(p.id, { is_active: !p.is_active });
    await load();
  };

  return (
    <>
      <PageHeader
        title="Promotions"
        subtitle="Manage promo codes and discounts"
        action={
          !creating && !editing
            ? <Btn onClick={() => setCreating(true)}>+ New Promo</Btn>
            : undefined
        }
      />
      {error && <ErrorMsg message={error} />}

      {(creating || editing) && (
        <Card style={{ marginBottom: 24 }}>
          <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 18, color: '#0f172a' }}>
            {creating ? 'Create New Promotion' : `Edit: ${editing?.name}`}
          </h3>
          <PromotionForm
            initial={editing ? {
              name: editing.name, code: editing.code,
              type: (editing.type === 'percentage' ? 'percentage' : 'fixed') as 'fixed' | 'percentage',
              discount_value: editing.discount_value, scope: editing.scope,
              min_order_laar: editing.min_order_laar, max_uses: editing.max_uses,
              stackable: editing.stackable, is_active: editing.is_active,
              starts_at: editing.starts_at, expires_at: editing.expires_at,
            } : EMPTY}
            onSave={creating ? handleCreate : handleUpdate}
            onCancel={() => { setCreating(false); setEditing(null); }}
          />
        </Card>
      )}

      {loading && promos.length === 0 ? (
        <Spinner />
      ) : promos.length === 0 ? (
        <Card><EmptyState message="No promotions yet. Create your first promo code." /></Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Name', 'Code', 'Discount', 'Uses', 'Valid', 'Status', ''].map((h) => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {promos.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{p.name}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <code style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 6, fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
                      {p.code}
                    </code>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#0ea5e9', fontWeight: 600 }}>
                    {formatDiscount(p)}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#475569' }}>
                    {p.redemptions_count}{p.max_uses ? ` / ${p.max_uses}` : ''}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#475569', fontSize: 12 }}>
                    {p.expires_at ? new Date(p.expires_at).toLocaleDateString() : '∞'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <Badge label={p.is_active ? 'Active' : 'Inactive'} color={p.is_active ? 'green' : 'gray'} />
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Btn small variant="ghost" onClick={() => handleToggle(p)}>
                        {p.is_active ? 'Disable' : 'Enable'}
                      </Btn>
                      <Btn small variant="secondary" onClick={() => { setEditing(p); setCreating(false); }}>Edit</Btn>
                      <Btn small variant="danger" onClick={() => handleDelete(p.id)}>Delete</Btn>
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
