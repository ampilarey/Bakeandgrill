// ── Order types ───────────────────────────────────────────────────────────────

// SHR-003: keep this in sync with backend OrderStatusMachine.
// `Order.status` falls back to `string` below so the app keeps
// compiling if the backend adds a new state, but the union here is
// the source of truth for exhaustive `switch` checks across apps.
export type OrderStatus =
  | 'pending'
  | 'payment_pending'
  | 'held'
  | 'in_progress'
  | 'preparing'
  | 'ready'
  | 'partial'
  | 'paid'
  | 'completed'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded';

// Order-level payment rollup (distinct from the per-Payment row
// status in payment.ts, which describes a single gateway txn).
export type OrderPaymentStatus =
  | 'unpaid'
  | 'pending'
  | 'partial'
  | 'paid'
  | 'refunded'
  | 'partially_refunded'
  | 'failed';

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
  variant_id?: number | null;
  variant_name?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  /** Legacy percent snapshot — prefer tax_code for GST math. */
  tax_rate?: number | null;
  tax_code?: string | null;
  notes?: string | null;
  status?: string;
  modifiers?: OrderItemModifier[];
};

export type OrderPaymentSettlement = {
  settlement: 'credit_account' | 'mixed' | 'standard' | 'unpaid';
  paid_on_credit: boolean;
  label: string;
  short_label: string;
};

export type Order = {
  id: number;
  order_number: string;
  status: OrderStatus | string;
  type: string;
  total: number;
  /** Integer laari (1 MVR = 100) when provided by the API */
  total_laar?: number;
  subtotal?: number;
  tax_amount?: number;
  discount_amount?: number;
  delivery_fee?: number;
  service_charge_enabled?: boolean;
  service_charge_amount?: number;
  service_charge_amount_laar?: number;
  service_charge_label?: string | null;
  service_charge_type?: string | null;
  service_charge_taxable?: boolean;
  promo_discount_laar?: number;
  loyalty_discount_laar?: number;
  gift_card_discount_laar?: number;
  referral_discount_laar?: number;
  notes?: string | null;
  customer_notes?: string | null;
  payment_status?: OrderPaymentStatus | string;
  payment_settlement?: OrderPaymentSettlement;
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
