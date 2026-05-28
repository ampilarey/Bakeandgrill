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
  phone?: string | null;
  role: string | null;
  permissions?: string[];
  /** Stored POS auto-lock preference; null = venue default (5 min). */
  pos_idle_lock_minutes?: number | null;
  /** Effective minutes used by POS (never null). */
  pos_idle_lock_minutes_resolved?: number;
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
  available_points?: number;
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
  reason: 'master_switch_off' | 'schedule' | 'override_active' | null;
  master_switch: boolean;
  override_active: boolean;
  override_until: string | null;
  schedule_active: boolean;
  next_open_window: string | null;
  today: {
    closed: boolean;
    open: string | null;
    close: string | null;
  } | null;
};
