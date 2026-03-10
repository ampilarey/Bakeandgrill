// ── Product / Menu types ─────────────────────────────────────────────────────

export type Modifier = {
  id: number;
  name: string;
  price: number;
  quantity?: number;
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

export type MenuItem = {
  id: number;
  name: string;
  name_dv?: string | null;
  description?: string | null;
  base_price: number;
  image_url?: string | null;
  category_id: number | null;
  barcode?: string | null;
  track_stock?: boolean;
  stock_quantity?: number | null;
  is_active?: boolean;
  is_available?: boolean;
  modifiers?: Modifier[];
};

export type CartItem = {
  id: number;
  name: string;
  price: number;
  quantity: number;
  modifiers: Modifier[];
  image_url?: string | null;
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
