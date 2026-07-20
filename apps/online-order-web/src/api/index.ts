// ── Barrel re-export — import from '../api' or '../../api' as before ───────────
// All domain slices are re-exported here so existing import paths keep working.

export { API_BASE_URL, API_ORIGIN, request } from './client';

export * from './auth';
export * from './menu';
export * from './orders';
export * from './promotions';
export * from './customer';
export * from './addresses';
export * from './eventOrders';

// Re-export shared types that pages import from '../api'
export type {
  Category,
  MenuItem as Item,
  Modifier,
  Variant,
  Order,
  OrderItem,
  LoyaltyAccount,
  LoyaltyHoldPreview,
  InitiatePaymentResult,
  PromoValidation,
  OpeningHoursStatus,
  Reservation,
} from '@shared/types';

export type { MenuItem } from './menu';
