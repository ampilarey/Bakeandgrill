import { useState, useEffect, useRef } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  PageHeader, PageShell, TableCard, TH, TD, Badge, Btn, ConfirmDialog, Pagination, EmptyState, useConfirmDialog,
} from '../components/SharedUI';
import { fetchSpecials, findOverlappingSpecial, getSpecial, createSpecial, updateSpecial, deleteSpecial, fetchItemVariants, type DailySpecial, type DailySpecialVariantOverride, type MenuItem, type MenuVariant, type DailySpecialPayload } from '../api';
import type { MenuItemSelection } from '../components/ItemSearch';
import { SpecialsEditor } from './SpecialsEditor';
import { ApiRequestError } from '@shared/api';
import { today } from '../utils/dateHelpers';
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

function pctStringFromPrice(catalog: number, specialPrice: number): string {
  if (catalog <= 0 || specialPrice < 0) return '';
  const pct = Math.round((1 - specialPrice / catalog) * 100);
  if (pct < 1) return '';
  return String(Math.min(100, pct));
}

function priceStringFromPct(catalog: number, pct: number): string {
  if (catalog <= 0 || pct < 1) return '';
  return (catalog * (1 - pct / 100)).toFixed(2);
}

function linkedPricePct(value: string, catalog: number, from: 'price' | 'pct'): { price: string; pct: string } {
  if (value.trim() === '') return { price: '', pct: '' };
  if (catalog <= 0) return from === 'price' ? { price: value, pct: '' } : { price: '', pct: value };

  if (from === 'price') {
    const parsed = parseFloat(value);
    if (isNaN(parsed)) return { price: value, pct: '' };
    return { price: value, pct: pctStringFromPrice(catalog, parsed) };
  }

  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return { price: '', pct: value };
  return { price: priceStringFromPct(catalog, parsed), pct: value };
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
    const catalog = vo.catalog_price ?? item?.variants?.find(v => v.id === vo.variant_id)?.price ?? 0;
    const catalogNum = Number(catalog);
    let discount_pct = vo.discount_pct != null ? String(vo.discount_pct) : '';
    let special_price = vo.special_price != null ? String(vo.special_price) : '';
    if (catalogNum > 0) {
      if (discount_pct && !special_price) {
        special_price = priceStringFromPct(catalogNum, parseInt(discount_pct, 10));
      } else if (special_price && !discount_pct) {
        discount_pct = pctStringFromPrice(catalogNum, parseFloat(special_price));
      }
    }
    base[vo.variant_id] = { discount_pct, special_price };
  }
  return base;
}

function formFromSpecial(s: DailySpecial, item: MenuItem | undefined): SpecialForm {
  const catalog = Number(item?.base_price ?? s.original_price ?? 0);
  let special_price = s.special_price != null ? String(s.special_price) : '';
  let discount_pct = s.discount_pct != null ? String(s.discount_pct) : '';
  if (!item?.has_variants && catalog > 0) {
    if (discount_pct && !special_price) {
      special_price = priceStringFromPct(catalog, parseInt(discount_pct, 10));
    } else if (special_price && !discount_pct) {
      discount_pct = pctStringFromPrice(catalog, parseFloat(special_price));
    }
  }

  return {
    item_id: s.item_id,
    badge_label: s.badge_label ?? '',
    special_price,
    discount_pct,
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

function mergeSpecialForms(base: SpecialForm, pending: SpecialForm): SpecialForm {
  const variant_overrides = { ...base.variant_overrides };
  for (const [vid, row] of Object.entries(pending.variant_overrides)) {
    if (row.discount_pct.trim() || row.special_price.trim()) {
      variant_overrides[Number(vid)] = row;
    }
  }

  return {
    ...base,
    badge_label: pending.badge_label.trim() || base.badge_label,
    description: pending.description.trim() || base.description,
    variant_overrides,
    discount_pct: pending.discount_pct.trim() || base.discount_pct,
    start_date: base.start_date,
    end_date: base.end_date,
    start_time: base.start_time || pending.start_time,
    end_time: base.end_time || pending.end_time,
    max_quantity: pending.max_quantity.trim() || base.max_quantity,
    is_active: base.is_active,
  };
}

function buildSpecialPayload(form: SpecialForm, item: MenuItem | undefined): DailySpecialPayload {
  const hasVariants = Boolean(item?.has_variants && (item.variants?.length ?? 0) > 0);
  const hasPctInput = form.discount_pct.trim() !== '';
  const variantRows = Object.entries(form.variant_overrides)
    .map(([variantId, row]) => ({ variant_id: Number(variantId), ...row }))
    .filter(row => row.discount_pct.trim() !== '' || row.special_price.trim() !== '');
  const discountPct = form.discount_pct ? parseInt(form.discount_pct, 10) : undefined;
  const specialPrice = form.special_price ? parseFloat(form.special_price) : undefined;
  const maxQty = form.max_quantity ? parseInt(form.max_quantity, 10) : undefined;

  return {
    item_id: Number(form.item_id),
    badge_label: form.badge_label || undefined,
    special_price: hasVariants ? undefined : (hasPctInput ? undefined : specialPrice),
    discount_pct: discountPct,
    variant_overrides: variantRows.map(row => ({
      variant_id: row.variant_id,
      discount_pct: row.discount_pct ? parseInt(row.discount_pct, 10) : undefined,
      special_price: row.discount_pct.trim() === '' && row.special_price
        ? parseFloat(row.special_price)
        : undefined,
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
}

function conflictIdFromError(e: unknown): number | null {
  if (e instanceof ApiRequestError && e.body && typeof e.body === 'object' && 'errors' in e.body) {
    const id = (e.body as { errors?: Record<string, string[]> }).errors?.conflicting_special_id?.[0];
    return id ? Number(id) : null;
  }
  return null;
}

async function saveToExistingSpecial(
  specialId: number,
  pendingForm: SpecialForm,
  items: MenuItem[],
): Promise<void> {
  const { special } = await getSpecial(specialId);
  const item = await resolveItemForSpecial(special, items);
  const merged = mergeSpecialForms(formFromSpecial(special, item), pendingForm);
  await updateSpecial(specialId, buildSpecialPayload(merged, item));
}

const BLANK: SpecialForm = {
  item_id: '', badge_label: '', special_price: '', discount_pct: '', variant_overrides: {},
  start_date: today(), end_date: today(), start_time: '', end_time: '',
  days_of_week: [], max_quantity: '', description: '', is_active: true,
};

export default function SpecialsPage() {
  usePageTitle('Daily Specials');
  const { state: dlg, ask: askConfirm, close: closeDlg } = useConfirmDialog();

  const [specials, setSpecials] = useState<DailySpecial[]>([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0, active_today_count: 0 });
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [itemSelection, setItemSelection] = useState<MenuItemSelection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DailySpecial | null>(null);
  const [form, setForm] = useState<SpecialForm>(BLANK);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [conflictSpecialId, setConflictSpecialId] = useState<number | null>(null);
  const [autoLoadedHint, setAutoLoadedHint] = useState(false);
  const [listFilter, setListFilter] = useState<ListFilter>('all');
  const formRef = useRef(form);
  formRef.current = form;
  const autoLoadedKeyRef = useRef<string | null>(null);

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
    if (editing || !modalOpen || !form.item_id || !form.start_date || !form.end_date) {
      if (!form.item_id) setConflictSpecialId(null);
      return;
    }

    const lookupKey = `${form.item_id}:${form.start_date}:${form.end_date}`;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const overlap = await findOverlappingSpecial(Number(form.item_id), form.start_date, form.end_date);
          if (!overlap) {
            setConflictSpecialId(null);
            autoLoadedKeyRef.current = null;
            return;
          }

          setConflictSpecialId(overlap.id);

          const item = editItem;
          if (!item?.has_variants) return;

          const loadedKey = `${lookupKey}:${overlap.id}`;
          if (autoLoadedKeyRef.current === loadedKey) return;

          const { special } = await getSpecial(overlap.id);
          const resolved = await resolveItemForSpecial(special, editItem ? [editItem] : []);
          autoLoadedKeyRef.current = loadedKey;
          setEditItem(resolved ?? null);
          if (resolved) {
            setItemSelection({ id: resolved.id, label: resolved.name, item: resolved });
          }
          setEditing(special);
          setForm(mergeSpecialForms(formFromSpecial(special, resolved), formRef.current));
          setConflictSpecialId(null);
          setFormError('');
          setAutoLoadedHint(true);
        } catch {
          // Overlap lookup failed — save still handles conflicts from the API.
        }
      })();
    }, 300);

    return () => clearTimeout(timer);
  }, [editing, modalOpen, form.item_id, form.start_date, form.end_date, editItem]);

  const openCreate = () => {
    setEditing(null); setEditItem(null); setItemSelection(null);
    setForm({ ...BLANK, start_date: today(), end_date: today() });
    setFormError(''); setConflictSpecialId(null); setAutoLoadedHint(false);
    autoLoadedKeyRef.current = null;
    setModalOpen(true);
  };

  const openEdit = async (s: DailySpecial) => {
    setFormError(''); setConflictSpecialId(null); setAutoLoadedHint(false);
    autoLoadedKeyRef.current = null;
    try {
      const { special } = await getSpecial(s.id);
      const item = await resolveItemForSpecial(special, []);
      setEditItem(item ?? null);
      setItemSelection(item ? { id: item.id, label: item.name, item } : null);
      setEditing(special);
      setForm(formFromSpecial(special, item));
      setModalOpen(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const openEditFromConflict = async () => {
    if (!conflictSpecialId) return;
    const pendingForm = form;
    setFormError('');
    try {
      const { special } = await getSpecial(conflictSpecialId);
      const item = await resolveItemForSpecial(special, editItem ? [editItem] : []);
      setEditItem(item ?? null);
      setItemSelection(item ? { id: item.id, label: item.name, item } : null);
      setEditing(special);
      setForm(mergeSpecialForms(formFromSpecial(special, item), pendingForm));
      setConflictSpecialId(null);
      setAutoLoadedHint(true);
    } catch (e) {
      setFormError((e as Error).message);
    }
  };

  const selectedItem = editItem;
  const hasVariants = Boolean(selectedItem?.has_variants && (selectedItem.variants?.length ?? 0) > 0);
  const catalogPrice = Number(selectedItem?.base_price ?? 0);

  const setItemSpecialPrice = (value: string) => {
    const linked = linkedPricePct(value, catalogPrice, 'price');
    setForm(f => ({ ...f, special_price: linked.price, discount_pct: linked.pct }));
  };

  const setItemDiscountPct = (value: string) => {
    const linked = linkedPricePct(value, catalogPrice, 'pct');
    setForm(f => ({ ...f, discount_pct: linked.pct, special_price: linked.price }));
  };

  const selectMenuItem = (sel: MenuItemSelection | null) => {
    setItemSelection(sel);
    if (!sel) {
      setEditItem(null);
      setForm(f => ({ ...f, item_id: '', variant_overrides: {} }));
      return;
    }
    const item = sel.item;
    const itemId = item.id;
    setEditItem(item);
    setForm(f => ({
      ...f,
      item_id: itemId,
      variant_overrides: blankVariantOverrides(item),
      special_price: item.has_variants ? '' : f.special_price,
    }));
    if (item.has_variants && !item.variants?.length) {
      void fetchItemVariants(itemId).then(({ variants }) => {
        const withVariants = { ...item, has_variants: true, variants };
        setEditItem(prev => (prev?.id === itemId ? withVariants : prev));
        setItemSelection(prev => (prev?.id === itemId ? { id: itemId, label: withVariants.name, item: withVariants } : prev));
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

  const setVariantField = (variantId: number, field: 'discount_pct' | 'special_price', value: string, catalog: number) => {
    setForm(f => {
      const linked = field === 'discount_pct'
        ? linkedPricePct(value, catalog, 'pct')
        : linkedPricePct(value, catalog, 'price');

      return {
        ...f,
        variant_overrides: {
          ...f.variant_overrides,
          [variantId]: {
            discount_pct: linked.pct,
            special_price: linked.price,
          },
        },
      };
    });
  };

  const handleSave = async () => {
    if (!form.item_id) { setFormError('Select a menu item.'); return; }
    if (!form.start_date || !form.end_date) { setFormError('Start and end dates are required.'); return; }
    const hasPctInput = form.discount_pct.trim() !== '';
    const hasPriceInput = form.special_price.trim() !== '';
    const variantRows = Object.entries(form.variant_overrides)
      .map(([variantId, row]) => ({ variant_id: Number(variantId), ...row }))
      .filter(row => row.discount_pct.trim() !== '' || row.special_price.trim() !== '');
    if (!hasPctInput && !hasPriceInput && variantRows.length === 0) {
      setFormError('Enter an item-level discount, or set pricing on at least one variant.'); return;
    }
    for (const row of variantRows) {
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
    setSaving(true); setFormError('');
    const payload = buildSpecialPayload(form, selectedItem ?? undefined);
    try {
      if (editing) {
        await updateSpecial(editing.id, payload);
      } else if (conflictSpecialId) {
        await saveToExistingSpecial(conflictSpecialId, form, editItem ? [editItem] : []);
      } else {
        await createSpecial(payload);
      }
      setModalOpen(false); void load();
    } catch (e) {
      const conflictId = conflictIdFromError(e);
      if (conflictId && !editing) {
        try {
          await saveToExistingSpecial(conflictId, form, editItem ? [editItem] : []);
          setModalOpen(false); void load();
          return;
        } catch (retryError) {
          setFormError((retryError as Error).message);
          setConflictSpecialId(conflictId);
          return;
        }
      }
      if (conflictId) setConflictSpecialId(conflictId);
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

  const emptyMessage = listFilter === 'all' ? 'No discounts yet. Add one to get started.' : 'No discounts match this filter.';

  const renderSpecialPrice = (s: DailySpecial) => {
    if (hasVariantOverrides(s) && s.variant_overrides) {
      return <VariantOverrideLines overrides={s.variant_overrides} mode="prices" />;
    }
    if (s.effective_price != null) {
      return (
        <>
          <span style={{ fontWeight: 700, color: '#D4813A' }}>MVR {s.effective_price.toFixed(2)}</span>
          {s.original_price != null && s.effective_price < s.original_price && (
            <span style={{ color: '#9C8E7E', textDecoration: 'line-through', fontSize: 11, marginLeft: 4 }}>
              MVR {s.original_price.toFixed(2)}
            </span>
          )}
        </>
      );
    }
    return '—';
  };

  return (
    <PageShell className="specials-page">
      <ConfirmDialog state={dlg} close={closeDlg} />
      <PageHeader section="Manage" title="Daily Specials" action={<Btn onClick={openCreate}>+ Add Discount</Btn>} />
      <p className="specials-intro" style={{ margin: '-8px 0 20px', fontSize: 14, color: '#6B5D4F', lineHeight: 1.55, maxWidth: 720 }}>
        Schedule a <strong>discount %</strong> or fixed sale price on specific menu items for any date range.
        Active discounts show on the order app menu (badge + sale price), POS, and optionally in Today&apos;s Specials on the homepage.
      </p>
      {error && <p style={{ color: '#ef4444', marginBottom: 16 }}>{error}</p>}

      <div className="page-stat-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#fff', border: '1px solid #E8E0D8', borderRadius: 12, padding: '16px 20px' }}>
          <p style={{ fontSize: 12, color: '#9C8E7E', margin: '0 0 4px', fontWeight: 600 }}>TOTAL SPECIALS</p>
          <p style={{ fontSize: 22, fontWeight: 800, color: '#1C1408', margin: 0 }}>{meta.total}</p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E8E0D8', borderRadius: 12, padding: '16px 20px' }}>
          <p style={{ fontSize: 12, color: '#9C8E7E', margin: '0 0 4px', fontWeight: 600 }}>ACTIVE TODAY</p>
          <p style={{ fontSize: 22, fontWeight: 800, color: '#22c55e', margin: 0 }}>{activeCount}</p>
        </div>
      </div>

      <div className="tab-scroll-row specials-filters" style={{ marginBottom: 16 }}>
        {filterPills.map((pill) => (
          <button
            key={pill.id}
            type="button"
            onClick={() => { setListFilter(pill.id); setPage(1); }}
            className={`specials-filter-pill${listFilter === pill.id ? ' is-active' : ''}`}
          >
            {pill.label}
          </button>
        ))}
      </div>

      <div className="specials-desktop-table">
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
                <tr><td colSpan={9}><EmptyState message={emptyMessage} /></td></tr>
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
                  <td style={{ ...TD, fontSize: 13 }}>{renderSpecialPrice(s)}</td>
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
      </div>

      <div className="specials-mobile-list" aria-live="polite">
        {loading ? (
          <div className="specials-mobile-card specials-mobile-card--muted">Loading…</div>
        ) : specials.length === 0 ? (
          <EmptyState message={emptyMessage} />
        ) : specials.map(s => (
          <article key={s.id} className="specials-mobile-card">
            <div className="specials-mobile-card-top">
              <div className="specials-mobile-card-item">
                {s.item_image && <img src={s.item_image} alt="" className="specials-mobile-thumb" />}
                <div>
                  <h3 className="specials-mobile-title">{s.item_name}</h3>
                  <div className="specials-mobile-badges">
                    <Badge color={hasVariantOverrides(s) ? 'purple' : isPctDiscount(s) ? 'orange' : 'blue'}>
                      {hasVariantOverrides(s) ? 'Per variant' : isPctDiscount(s) ? `${s.discount_pct}% off` : 'Fixed price'}
                    </Badge>
                    {s.badge_label && <Badge color="orange">{s.badge_label}</Badge>}
                    <Badge color={s.is_active ? 'green' : 'gray'}>{s.is_active ? 'Active' : 'Inactive'}</Badge>
                  </div>
                </div>
              </div>
              <div className="specials-mobile-card-actions">
                <Btn small variant="secondary" onClick={() => void openEdit(s)} aria-label="Edit special"><Pencil size={14} /></Btn>
                <Btn small variant="danger" onClick={() => handleDelete(s.id)} aria-label="Delete special"><Trash2 size={14} /></Btn>
              </div>
            </div>
            <div className="specials-mobile-meta">
              <div>
                <span className="specials-mobile-meta-label">Price</span>
                <div className="specials-mobile-meta-value">{renderSpecialPrice(s)}</div>
              </div>
              <div>
                <span className="specials-mobile-meta-label">Dates</span>
                <div className="specials-mobile-meta-value">{s.start_date} → {s.end_date}</div>
              </div>
              <div>
                <span className="specials-mobile-meta-label">Days</span>
                <div className="specials-mobile-meta-value">
                  {s.days_of_week?.length ? s.days_of_week.map(d => DAY_NAMES[d]).join(', ') : 'All days'}
                </div>
              </div>
              <div>
                <span className="specials-mobile-meta-label">Sold</span>
                <div className="specials-mobile-meta-value">{s.sold_count}</div>
              </div>
            </div>
            {hasVariantOverrides(s) && s.variant_overrides && (
              <VariantOverrideLines overrides={s.variant_overrides} mode="names" />
            )}
          </article>
        ))}
      </div>

      <Pagination page={page} totalPages={meta.last_page} onChange={setPage} />

      {modalOpen && (
        <SpecialsEditor
          title={editing ? 'Edit Daily Special' : 'Add Daily Special'}
          editing={Boolean(editing)}
          startOnDetails={Boolean(editing)}
          form={form}
          setForm={setForm}
          itemSelection={itemSelection}
          selectedItem={selectedItem}
          hasVariants={hasVariants}
          catalogPrice={catalogPrice}
          saving={saving}
          formError={formError}
          autoLoadedHint={autoLoadedHint}
          conflictSpecialId={conflictSpecialId}
          onSelectItem={selectMenuItem}
          onSetSpecialPrice={setItemSpecialPrice}
          onSetDiscountPct={setItemDiscountPct}
          onSetVariantField={setVariantField}
          onToggleDay={toggleDay}
          onOpenConflict={() => void openEditFromConflict()}
          onClose={() => setModalOpen(false)}
          onSave={() => void handleSave()}
        />
      )}
    </PageShell>
  );
}
