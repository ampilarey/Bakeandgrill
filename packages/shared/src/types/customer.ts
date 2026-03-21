// ── Customer / Auth types ─────────────────────────────────────────────────────

export type Customer = {
  id: number;
  phone: string;
  name?: string | null;
  email?: string | null;
  loyalty_points?: number;
  tier?: string | null;
  preferred_language?: string | null;
  is_active?: boolean;
};

export type StaffUser = {
  id: number;
  name: string;
  email: string;
  role: string | null;
  permissions?: string[];
};

export type StaffLoginResponse = {
  token: string;
  user: StaffUser;
};

export type LoyaltyAccount = {
  id: number;
  customer_id?: number;
  points_balance: number;
  points_held?: number;
  lifetime_points?: number;
  tier: string;
};

export type LoyaltyHoldPreview = {
  points: number;
  discount_laar: number;
  discount_mvr: number;
};

export type OpeningHoursStatus = {
  open: boolean;
  message: string | null;
  today: {
    closed: boolean;
    open: string | null;
    close: string | null;
  } | null;
};
