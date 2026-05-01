// ── Menu & Specials ────────────────────────────────────────────────────────────
import { ENDPOINTS } from '@shared/api';
import type { Category, MenuItem } from '@shared/types';
import { request } from './client';

export type { MenuItem };

/** Sales channel for public menu API (`online_pickup` = takeaway, `delivery` = delivery). */
export type SalesChannel = 'online_pickup' | 'delivery';

const SALES_CHANNEL_KEY = 'bakegrill_sales_channel';

export function getSalesChannel(): SalesChannel {
  if (typeof localStorage === 'undefined') return 'online_pickup';
  return localStorage.getItem(SALES_CHANNEL_KEY) === 'delivery' ? 'delivery' : 'online_pickup';
}

export function setSalesChannel(channel: SalesChannel): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SALES_CHANNEL_KEY, channel);
  window.dispatchEvent(new Event('sales_channel_change'));
}

export interface OrderingEligibility {
  delivery: {
    accepting: boolean;
    reason: string | null;
    message: string | null;
  };
  active_menu_groups: Array<{ id: number; name: string; slug: string }>;
}

export async function fetchOrderingEligibility(): Promise<OrderingEligibility> {
  return request<OrderingEligibility>(ENDPOINTS.ORDERING_ELIGIBILITY);
}

export interface OnlineOrderingStatus {
  open: boolean;
  message: string;
  reason: 'master_switch_off' | 'schedule' | 'override_active' | null;
  master_switch: boolean;
  override_active: boolean;
  override_until: string | null;
  schedule_active: boolean;
  /** ISO 8601 end of the active window (when open). Used for "Closes X:XX PM". */
  current_close: string | null;
  /** ISO 8601 start of the next window (when closed). Used for "Opens X:XX PM". */
  next_open_window: string | null;
}

export async function fetchOnlineOrderingStatus(): Promise<OnlineOrderingStatus> {
  return request<OnlineOrderingStatus>(ENDPOINTS.ORDERING_STATUS);
}

export interface DeliveryZoneStatus {
  accepting: boolean;
  zone_eligible: boolean | null;
  message: string | null;
  reason: string | null;
}

export async function fetchDeliveryZoneStatus(area: string): Promise<DeliveryZoneStatus> {
  const qs = new URLSearchParams({ area });
  return request<DeliveryZoneStatus>(`${ENDPOINTS.ORDERING_DELIVERY_STATUS}?${qs}`);
}

export async function fetchCategories(): Promise<{ data: Category[] }> {
  return request<{ data: Category[] }>(ENDPOINTS.CATEGORIES);
}

export async function fetchItems(channel?: SalesChannel): Promise<{ data: MenuItem[] }> {
  const ch = channel ?? getSalesChannel();
  const qs = new URLSearchParams({ available_only: '1', channel: ch });
  const res = await request<{ data: MenuItem[] }>(`${ENDPOINTS.ITEMS}?${qs}`);
  // Coerce prices to numbers at the API boundary so consumers never need parseFloat()
  res.data = (res.data ?? []).map((item) => ({
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
