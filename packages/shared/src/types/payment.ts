// ── Payment types ─────────────────────────────────────────────────────────────

export type PaymentMethod = 'cash' | 'card' | 'bml_connect' | 'bank_transfer';

export type PaymentStatus =
  | 'created'
  | 'initiated'
  | 'confirmed'
  | 'paid'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired';

export type Payment = {
  id: number;
  order_id: number;
  method: PaymentMethod | string;
  gateway?: string | null;
  currency: string;
  amount: number;
  amount_laar?: number;
  local_id?: string | null;
  provider_transaction_id?: string | null;
  status: PaymentStatus | string;
  reference_number?: string | null;
  processed_at?: string | null;
};

export type InitiatePaymentResult = {
  payment_url: string | null;
  payment_id: number;
  local_id?: string;
  reused?: boolean;
};

export type PromoValidation = {
  valid: boolean;
  promotion?: {
    id: number;
    code: string;
    discount_type: string;
    discount_value: number;
  };
  estimated_discount_laar?: number;
  message?: string;
};
