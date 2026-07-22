import { req } from './client';

export type MenuCategory = {
  id: number;
  name: string;
  name_dv?: string | null;
  description?: string | null;
  image_url?: string | null;
  image_original_url?: string | null;
  thumb_url?: string | null;
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
  is_active: boolean;
  sort_order?: number;
};

export type MenuItem = {
  id: number;
  name: string;
  name_dv?: string | null;
  description?: string | null;
  sku?: string | null;
  image_url?: string | null;
  /** High-res master for admin re-crop (not used on POS/website). */
  image_original_url?: string | null;
  /** Card thumbnail (400×300); optional. */
  thumb_url?: string | null;
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
  is_active: boolean;
  sort_order?: number | null;
  track_stock?: boolean;
  stock_quantity?: number | null;
  low_stock_threshold?: number | null;
  availability_type?: 'always' | 'stock_based' | 'made_to_order' | 'pre_order_only' | null;
  category_id?: number | null;
  menu_group_id?: number | null;
  prep_time_minutes?: number | null;
  spice_level?: 'none' | 'mild' | 'medium' | 'hot' | 'extra_hot' | null;
  category?: { id: number; name: string } | null;
  menu_group?: { id: number; name: string; slug: string } | null;
  channel_availabilities?: ItemChannelAvailabilityRow[] | null;
  is_combo?: boolean;
  combo_discount_pct?: number | null;
  combo_items?: Array<{
    item_id: number;
    quantity: number;
    is_optional: boolean;
    item?: { id: number; name: string; base_price: number } | null;
  }>;
  dietary_tags?: string[] | null;
  allergens?: string[] | null;
  calories?: number | null;
  /** Catering channel enabled — display flag only. */
  is_catering?: boolean;
};

export type MenuItemPayload = {
  name: string;
  name_dv?: string | null;
  description?: string | null;
  sku?: string | null;
  image_url?: string | null;
  image_original_url?: string | null;
  thumb_url?: string | null;
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
  channel_availability?: Array<{
    channel: string;
    is_enabled: boolean;
    valid_from?: string | null;
    valid_until?: string | null;
  }>;
  is_combo?: boolean;
  combo_discount_pct?: number | null;
  combo_items?: Array<{ item_id: number; quantity?: number; is_optional?: boolean }>;
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

export async function deleteItem(id: number): Promise<void> {
  await req(`/items/${id}`, { method: 'DELETE' });
}

export async function toggleItemAvailability(id: number): Promise<{ item: MenuItem }> {
  return req(`/items/${id}/toggle-availability`, { method: 'PATCH' });
}

export async function uploadMenuImage(
  file: File,
  original?: File,
  purpose: 'menu' | 'banner' = 'menu',
): Promise<{
  url: string;
  original_url?: string | null;
  thumb_url?: string | null;
  width?: number;
  height?: number;
}> {
  const formData = new FormData();
  formData.append('image', file);
  if (original) formData.append('original', original);
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
  const form = new FormData();
  form.append('photo', file);
  if (options?.original) form.append('original', options.original);
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
  const form = new FormData();
  form.append('media_type', 'video');
  form.append('video', video);
  form.append('poster', poster);
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
  badge_label: string;
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

// ── Item Recipe ───────────────────────────────────────────────────────────────

export interface RecipeItem {
  id: number;
  inventory_item: { id: number; name: string; unit: string } | null;
  quantity: number;
  unit: string | null;
  notes: string | null;
}

export interface ItemWithRecipe extends MenuItem {
  recipe: { id: number; recipe_items: RecipeItem[] } | null;
}

export async function getItemWithRecipe(id: number): Promise<{ item: ItemWithRecipe }> {
  return req(`/items/${id}/recipe`);
}
