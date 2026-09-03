// ── Customer / Auth types ─────────────────────────────────────────────────────

export type Customer = {
  id: number;
  phone: string;
  name?: string | null;
  email?: string | null;
  date_of_birth?: string | null;
  loyalty_points?: number;
  tier?: string | null;
  preferred_language?: string | null;
  is_active?: boolean;
  /** Stage E — wholesale shop login has an active trade account. */
  has_trade_account?: boolean;
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
  /** Which side of the till the ticket sits on. Absent or null means right. */
  pos_cart_side?: 'left' | 'right' | null;
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

export type LoyaltyProgramPublic = {
  enabled: boolean;
  earn_per_mvr: number;
  redeem_rate_points_per_mvr: number;
  min_redeem_points: number;
  max_redeem_points: number;
  max_redeem_percent: number;
  points_expiry_days: number;
  customer_message: string;
};

export type LoyaltyRates = {
  earn_per_mvr: number;
  /** Applied after base earn (matches PointsCalculator). Defaults to 1 when tiers off. */
  tier_multiplier?: number;
  redeem_rate_points_per_mvr: number;
  discount_per_point_laar: number;
  min_redeem_points: number;
  max_redeem_points: number;
  max_redeem_percent: number;
};

export type LoyaltyTierProgress = {
  enabled: boolean;
  current_tier: string;
  current_tier_name: string;
  next_tier?: string | null;
  next_tier_name?: string | null;
  lifetime_points: number;
  next_threshold?: number | null;
  points_to_next?: number | null;
  progress_percent?: number | null;
  near_next_tier?: boolean;
  at_max_tier?: boolean;
};

export type LoyaltyMeResponse = {
  account: LoyaltyAccount;
  tier_progress?: LoyaltyTierProgress | null;
  program?: LoyaltyProgramPublic;
  rates?: LoyaltyRates;
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
