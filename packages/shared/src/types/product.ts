// ── Product / Menu types ─────────────────────────────────────────────────────

export type Modifier = {
  id: number;
  name: string;
  price: number;
  quantity?: number;
};

export type Variant = {
  id: number;
  name: string;
  name_dv?: string | null;
  price: number;
  original_price?: number;
  effective_price?: number;
  is_active: boolean;
  sort_order?: number;
  /**
   * Whether a customer can pick this size right now. Combines the owner's
   * "sold out today" switch with the shared ingredient pool, which sizes draw
   * on at different rates — a half portion outlives a full one. Absent means
   * nothing is limiting this size.
   */
  is_available?: boolean;
  available_stock?: number;
};

export type ItemSpecialPricing = {
  id: number;
  badge_label?: string | null;
  discount_pct?: number | null;
  original_price: number;
  effective_price: number;
};

export type Category = {
  id: number;
  name: string;
  name_dv?: string | null;
  description?: string | null;
  image_url?: string | null;
  thumb_url?: string | null;
  image_webp_url?: string | null;
  thumb_webp_url?: string | null;
  parent_id?: number | null;
  sort_order?: number;
  is_active?: boolean;
  items?: MenuItem[];
};

export type SpiceLevel = 'none' | 'mild' | 'medium' | 'hot' | 'extra_hot';

export type MenuItem = {
  id: number;
  name: string;
  name_dv?: string | null;
  /** Short name for the mobile menu card (falls back to name). */
  card_name?: string | null;
  card_name_dv?: string | null;
  description?: string | null;
  /** One-line detail on the mobile menu card (falls back to truncated description). */
  short_description?: string | null;
  short_description_dv?: string | null;
  base_price: number;
  /** Caption beside the price, e.g. "from" / "per box". */
  price_note?: string | null;
  /** Fallback per-unit packaging fee in MVR when the item has no options. */
  packaging_fee?: number;
  packaging_fee_mode?: "per_unit" | "per_line";
  packaging_options?: PackagingOption[];
  has_variants?: boolean;
  variants?: Variant[];
  image_url?: string | null;
  /** Card-sized crop when available; fall back to image_url. */
  thumb_url?: string | null;
  image_webp_url?: string | null;
  thumb_webp_url?: string | null;
  /** Extra gallery photos (public menu). Combined with image_url for slideshows. */
  photos?: Array<{
    id: number;
    url: string;
    thumb_url?: string | null;
    image_webp_url?: string | null;
    thumb_webp_url?: string | null;
    poster_url?: string | null;
    media_type?: 'image' | 'video';
    alt_text?: string | null;
    sort_order: number;
    is_primary: boolean;
  }> | null;
  /** True when the catering channel is enabled — display only; not orderability. */
  is_catering?: boolean;
  category_id: number | null;
  barcode?: string | null;
  track_stock?: boolean;
  stock_quantity?: number | null;
  is_active?: boolean;
  is_available?: boolean;
  /** ISO datetime — item is 86'd / unavailable until this time. */
  snoozed_until?: string | null;
  /** Wave C — optional public aliases from GET /api/items */
  available_now?: boolean;
  unavailable_reason?: string | null;
  available_from?: string | null;
  /** Server-computed — threshold itself is never public. */
  is_low_stock?: boolean;
  /** Optional short staff note shown to customers when the item is unavailable. */
  unavailable_reason_note?: string | null;
  availability?: {
    available: boolean;
    reason_code?: string | null;
    reason_message?: string | null;
    available_stock?: number | null;
    available_from?: string | null;
  };
  modifiers?: Modifier[];
  // Dietary & nutritional info
  dietary_tags?: string[] | null;
  allergens?: string[] | null;
  calories?: number | null;
  prep_time_minutes?: number | null;
  spice_level?: SpiceLevel | null;
  /** TV signage board — hard exclude the item. Undefined means visible. */
  show_on_signage?: boolean;
  /** TV signage board — force a showcase slide with no photo or discount. */
  is_signage_promoted?: boolean;
  // Combo / bundle
  is_combo?: boolean;
  combo_discount_pct?: number | null;
  combo_items?: ComboItemEntry[];
  /** True when the item has platter choice groups (build-your-own). */
  is_platter?: boolean;
  platter_groups?: PlatterGroup[];
  tax_rate?: number | null;
  tax_code?: string | null;
  special?: ItemSpecialPricing;
  // Review aggregates (public API only)
  avg_rating?: number | null;
  review_count?: number;
  /** Non-cancelled order lines in the last 30 days (public menu). */
  sales_30d?: number;
  /** ISO datetime — used by the dine-in view “New items” section. */
  created_at?: string | null;
  /** Owner-ticked: item can be ordered for tomorrow collection. */
  allow_pre_order?: boolean;
  /**
   * Units still available for collect-tomorrow on the allowed tomorrow date.
   * Null/undefined = no daily limit. Never exposes the configured max itself.
   */
  tomorrow_remaining?: number | null;
};

export type ComboItemEntry = {
  item_id: number;
  item_name?: string | null;
  quantity: number;
  is_optional: boolean;
  unit_price?: number;
  item?: { id: number; name: string; name_dv?: string | null; base_price?: number | string | null } | null;
};

export type PlatterRuleType = 'exactly' | 'min' | 'range';

export type PlatterAllowedItem = {
  item_id: number;
  surcharge: number;
  sort_order?: number;
  item?: {
    id: number;
    name: string;
    name_dv?: string | null;
    base_price?: number | string | null;
    image_url?: string | null;
    is_available?: boolean;
    has_variants?: boolean;
    allow_pre_order?: boolean;
    available_now?: boolean;
    unavailable_reason?: string | null;
    tomorrow_remaining?: number | null;
  } | null;
};

export type PlatterGroup = {
  id: number;
  name: string;
  rule_type: PlatterRuleType;
  min_count: number | null;
  max_count: number | null;
  /** Variant id string → required pick count for tiered platters. */
  size_counts?: Record<string, number> | null;
  sort_order?: number;
  items: PlatterAllowedItem[];
};

/** Structured cart / order selections for a platter line (not notes). */
export type PlatterSelection = {
  group_id: number;
  item_id: number;
  item_name: string;
  quantity: number;
  surcharge: number;
};

export type PackagingOption = {
  id: number;
  name: string;
  name_dv?: string | null;
  fee: number;
  is_default: boolean;
  sort_order: number;
};

export type CartItem = {
  id: number;
  name: string;
  price: number;
  quantity: number;
  modifiers: Modifier[];
  /** Snapshot of resolved packaging fee (MVR per unit) at add-to-cart time. */
  packaging_fee?: number;
  packaging_fee_mode?: "per_unit" | "per_line";
  packaging_option_id?: number | null;
  packaging_option_name?: string | null;
  image_url?: string | null;
  variant_id?: number | null;
  variant_name?: string | null;
  // Legacy percent snapshot — backend GST math prefers tax_code +
  // current settings rate (see GstTaxCalculator). Kept for display
  // fallbacks on very old lines.
  tax_rate?: number | null;
  /** GST tax code snapshot (standard_8 / zero_rated / exempt / out_of_scope). */
  tax_code?: string | null;
  // Per-line kitchen notes the cashier attached from the POS chip
  // picker (e.g. ["No salt", "Extra spicy"]). Two cart lines with
  // the same item but different notes are kept separate (see
  // `makeCartKey` in `useCart`). Joined with " · " before being sent
  // to the backend's `notes` field.
  notes?: string[];
  /** Snapshot: item has catering channel enabled (POS cart badge). */
  is_catering?: boolean;
};

export type RestaurantTable = {
  id: number;
  name: string;
  capacity: number;
  status: string;
  location?: string | null;
  notes?: string | null;
  is_active: boolean;
  /** Seat-owning open check — source of truth for "in use". */
  current_order_id?: number | null;
  current_order_number?: string | null;
  current_order_total?: number | null;
  current_order_label?: string | null;
};
