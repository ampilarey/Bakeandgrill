// ── Order types ───────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'pending'
  | 'held'
  | 'in_progress'
  | 'partial'
  | 'paid'
  | 'completed'
  | 'cancelled';

export type OrderItemModifier = {
  id?: number;
  modifier_name: string;
  modifier_price: number;
  quantity?: number;
  /** alias used by KDS */
  name?: string;
  price?: number;
};

export type OrderItem = {
  id: number;
  item_id?: number;
  item_name: string;
  variant_name?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  notes?: string | null;
  status?: string;
  modifiers?: OrderItemModifier[];
};

export type Order = {
  id: number;
  order_number: string;
  status: OrderStatus | string;
  type: string;
  total: number;
  subtotal?: number;
  tax_amount?: number;
  discount_amount?: number;
  delivery_fee?: number;
  promo_discount_laar?: number;
  loyalty_discount_laar?: number;
  notes?: string | null;
  customer_notes?: string | null;
  paid_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at?: string;

  // Relations
  items?: OrderItem[];
  customer?: { id: number; name: string; phone: string } | null;
  customer_id?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;

  // Table
  table_number?: string | null;
  restaurant_table_id?: number | null;

  // Delivery
  delivery_address_line1?: string | null;
  delivery_address_line2?: string | null;
  delivery_island?: string | null;
  delivery_contact_name?: string | null;
  delivery_contact_phone?: string | null;
  delivery_notes?: string | null;
  desired_eta?: string | null;
};

export type SalesSummary = {
  totals: {
    orders_count: number;
    subtotal: number;
    tax_amount: number;
    discount_amount: number;
    total: number;
  };
  payments: Record<string, number>;
};

export type PaginatedOrders = {
  data: Order[];
  meta?: {
    current_page: number;
    last_page: number;
    per_page?: number;
    total: number;
  };
};
