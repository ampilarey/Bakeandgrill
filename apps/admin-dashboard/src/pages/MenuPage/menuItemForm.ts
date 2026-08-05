import type { MenuItem, MenuItemPayload, MenuVariant } from '../../api';

export const SALES_CHANNELS = [
  { id: 'dine_in', label: 'Dine-in' },
  { id: 'takeaway', label: 'Takeaway (POS)' },
  { id: 'online_pickup', label: 'Online pickup' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'catering', label: 'Catering / events' },
] as const;

export type VariantRow = MenuVariant & { _key: string };

export type ComboRow = { item_id: string; item_name?: string; quantity: string; is_optional: boolean };

export type PackagingOptionRow = {
  _key: string;
  id?: number;
  name: string;
  name_dv: string;
  fee: string;
  is_default: boolean;
};

export type ItemForm = {
  name: string; name_dv: string;
  card_name: string; card_name_dv: string;
  description: string;
  short_description: string; short_description_dv: string;
  price_note: string;
  sku: string;
  image_url: string; image_original_url: string; thumb_url: string; base_price: string; packaging_fee: string;
  packaging_fee_mode: 'per_unit' | 'per_line';
  packaging_options: PackagingOptionRow[];
  tax_code: string;
  sort_order: string; is_active: boolean; is_available: boolean;
  category_id: string;
  menu_group_id: string;
  channels: Record<string, boolean>;
  has_variants: boolean;
  is_combo: boolean;
  combo_discount_pct: string;
  combo_items: ComboRow[];
  show_on_signage: boolean;
  is_signage_promoted: boolean;
  track_stock: boolean;
  stock_quantity: string;
  low_stock_threshold: string;
  /** Customers may order this item for tomorrow collection. */
  allow_pre_order: boolean;
  /** Max the kitchen can make for one tomorrow date. Empty = no limit. */
  tomorrow_daily_capacity: string;
  variants: VariantRow[];
  dietary_tags: string;
  allergens: string;
  prep_time_minutes: string;
  calories: string;
  spice_level: 'none' | 'mild' | 'medium' | 'hot' | 'extra_hot';
};

export function emptyPackagingOptionRow(isDefault = false): PackagingOptionRow {
  return {
    _key: String(Date.now() + Math.random()),
    name: '',
    name_dv: '',
    fee: '0',
    is_default: isDefault,
  };
}

export function emptyVariantRow(): VariantRow {
  return { _key: String(Date.now() + Math.random()), name: '', price: 0, cost: null, sku: null, track_stock: false, stock_qty: 0, low_stock_threshold: 5, is_active: true, sort_order: 0 };
}

function channelsFromItem(item: MenuItem): Record<string, boolean> {
  const base: Record<string, boolean> = {
    dine_in: true, takeaway: true, online_pickup: true, delivery: true, catering: false,
  };
  if (!item.channel_availabilities?.length) return base;
  for (const r of item.channel_availabilities) {
    if (r.channel in base) base[r.channel] = r.is_enabled;
  }
  return base;
}

export function itemToForm(item: MenuItem): ItemForm {
  return {
    name: item.name,
    name_dv: item.name_dv ?? '',
    card_name: item.card_name ?? '',
    card_name_dv: item.card_name_dv ?? '',
    description: item.description ?? '',
    short_description: item.short_description ?? '',
    short_description_dv: item.short_description_dv ?? '',
    price_note: item.price_note ?? '',
    sku: item.sku ?? '',
    image_url: item.image_url ?? '',
    image_original_url: item.image_original_url ?? '',
    thumb_url: item.thumb_url ?? '',
    base_price: String(item.base_price),
    packaging_fee: item.packaging_fee != null ? String(item.packaging_fee) : '0',
    packaging_fee_mode: item.packaging_fee_mode === 'per_line' ? 'per_line' : 'per_unit',
    packaging_options: (item.packaging_options ?? []).map((o) => ({
      _key: String(o.id ?? Math.random()),
      id: o.id,
      name: o.name ?? '',
      name_dv: o.name_dv ?? '',
      fee: String(o.fee ?? 0),
      is_default: !!o.is_default,
    })),
    tax_code: item.tax_code ?? (item.tax_rate && Number(item.tax_rate) > 0 ? 'standard_8' : 'out_of_scope'),
    sort_order: item.sort_order != null ? String(item.sort_order) : '',
    is_active: item.is_active,
    is_available: item.is_available,
    category_id: item.category_id != null ? String(item.category_id) : '',
    menu_group_id: item.menu_group_id != null ? String(item.menu_group_id) : '1',
    channels: channelsFromItem(item),
    has_variants: item.has_variants ?? false,
    is_combo: item.is_combo ?? false,
    show_on_signage: item.show_on_signage ?? true,
    is_signage_promoted: item.is_signage_promoted ?? false,
    combo_discount_pct: item.combo_discount_pct != null ? String(item.combo_discount_pct) : '',
    combo_items: (item.combo_items ?? []).map((row) => ({
      item_id: String(row.item_id),
      item_name: row.item?.name,
      quantity: String(row.quantity ?? 1),
      is_optional: row.is_optional ?? false,
    })),
    track_stock: item.track_stock ?? false,
    stock_quantity: item.stock_quantity != null ? String(item.stock_quantity) : '0',
    low_stock_threshold: item.low_stock_threshold != null ? String(item.low_stock_threshold) : '5',
    allow_pre_order: item.allow_pre_order ?? false,
    tomorrow_daily_capacity: item.tomorrow_daily_capacity != null
      ? String(item.tomorrow_daily_capacity)
      : '',
    variants: (item.variants ?? []).map((v) => ({ ...v, _key: String(v.id ?? Math.random()) })),
    dietary_tags: (item.dietary_tags ?? []).join(', '),
    allergens: (item.allergens ?? []).join(', '),
    prep_time_minutes: item.prep_time_minutes != null ? String(item.prep_time_minutes) : '',
    calories: item.calories != null ? String(item.calories) : '',
    spice_level: (['none', 'mild', 'medium', 'hot', 'extra_hot'] as const).includes(
      item.spice_level as 'none',
    )
      ? (item.spice_level as ItemForm['spice_level'])
      : 'none',
  };
}

export function formToPayload(form: ItemForm, includeChannels: boolean): MenuItemPayload {
  const payload: MenuItemPayload = {
    name: form.name.trim(),
    name_dv: form.name_dv.trim() || null,
    card_name: form.card_name.trim() || null,
    card_name_dv: form.card_name_dv.trim() || null,
    description: form.description.trim() || null,
    short_description: form.short_description.trim() || null,
    short_description_dv: form.short_description_dv.trim() || null,
    price_note: form.price_note.trim() || null,
    sku: form.sku.trim() || null,
    image_url: form.image_url.trim() || null,
    image_original_url: form.image_original_url.trim() || null,
    thumb_url: form.thumb_url.trim() || null,
    base_price: parseFloat(form.base_price) || 0,
    packaging_fee: Math.max(0, parseFloat(form.packaging_fee) || 0),
    packaging_fee_mode: form.packaging_fee_mode,
    packaging_options: form.packaging_options
      .filter((row) => row.name.trim() !== '')
      .map((row, i) => ({
        ...(row.id != null ? { id: row.id } : {}),
        name: row.name.trim(),
        name_dv: row.name_dv.trim() || null,
        fee: Math.max(0, parseFloat(row.fee) || 0),
        is_default: !!row.is_default,
        sort_order: i,
        is_active: true,
      })),
    has_variants: form.has_variants,
    tax_code: form.tax_code,
    sort_order: form.sort_order !== '' ? parseInt(form.sort_order) : null,
    is_active: form.is_active,
    is_available: form.is_available,
    category_id: form.category_id !== '' ? parseInt(form.category_id) : null,
    menu_group_id: form.menu_group_id !== '' ? parseInt(form.menu_group_id, 10) : null,
    variants: form.has_variants
      ? form.variants.map(({ _key, ...v }, i) => ({ ...v, sort_order: i }))
      : undefined,
  };
  if (!form.has_variants) {
    payload.track_stock = form.track_stock;
    payload.stock_quantity = form.track_stock
      ? Math.max(0, parseInt(form.stock_quantity, 10) || 0)
      : 0;
    payload.low_stock_threshold = form.track_stock
      ? Math.max(0, parseInt(form.low_stock_threshold, 10) || 0)
      : 0;
    payload.availability_type = form.track_stock ? 'stock_based' : 'made_to_order';
  }
  if (includeChannels) {
    payload.channel_availability = SALES_CHANNELS.map(({ id }) => ({
      channel: id,
      is_enabled: !!form.channels[id],
    }));
  }
  payload.is_combo = form.is_combo;
  payload.show_on_signage = form.show_on_signage;
  payload.is_signage_promoted = form.is_signage_promoted;
  payload.combo_discount_pct = form.combo_discount_pct !== '' ? parseFloat(form.combo_discount_pct) : null;
  if (form.is_combo) {
    payload.combo_items = form.combo_items
      .filter((row) => row.item_id !== '')
      .map((row) => ({
        item_id: parseInt(row.item_id, 10),
        quantity: Math.max(1, parseInt(row.quantity, 10) || 1),
        is_optional: row.is_optional,
      }));
  }
  const parseTagList = (raw: string) =>
    raw.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 12);
  // Slug-style tags so online filters match "Gluten Free" → gluten-free
  const parseDietaryTags = (raw: string) =>
    parseTagList(raw).map((t) =>
      t.toLowerCase().replace(/[_\s]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''),
    ).filter(Boolean);
  payload.dietary_tags = parseDietaryTags(form.dietary_tags);
  payload.allergens = parseTagList(form.allergens).map((t) =>
    t.toLowerCase().replace(/[_\s]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''),
  ).filter(Boolean);
  payload.prep_time_minutes = form.prep_time_minutes !== ''
    ? Math.max(0, Math.min(480, parseInt(form.prep_time_minutes, 10) || 0))
    : null;
  payload.calories = form.calories !== ''
    ? Math.max(0, Math.min(9999, parseInt(form.calories, 10) || 0))
    : null;
  payload.spice_level = form.spice_level === 'none' ? null : form.spice_level;
  payload.allow_pre_order = form.allow_pre_order;
  if (form.allow_pre_order) {
    const raw = form.tomorrow_daily_capacity.trim();
    payload.tomorrow_daily_capacity = raw !== ''
      ? Math.max(1, parseInt(raw, 10) || 1)
      : null;
  } else {
    // Unticked: clear any leftover limit so it cannot apply by accident.
    payload.tomorrow_daily_capacity = null;
  }
  return payload;
}

export function emptyItemForm(selectedCat: number | null): ItemForm {
  return {
    name: '', name_dv: '',
    card_name: '', card_name_dv: '',
    description: '',
    short_description: '', short_description_dv: '',
    price_note: '',
    sku: '', image_url: '', image_original_url: '', thumb_url: '',
    base_price: '', packaging_fee: '0', packaging_fee_mode: 'per_unit', packaging_options: [],
    tax_code: 'standard_8', sort_order: '',
    is_active: true, is_available: true,
    category_id: selectedCat != null ? String(selectedCat) : '',
    menu_group_id: '1',
    channels: { dine_in: true, takeaway: true, online_pickup: true, delivery: true, catering: false },
    has_variants: false, variants: [],
    is_combo: false, combo_discount_pct: '', combo_items: [],
    show_on_signage: true, is_signage_promoted: false,
    track_stock: false, stock_quantity: '0', low_stock_threshold: '5',
    allow_pre_order: false,
    tomorrow_daily_capacity: '',
    dietary_tags: '', allergens: '',
    prep_time_minutes: '', calories: '', spice_level: 'none',
  };
}
