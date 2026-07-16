import type { MenuItem, MenuItemPayload, MenuVariant } from '../../api';

export const SALES_CHANNELS = [
  { id: 'dine_in', label: 'Dine-in' },
  { id: 'takeaway', label: 'Takeaway (POS)' },
  { id: 'online_pickup', label: 'Online pickup' },
  { id: 'delivery', label: 'Delivery' },
] as const;

export type VariantRow = MenuVariant & { _key: string };

export type ComboRow = { item_id: string; item_name?: string; quantity: string; is_optional: boolean };

export type ItemForm = {
  name: string; name_dv: string; description: string; sku: string;
  image_url: string; base_price: string; tax_code: string;
  sort_order: string; is_active: boolean; is_available: boolean;
  category_id: string;
  menu_group_id: string;
  channels: Record<string, boolean>;
  has_variants: boolean;
  is_combo: boolean;
  combo_discount_pct: string;
  combo_items: ComboRow[];
  track_stock: boolean;
  stock_quantity: string;
  low_stock_threshold: string;
  variants: VariantRow[];
  dietary_tags: string;
  allergens: string;
};

export function emptyVariantRow(): VariantRow {
  return { _key: String(Date.now() + Math.random()), name: '', price: 0, cost: null, sku: null, track_stock: false, stock_qty: 0, low_stock_threshold: 5, is_active: true, sort_order: 0 };
}

function channelsFromItem(item: MenuItem): Record<string, boolean> {
  const base: Record<string, boolean> = {
    dine_in: true, takeaway: true, online_pickup: true, delivery: true,
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
    description: item.description ?? '',
    sku: item.sku ?? '',
    image_url: item.image_url ?? '',
    base_price: String(item.base_price),
    tax_code: item.tax_code ?? (item.tax_rate && Number(item.tax_rate) > 0 ? 'standard_8' : 'out_of_scope'),
    sort_order: item.sort_order != null ? String(item.sort_order) : '',
    is_active: item.is_active,
    is_available: item.is_available,
    category_id: item.category_id != null ? String(item.category_id) : '',
    menu_group_id: item.menu_group_id != null ? String(item.menu_group_id) : '1',
    channels: channelsFromItem(item),
    has_variants: item.has_variants ?? false,
    is_combo: item.is_combo ?? false,
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
    variants: (item.variants ?? []).map((v) => ({ ...v, _key: String(v.id ?? Math.random()) })),
    dietary_tags: (item.dietary_tags ?? []).join(', '),
    allergens: (item.allergens ?? []).join(', '),
  };
}

export function formToPayload(form: ItemForm, includeChannels: boolean): MenuItemPayload {
  const payload: MenuItemPayload = {
    name: form.name.trim(),
    name_dv: form.name_dv.trim() || null,
    description: form.description.trim() || null,
    sku: form.sku.trim() || null,
    image_url: form.image_url.trim() || null,
    base_price: parseFloat(form.base_price) || 0,
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
  payload.dietary_tags = parseTagList(form.dietary_tags);
  payload.allergens = parseTagList(form.allergens);
  return payload;
}

export function emptyItemForm(selectedCat: number | null): ItemForm {
  return {
    name: '', name_dv: '', description: '', sku: '', image_url: '',
    base_price: '', tax_code: 'standard_8', sort_order: '',
    is_active: true, is_available: true,
    category_id: selectedCat != null ? String(selectedCat) : '',
    menu_group_id: '1',
    channels: { dine_in: true, takeaway: true, online_pickup: true, delivery: true },
    has_variants: false, variants: [],
    is_combo: false, combo_discount_pct: '', combo_items: [],
    track_stock: false, stock_quantity: '0', low_stock_threshold: '5',
    dietary_tags: '', allergens: '',
  };
}
