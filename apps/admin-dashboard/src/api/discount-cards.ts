import { req } from './client';

export type DiscountCardBatch = {
  id: number;
  name: string;
  type: 'percentage' | 'fixed' | string;
  discount_value: number;
  min_order_laar: number;
  starts_at: string | null;
  expires_at: string | null;
  max_uses_per_card: number;
  max_uses_per_customer: number | null;
  quantity: number;
  note: string | null;
  created_by?: { id: number; name: string } | null;
  created_at?: string | null;
  stats?: { active: number; redeemed_uses: number; voided: number };
};

export type DiscountCard = {
  id: number;
  code: string;
  name: string;
  type: string;
  discount_value: number;
  redemptions_count: number;
  max_uses: number | null;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  status: 'active' | 'redeemed' | 'expired' | 'voided' | string;
};

export type IssueDiscountCardPayload = {
  name: string;
  type: 'percentage' | 'fixed';
  discount_value: number;
  min_order_laar?: number;
  starts_at?: string | null;
  expires_at?: string | null;
  max_uses_per_card?: number;
  max_uses_per_customer?: number | null;
  quantity: number;
  note?: string | null;
};

export async function fetchDiscountCardBatches(page = 1): Promise<{
  data: DiscountCardBatch[];
  meta: { current_page: number; last_page: number; total: number };
}> {
  return req(`/admin/discount-cards/batches?page=${page}`);
}

export async function fetchDiscountCardBatch(id: number): Promise<{
  batch: DiscountCardBatch;
  cards: DiscountCard[];
}> {
  return req(`/admin/discount-cards/batches/${id}`);
}

export async function issueDiscountCardBatch(data: IssueDiscountCardPayload): Promise<{
  batch: DiscountCardBatch;
  cards: Array<{ id: number; code: string; name: string; expires_at: string | null }>;
  message: string;
}> {
  return req('/admin/discount-cards/batches', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function voidDiscountCard(id: number): Promise<{ message: string }> {
  return req(`/admin/discount-cards/${id}/void`, { method: 'POST' });
}
