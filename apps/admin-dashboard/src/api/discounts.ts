import { req } from './client';

export type DiscountRoleCap = {
  percent?: number;
  fixed_mvr?: number;
};

export type DiscountApprover = {
  user_id?: number | null;
  phone: string;
  label?: string;
};

export type DiscountControls = {
  discount_manual_enabled: boolean;
  discount_max_percent: number;
  discount_max_fixed_mvr: number;
  discount_role_caps: Record<string, DiscountRoleCap>;
  discount_reason_required: boolean;
  discount_reasons: string[];
  discount_approval_required: boolean;
  discount_approval_approvers: DiscountApprover[];
  discount_approval_code_ttl_minutes: number;
  discount_approval_max_attempts: number;
  discount_margin_floor_enabled: boolean;
  discount_margin_floor_pct: number;
  /** Active items with no cost price: the margin floor cannot protect these. */
  items_without_cost?: number;
  roles_with_discounts: string[];
  roles_with_override: string[];
};

export type DiscountControlsUpdate = Partial<{
  discount_manual_enabled: boolean;
  discount_max_percent: number;
  discount_max_fixed_mvr: number;
  discount_role_caps: Record<string, DiscountRoleCap>;
  discount_reason_required: boolean;
  discount_reasons: string[];
  discount_approval_required: boolean;
  discount_approval_approvers: DiscountApprover[];
  discount_approval_code_ttl_minutes: number;
  discount_approval_max_attempts: number;
  discount_margin_floor_enabled: boolean;
  discount_margin_floor_pct: number;
}>;

export async function getDiscountControls(): Promise<DiscountControls> {
  return req('/admin/discounts/controls');
}

export async function updateDiscountControls(
  data: DiscountControlsUpdate,
): Promise<DiscountControls> {
  return req('/admin/discounts/controls', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}
