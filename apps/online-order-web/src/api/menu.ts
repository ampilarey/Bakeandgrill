// ── Menu & Specials ────────────────────────────────────────────────────────────
import { ENDPOINTS } from '@shared/api';
import type { Category, MenuItem } from '@shared/types';
import { request } from './client';

export type { MenuItem };

/** Sales channel for public menu API (`online_pickup` = pickup, `delivery` = delivery). */
export type SalesChannel = 'online_pickup' | 'delivery';

/** Listing-only channel for the event wizard Catering tab (not orderable immediately). */
export type MenuListingChannel = SalesChannel | 'catering';

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
  /** Whether delivery is currently available (false = pickup only). */
  delivery_available: boolean;
  /** ISO 8601 start of the next delivery window, when delivery is currently unavailable. */
  next_delivery_window: string | null;
}

export async function fetchOnlineOrderingStatus(): Promise<OnlineOrderingStatus> {
  return request<OnlineOrderingStatus>(ENDPOINTS.ORDERING_STATUS);
}

export interface DeliveryZoneStatus {
  accepting: boolean;
  zone_eligible: boolean | null;
  message: string | null;
  reason: string | null;
  delivery_open?: boolean;
}

export async function fetchDeliveryZoneStatus(area: string): Promise<DeliveryZoneStatus> {
  const qs = new URLSearchParams({ area });
  const raw = await request<DeliveryZoneStatus & {
    delivery_open?: boolean;
    accepting_flag?: boolean;
  }>(`${ENDPOINTS.ORDERING_DELIVERY_STATUS}?${qs}`);

  return {
    accepting: raw.accepting ?? raw.delivery_open ?? raw.accepting_flag ?? false,
    zone_eligible: raw.zone_eligible ?? null,
    message: raw.message ?? null,
    reason: raw.reason ?? null,
    delivery_open: raw.delivery_open,
  };
}

export type DeliveryFeePreview = {
  fee_laar: number;
  fee_mvr: number;
  free_threshold_mvr: number;
  qualifies_free: boolean;
};

export async function fetchDeliveryFeePreview(
  island: string,
  subtotalLaar: number,
): Promise<DeliveryFeePreview> {
  const qs = new URLSearchParams({
    island: island.trim(),
    subtotal_laar: String(Math.max(0, subtotalLaar)),
  });
  return request<DeliveryFeePreview>(`${ENDPOINTS.ORDERING_DELIVERY_FEE_PREVIEW}?${qs}`);
}

export type CheckoutFeesPreview = {
  packaging_fee_laar: number;
  packaging_fee_label: string;
  small_order_fee_laar: number;
  small_order_fee_label: string;
  packaging_fee_taxable?: boolean;
};

export async function fetchCheckoutFeesPreview(
  orderType: 'delivery' | 'online_pickup' | 'takeaway',
  discountedSubtotalLaar: number,
  lines: Array<{
    item_id: number;
    quantity: number;
    packaging_option_id?: number | null;
    packaging_fee?: number | null;
    packaging_fee_mode?: 'per_unit' | 'per_line' | null;
  }> = [],
): Promise<CheckoutFeesPreview> {
  return request<CheckoutFeesPreview>(ENDPOINTS.ORDERING_CHECKOUT_FEES_PREVIEW, {
    method: 'POST',
    body: JSON.stringify({
      order_type: orderType,
      discounted_subtotal_laar: Math.max(0, discountedSubtotalLaar),
      lines,
    }),
  });
}

export async function fetchCategories(): Promise<{ data: Category[] }> {
  return request<{ data: Category[] }>(ENDPOINTS.CATEGORIES);
}

export type FetchItemsResult = {
  data: MenuItem[];
  /** Channel actually used after any pickup fallback. */
  channelUsed: MenuListingChannel;
  /** True when delivery was requested but no delivery items exist — switched to pickup. */
  deliveryFallback: boolean;
};

async function fetchItemsForChannel(ch: MenuListingChannel): Promise<MenuItem[]> {
  const qs = new URLSearchParams({ available_only: '1', channel: ch });
  const res = await request<{ data: MenuItem[] }>(`${ENDPOINTS.ITEMS}?${qs}`);
  return (res.data ?? []).map((item) => ({
    ...item,
    base_price: Number(item.base_price),
    packaging_fee: Number(item.packaging_fee ?? 0),
    packaging_fee_mode: item.packaging_fee_mode === 'per_line' ? 'per_line' as const : 'per_unit' as const,
    packaging_options: (item.packaging_options ?? []).map((o) => ({
      ...o,
      fee: Number(o.fee ?? 0),
      is_default: !!o.is_default,
      sort_order: Number(o.sort_order ?? 0),
    })),
    modifiers: item.modifiers?.map((m) => ({ ...m, price: Number(m.price) })),
    variants: item.variants?.map((v) => ({
      ...v,
      price: Number(v.price),
      original_price: v.original_price != null ? Number(v.original_price) : undefined,
      effective_price: v.effective_price != null ? Number(v.effective_price) : undefined,
    })),
    special: item.special
      ? {
          ...item.special,
          original_price: Number(item.special.original_price),
          effective_price: Number(item.special.effective_price),
        }
      : undefined,
  }));
}

export async function fetchItems(channel?: MenuListingChannel): Promise<FetchItemsResult> {
  const requested = channel ?? getSalesChannel();
  let channelUsed: MenuListingChannel = requested;
  let deliveryFallback = false;

  let data = await fetchItemsForChannel(requested);

  // Delivery with zero channel-enabled items used to show categories but an empty grid.
  // Never fall back when listing the catering channel — that tab must show catering-only items.
  if (requested === 'delivery' && data.length === 0) {
    const pickupItems = await fetchItemsForChannel('online_pickup');
    if (pickupItems.length > 0) {
      data = pickupItems;
      channelUsed = 'online_pickup';
      deliveryFallback = true;
      setSalesChannel('online_pickup');
    }
  }

  return { data, channelUsed, deliveryFallback };
}

export interface DailySpecial {
  id: number;
  item_id: number;
  variant_id?: number | null;
  item_name: string | null;
  variant_name?: string | null;
  item_image: string | null;
  badge_label: string | null;
  special_price: number | null;
  discount_pct: number | null;
  effective_price: number | null;
  original_price: number | null;
  start_time: string | null;
  end_time: string | null;
}

export async function fetchActiveSpecials(): Promise<{ specials: DailySpecial[] }> {
  return request('/specials');
}

export async function getWaitTimeEstimate(): Promise<{ wait_minutes: number; queue_depth: number }> {
  return request(ENDPOINTS.WAIT_TIME);
}

export type PickupSlot = {
  starts_at: string;
  ends_at: string;
  label: string;
  available: boolean;
  remaining: number;
};

export async function fetchPickupSlots(date?: string): Promise<{ date: string; slots: PickupSlot[] }> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : '';
  return request(`${ENDPOINTS.PICKUP_SLOTS}${qs}`);
}

export interface FeaturedReview {
  id: number;
  rating: number;
  comment: string | null;
  author: string;
  item: { id: number; name: string } | null;
  created_at: string;
}

export async function fetchFeaturedReviews(limit = 6): Promise<{ reviews: FeaturedReview[] }> {
  const qs = new URLSearchParams({ limit: String(limit) });
  return request(`${ENDPOINTS.REVIEWS_FEATURED}?${qs}`);
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

export async function fetchCartRecommendations(itemIds: number[], limit = 3): Promise<{ items: MenuItem[] }> {
  if (itemIds.length === 0) return { items: [] };
  return request('/recommendations/cart', {
    method: 'POST',
    body: JSON.stringify({ item_ids: itemIds, limit }),
  });
}

export type GstBootstrap = {
  default_tax_rate_bp: number;
  tax_rate_percent: number;
  tax_inclusive: boolean;
  gst_registered: boolean;
  currency: string;
  packaging_fee_taxable?: boolean;
};

let gstBootstrapCache: GstBootstrap | null = null;

/** Authoritative GST rate for checkout preview — order create is server-calculated. */
export async function fetchGstBootstrap(): Promise<GstBootstrap> {
  if (gstBootstrapCache) return gstBootstrapCache;
  try {
    const data = await request<GstBootstrap>('/gst/bootstrap');
    gstBootstrapCache = data;
    return data;
  } catch {
    return {
      default_tax_rate_bp: 800,
      tax_rate_percent: 8,
      tax_inclusive: false,
      gst_registered: false,
      currency: 'MVR',
      packaging_fee_taxable: true,
    };
  }
}
