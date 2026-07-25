import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchPromotions, createPromotion, updatePromotion, deletePromotion, fetchOffersPerformance,
  type Promotion, type PromotionPayload, type PromotionType, type PromotionTier,
  type OffersPerformanceReport,
} from '../api';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  Badge, Btn, Card, ConfirmDialog, EmptyState, ErrorMsg, Input,
  PageHeader, PageShell, ScrollX, Select, Spinner, TableCard, TD, TH, useConfirmDialog,
} from '../components/Layout';
import { CustomerSearch } from '../components/CustomerSearch';
import { downloadCSV } from '../utils/csvExport';
import { PrintCardModal, type PrintCardData } from '../components/PrintCardModal';

const STRATEGY_TYPES: PromotionType[] = ['tiered', 'quantity_break', 'buy_x_get_y', 'free_delivery'];

const TYPE_OPTIONS = [
  { value: 'fixed', label: 'Fixed Amount (MVR)' },
  { value: 'percentage', label: 'Percentage (%)' },
  { value: 'tiered', label: 'Tiered (spend & save)' },
  { value: 'quantity_break', label: 'Quantity break' },
  { value: 'buy_x_get_y', label: 'BOGO / Buy X Get Y' },
  { value: 'free_delivery', label: 'Free delivery' },
];

const EMPTY: PromotionPayload = {
  name: '', code: '', type: 'fixed', discount_value: 0,
  scope: 'order', min_order_laar: null, max_uses: null,
  stackable: false, is_active: true, auto_apply: false,
  first_order_only: false, waive_delivery: false, budget_laar: null,
  metadata: {},
  starts_at: null, expires_at: null,
  days_of_week: null, starts_time: null, ends_time: null,
  restricted_customer_id: null, targets: [],
};

const DAY_OPTIONS = [
  { value: 0, label: 'Sun' }, { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' }, { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

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
  const [targetType, setTargetType] = useState<'item' | 'category'>('category');
  const [targetId, setTargetId] = useState('');

  const set = <K extends keyof PromotionPayload>(k: K, v: PromotionPayload[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const autoApply = !!form.auto_apply;
  const isStrategy = STRATEGY_TYPES.includes(form.type);
  const meta = form.metadata ?? {};
  const tiers: PromotionTier[] = Array.isArray(meta.tiers) ? meta.tiers : [];

  const setMeta = (patch: Partial<NonNullable<PromotionPayload['metadata']>>) =>
    setForm((f) => ({ ...f, metadata: { ...(f.metadata ?? {}), ...patch } }));

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

  const budgetDisplay = form.budget_laar != null
    ? String((form.budget_laar / 100).toFixed(2))
    : '';

  const handleBudgetChange = (v: string) => {
    if (!v) { set('budget_laar', null); return; }
    const n = Math.round(parseFloat(v) * 100);
    if (!Number.isFinite(n) || n < 1) return;
    set('budget_laar', n);
  };

  const handleTypeChange = (v: string) => {
    const type = v as PromotionType;
    setForm((f) => {
      const next: PromotionPayload = { ...f, type };
      if (type === 'free_delivery') {
        next.waive_delivery = true;
        next.discount_value = 0;
      }
      if (type === 'tiered' && !f.metadata?.tiers?.length) {
        next.metadata = { tiers: [{ min_laar: 30000, kind: 'fixed', value: 3000 }] };
      }
      if (type === 'quantity_break') {
        next.metadata = { min_qty: 3, kind: 'percentage', value: 10, ...(f.metadata ?? {}) };
      }
      if (type === 'buy_x_get_y') {
        next.metadata = {
          buy_qty: 2, get_qty: 1, get_discount_pct: 100, cheapest: true,
          ...(f.metadata ?? {}),
        };
      }
      return next;
    });
  };

  const updateTier = (idx: number, patch: Partial<PromotionTier>) => {
    const next = tiers.map((t, i) => (i === idx ? { ...t, ...patch } : t));
    setMeta({ tiers: next });
  };

  const addTier = () => {
    setMeta({ tiers: [...tiers, { min_laar: 50000, kind: 'fixed', value: 5000 }] });
  };

  const removeTier = (idx: number) => {
    setMeta({ tiers: tiers.filter((_, i) => i !== idx) });
  };

  const toggleDay = (day: number) => {
    const current = form.days_of_week ?? [];
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort();
    set('days_of_week', next.length ? next : null);
  };

  const addTarget = () => {
    const id = parseInt(targetId, 10);
    if (!Number.isFinite(id) || id < 1) return;
    const existing = form.targets ?? [];
    if (existing.some((t) => t.target_type === targetType && t.target_id === id)) return;
    set('targets', [...existing, { target_type: targetType, target_id: id, is_exclusion: false }]);
    setTargetId('');
  };

  const removeTarget = (idx: number) => {
    set('targets', (form.targets ?? []).filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required.'); return; }
    if (!autoApply && !form.code?.trim()) { setError('Name and code are required.'); return; }
    if (!isStrategy && form.discount_value <= 0) { setError('Discount value must be greater than 0.'); return; }
    if (form.type === 'percentage' && form.discount_value > 100) { setError('Percentage discount cannot exceed 100%.'); return; }
    if (form.type === 'fixed' && form.discount_value > 500000) {
      setError('Fixed discount cannot exceed MVR 5000.');
      return;
    }
    if (form.type === 'tiered' && tiers.length === 0) {
      setError('Add at least one spend tier.'); return;
    }
    if (form.type === 'quantity_break' && !(meta.min_qty && meta.min_qty >= 1)) {
      setError('Quantity break needs a minimum quantity.'); return;
    }
    if (form.type === 'buy_x_get_y' && (!(meta.buy_qty && meta.buy_qty >= 1) || !(meta.get_qty && meta.get_qty >= 1))) {
      setError('BOGO needs buy and get quantities.'); return;
    }
    if (form.min_order_laar != null && form.min_order_laar < 0) { setError('Minimum order amount cannot be negative.'); return; }
    if (form.starts_at && form.expires_at && form.starts_at >= form.expires_at) {
      setError('Expiry date must be after start date.'); return;
    }
    setError('');
    setLoading(true);
    try {
      const payload: PromotionPayload = {
        ...form,
        discount_value: isStrategy ? (form.discount_value || 0) : form.discount_value,
        waive_delivery: form.type === 'free_delivery' ? true : !!form.waive_delivery,
        code: autoApply ? (form.code?.trim() || null) : form.code,
        restricted_customer_id: autoApply ? null : form.restricted_customer_id,
        targets: autoApply ? (form.targets ?? []) : form.targets,
      };
      await onSave(payload);
    }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {error && <ErrorMsg message={error} />}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', padding: '10px 12px', background: autoApply ? '#F0FDF4' : '#F8F6F3', borderRadius: 8, border: `1px solid ${autoApply ? '#86EFAC' : '#E8E0D8'}` }}>
        <input
          type="checkbox"
          checked={autoApply}
          onChange={(e) => {
            const on = e.target.checked;
            setForm((f) => ({
              ...f,
              auto_apply: on,
              code: on ? '' : f.code,
              restricted_customer_id: on ? null : f.restricted_customer_id,
            }));
          }}
        />
        <span>
          <strong>Automatic (all customers, no code)</strong>
          <div style={{ fontSize: 12, color: '#6B5D4F', marginTop: 2 }}>
            Applies at checkout to everyone. Hide the code field and use targeting + schedule window instead.
          </div>
        </span>
      </label>
      <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Promo Name">
          <Input value={form.name} onChange={(v) => set('name', v)} placeholder="e.g. Ramadan Special" />
        </Field>
        {!autoApply && (
          <Field label="Code">
            <Input value={form.code ?? ''} onChange={(v) => set('code', v.toUpperCase())} placeholder="e.g. RAMADAN20" />
          </Field>
        )}
        <Field label="Discount Type">
          <Select
            value={form.type}
            onChange={handleTypeChange}
            options={TYPE_OPTIONS}
          />
        </Field>
        {!isStrategy && (
          <Field label={`Discount Value (${form.type === 'percentage' ? '%' : 'MVR'})`}>
            <Input
              value={discountDisplay}
              onChange={handleDiscountChange}
              type="number"
            />
          </Field>
        )}
        <Field label="Min Order Amount (MVR)">
          <Input
            value={minOrderDisplay}
            onChange={handleMinOrderChange}
            type="number" placeholder="No minimum"
          />
        </Field>
        <Field label="Campaign budget (MVR, optional)">
          <Input
            value={budgetDisplay}
            onChange={handleBudgetChange}
            type="number" placeholder="No budget cap"
          />
          <div style={{ fontSize: 11, color: '#9C8E7E', marginTop: 3 }}>
            Approximate under high concurrency.
          </div>
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

      {form.type === 'tiered' && (
        <Field label="Spend tiers (highest satisfied tier wins)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tiers.map((tier, idx) => (
              <div key={idx} className="form-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                <Input
                  label="Min spend (MVR)"
                  type="number"
                  value={String((tier.min_laar / 100).toFixed(2))}
                  onChange={(v) => {
                    const n = Math.round(parseFloat(v) * 100);
                    if (!Number.isFinite(n)) return;
                    updateTier(idx, { min_laar: n });
                  }}
                />
                <Select
                  value={tier.kind}
                  onChange={(v) => updateTier(idx, { kind: v as 'fixed' | 'percentage' })}
                  options={[{ value: 'fixed', label: 'Fixed (MVR)' }, { value: 'percentage', label: 'Percentage' }]}
                />
                <Input
                  label={tier.kind === 'percentage' ? 'Value %' : 'Value (MVR)'}
                  type="number"
                  value={tier.kind === 'percentage'
                    ? String(tier.value)
                    : String((tier.value / 100).toFixed(2))}
                  onChange={(v) => {
                    if (tier.kind === 'percentage') {
                      const n = parseInt(v, 10);
                      if (!Number.isFinite(n) || n < 0) return;
                      updateTier(idx, { value: n });
                      return;
                    }
                    const n = Math.round(parseFloat(v) * 100);
                    if (!Number.isFinite(n) || n < 0) return;
                    updateTier(idx, { value: n });
                  }}
                />
                <Btn small variant="ghost" onClick={() => removeTier(idx)}>Remove</Btn>
              </div>
            ))}
            <Btn small variant="secondary" onClick={addTier}>+ Add tier</Btn>
          </div>
        </Field>
      )}

      {form.type === 'quantity_break' && (
        <div className="form-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Field label="Min quantity">
            <Input
              type="number"
              value={String(meta.min_qty ?? 3)}
              onChange={(v) => setMeta({ min_qty: Math.max(1, parseInt(v, 10) || 1) })}
            />
          </Field>
          <Field label="Kind">
            <Select
              value={meta.kind ?? 'percentage'}
              onChange={(v) => setMeta({ kind: v as 'fixed' | 'percentage' })}
              options={[{ value: 'percentage', label: 'Percentage' }, { value: 'fixed', label: 'Fixed (MVR)' }]}
            />
          </Field>
          <Field label={(meta.kind ?? 'percentage') === 'percentage' ? 'Value %' : 'Value (MVR)'}>
            <Input
              type="number"
              value={(meta.kind ?? 'percentage') === 'percentage'
                ? String(meta.value ?? 10)
                : String(((meta.value ?? 0) / 100).toFixed(2))}
              onChange={(v) => {
                if ((meta.kind ?? 'percentage') === 'percentage') {
                  setMeta({ value: Math.max(0, parseInt(v, 10) || 0) });
                  return;
                }
                const n = Math.round(parseFloat(v) * 100);
                if (!Number.isFinite(n) || n < 0) return;
                setMeta({ value: n });
              }}
            />
          </Field>
        </div>
      )}

      {form.type === 'buy_x_get_y' && (
        <div className="form-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
          <Field label="Buy qty">
            <Input
              type="number"
              value={String(meta.buy_qty ?? 2)}
              onChange={(v) => setMeta({ buy_qty: Math.max(1, parseInt(v, 10) || 1) })}
            />
          </Field>
          <Field label="Get qty">
            <Input
              type="number"
              value={String(meta.get_qty ?? 1)}
              onChange={(v) => setMeta({ get_qty: Math.max(1, parseInt(v, 10) || 1) })}
            />
          </Field>
          <Field label="Get discount %">
            <Input
              type="number"
              value={String(meta.get_discount_pct ?? 100)}
              onChange={(v) => setMeta({ get_discount_pct: Math.max(0, Math.min(100, parseInt(v, 10) || 0)) })}
            />
          </Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer', paddingTop: 22 }}>
            <input
              type="checkbox"
              checked={meta.cheapest !== false}
              onChange={(e) => setMeta({ cheapest: e.target.checked })}
            />
            Discount cheapest units
          </label>
        </div>
      )}

      {form.type === 'free_delivery' && (
        <p style={{ fontSize: 13, color: '#6B5D4F', margin: 0 }}>
          Waives the delivery fee on delivery orders. Use min order + schedule window as needed.
        </p>
      )}

      {autoApply && (
        <>
          <Field label="Targets (item or category IDs — leave empty for whole-order)">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Select
                value={targetType}
                onChange={(v) => setTargetType(v as 'item' | 'category')}
                options={[{ value: 'category', label: 'Category' }, { value: 'item', label: 'Item' }]}
              />
              <Input value={targetId} onChange={setTargetId} type="number" placeholder="ID" />
              <Btn small variant="secondary" onClick={addTarget}>Add</Btn>
            </div>
            {(form.targets ?? []).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {(form.targets ?? []).map((t, i) => (
                  <span key={`${t.target_type}-${t.target_id}-${i}`} style={{ fontSize: 12, background: '#F8F6F3', border: '1px solid #E8E0D8', borderRadius: 6, padding: '4px 8px' }}>
                    {t.target_type} #{t.target_id}
                    <button type="button" onClick={() => removeTarget(i)} style={{ marginLeft: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: '#9C8E7E' }}>×</button>
                  </span>
                ))}
              </div>
            )}
          </Field>
          <Field label="Days of week (optional — empty = every day)">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DAY_OPTIONS.map((d) => {
                const on = (form.days_of_week ?? []).includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDay(d.value)}
                    style={{
                      minHeight: 36, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                      border: `1px solid ${on ? '#D4813A' : '#E8E0D8'}`,
                      background: on ? '#FFF7ED' : '#fff', color: on ? '#D4813A' : '#6B5D4F', fontWeight: 600, fontSize: 12,
                    }}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </Field>
          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Starts time (optional)">
              <Input value={form.starts_time ?? ''} onChange={(v) => set('starts_time', v || null)} type="time" />
            </Field>
            <Field label="Ends time (optional)">
              <Input value={form.ends_time ?? ''} onChange={(v) => set('ends_time', v || null)} type="time" />
            </Field>
          </div>
        </>
      )}

      {!autoApply && (
        <Field label="Restrict to Specific Customer (optional)">
          <CustomerSearch
            value={form.restricted_customer_id ?? null}
            onChange={(id) => set('restricted_customer_id', id)}
            placeholder="Search by name or phone… (leave empty for public)"
          />
          <div style={{ fontSize: 11, color: '#9C8E7E', marginTop: 3 }}>
            If set, only this customer can redeem the code — useful for personal discounts.
          </div>
        </Field>
      )}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
          Active
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.stackable} onChange={(e) => set('stackable', e.target.checked)} />
          Stackable
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!form.first_order_only} onChange={(e) => set('first_order_only', e.target.checked)} />
          First order only
        </label>
        {form.type !== 'free_delivery' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!form.waive_delivery} onChange={(e) => set('waive_delivery', e.target.checked)} />
            Also waive delivery
          </label>
        )}
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
  if (p.type === 'tiered') return 'Tiered';
  if (p.type === 'quantity_break') return `Qty ${p.metadata?.min_qty ?? '—'}+`;
  if (p.type === 'buy_x_get_y') {
    return `Buy ${p.metadata?.buy_qty ?? 2} Get ${p.metadata?.get_qty ?? 1}`;
  }
  if (p.type === 'free_delivery') return 'Free delivery';
  return p.type;
}

function formatBudget(p: Promotion): string {
  if (p.budget_laar == null) return '—';
  const spent = (p.spent_laar ?? 0) / 100;
  const budget = p.budget_laar / 100;
  return `${spent.toFixed(0)} / ${budget.toFixed(0)}`;
}

function toFormPayload(p: Promotion): PromotionPayload {
  const type = (TYPE_OPTIONS.some((o) => o.value === p.type) ? p.type : 'fixed') as PromotionType;
  return {
    name: p.name,
    code: p.code ?? '',
    type,
    discount_value: p.discount_value,
    scope: p.scope,
    min_order_laar: p.min_order_laar,
    max_uses: p.max_uses,
    stackable: p.stackable,
    is_active: p.is_active,
    auto_apply: !!p.auto_apply,
    first_order_only: !!p.first_order_only,
    waive_delivery: !!p.waive_delivery || type === 'free_delivery',
    budget_laar: p.budget_laar ?? null,
    metadata: p.metadata ?? {},
    starts_at: p.starts_at,
    expires_at: p.expires_at,
    days_of_week: p.days_of_week ?? null,
    starts_time: p.starts_time ?? null,
    ends_time: p.ends_time ?? null,
    restricted_customer_id: p.restricted_customer_id ?? null,
    targets: p.targets ?? [],
  };
}

export function PromotionsPage() {
    usePageTitle('Promotions');
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [printCard, setPrintCard] = useState<PrintCardData | null>(null);
  const [perf, setPerf] = useState<OffersPerformanceReport | null>(null);
  const [showPerf, setShowPerf] = useState(false);
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

  const loadPerf = async () => {
    try {
      const res = await fetchOffersPerformance();
      setPerf(res);
      setShowPerf(true);
    } catch (e) {
      setError((e as Error).message);
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
    <PageShell>
    <>
      <ConfirmDialog state={dlg} close={closeDlg} />
      {printCard && <PrintCardModal data={printCard} onClose={() => setPrintCard(null)} />}
      <PageHeader section="Customers & Marketing"
        title="Promotions"
        subtitle="Manage promo codes and discounts"
        action={
          !creating && !editing ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="secondary" onClick={() => void loadPerf()}>Offers preview</Btn>
              <Btn variant="secondary" onClick={() => downloadCSV('promotions', promos.map((p) => ({ Name: p.name, Code: p.code, Type: p.type, 'Discount Value': p.discount_value, Scope: p.scope, 'Max Uses': p.max_uses ?? 'Unlimited', Redemptions: p.redemptions_count, Active: p.is_active ? 'Yes' : 'No', Expires: p.expires_at ?? 'No expiry' })))}>Export CSV</Btn>
              <Btn onClick={() => setCreating(true)}>+ New Promo</Btn>
            </div>
          ) : undefined
        }
      />
      {error && <ErrorMsg message={error} />}

      {showPerf && perf && (
        <Card style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontWeight: 700, fontSize: 16, margin: 0, color: '#1C1408' }}>Customer offers preview & performance</h3>
            <Btn small variant="ghost" onClick={() => setShowPerf(false)}>Close</Btn>
          </div>
          <p style={{ fontSize: 13, color: '#6B5D4F', marginBottom: 12 }}>
            What customers see on the menu Offers rail right now ({perf.offers_preview.length} cards).
          </p>
          {perf.offers_preview.length === 0 ? (
            <EmptyState message="No active offers right now." />
          ) : (
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, marginBottom: 18 }}>
              {perf.offers_preview.map((o) => (
                <div key={o.id} style={{ flexShrink: 0, width: 160, border: '1px solid #E8E0D8', borderRadius: 10, padding: 10, background: '#F8F6F3' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#D4813A', marginBottom: 4 }}>{o.kind.toUpperCase()}</div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#1C1408' }}>{o.title}</div>
                  {o.badge && <div style={{ fontSize: 11, color: '#059669', marginTop: 4 }}>{o.badge}</div>}
                  {o.effective_price != null && (
                    <div style={{ fontSize: 12, fontWeight: 700, marginTop: 6, color: '#D4813A' }}>
                      MVR {Number(o.effective_price).toFixed(2)}
                      {o.original_price != null && Number(o.original_price) > Number(o.effective_price) && (
                        <span style={{ marginLeft: 6, textDecoration: 'line-through', color: '#9C8E7E', fontWeight: 500 }}>
                          {Number(o.original_price).toFixed(2)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <h4 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 8px', color: '#1C1408' }}>Promotion redemptions</h4>
          <ScrollX style={{ marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Name', 'Mode', 'Redemptions', 'Discount (MVR)'].map((h) => (
                    <th key={h} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {perf.report.map((r) => (
                  <tr key={r.id}>
                    <td style={TD}>{r.name}</td>
                    <td style={TD}>{r.auto_apply ? 'Automatic' : (r.code ?? '—')}</td>
                    <td style={TD}>{r.redemptions_count}</td>
                    <td style={TD}>{(Number(r.total_discount_laar) / 100).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollX>
          <h4 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 8px', color: '#1C1408' }}>Daily specials</h4>
          <ScrollX>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Item', 'Sold', 'Active', 'Window'].map((h) => (
                    <th key={h} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {perf.specials.map((s) => (
                  <tr key={s.id}>
                    <td style={TD}>{s.name}</td>
                    <td style={TD}>{s.sold_count}{s.max_quantity ? ` / ${s.max_quantity}` : ''}</td>
                    <td style={TD}>{s.is_active ? 'Yes' : 'No'}</td>
                    <td style={{ ...TD, fontSize: 12, color: '#9C8E7E' }}>{s.start_date ?? '—'} → {s.end_date ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollX>
        </Card>
      )}

      {(creating || editing) && (
        <Card style={{ marginBottom: 24 }}>
          <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 18, color: '#1C1408' }}>
            {creating ? 'Create New Promotion' : `Edit: ${editing?.name}`}
          </h3>
          <PromotionForm
            initial={editing ? toFormPayload(editing) : EMPTY}
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
                {['Name', 'Code', 'Discount', 'Budget', 'Uses', 'Valid', 'Status', ''].map((h) => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {promos.map((p) => (
                <tr key={p.id}>
                  <td style={{ ...TD, fontWeight: 600, color: '#1C1408' }}>
                    {p.name}
                    {p.auto_apply && (
                      <div style={{ fontSize: 11, color: '#059669', fontWeight: 400, marginTop: 2 }}>
                        Automatic — no code
                      </div>
                    )}
                    {p.first_order_only && (
                      <div style={{ fontSize: 11, color: '#9C8E7E', fontWeight: 400, marginTop: 2 }}>
                        First order only
                      </div>
                    )}
                    {p.restricted_customer_id && (
                      <div style={{ fontSize: 11, color: '#059669', fontWeight: 400, marginTop: 2 }}>
                        <Link to={`/customers?customer=${p.restricted_customer_id}`} style={{ color: '#059669', textDecoration: 'none' }}>
                          🔒 Personal promo
                        </Link>
                      </div>
                    )}
                  </td>
                  <td style={TD}>
                    {p.auto_apply ? (
                      <span style={{ fontSize: 12, color: '#9C8E7E' }}>—</span>
                    ) : (
                      <code style={{ background: '#F8F6F3', padding: '2px 8px', borderRadius: 6, fontSize: 13, fontWeight: 700, letterSpacing: 1, color: '#1C1408', border: '1px solid #E8E0D8' }}>
                        {p.code}
                      </code>
                    )}
                  </td>
                  <td style={{ ...TD, color: '#D4813A', fontWeight: 700 }}>
                    {formatDiscount(p)}
                  </td>
                  <td style={{ ...TD, color: '#6B5D4F', fontSize: 12 }}>
                    {formatBudget(p)}
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
                        code: p.code ?? 'AUTO',
                        title: p.name,
                        subtitle: formatDiscount(p),
                        expiry: p.expires_at ?? null,
                        note: p.auto_apply
                          ? 'Automatic offer — applied at checkout'
                          : (p.restricted_customer_id ? 'Personal discount — non-transferable' : 'Enter code at checkout'),
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

    </PageShell>
  );
}
