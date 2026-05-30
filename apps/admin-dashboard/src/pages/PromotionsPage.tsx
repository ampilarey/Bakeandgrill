import { useEffect, useRef, useState } from 'react';
import {
  fetchPromotions, createPromotion, updatePromotion, deletePromotion,
  fetchAdminCustomers,
  type Promotion, type PromotionPayload,
} from '../api';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  Badge, Btn, Card, ConfirmDialog, EmptyState, ErrorMsg, Input,
  PageHeader, Select, Spinner, TableCard, TD, TH, useConfirmDialog,
} from '../components/Layout';
import { downloadCSV } from '../utils/csvExport';
import { PrintCardModal, type PrintCardData } from '../components/PrintCardModal';

const EMPTY: PromotionPayload = {
  name: '', code: '', type: 'fixed', discount_value: 0,
  scope: 'order', min_order_laar: null, max_uses: null,
  stackable: false, is_active: true, starts_at: null, expires_at: null,
  restricted_customer_id: null,
};

function CustomerSearch({
  value, onChange,
}: {
  value: number | null;
  onChange: (id: number | null, label: string) => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ id: number; name: string | null; phone: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [label, setLabel] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    if (!v.trim()) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetchAdminCustomers({ search: v.trim(), page: 1 });
        setResults((res.data ?? []).slice(0, 6).map((c) => ({ id: c.id, name: c.name, phone: c.phone })));
      } finally { setSearching(false); }
    }, 300);
  };

  const select = (c: { id: number; name: string | null; phone: string }) => {
    const lbl = `${c.name ?? 'Unknown'} (${c.phone})`;
    setLabel(lbl); setQ(''); setResults([]);
    onChange(c.id, lbl);
  };

  return (
    <div style={{ position: 'relative' }}>
      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8, padding: '7px 10px', fontSize: 13 }}>
          <span style={{ flex: 1, color: '#166534', fontWeight: 600 }}>🔒 {label}</span>
          <button type="button" onClick={() => { onChange(null, ''); setLabel(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      ) : (
        <>
          <Input
            value={q}
            onChange={search}
            placeholder="Search by name or phone… (leave empty for public)"
          />
          {searching && <div style={{ fontSize: 12, color: '#9C8E7E', marginTop: 4 }}>Searching…</div>}
          {results.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #E8E0D8', borderRadius: 8, zIndex: 50, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', marginTop: 2 }}>
              {results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => select(c)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #F5F0EB' }}
                  onMouseOver={(e) => (e.currentTarget.style.background = '#FFF8F3')}
                  onMouseOut={(e) => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{ fontWeight: 600 }}>{c.name ?? 'Unknown'}</span>
                  <span style={{ color: '#9C8E7E', marginLeft: 8 }}>{c.phone}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

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
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return;
    if (n < 0) return;
    if (form.type === 'percentage' && n > 100) return;
    set('discount_value', form.type === 'fixed' ? Math.round(n * 100) : n);
  };

  const minOrderDisplay = form.min_order_laar != null
    ? String((form.min_order_laar / 100).toFixed(2))
    : '';

  const handleMinOrderChange = (v: string) => {
    if (!v) { set('min_order_laar', null); return; }
    const n = Math.round(parseFloat(v) * 100);
    if (!Number.isFinite(n)) return;
    set('min_order_laar', n);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.code.trim()) { setError('Name and code are required.'); return; }
    if (form.discount_value <= 0) { setError('Discount value must be greater than 0.'); return; }
    if (form.type === 'percentage' && form.discount_value > 100) { setError('Percentage discount cannot exceed 100%.'); return; }
    if (form.min_order_laar != null && form.min_order_laar < 0) { setError('Minimum order amount cannot be negative.'); return; }
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
      <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
            onChange={(v) => {
              const n = v ? parseInt(v, 10) : null;
              if (n !== null && (!Number.isFinite(n) || n < 0)) return;
              set('max_uses', n);
            }}
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
      <Field label="Restrict to Specific Customer (optional)">
        <CustomerSearch
          value={form.restricted_customer_id ?? null}
          onChange={(id) => set('restricted_customer_id', id)}
        />
        <div style={{ fontSize: 11, color: '#9C8E7E', marginTop: 3 }}>
          If set, only this customer can redeem the code — useful for personal discounts.
        </div>
      </Field>
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
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

function formatDiscount(p: Promotion): string {
  if (p.type === 'percentage') return `${p.discount_value}%`;
  if (p.type === 'fixed') return `MVR ${(parseFloat(String(p.discount_value ?? 0)) / 100).toFixed(2)}`;
  return p.type;
}

export function PromotionsPage() {
    usePageTitle('Promotions');
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [printCard, setPrintCard] = useState<PrintCardData | null>(null);
  const { state: dlg, ask, close: closeDlg } = useConfirmDialog();

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchPromotions();
      setPromos(res.data ?? []);
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

  const handleDelete = (id: number) => {
    ask({
      title: 'Delete Promotion',
      message: 'Delete this promotion? This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        try {
          await deletePromotion(id);
          await load();
        } catch (e) {
          setError((e as Error).message);
        }
      },
    });
  };

  const handleToggle = async (p: Promotion) => {
    try {
      await updatePromotion(p.id, { is_active: !p.is_active });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <ConfirmDialog state={dlg} close={closeDlg} />
      {printCard && <PrintCardModal data={printCard} onClose={() => setPrintCard(null)} />}
      <PageHeader
        title="Promotions"
        subtitle="Manage promo codes and discounts"
        action={
          !creating && !editing ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="secondary" onClick={() => downloadCSV('promotions', promos.map((p) => ({ Name: p.name, Code: p.code, Type: p.type, 'Discount Value': p.discount_value, Scope: p.scope, 'Max Uses': p.max_uses ?? 'Unlimited', Redemptions: p.redemptions_count, Active: p.is_active ? 'Yes' : 'No', Expires: p.expires_at ?? 'No expiry' })))}>Export CSV</Btn>
              <Btn onClick={() => setCreating(true)}>+ New Promo</Btn>
            </div>
          ) : undefined
        }
      />
      {error && <ErrorMsg message={error} />}

      {(creating || editing) && (
        <Card style={{ marginBottom: 24 }}>
          <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 18, color: '#1C1408' }}>
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
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                {['Name', 'Code', 'Discount', 'Uses', 'Valid', 'Status', ''].map((h) => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {promos.map((p) => (
                <tr key={p.id}>
                  <td style={{ ...TD, fontWeight: 600, color: '#1C1408' }}>
                    {p.name}
                    {p.restricted_customer_id && (
                      <div style={{ fontSize: 11, color: '#059669', fontWeight: 400, marginTop: 2 }}>
                        🔒 Personal promo
                      </div>
                    )}
                  </td>
                  <td style={TD}>
                    <code style={{ background: '#F8F6F3', padding: '2px 8px', borderRadius: 6, fontSize: 13, fontWeight: 700, letterSpacing: 1, color: '#1C1408', border: '1px solid #E8E0D8' }}>
                      {p.code}
                    </code>
                  </td>
                  <td style={{ ...TD, color: '#D4813A', fontWeight: 700 }}>
                    {formatDiscount(p)}
                  </td>
                  <td style={{ ...TD, color: '#6B5D4F' }}>
                    {p.redemptions_count}{p.max_uses ? ` / ${p.max_uses}` : ''}
                  </td>
                  <td style={{ ...TD, color: '#9C8E7E', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {p.expires_at ? new Date(p.expires_at).toLocaleDateString() : '∞'}
                  </td>
                  <td style={TD}>
                    <Badge label={p.is_active ? 'Active' : 'Inactive'} color={p.is_active ? 'green' : 'gray'} />
                  </td>
                  <td style={TD}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Btn small variant="ghost" onClick={() => handleToggle(p)}>
                        {p.is_active ? 'Disable' : 'Enable'}
                      </Btn>
                      <Btn small variant="secondary" onClick={() => { setEditing(p); setCreating(false); }}>Edit</Btn>
                      <Btn small variant="secondary" onClick={() => setPrintCard({
                        type: 'promo',
                        code: p.code,
                        title: p.name,
                        subtitle: formatDiscount(p),
                        expiry: p.expires_at ?? null,
                        note: p.restricted_customer_id ? 'Personal discount — non-transferable' : 'Enter code at checkout',
                        logoText: 'Bake & Grill',
                      })}>🖨️ Print</Btn>
                      <Btn small variant="danger" onClick={() => handleDelete(p.id)}>Delete</Btn>
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
