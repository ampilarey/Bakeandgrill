import type { Category, MenuItem as Item, RestaurantTable, Variant } from "@shared/types";
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

/** Effective discount policy for the logged-in actor (UX only; server enforces). */
export type PosDiscountControls = {
  manual_enabled: boolean;
  max_percent: number;
  max_fixed_mvr: number;
  effective_cap_percent: number;
  reason_required: boolean;
  reasons: string[];
  approval_required: boolean;
};

export const DEFAULT_POS_DISCOUNT_CONTROLS: PosDiscountControls = {
  manual_enabled: true,
  max_percent: 100,
  max_fixed_mvr: 0,
  effective_cap_percent: 100,
  reason_required: false,
  reasons: [],
  approval_required: false,
};

export function normalizePosDiscountControls(raw: unknown): PosDiscountControls {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_POS_DISCOUNT_CONTROLS };
  const o = raw as Record<string, unknown>;
  const maxPercent = Number(o.max_percent);
  const maxFixed = Number(o.max_fixed_mvr);
  const effectiveCap = Number(o.effective_cap_percent);
  const reasonsRaw = o.reasons;
  const reasons = Array.isArray(reasonsRaw)
    ? reasonsRaw.map((r) => String(r).trim()).filter((r) => r !== "")
    : [];
  return {
    manual_enabled: o.manual_enabled !== false,
    max_percent: Number.isFinite(maxPercent)
      ? Math.max(0, Math.min(100, Math.round(maxPercent)))
      : DEFAULT_POS_DISCOUNT_CONTROLS.max_percent,
    max_fixed_mvr: Number.isFinite(maxFixed) && maxFixed > 0 ? maxFixed : 0,
    effective_cap_percent: Number.isFinite(effectiveCap)
      ? Math.max(0, Math.min(100, Math.round(effectiveCap)))
      : DEFAULT_POS_DISCOUNT_CONTROLS.effective_cap_percent,
    reason_required: o.reason_required === true,
    reasons,
    approval_required: o.approval_required === true,
  };
}

/**
 * Cap in MVR for a cart subtotal from bootstrap controls.
 * Mirrors DiscountSettings::effectiveCapLaar (global % + optional fixed, never above subtotal).
 */
export function computeEffectiveDiscountCapMvr(
  subtotalMvr: number,
  controls: PosDiscountControls,
): number {
  const sub = Math.max(0, subtotalMvr);
  if (sub <= 0) return 0;
  const caps = [sub * controls.max_percent / 100];
  if (controls.max_fixed_mvr > 0) caps.push(controls.max_fixed_mvr);
  caps.push(sub);
  return Math.max(0, Math.min(...caps));
}

/**
 * Client-side preflight for a manual discount. Returns an error message
 * or null when OK. Server remains authoritative.
 */
export function validateManualDiscountInput(opts: {
  amountMvr: number;
  subtotalMvr: number;
  controls: PosDiscountControls;
  reason: string | null | undefined;
  reasonNote?: string | null;
}): string | null {
  const amount = Math.max(0, opts.amountMvr);
  if (amount <= 0) return null;
  if (!opts.controls.manual_enabled) {
    return "Manual discounts are currently disabled.";
  }
  const cap = computeEffectiveDiscountCapMvr(opts.subtotalMvr, opts.controls);
  // Allow 0.5 laari float noise.
  if (amount > cap + 0.005) {
    const capPct = opts.subtotalMvr > 0
      ? Math.round((cap * 100 / opts.subtotalMvr) * 10) / 10
      : 0;
    return `Discount exceeds the maximum allowed (${capPct}%).`;
  }
  if (opts.controls.reason_required) {
    const reason = (opts.reason ?? "").trim();
    if (!reason || !opts.controls.reasons.includes(reason)) {
      return "A discount reason is required.";
    }
    if (reason === "Other (note required)" && !(opts.reasonNote ?? "").trim()) {
      return "A note is required for this discount reason.";
    }
  }
  return null;
}

/**
 * One Quick tab on the till: a name, items in order, and optionally the
 * hours it opens itself ("06:00"–"11:00"; a window past midnight is fine).
 * Owner, 2026-09-02.
 */
export type PosQuickTab = {
  id: string;
  name: string;
  items: number[];
  from: string | null;
  to: string | null;
};

/**
 * `shared` is the layout every till starts with; `mine` is this cashier's
 * own, shown in front of it. Both ride in the menu payload so the tabs are
 * there offline and on whichever iPad the cashier logs into.
 */
export type PosQuickLayout = { shared: PosQuickTab[]; mine: PosQuickTab[] };

/** What the server adds to both menu feeds for the till's own tabs. */
export type PosTillTabs = {
  quickLayout: PosQuickLayout;
  canManageSharedQuickKeys: boolean;
  /** Item ids ranked by what sells at this hour of the day, best first. */
  popularNow: number[];
};

type RawTillTabs = {
  quick_layout?: { shared?: unknown; mine?: unknown };
  can_manage_shared_quick_keys?: unknown;
  popular_now?: unknown;
};

function idList(raw: unknown): number[] {
  return Array.isArray(raw) ? raw.map(Number).filter((n) => Number.isFinite(n) && n > 0) : [];
}

const HOUR = /^([01]\d|2[0-3]):[0-5]\d$/;

function tabList(raw: unknown): PosQuickTab[] {
  if (!Array.isArray(raw)) return [];
  const out: PosQuickTab[] = [];
  raw.forEach((t, index) => {
    if (!t || typeof t !== "object") return;
    const tab = t as Record<string, unknown>;
    const name = typeof tab.name === "string" ? tab.name.trim() : "";
    if (!name) return;
    const from = typeof tab.from === "string" && HOUR.test(tab.from) ? tab.from : null;
    const to = typeof tab.to === "string" && HOUR.test(tab.to) ? tab.to : null;
    out.push({
      id: typeof tab.id === "string" && tab.id ? tab.id : `tab-${index + 1}`,
      name,
      items: idList(tab.items),
      from: from && to ? from : null,
      to: from && to ? to : null,
    });
  });
  return out;
}

export function normalizePosTillTabs(raw: RawTillTabs | undefined): PosTillTabs {
  return {
    quickLayout: {
      shared: tabList(raw?.quick_layout?.shared),
      mine: tabList(raw?.quick_layout?.mine),
    },
    canManageSharedQuickKeys: raw?.can_manage_shared_quick_keys === true,
    popularNow: idList(raw?.popular_now),
  };
}

/** Login bootstrap — menu + current shift in one request. */
export async function fetchPosBootstrap(channel?: PosSalesChannel): Promise<{
  categories: Category[];
  items: Item[];
  pairings: PosPairings;
  tillTabs: PosTillTabs;
  shift: PosBootstrapShift | null;
  smsNotifications: PosSmsNotifications;
  discountControls: PosDiscountControls;
}> {
  const params = new URLSearchParams();
  if (channel) params.set("channel", channel);
  const data = await request<{
    categories: Category[];
    items: Item[];
    shift: PosBootstrapShift | null;
    pairings?: PosPairings;
    sms_notifications?: PosSmsNotifications;
    discount_controls?: unknown;
  } & RawTillTabs>(`/pos/bootstrap?${params.toString()}`);
  return {
    categories: data.categories ?? [],
    items: data.items ?? [],
    pairings: data.pairings ?? {},
    tillTabs: normalizePosTillTabs(data),
    shift: data.shift ?? null,
    smsNotifications: normalizePosSmsNotifications(data.sms_notifications),
    discountControls: normalizePosDiscountControls(data.discount_controls),
  };
}

/**
 * Replace a Quick layout. The till holds the whole thing and sends it back
 * after every change, so there is nothing to diff and nothing to drift.
 */
export async function savePosQuickLayout(scope: "mine" | "shared", tabs: PosQuickTab[]): Promise<PosQuickTab[]> {
  const path = scope === "shared" ? "/pos/quick-keys/shared" : "/pos/quick-keys";
  const data = await request<{ mine?: unknown; shared?: unknown }>(path, {
    method: "PUT",
    body: JSON.stringify({ tabs }),
  });
  return tabList(scope === "shared" ? data.shared : data.mine);
}

/** Cashiers whose Quick tabs can be copied. */
export type PosQuickLayoutSource = { user_id: number; name: string; tabs: number };

export async function fetchPosQuickLayoutSources(): Promise<PosQuickLayoutSource[]> {
  const data = await request<{ sources?: unknown }>("/pos/quick-keys/sources");
  if (!Array.isArray(data.sources)) return [];
  return data.sources
    .filter((s): s is PosQuickLayoutSource => !!s && typeof s === "object" && typeof (s as PosQuickLayoutSource).user_id === "number")
    .map((s) => ({ user_id: s.user_id, name: String(s.name ?? ""), tabs: Number(s.tabs ?? 0) }));
}

/** Take a copy of another cashier's tabs as my own. Returns what was stored. */
export async function copyPosQuickLayout(fromUserId: number): Promise<PosQuickTab[]> {
  const data = await request<{ mine?: unknown }>("/pos/quick-keys/copy", {
    method: "POST",
    body: JSON.stringify({ user_id: fromUserId }),
  });
  return tabList(data.mine);
}

/**
 * Suggestion chips, as anchor item id -> suggested item ids (best first).
 *
 * Shipped inside the menu payload rather than fetched per item: the till
 * caches the menu for offline service, and a chip that needs its own round
 * trip disappears exactly when the connection does — which behind a counter,
 * mid-queue, is the worst possible moment. The server has already filtered
 * these to items the cashier can actually ring up on this channel.
 */
export type PosPairings = Record<number, number[]>;

/** Single round-trip menu load for the POS register (channel changes). */
export async function fetchPosMenu(channel?: PosSalesChannel): Promise<{
  categories: Category[];
  items: Item[];
  pairings: PosPairings;
  tillTabs: PosTillTabs;
}> {
  const params = new URLSearchParams();
  if (channel) params.set("channel", channel);
  const data = await request<{ categories: Category[]; items: Item[]; pairings?: PosPairings } & RawTillTabs>(
    `/pos/menu?${params.toString()}`,
  );
  return {
    categories: data.categories ?? [],
    items: data.items ?? [],
    pairings: data.pairings ?? {},
    tillTabs: normalizePosTillTabs(data),
  };
}

/**
 * Tell the server a chip was shown, or tapped.
 *
 * Fire-and-forget and deliberately silent: this feeds the admin's suggestion
 * report, and a failed tally must never get between a cashier and a sale.
 * Skipped entirely when offline — the queue matters more than the metric.
 */
export function trackPosSuggestion(action: "shown" | "accepted", itemIds: number[]): void {
  if (itemIds.length === 0) return;
  void request("/recommendations/track", {
    method: "POST",
    body: JSON.stringify({ surface: "pos", action, item_ids: itemIds }),
  }).catch(() => { /* never surfaced */ });
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

/**
 * A scan resolves to a dish, and sometimes to one size of it.
 *
 * A large bottle and a small bottle carry different barcodes, so the endpoint
 * returns the size that matched when the code belonged to a size rather than
 * to the dish. Ringing up the dish alone would fall back to its first size —
 * the wrong one half the time, at the wrong price.
 */
export async function lookupBarcode(
  barcode: string,
): Promise<{ item: Item; variant: Variant | null } | null> {
  const data = await request<{ item: Item; variant?: Variant | null }>(
    `/items/barcode/${barcode}`,
  );
  if (!data.item) return null;
  return { item: data.item, variant: data.variant ?? null };
}
export async function fetchTables(): Promise<{ tables: RestaurantTable[] }> {
  return request<{ tables: RestaurantTable[] }>("/tables");
}

export async function openTable(id: number): Promise<{ table: RestaurantTable }> {
  return request<{ table: RestaurantTable }>(`/tables/${id}/open`, { method: "POST" });
}

export async function closeTable(id: number): Promise<{ table: RestaurantTable }> {
  return request<{ table: RestaurantTable }>(`/tables/${id}/close`, { method: "POST" });
}

export async function mergeTables(
  sourceTableId: number,
  targetTableId: number,
): Promise<{ target_table: RestaurantTable }> {
  return request<{ target_table: RestaurantTable }>("/tables/merge", {
    method: "POST",
    body: JSON.stringify({ source_table_id: sourceTableId, target_table_id: targetTableId }),
  });
}
