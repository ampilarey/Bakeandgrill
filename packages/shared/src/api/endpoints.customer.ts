// ── Customer API endpoints — auth via customer.token Sanctum ability ────────
//
// Routes the online ordering React app calls once the customer has
// authenticated with an OTP. Every entry here SHOULD be protected
// server-side by the `customer.token` middleware (see
// `EnsureCustomerToken`) so a staff token can't accidentally hit them.
// Some are dual-actor on the server side because they live under
// `auth:sanctum` only — those are clearly noted; new ones should
// default to `customer.token`.

export const CUSTOMER_ENDPOINTS = {
  // Profile / session
  AUTH_LOGOUT:                '/auth/logout',
  CUSTOMER_ME:                '/customer/me',
  CUSTOMER_CREDIT:            '/customer/credit',
  CUSTOMER_CREDIT_PREFERENCES:'/customer/credit/preferences',
  CUSTOMER_PROFILE:           '/customer/profile',
  CUSTOMER_CART_SNAPSHOT:     '/customer/cart/snapshot',
  CART_SNAPSHOT_GUEST:        '/cart/snapshot-guest',
  CUSTOMER_COMPLETE_PROFILE:  '/customer/complete-profile',
  CUSTOMER_CHANGE_PASSWORD:   '/customer/change-password',

  // Saved delivery addresses
  CUSTOMER_ADDRESSES:         '/customer/addresses',
  CUSTOMER_ADDRESS_BY_ID:     (id: number) => `/customer/addresses/${id}`,
  CUSTOMER_ADDRESS_DEFAULT:   (id: number) => `/customer/addresses/${id}/default`,

  // Order history
  CUSTOMER_ORDERS:            '/customer/orders',
  CUSTOMER_ORDER_BY_ID:       (id: number) => `/customer/orders/${id}`,
  QUICK_REORDER:              (orderId: number) => `/customer/orders/${orderId}/reorder`,
  CUSTOMER_PRE_ORDERS:        '/customer/pre-orders',
  CUSTOMER_EVENT_ORDERS:      '/customer/event-orders',

  // Order creation & lifecycle (some dual-actor — see api.php notes)
  ORDERS:                     '/orders',
  ORDER_BY_ID:                (id: number) => `/orders/${id}`,
  ORDER_PAY_BML:              (id: number) => `/orders/${id}/pay/bml`,
  ORDER_COMPLETE_ZERO_BALANCE:(id: number) => `/orders/${id}/complete-zero-balance`,
  ORDER_APPLY_PROMO:          (id: number) => `/orders/${id}/apply-promo`,
  ORDER_REMOVE_PROMO:         (orderId: number, promoId: number) => `/orders/${orderId}/promo/${promoId}`,
  ORDER_APPLY_REFERRAL:       (id: number) => `/orders/${id}/apply-referral`,
  ORDER_REMOVE_REFERRAL:      (id: number) => `/orders/${id}/referral`,
  ORDER_APPLY_GIFT_CARD:      (orderId: number) => `/orders/${orderId}/apply-gift-card`,
  ORDER_REMOVE_GIFT_CARD:     (orderId: number) => `/orders/${orderId}/gift-card`,
  DELIVERY_ORDER:             '/orders/delivery',
  DELIVERY_ORDER_UPDATE:      (id: number) => `/orders/${id}/delivery`,
  PARTIAL_PAYMENT:            '/payments/online/initiate-partial',

  // Loyalty (hard-pinned to customer.token at the route level)
  LOYALTY_ME:                 '/loyalty/me',
  LOYALTY_HOLD:               '/loyalty/hold',
  LOYALTY_HOLD_PREVIEW:       '/loyalty/hold-preview',

  // Referrals
  CUSTOMER_REFERRAL_CODE:     '/customer/referral-code',
  REFERRALS_VALIDATE:         '/referrals/validate',

  // Reservations (customer-side)
  RESERVATIONS:               '/reservations',
  RESERVATIONS_AVAILABILITY:  '/reservations/availability',
  RESERVATION_CANCEL:         (id: number) => `/reservations/${id}`,

  // Favorites & reviews
  FAVORITES:                  '/customer/favorites',
  FAVORITE_TOGGLE:            (itemId: number) => `/customer/favorites/${itemId}/toggle`,
  REVIEWS:                    '/reviews',
  CUSTOMER_REVIEWS:           '/customer/reviews',

  // Push notifications (customer subscribes)
  PUSH_SUBSCRIBE:             '/push/subscribe',
  PUSH_UNSUBSCRIBE:           '/push/unsubscribe',

  // SSE streams (customer-scoped)
  STREAM_ORDER_STATUS:        (orderId: number) => `/stream/orders/${orderId}/status`,
  STREAM_TICKET:              (orderId: number) => `/orders/${orderId}/stream-ticket`,
} as const;
