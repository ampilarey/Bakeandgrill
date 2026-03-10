// ── API endpoint constants — single source of truth ──────────────────────────

export const ENDPOINTS = {
  // Auth
  STAFF_PIN_LOGIN:    '/auth/staff/pin-login',
  AUTH_ME:            '/auth/me',
  AUTH_LOGOUT:        '/auth/logout',
  CUSTOMER_OTP_REQUEST: '/auth/customer/otp/request',
  CUSTOMER_OTP_VERIFY:  '/auth/customer/otp/verify',

  // Customer
  CUSTOMER_ME:        '/customer/me',
  CUSTOMER_ORDERS:    '/customer/orders',

  // Menu
  CATEGORIES:         '/categories',
  ITEMS:              '/items',

  // Orders
  ORDERS:             '/orders',
  ORDER_BY_ID:        (id: number) => `/orders/${id}`,
  ORDER_PAY_BML:      (id: number) => `/orders/${id}/pay/bml`,
  ORDER_APPLY_PROMO:  (id: number) => `/orders/${id}/apply-promo`,
  ORDER_REMOVE_PROMO: (orderId: number, promoId: number) => `/orders/${orderId}/promo/${promoId}`,

  // Delivery
  DELIVERY_ORDER:     '/orders/delivery',

  // Payments
  BML_WEBHOOK:        '/payments/bml/webhook',

  // Loyalty
  LOYALTY_ME:         '/loyalty/me',
  LOYALTY_HOLD:       '/loyalty/hold',
  LOYALTY_HOLD_PREVIEW: '/loyalty/hold-preview',

  // Promotions
  PROMOTIONS_VALIDATE: '/promotions/validate',

  // KDS
  KDS_ORDERS:         '/kds/orders',
  KDS_ORDER_START:    (id: number) => `/kds/orders/${id}/start`,
  KDS_ORDER_COMPLETE: (id: number) => `/kds/orders/${id}/complete`,

  // Opening hours
  OPENING_HOURS_STATUS: '/opening-hours/status',
} as const;
