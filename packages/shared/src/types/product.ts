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
  has_variants?: boolean;
  variants?: Variant[];
  image_url?: string | null;
  category_id: number | null;
  barcode?: string | null;
  track_stock?: boolean;
  stock_quantity?: number | null;
  is_active?: boolean;
  is_available?: boolean;
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

export type CartItem = {
  id: number;
  name: string;
  price: number;
  quantity: number;
  modifiers: Modifier[];
  image_url?: string | null;
  variant_id?: number | null;
  variant_name?: string | null;
  // Snapshot of the item's tax_rate (percentage) at the time it was added
  // to the cart. The backend taxes per-item using this same field, so the
  // POS uses it to compute and DISPLAY tax client-side before the order
  // hits the server — without it, the Charge button shows the subtotal
  // and the cashier ends up under-collecting from the customer.
  tax_rate?: number | null;
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
};
