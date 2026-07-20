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
  description?: string | null;
  base_price: number;
  /** Fallback per-unit packaging fee in MVR when the item has no options. */
  packaging_fee?: number;
  packaging_fee_mode?: "per_unit" | "per_line";
  packaging_options?: PackagingOption[];
  has_variants?: boolean;
  variants?: Variant[];
  image_url?: string | null;
  /** Extra gallery photos (public menu). Combined with image_url for slideshows. */
  photos?: Array<{
    id: number;
    url: string;
    sort_order: number;
    is_primary: boolean;
  }> | null;
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
  // Combo / bundle
  is_combo?: boolean;
  combo_discount_pct?: number | null;
  combo_items?: ComboItemEntry[];
  tax_rate?: number | null;
  tax_code?: string | null;
  special?: ItemSpecialPricing;
  // Review aggregates (public API only)
  avg_rating?: number | null;
  review_count?: number;
};

export type ComboItemEntry = {
  item_id: number;
  item_name: string;
  quantity: number;
  is_optional: boolean;
  unit_price: number;
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
