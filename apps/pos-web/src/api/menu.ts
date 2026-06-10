import type { Category, MenuItem as Item, RestaurantTable } from "@shared/types";
import { request } from "./client";

export async function fetchCategories(): Promise<Category[]> {
  const data = await request<{ categories?: Category[]; data?: Category[] }>(
    "/categories?with_items=0",
  );
  return data.categories ?? data.data ?? [];
}
export type PosBootstrapShift = {
  id: number;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  closing_cash: number | null;
  expected_cash: number | null;
  variance: number | null;
};

export type PosSmsNotifications = {
  send_bill: boolean;
  send_pay_link: boolean;
  receipt_resend: boolean;
};

export const DEFAULT_POS_SMS_NOTIFICATIONS: PosSmsNotifications = {
  send_bill: true,
  send_pay_link: true,
  receipt_resend: true,
};

function normalizePosSmsNotifications(raw: unknown): PosSmsNotifications {
  if (!raw || typeof raw !== "object") return DEFAULT_POS_SMS_NOTIFICATIONS;
  const o = raw as Record<string, unknown>;
  return {
    send_bill: o.send_bill !== false,
    send_pay_link: o.send_pay_link !== false,
    receipt_resend: o.receipt_resend !== false,
  };
}

/** Login bootstrap — menu + current shift in one request. */
export async function fetchPosBootstrap(channel?: PosSalesChannel): Promise<{
  categories: Category[];
  items: Item[];
  shift: PosBootstrapShift | null;
  smsNotifications: PosSmsNotifications;
}> {
  const params = new URLSearchParams();
  if (channel) params.set("channel", channel);
  const data = await request<{
    categories: Category[];
    items: Item[];
    shift: PosBootstrapShift | null;
    sms_notifications?: PosSmsNotifications;
  }>(`/pos/bootstrap?${params.toString()}`);
  return {
    categories: data.categories ?? [],
    items: data.items ?? [],
    shift: data.shift ?? null,
    smsNotifications: normalizePosSmsNotifications(data.sms_notifications),
  };
}

/** Single round-trip menu load for the POS register (channel changes). */
export async function fetchPosMenu(channel?: PosSalesChannel): Promise<{
  categories: Category[];
  items: Item[];
}> {
  const params = new URLSearchParams();
  if (channel) params.set("channel", channel);
  const data = await request<{ categories: Category[]; items: Item[] }>(
    `/pos/menu?${params.toString()}`,
  );
  return {
    categories: data.categories ?? [],
    items: data.items ?? [],
  };
}
export type PosSalesChannel = "dine_in" | "takeaway" | "online_pickup" | "delivery";

export async function fetchItems(channel?: PosSalesChannel): Promise<Item[]> {
  // ItemController caps staff requests at `min(100, per_page)` and
  // defaults `per_page` to 25 when the staff token is present. We
  // used to request `per_page=100` and stop — which silently
  // truncated menus larger than 100 items (Bug-026). Now we PAGE
  // through every available page so a 250-item menu is fully
  // loaded. Hard cap at 10 pages (1000 items) as a sanity guard so
  // a runaway server response can't lock the iPad.
  const MAX_PAGES = 10;

  const fetchPage = async (page: number) => {
    const params = new URLSearchParams();
    if (channel) params.set("channel", channel);
    params.set("view", "pos");
    params.set("per_page", "100");
    params.set("page", String(page));
    const res = await request<{
      data: Item[];
      meta?: { current_page?: number; last_page?: number };
      last_page?: number;
      current_page?: number;
    }>(`/items?${params.toString()}`);
    const batch = res.data ?? [];
    const lastPage = res.meta?.last_page ?? res.last_page ?? page;
    return { batch, lastPage };
  };

  const first = await fetchPage(1);
  const out: Item[] = [...first.batch];
  const lastPage = Math.min(first.lastPage, MAX_PAGES);
  if (lastPage > 1) {
    const rest = await Promise.all(
      Array.from({ length: lastPage - 1 }, (_, i) => fetchPage(i + 2)),
    );
    for (const page of rest) out.push(...page.batch);
  }
  return out;
}

export async function lookupBarcode(barcode: string): Promise<Item | null> {
  const data = await request<{ item: Item }>(`/items/barcode/${barcode}`);
  return data.item ?? null;
}
export async function fetchTables(): Promise<{ tables: RestaurantTable[] }> {
  return request<{ tables: RestaurantTable[] }>("/tables");
}
