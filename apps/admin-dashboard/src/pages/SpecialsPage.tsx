import { useState, useEffect } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  PageHeader, TableCard, TH, TD, Badge, Btn, ConfirmDialog, Modal, ModalActions, Input, Pagination, EmptyState, useConfirmDialog,
} from '../components/SharedUI';
import { fetchSpecials, getSpecial, createSpecial, updateSpecial, deleteSpecial, fetchAdminItems, fetchItemVariants, type DailySpecial, type DailySpecialVariantOverride, type MenuItem, type MenuVariant } from '../api';
import { ApiRequestError } from '@shared/api';
import { Pencil, Trash2 } from 'lucide-react';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type VariantOverrideForm = Record<number, { discount_pct: string; special_price: string }>;

type SpecialForm = {
  item_id: number | '';
  badge_label: string;
  special_price: string;
  discount_pct: string;
  variant_overrides: VariantOverrideForm;
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

type ListFilter = 'all' | 'active' | 'discount' | 'special' | 'inactive';

function isPctDiscount(s: DailySpecial): boolean {
  return s.discount_pct != null && s.discount_pct > 0;
}

function hasVariantOverrides(s: DailySpecial): boolean {
  return (s.variant_overrides?.length ?? 0) > 0;
}

function variantPriceLabel(vo: DailySpecialVariantOverride): string {
  if (vo.discount_pct) {
    const effective = vo.effective_price != null ? ` → MVR ${vo.effective_price.toFixed(2)}` : '';
    return `${vo.discount_pct}% off${effective}`;
  }
  if (vo.special_price != null) return `MVR ${vo.special_price.toFixed(2)}`;
  if (vo.effective_price != null) return `MVR ${vo.effective_price.toFixed(2)}`;
  return '—';
}

function VariantOverrideLines({ overrides, mode }: { overrides: DailySpecialVariantOverride[]; mode: 'names' | 'prices' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
      {overrides.map(vo => (
        <div key={vo.variant_id} style={{ fontSize: 12, lineHeight: 1.4 }}>
          {mode === 'names' ? (
            <span style={{ color: '#6B5D4F', fontWeight: 600 }}>{vo.variant_name ?? `Variant #${vo.variant_id}`}</span>
          ) : (
            <>
              <span style={{ fontWeight: 700, color: '#D4813A' }}>{variantPriceLabel(vo)}</span>
              {vo.catalog_price != null && vo.effective_price != null && vo.effective_price < vo.catalog_price && (
                <span style={{ color: '#9C8E7E', textDecoration: 'line-through', fontSize: 11, marginLeft: 4 }}>
                  MVR {vo.catalog_price.toFixed(2)}
                </span>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function blankVariantOverrides(item: MenuItem | undefined): VariantOverrideForm {
  if (!item?.variants?.length) return {};
  return Object.fromEntries(
    item.variants.filter((v): v is MenuVariant & { id: number } => v.id != null).map(v => [v.id, { discount_pct: '', special_price: '' }]),
  );
}

function variantOverridesFromSpecial(s: DailySpecial, item: MenuItem | undefined): VariantOverrideForm {
  const base = blankVariantOverrides(item);
  for (const vo of s.variant_overrides ?? []) {
    base[vo.variant_id] = {
      discount_pct: vo.discount_pct != null ? String(vo.discount_pct) : '',
      special_price: vo.special_price != null ? String(vo.special_price) : '',
    };
  }
  return base;
}

function formFromSpecial(s: DailySpecial, item: MenuItem | undefined): SpecialForm {
  return {
    item_id: s.item_id,
    badge_label: s.badge_label ?? '',
    special_price: s.special_price != null ? String(s.special_price) : '',
    discount_pct: s.discount_pct != null ? String(s.discount_pct) : '',
    variant_overrides: variantOverridesFromSpecial(s, item),
    start_date: s.start_date,
    end_date: s.end_date,
    start_time: s.start_time ?? '',
    end_time: s.end_time ?? '',
    days_of_week: s.days_of_week ?? [],
    max_quantity: s.max_quantity != null ? String(s.max_quantity) : '',
    description: s.description ?? '',
    is_active: s.is_active,
  };
}

async function resolveItemForSpecial(special: DailySpecial, items: MenuItem[]): Promise<MenuItem | undefined> {
  let item = items.find(i => i.id === special.item_id);
  const needsVariants = Boolean(item?.has_variants || (special.variant_overrides?.length ?? 0) > 0);
  if (!needsVariants) return item;

  if (item?.variants?.length) return item;

  const { variants } = await fetchItemVariants(special.item_id);
  if (item) {
    return { ...item, has_variants: true, variants };
  }

  return {
    id: special.item_id,
    name: special.item_name ?? 'Item',
    base_price: special.original_price ?? 0,
    has_variants: true,
    variants,
    is_available: true,
    is_active: true,
  };
}

const BLANK: SpecialForm = {
  item_id: '', badge_label: '', special_price: '', discount_pct: '', variant_overrides: {},
  start_date: today(), end_date: today(), start_time: '', end_time: '',
  days_of_week: [], max_quantity: '', description: '', is_active: true,
};

export default function SpecialsPage() {
  usePageTitle('Item Discounts');
  const { state: dlg, ask: askConfirm, close: closeDlg } = useConfirmDialog();

  const [specials, setSpecials] = useState<DailySpecial[]>([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0, active_today_count: 0 });
  const [items, setItems] = useState<MenuItem[]>([]);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DailySpecial | null>(null);
  const [form, setForm] = useState<SpecialForm>(BLANK);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [conflictSpecialId, setConflictSpecialId] = useState<number | null>(null);
  const [listFilter, setListFilter] = useState<ListFilter>('all');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetchSpecials({ page, filter: listFilter });
      setSpecials(res.data ?? []);
      setMeta({
        current_page: res.meta.current_page,
        last_page: res.meta.last_page,
        total: res.meta.total,
        active_today_count: res.meta.active_today_count ?? 0,
      });
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [page, listFilter]);
  useEffect(() => {
    fetchAdminItems({ per_page: 200 })
      .then(r => setItems(r.data))
      .catch(() => { /* menu item picker still works with empty list; don't block discounts table */ });
  }, []);

  const openCreate = () => {
    setEditing(null); setEditItem(null);
    setForm({ ...BLANK, start_date: today(), end_date: today() });
    setFormError(''); setConflictSpecialId(null); setModalOpen(true);
  };

  const openEdit = async (s: DailySpecial) => {
    setFormError(''); setConflictSpecialId(null);
    try {
      const { special } = await getSpecial(s.id);
      const item = await resolveItemForSpecial(special, items);
      setEditItem(item ?? null);
      setEditing(special);
      setForm(formFromSpecial(special, item));
      setModalOpen(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const openEditFromConflict = async () => {
    if (!conflictSpecialId) return;
    setFormError('');
    try {
      const res = await getSpecial(conflictSpecialId);
      setModalOpen(false);
      setConflictSpecialId(null);
      openEdit(res.special);
    } catch (e) {
      setFormError((e as Error).message);
    }
  };

  const selectedItem = editItem ?? items.find(i => i.id === form.item_id);
  const hasVariants = Boolean(selectedItem?.has_variants && (selectedItem.variants?.length ?? 0) > 0);

  const setItemId = (itemId: number | '') => {
    if (!itemId) {
      setEditItem(null);
      setForm(f => ({ ...f, item_id: '', variant_overrides: {} }));
      return;
    }
    const item = items.find(i => i.id === itemId);
    setEditItem(item ?? null);
    setForm(f => ({
      ...f,
      item_id: itemId,
      variant_overrides: blankVariantOverrides(item),
      special_price: item?.has_variants ? '' : f.special_price,
    }));
    if (item?.has_variants && !item.variants?.length) {
      void fetchItemVariants(itemId).then(({ variants }) => {
        const withVariants = { ...(item as MenuItem), has_variants: true, variants };
        setEditItem(prev => (prev?.id === itemId ? withVariants : prev));
        setForm(f => {
          if (f.item_id !== itemId) return f;
          const blanks = blankVariantOverrides(withVariants);
          const merged = { ...blanks };
          for (const [vid, row] of Object.entries(f.variant_overrides)) {
            if (row.discount_pct || row.special_price) merged[Number(vid)] = row;
          }
          return { ...f, variant_overrides: merged };
        });
      }).catch(() => { /* variant table stays empty until retry */ });
    }
  };

  const setVariantField = (variantId: number, field: 'discount_pct' | 'special_price', value: string) => {
    setForm(f => ({
      ...f,
      variant_overrides: {
        ...f.variant_overrides,
        [variantId]: {
          discount_pct: field === 'discount_pct' ? value : (f.variant_overrides[variantId]?.discount_pct ?? ''),
          special_price: field === 'special_price' ? value : (f.variant_overrides[variantId]?.special_price ?? ''),
        },
      },
    }));
  };

  const handleSave = async () => {
    if (!form.item_id) { setFormError('Select a menu item.'); return; }
    if (!form.start_date || !form.end_date) { setFormError('Start and end dates are required.'); return; }
    const hasPctInput = form.discount_pct.trim() !== '';
    const hasPriceInput = form.special_price.trim() !== '';
    if (hasPctInput && hasPriceInput) {
      setFormError('Use either item-level discount % or special price, not both.'); return;
    }
    const variantRows = Object.entries(form.variant_overrides)
      .map(([variantId, row]) => ({ variant_id: Number(variantId), ...row }))
      .filter(row => row.discount_pct.trim() !== '' || row.special_price.trim() !== '');
    if (!hasPctInput && !hasPriceInput && variantRows.length === 0) {
      setFormError('Enter an item-level discount, or set pricing on at least one variant.'); return;
    }
    for (const row of variantRows) {
      if (row.discount_pct.trim() !== '' && row.special_price.trim() !== '') {
        setFormError('Each variant can use either discount % or special price, not both.'); return;
      }
      const pct = row.discount_pct ? parseInt(row.discount_pct, 10) : undefined;
      if (pct !== undefined && (isNaN(pct) || pct < 1 || pct > 100)) {
        setFormError('Variant discount % must be between 1 and 100.'); return;
      }
      const price = row.special_price ? parseFloat(row.special_price) : undefined;
      if (price !== undefined && (isNaN(price) || price < 0)) {
        setFormError('Variant special price must be a valid positive number.'); return;
      }
    }
    if (form.end_date < form.start_date) { setFormError('End date must be on or after start date.'); return; }
    const discountPct = form.discount_pct ? parseInt(form.discount_pct, 10) : undefined;
    if (discountPct !== undefined && (isNaN(discountPct) || discountPct < 1 || discountPct > 100)) {
      setFormError('Discount % must be between 1 and 100.'); return;
    }
    const specialPrice = form.special_price ? parseFloat(form.special_price) : undefined;
    if (specialPrice !== undefined && (isNaN(specialPrice) || specialPrice < 0)) {
      setFormError('Special price must be a valid positive number.'); return;
    }
    const maxQty = form.max_quantity ? parseInt(form.max_quantity, 10) : undefined;
    if (maxQty !== undefined && (isNaN(maxQty) || maxQty < 1)) {
      setFormError('Max quantity must be a positive whole number.'); return;
    }
    setSaving(true); setFormError(''); setConflictSpecialId(null);
    try {
      const payload = {
        item_id: Number(form.item_id),
        badge_label: form.badge_label || undefined,
        special_price: hasVariants ? undefined : specialPrice,
        discount_pct: discountPct,
        variant_overrides: variantRows.map(row => ({
          variant_id: row.variant_id,
          discount_pct: row.discount_pct ? parseInt(row.discount_pct, 10) : undefined,
          special_price: row.special_price ? parseFloat(row.special_price) : undefined,
        })),
        start_date: form.start_date,
        end_date: form.end_date,
        start_time: form.start_time || undefined,
        end_time: form.end_time || undefined,
        days_of_week: form.days_of_week.length > 0 ? form.days_of_week : undefined,
        max_quantity: maxQty,
        description: form.description || undefined,
        is_active: form.is_active,
      };
      if (editing) { await updateSpecial(editing.id, payload); }
      else { await createSpecial(payload); }
      setModalOpen(false); void load();
    } catch (e) {
      if (e instanceof ApiRequestError && e.body && typeof e.body === 'object' && 'errors' in e.body) {
        const errors = (e.body as { errors?: Record<string, string[]> }).errors;
        const conflictId = errors?.conflicting_special_id?.[0];
        if (conflictId) setConflictSpecialId(Number(conflictId));
      }
      setFormError((e as Error).message);
    }
    finally { setSaving(false); }
  };

  const handleDelete = (id: number) => {
    askConfirm({
      title: 'Delete Special',
      message: 'Delete this daily special? This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        try { await deleteSpecial(id); void load(); }
        catch (e) { setError((e as Error).message); }
      },
    });
  };

  const toggleDay = (day: number) => {
    setForm(f => ({
      ...f,
      days_of_week: f.days_of_week.includes(day)
        ? f.days_of_week.filter(d => d !== day)
        : [...f.days_of_week, day].sort((a, b) => a - b),
    }));
  };

  const activeCount = meta.active_today_count;

  const filterPills: { id: ListFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active now' },
    { id: 'discount', label: '% Discount' },
    { id: 'special', label: 'Fixed price' },
    { id: 'inactive', label: 'Inactive' },
  ];

  return (
    <div>
      <ConfirmDialog state={dlg} close={closeDlg} />
      <PageHeader title="Item Discounts" action={<Btn onClick={openCreate}>+ Add Discount</Btn>} />
      <p style={{ margin: '-8px 0 20px', fontSize: 14, color: '#6B5D4F', lineHeight: 1.55, maxWidth: 720 }}>
        Schedule a <strong>discount %</strong> or fixed sale price on specific menu items for any date range.
        Active discounts show on the order app menu (badge + sale price), POS, and optionally in Today&apos;s Specials on the homepage.
      </p>
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

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {filterPills.map((pill) => (
          <button
            key={pill.id}
            type="button"
            onClick={() => { setListFilter(pill.id); setPage(1); }}
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              border: listFilter === pill.id ? '2px solid #D4813A' : '1px solid #E8E0D8',
              background: listFilter === pill.id ? '#FEF3E8' : '#fff',
              color: listFilter === pill.id ? '#9A3412' : '#6B5D4F',
              fontSize: 13,
              fontWeight: listFilter === pill.id ? 700 : 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {pill.label}
          </button>
        ))}
      </div>

      <TableCard>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Item', 'Type', 'Badge', 'Price', 'Dates', 'Days', 'Status', 'Sold', 'Actions'].map(h => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: '#9C8E7E' }}>Loading…</td></tr>
            ) : specials.length === 0 ? (
              <tr><td colSpan={9}><EmptyState message={listFilter === 'all' ? 'No discounts yet. Add one to get started.' : 'No discounts match this filter.'} /></td></tr>
            ) : specials.map(s => (
              <tr key={s.id}>
                <td style={{ ...TD, fontWeight: 600 }}>
                  {s.item_image && <img src={s.item_image} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover', marginRight: 8, verticalAlign: 'middle' }} />}
                  {s.item_name}
                  {hasVariantOverrides(s) && s.variant_overrides && (
                    <VariantOverrideLines overrides={s.variant_overrides} mode="names" />
                  )}
                </td>
                <td style={TD}>
                  <Badge color={hasVariantOverrides(s) ? 'purple' : isPctDiscount(s) ? 'orange' : 'blue'}>
                    {hasVariantOverrides(s) ? 'Per variant' : isPctDiscount(s) ? `${s.discount_pct}% off` : 'Fixed price'}
                  </Badge>
                </td>
                <td style={TD}><Badge color="orange">{s.badge_label}</Badge></td>
                <td style={{ ...TD, fontSize: 13 }}>
                  {hasVariantOverrides(s) && s.variant_overrides ? (
                    <VariantOverrideLines overrides={s.variant_overrides} mode="prices" />
                  ) : s.effective_price != null ? (
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
                  <Btn small variant="secondary" onClick={() => void openEdit(s)} style={{ marginRight: 6 }}><Pencil size={12} /></Btn>
                  <Btn small variant="danger" onClick={() => handleDelete(s.id)}><Trash2 size={12} /></Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      <Pagination page={page} totalPages={meta.last_page} onChange={setPage} />

      {modalOpen && (
        <Modal title={editing ? 'Edit Item Discount' : 'Add Item Discount'} onClose={() => setModalOpen(false)} maxWidth={hasVariants ? 640 : 520}>
          {formError && (
            <div style={{ marginBottom: 12 }}>
              <p style={{ color: '#ef4444', margin: 0 }}>{formError}</p>
              {conflictSpecialId && (
                <Btn small variant="secondary" onClick={() => void openEditFromConflict()} style={{ marginTop: 8 }}>
                  Edit existing discount
                </Btn>
              )}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>Menu Item *</span>
              <select value={form.item_id} onChange={e => setItemId(e.target.value ? Number(e.target.value) : '')}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #E8E0D8', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}>
                <option value="">Select item…</option>
                {items.map(item => <option key={item.id} value={item.id}>{item.name} (MVR {parseFloat(String(item.base_price)).toFixed(2)})</option>)}
              </select>
            </label>
            {!hasVariants ? (
            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>Special Price (MVR)</span>
                <Input type="number" min="0" step="0.01" placeholder="e.g. 39.00" value={form.special_price} onChange={v => setForm(f => ({ ...f, special_price: v }))} />
              </label>
              <label>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>Discount %</span>
                <Input type="number" min="1" max="100" placeholder="e.g. 20" value={form.discount_pct} onChange={v => setForm(f => ({ ...f, discount_pct: v }))} />
              </label>
            </div>
            ) : (
            <>
              <label>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>Default discount % (all variants)</span>
                <Input type="number" min="1" max="100" placeholder="Optional — applies to variants without their own %" value={form.discount_pct} onChange={v => setForm(f => ({ ...f, discount_pct: v }))} />
              </label>
              <div style={{ border: '1px solid #E8E0D8', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '10px 12px', background: '#FAF7F4', borderBottom: '1px solid #E8E0D8' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1C1408' }}>Per-variant pricing</span>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9C8E7E' }}>Set a different discount % or fixed price for each size/option.</p>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Variant', 'Catalog', 'Discount %', 'Special price'].map(h => (
                        <th key={h} style={{ ...TH, fontSize: 11, padding: '8px 10px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedItem?.variants ?? []).filter((v): v is MenuVariant & { id: number } => v.id != null).map(v => {
                      const row = form.variant_overrides[v.id] ?? { discount_pct: '', special_price: '' };
                      return (
                        <tr key={v.id}>
                          <td style={{ ...TD, fontWeight: 600, fontSize: 12 }}>{v.name}</td>
                          <td style={{ ...TD, fontSize: 12, color: '#6B5D4F' }}>MVR {parseFloat(String(v.price)).toFixed(2)}</td>
                          <td style={{ ...TD, padding: '6px 8px' }}>
                            <Input type="number" min="1" max="100" placeholder="%" value={row.discount_pct} onChange={val => setVariantField(v.id, 'discount_pct', val)} />
                          </td>
                          <td style={{ ...TD, padding: '6px 8px' }}>
                            <Input type="number" min="0" step="0.01" placeholder="MVR" value={row.special_price} onChange={val => setVariantField(v.id, 'special_price', val)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
            )}
            <p style={{ margin: 0, fontSize: 12, color: '#9C8E7E', lineHeight: 1.5 }}>
              {hasVariants
                ? 'Use the default % for all variants, or set per-variant pricing below. Variant rows override the default.'
                : 'Use either a fixed special price or a discount %.'}
            </p>
            <label>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>Badge Label</span>
              <Input placeholder="e.g. Chef's Special" value={form.badge_label} onChange={v => setForm(f => ({ ...f, badge_label: v }))} />
            </label>
            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
