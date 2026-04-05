import { BASE, req } from './client';

export type MenuCategory = {
  id: number;
  name: string;
  name_dv?: string | null;
  description?: string | null;
  image_url?: string | null;
  sort_order?: number | null;
  is_active: boolean;
  items?: MenuItem[];
};

export type MenuItem = {
  id: number;
  name: string;
  name_dv?: string | null;
  description?: string | null;
  sku?: string | null;
  image_url?: string | null;
  base_price: number;
  tax_rate?: number | null;
  is_available: boolean;
  is_active: boolean;
  sort_order?: number | null;
  category_id?: number | null;
  category?: { id: number; name: string } | null;
};

export type MenuItemPayload = {
  name: string;
  name_dv?: string | null;
  description?: string | null;
  sku?: string | null;
  image_url?: string | null;
  base_price: number;
  tax_rate?: number | null;
  category_id?: number | null;
  sort_order?: number | null;
  is_active?: boolean;
  is_available?: boolean;
};

export async function fetchAdminCategories(): Promise<{ data: MenuCategory[] }> {
  return req('/categories?admin=1');
}

export async function createCategory(data: {
  name: string;
  name_dv?: string | null;
  description?: string | null;
  image_url?: string | null;
  sort_order?: number | null;
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
    sort_order: number | null;
    is_active: boolean;
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

export async function uploadMenuImage(file: File): Promise<{ url: string }> {
  const token = localStorage.getItem('admin_token');
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch(`${BASE}/admin/upload-image`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? `Upload failed (${res.status})`);
  }
  return res.json() as Promise<{ url: string }>;
}

// ── Item Photos ────────────────────────────────────────────────────────────────

export interface ItemPhoto {
  id: number;
  item_id: number;
  url: string;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
}

export async function getItemPhotos(itemId: number): Promise<{ data: ItemPhoto[] }> {
  return req(`/items/${itemId}/photos`);
}

export async function uploadItemPhoto(itemId: number, file: File): Promise<{ photo: ItemPhoto }> {
  const token = localStorage.getItem('admin_token');
  const form = new FormData();
  form.append('photo', file);
  const res = await fetch(`${BASE}/items/${itemId}/photos`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? `Upload failed (${res.status})`);
  }
  return res.json() as Promise<{ photo: ItemPhoto }>;
}

export async function updateItemPhoto(
  itemId: number,
  photoId: number,
  data: { sort_order?: number; is_primary?: boolean },
): Promise<{ photo: ItemPhoto }> {
  return req(`/items/${itemId}/photos/${photoId}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteItemPhoto(itemId: number, photoId: number): Promise<void> {
  await req(`/items/${itemId}/photos/${photoId}`, { method: 'DELETE' });
}

// ── Daily Specials ─────────────────────────────────────────────────────────────

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

export async function fetchSpecials(params?: { page?: number }): Promise<{ data: DailySpecial[]; meta: { current_page: number; last_page: number; total: number } }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  return req(`/admin/specials?${qs}`);
}

export async function createSpecial(data: Partial<DailySpecial>): Promise<{ special: DailySpecial }> {
  return req('/admin/specials', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateSpecial(id: number, data: Partial<DailySpecial>): Promise<{ special: DailySpecial }> {
  return req(`/admin/specials/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteSpecial(id: number): Promise<void> {
  await req(`/admin/specials/${id}`, { method: 'DELETE' });
}
