// ── Menu & Specials ────────────────────────────────────────────────────────────
import { ENDPOINTS } from '@shared/api';
import type { Category, MenuItem } from '@shared/types';
import { request } from './client';

export type { MenuItem };

export async function fetchCategories(): Promise<{ data: Category[] }> {
  return request<{ data: Category[] }>(ENDPOINTS.CATEGORIES);
}

export async function fetchItems(): Promise<{ data: MenuItem[] }> {
  const res = await request<{ data: MenuItem[] }>(`${ENDPOINTS.ITEMS}?available_only=1`);
  // Coerce prices to numbers at the API boundary so consumers never need parseFloat()
  res.data = res.data.map((item) => ({
    ...item,
    base_price: Number(item.base_price),
    modifiers: item.modifiers?.map((m) => ({ ...m, price: Number(m.price) })),
  }));
  return res;
}

export interface DailySpecial {
  id: number;
  item: { id: number; name: string; description: string | null; image_url: string | null; base_price: number } | null;
  badge_label: string | null;
  special_price: number | null;
  discount_pct: number | null;
  start_time: string | null;
  end_time: string | null;
}

export async function fetchActiveSpecials(): Promise<{ specials: DailySpecial[] }> {
  return request('/specials');
}

export async function getWaitTimeEstimate(): Promise<{ wait_minutes: number; queue_depth: number }> {
  return request('/wait-time');
}

export interface ItemReview {
  id: number;
  rating: number;
  comment: string | null;
  created_at: string;
}

export async function getItemReviews(itemId: number): Promise<{ reviews: ItemReview[]; average_rating: number | null; review_count: number }> {
  return request(`/items/${itemId}/reviews`);
}

export interface ItemPhoto {
  id: number;
  url: string;
  is_primary: boolean;
  sort_order: number;
}

export async function getItemPhotos(itemId: number): Promise<{ photos: ItemPhoto[] }> {
  return request(`/items/${itemId}/photos`);
}
