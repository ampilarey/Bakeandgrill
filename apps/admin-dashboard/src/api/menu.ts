import { req } from './client';

export type MenuCategory = {
  id: number;
  name: string;
  name_dv?: string | null;
  description?: string | null;
  image_url?: string | null;
  image_original_url?: string | null;
  thumb_url?: string | null;
  image_webp_url?: string | null;
  thumb_webp_url?: string | null;
  sort_order?: number | null;
  is_active: boolean;
  parent_id?: number | null;
  items?: MenuItem[];
};

export type MenuGroupRow = {
  id: number;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
};

export type ItemChannelAvailabilityRow = {
  channel: string;
  is_enabled: boolean;
  valid_from?: string | null;
  valid_until?: string | null;
};

export type MenuVariant = {
  id?: number;
  name: string;
  name_dv?: string | null;
  price: number;
  cost?: number | null;
  sku?: string | null;
  track_stock?: boolean;
  stock_qty?: number;
  low_stock_threshold?: number;
  /**
   * How much of the item's recipe one of this size uses — full 1, half 0.5.
   * Lets several sizes share one pool of ingredients.
   */
  consumption_factor?: number;
  is_active: boolean;
  /** Sold-out-today switch for this size alone, independent of its dish. */
  is_available?: boolean;
  sort_order?: number;
};

export type MenuItem = {
  id: number;
  name: string;
  name_dv?: string | null;
  card_name?: string | null;
  card_name_dv?: string | null;
  description?: string | null;
  short_description?: string | null;
  short_description_dv?: string | null;
  price_note?: string | null;
  sku?: string | null;
  image_url?: string | null;
  /** High-res master for admin re-crop (not used on POS/website). */
  image_original_url?: string | null;
  /** Card thumbnail (400×300); optional. */
  thumb_url?: string | null;
  image_webp_url?: string | null;
  thumb_webp_url?: string | null;
  base_price: number;
  packaging_fee?: number;
  packaging_fee_mode?: 'per_unit' | 'per_line';
  packaging_options?: Array<{
    id?: number;
    name: string;
    name_dv?: string | null;
    fee: number;
    is_default: boolean;
    sort_order: number;
    is_active?: boolean;
  }>;
  cost?: number | null;
  recipe_cost?: number | null;
  effective_cost?: number | null;
  has_variants?: boolean;
  variants?: MenuVariant[];
  tax_rate?: number | null;
  tax_code?: string | null;
  is_available: boolean;
  /** ISO datetime — 86 / snooze until this time. */
  snoozed_until?: string | null;
  /** Optional short note shown to customers while unavailable. */
  unavailable_reason_note?: string | null;
  is_active: boolean;
  sort_order?: number | null;
  track_stock?: boolean;
  stock_quantity?: number | null;
  low_stock_threshold?: number | null;
  availability_type?: 'always' | 'stock_based' | 'made_to_order' | 'pre_order_only' | null;
  /** When true, customers may order this item for tomorrow collection. */
  allow_pre_order?: boolean;
  /** Max units kitchen can make for one tomorrow collection date. Null = no limit. */
  tomorrow_daily_capacity?: number | null;
  category_id?: number | null;
  menu_group_id?: number | null;
  prep_time_minutes?: number | null;
  spice_level?: 'none' | 'mild' | 'medium' | 'hot' | 'extra_hot' | null;
  category?: { id: number; name: string } | null;
  menu_group?: { id: number; name: string; slug: string } | null;
  channel_availabilities?: ItemChannelAvailabilityRow[] | null;
  is_combo?: boolean;
  /** True when platter_groups are defined (build-your-own, not fixed combo). */
  is_platter?: boolean;
  show_on_signage?: boolean;
  is_signage_promoted?: boolean;
  combo_discount_pct?: number | null;
  combo_items?: Array<{
    item_id: number;
    quantity: number;
    is_optional: boolean;
    item?: { id: number; name: string; base_price: number } | null;
  }>;
  platter_groups?: PlatterGroup[];
  dietary_tags?: string[] | null;
  allergens?: string[] | null;
  calories?: number | null;
  /** Catering channel enabled — display flag only. */
  is_catering?: boolean;
};

export type PlatterGroupItem = {
  item_id: number;
  surcharge?: number;
  sort_order?: number;
  item?: {
    id: number;
    name: string;
    name_dv?: string | null;
    base_price?: number;
    image_url?: string | null;
    is_available?: boolean;
    has_variants?: boolean;
  } | null;
};

export type PlatterGroup = {
  id?: number;
  name: string;
  /** exactly = choose N; min = at least N; range = between min and max */
  rule_type: 'exactly' | 'min' | 'range';
  min_count?: number | null;
  max_count?: number | null;
  /** variant_id → how many pieces that size picks */
  size_counts?: Record<string, number> | null;
  sort_order?: number;
  items: PlatterGroupItem[];
};

export type MenuItemPayload = {
  name: string;
  name_dv?: string | null;
  card_name?: string | null;
  card_name_dv?: string | null;
  description?: string | null;
  short_description?: string | null;
  short_description_dv?: string | null;
  price_note?: string | null;
  sku?: string | null;
  image_url?: string | null;
  image_original_url?: string | null;
  thumb_url?: string | null;
  image_webp_url?: string | null;
  thumb_webp_url?: string | null;
  base_price: number;
  packaging_fee?: number;
  packaging_fee_mode?: 'per_unit' | 'per_line';
  packaging_options?: Array<{
    id?: number;
    name: string;
    name_dv?: string | null;
    fee: number;
    is_default: boolean;
    sort_order: number;
    is_active?: boolean;
  }>;
  has_variants?: boolean;
  variants?: MenuVariant[];
  tax_rate?: number | null;
  tax_code?: string | null;
  category_id?: number | null;
  menu_group_id?: number | null;
  sort_order?: number | null;
  is_active?: boolean;
  is_available?: boolean;
  track_stock?: boolean;
  stock_quantity?: number | null;
  low_stock_threshold?: number | null;
  availability_type?: 'always' | 'stock_based' | 'made_to_order' | 'pre_order_only';
  allow_pre_order?: boolean;
  tomorrow_daily_capacity?: number | null;
  channel_availability?: Array<{
    channel: string;
    is_enabled: boolean;
    valid_from?: string | null;
    valid_until?: string | null;
  }>;
  is_combo?: boolean;
  show_on_signage?: boolean;
  is_signage_promoted?: boolean;
  combo_discount_pct?: number | null;
  combo_items?: Array<{ item_id: number; quantity?: number; is_optional?: boolean }>;
  platter_groups?: Array<{
    name: string;
    rule_type: 'exactly' | 'min' | 'range';
    min_count?: number | null;
    max_count?: number | null;
    size_counts?: Record<string, number> | null;
    sort_order?: number;
    items: Array<{ item_id: number; surcharge?: number; sort_order?: number }>;
  }>;
  dietary_tags?: string[] | null;
  allergens?: string[] | null;
  calories?: number | null;
  prep_time_minutes?: number | null;
  spice_level?: 'none' | 'mild' | 'medium' | 'hot' | 'extra_hot' | null;
};

export async function fetchItemVariants(itemId: number): Promise<{ variants: MenuVariant[] }> {
  return req(`/items/${itemId}/variants`);
}

export async function createVariant(itemId: number, data: Omit<MenuVariant, 'id'>): Promise<{ variant: MenuVariant }> {
  return req(`/items/${itemId}/variants`, { method: 'POST', body: JSON.stringify(data) });
}

export async function updateVariant(itemId: number, variantId: number, data: Partial<MenuVariant>): Promise<{ variant: MenuVariant }> {
  return req(`/items/${itemId}/variants/${variantId}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteVariant(itemId: number, variantId: number): Promise<void> {
  return req(`/items/${itemId}/variants/${variantId}`, { method: 'DELETE' });
}

export async function fetchMenuGroups(): Promise<{ data: MenuGroupRow[] }> {
  return req('/admin/menu-groups');
}

export async function getKitchenMenuState(): Promise<{
  kitchen_menu_state: { id: number; active_menu_group_ids: number[] };
}> {
  return req('/admin/kitchen-menu-state');
}

export async function updateKitchenMenuState(active_menu_group_ids: number[]): Promise<{
  kitchen_menu_state: { id: number; active_menu_group_ids: number[] };
}> {
  return req('/admin/kitchen-menu-state', {
    method: 'PATCH',
    body: JSON.stringify({ active_menu_group_ids }),
  });
}

export async function fetchAdminCategories(): Promise<{ data: MenuCategory[] }> {
  return req('/categories?admin=1');
}

export async function createCategory(data: {
  name: string;
  name_dv?: string | null;
  description?: string | null;
  image_url?: string | null;
  image_original_url?: string | null;
  thumb_url?: string | null;
  image_webp_url?: string | null;
  thumb_webp_url?: string | null;
  sort_order?: number | null;
  parent_id?: number | null;
}): Promise<{ category: MenuCategory }> {
  return req('/categories', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateCategory(
  id: number,
  data: Partial<{
    name: string;
    name_dv: string | null;
    description: string | null;
    image_url: string | null;
    image_original_url: string | null;
    thumb_url: string | null;
    image_webp_url: string | null;
    thumb_webp_url: string | null;
    sort_order: number | null;
    is_active: boolean;
    parent_id: number | null;
  }>
): Promise<{ category: MenuCategory }> {
  return req(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteCategory(id: number): Promise<void> {
  await req(`/categories/${id}`, { method: 'DELETE' });
}

export async function fetchAdminItems(params?: {
  category_id?: number;
  search?: string;
  page?: number;
  per_page?: number;
}): Promise<{ data: MenuItem[]; meta?: { total: number; last_page: number; current_page: number } }> {
  const qs = new URLSearchParams({ admin: '1' });
  if (params?.category_id) qs.set('category_id', String(params.category_id));
  if (params?.search) qs.set('search', params.search);
  if (params?.page) qs.set('page', String(params.page));
  if (params?.per_page) qs.set('per_page', String(params.per_page));
  return req(`/items?${qs}`);
}

export async function createItem(data: MenuItemPayload): Promise<{ item: MenuItem }> {
  return req('/items', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateItem(id: number, data: Partial<MenuItemPayload>): Promise<{ item: MenuItem }> {
  return req(`/items/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

/** Columns the bulk editor is allowed to touch. Mirrors MenuBulkUpdateService::fieldRules(). */
export type BulkItemFields = Partial<{
  name: string;
  name_dv: string | null;
  sku: string | null;
  barcode: string | null;
  base_price: number;
  cost: number | null;
  category_id: number | null;
  menu_group_id: number | null;
  sort_order: number | null;
  tax_code: string;
  is_active: boolean;
  is_available: boolean;
  track_stock: boolean;
  stock_quantity: number | null;
  low_stock_threshold: number | null;
  prep_time_minutes: number | null;
  packaging_fee: number;
  allow_pre_order: boolean;
  show_on_signage: boolean;
}>;

export type BulkItemChange = { id: number; fields: BulkItemFields };

/** Row index → field → messages. Present on a 422; nothing was saved. */
export type BulkRowErrors = Record<number, Record<string, string[]>>;

export type BulkUpdateResult = {
  message: string;
  updated: number;
  created: number;
  unchanged: number;
  items: MenuItem[];
};

/**
 * Save one small change to each of many items.
 *
 * Sparse on purpose: only the keys present in `fields` are written, so this
 * never clobbers a column somebody else is editing, and the server applies the
 * whole batch in one transaction — on a validation failure nothing is saved
 * and the thrown error carries `row_errors` keyed by position in `changes`.
 */
export async function bulkUpdateItems(
  changes: BulkItemChange[],
  variantChanges: BulkItemChange[] = [],
  newItems: BulkItemFields[] = [],
): Promise<BulkUpdateResult> {
  return req('/items/bulk-update', {
    method: 'POST',
    body: JSON.stringify({ changes, variant_changes: variantChanges, new_items: newItems }),
  });
}

/**
 * Pull the per-row errors out of a failed bulkUpdateItems call.
 *
 * Items and sizes are reported separately because they are separate lists in
 * the request — an index means nothing without knowing which one it counts.
 */
export function bulkRowErrors(error: unknown): {
  items: BulkRowErrors | null;
  variants: BulkRowErrors | null;
  newRows: BulkRowErrors | null;
} | null {
  const body = (error as { body?: unknown } | null)?.body;
  if (!body || typeof body !== 'object') return null;
  const asRows = (v: unknown) => (v && typeof v === 'object' ? (v as BulkRowErrors) : null);
  const items = asRows((body as { row_errors?: unknown }).row_errors);
  const variants = asRows((body as { variant_row_errors?: unknown }).variant_row_errors);
  const newRows = asRows((body as { new_row_errors?: unknown }).new_row_errors);
  if (!items && !variants && !newRows) return null;

  return { items, variants, newRows };
}

export async function deleteItem(id: number): Promise<void> {
  await req(`/items/${id}`, { method: 'DELETE' });
}

export async function toggleItemAvailability(id: number): Promise<{ item: MenuItem }> {
  return req(`/items/${id}/toggle-availability`, { method: 'PATCH' });
}

export type SnoozeUntil = '2_hours' | 'end_of_day' | 'tomorrow' | 'date' | 'indefinite' | null;

export async function snoozeItem(
  id: number,
  until: SnoozeUntil,
  opts?: { until_date?: string; unavailable_reason_note?: string | null },
): Promise<{
  message: string;
  item: {
    id: number;
    name: string;
    is_available?: boolean;
    snoozed_until: string | null;
    is_snoozed: boolean;
    unavailable_reason_note?: string | null;
  };
}> {
  return req(`/items/${id}/snooze`, {
    method: 'PATCH',
    body: JSON.stringify({
      until,
      ...(opts?.until_date ? { until_date: opts.until_date } : {}),
      ...(opts && 'unavailable_reason_note' in opts
        ? { unavailable_reason_note: opts.unavailable_reason_note }
        : {}),
    }),
  });
}

export async function uploadMenuImage(
  file: File,
  original?: File,
  purpose: 'menu' | 'banner' = 'menu',
): Promise<{
  url: string;
  original_url?: string | null;
  thumb_url?: string | null;
  image_webp_url?: string | null;
  thumb_webp_url?: string | null;
  width?: number;
  height?: number;
}> {
  const { prepareImageForUpload } = await import('../utils/prepareUpload');
  const prepared = await prepareImageForUpload(file);
  const preparedOriginal = original ? await prepareImageForUpload(original) : undefined;
  const formData = new FormData();
  formData.append('image', prepared);
  if (preparedOriginal) formData.append('original', preparedOriginal);
  if (purpose !== 'menu') formData.append('purpose', purpose);
  return req('/admin/upload-image', { method: 'POST', body: formData });
}

// ── Item Photos ────────────────────────────────────────────────────────────────

export interface ItemPhoto {
  id: number;
  item_id: number;
  url: string;
  original_url?: string | null;
  alt_text?: string | null;
  thumb_url?: string | null;
  image_webp_url?: string | null;
  thumb_webp_url?: string | null;
  media_type?: 'image' | 'video';
  poster_url?: string | null;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
}

export async function getItemPhotos(itemId: number): Promise<{ photos: ItemPhoto[] }> {
  return req(`/items/${itemId}/photos`);
}

export async function uploadItemPhoto(
  itemId: number,
  file: File,
  options?: { original?: File; original_url?: string | null; alt_text?: string | null },
): Promise<{ photo: ItemPhoto }> {
  const { prepareImageForUpload } = await import('../utils/prepareUpload');
  const prepared = await prepareImageForUpload(file);
  const preparedOriginal = options?.original ? await prepareImageForUpload(options.original) : undefined;
  const form = new FormData();
  form.append('photo', prepared);
  if (preparedOriginal) form.append('original', preparedOriginal);
  if (options?.original_url) form.append('original_url', options.original_url);
  if (options?.alt_text) form.append('alt_text', options.alt_text);
  return req(`/items/${itemId}/photos`, { method: 'POST', body: form });
}

export async function updateItemPhoto(
  itemId: number,
  photoId: number,
  data: { sort_order?: number; is_primary?: boolean; original_url?: string | null; alt_text?: string | null },
): Promise<{ photo: ItemPhoto }> {
  return req(`/items/${itemId}/photos/${photoId}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function reorderItemPhotos(
  itemId: number,
  order: number[],
): Promise<{ photos: ItemPhoto[] }> {
  return req(`/items/${itemId}/photos/reorder`, {
    method: 'POST',
    body: JSON.stringify({ order }),
  });
}

export async function uploadItemVideo(
  itemId: number,
  video: File,
  poster: File,
  options?: { alt_text?: string | null; is_primary?: boolean },
): Promise<{ photo: ItemPhoto }> {
  const { prepareImageForUpload } = await import('../utils/prepareUpload');
  const preparedPoster = await prepareImageForUpload(poster);
  const form = new FormData();
  form.append('media_type', 'video');
  form.append('video', video);
  form.append('poster', preparedPoster);
  if (options?.alt_text) form.append('alt_text', options.alt_text);
  if (options?.is_primary) form.append('is_primary', '1');
  return req(`/items/${itemId}/photos`, { method: 'POST', body: form });
}

export async function deleteItemPhoto(itemId: number, photoId: number): Promise<void> {
  await req(`/items/${itemId}/photos/${photoId}`, { method: 'DELETE' });
}

// ── Daily Specials ─────────────────────────────────────────────────────────────

export interface DailySpecialVariantOverride {
  variant_id: number;
  variant_name: string | null;
  catalog_price: number | null;
  discount_pct: number | null;
  special_price: number | null;
  effective_price: number | null;
}

export interface DailySpecial {
  id: number;
  item_id: number;
  item_name: string | null;
  item_image: string | null;
  badge_label: string | null;
  special_price: number | null;
  discount_pct: number | null;
  effective_price: number | null;
  original_price: number | null;
  variant_overrides?: DailySpecialVariantOverride[];
  description: string | null;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  days_of_week: number[] | null;
  is_active: boolean;
  sold_count: number;
  max_quantity: number | null;
}

export type DailySpecialPayload = Partial<Omit<DailySpecial, 'id' | 'variant_overrides' | 'item_name' | 'item_image' | 'effective_price' | 'original_price'>> & {
  variant_overrides?: Array<{
    variant_id: number;
    discount_pct?: number;
    special_price?: number;
  }>;
};

export async function fetchSpecials(params?: {
  page?: number;
  filter?: string;
  item_id?: number;
  overlap_start?: string;
  overlap_end?: string;
}): Promise<{ data: DailySpecial[]; meta: { current_page: number; last_page: number; total: number; active_today_count?: number } }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.filter && params.filter !== 'all') qs.set('filter', params.filter);
  if (params?.item_id) qs.set('item_id', String(params.item_id));
  if (params?.overlap_start) qs.set('overlap_start', params.overlap_start);
  if (params?.overlap_end) qs.set('overlap_end', params.overlap_end);
  return req(`/admin/specials?${qs}`);
}

export async function findOverlappingSpecial(
  itemId: number,
  startDate: string,
  endDate: string,
): Promise<DailySpecial | null> {
  const res = await fetchSpecials({
    item_id: itemId,
    overlap_start: startDate,
    overlap_end: endDate,
  });
  return res.data[0] ?? null;
}

export async function getSpecial(id: number): Promise<{ special: DailySpecial }> {
  return req(`/admin/specials/${id}`);
}

export async function createSpecial(data: DailySpecialPayload): Promise<{ special: DailySpecial }> {
  return req('/admin/specials', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateSpecial(id: number, data: DailySpecialPayload): Promise<{ special: DailySpecial }> {
  return req(`/admin/specials/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteSpecial(id: number): Promise<void> {
  await req(`/admin/specials/${id}`, { method: 'DELETE' });
}

// ── Item Recipe & costing ───────────────────────────────────────────────────
// Owner-only (recipes.manage): the recipe roll-up exposes cost price, margin
// and profit. Shape mirrors RecipeController::payload on the backend.

export interface RecipeIngredient {
  id: number;
  inventory_item_id: number;
  inventory_item: { id: number; name: string; unit: string; unit_cost: number } | null;
  quantity: number;
  unit: string | null;
  line_cost: number;
}

export interface ItemRecipe {
  id: number;
  yield_quantity: number;
  /** When true, the dish leaves the menu once its ingredients run out. */
  limits_availability: boolean;
  instructions: string | null;
  ingredients: RecipeIngredient[];
}

export interface ItemWithRecipe {
  id: number;
  name: string;
  base_price: number;
  recipe_cost: number | null;
  effective_cost: number | null;
  profit: number | null;
  margin_pct: number | null;
  recipe: ItemRecipe | null;
}

/** One ingredient line as sent when saving a recipe. */
export interface RecipeIngredientInput {
  inventory_item_id: number;
  quantity: number;
  unit?: string | null;
}

export async function getItemWithRecipe(id: number): Promise<{ item: ItemWithRecipe }> {
  return req(`/items/${id}/recipe`);
}

/** Replace an item's ingredient list; the backend recomputes cost from live prices. */
export async function saveItemRecipe(
  id: number,
  ingredients: RecipeIngredientInput[],
  limitsAvailability?: boolean,
): Promise<{ item: ItemWithRecipe }> {
  return req(`/items/${id}/recipe`, {
    method: 'PUT',
    body: JSON.stringify(
      limitsAvailability === undefined
        ? { ingredients }
        : { ingredients, limits_availability: limitsAvailability },
    ),
  });
}
