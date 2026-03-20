// ── API endpoint constants — single source of truth ──────────────────────────

export const ENDPOINTS = {
  // Auth
  STAFF_PIN_LOGIN:    '/auth/staff/pin-login',
  AUTH_ME:            '/auth/me',
  AUTH_LOGOUT:        '/auth/logout',
  CUSTOMER_OTP_REQUEST:   '/auth/customer/otp/request',
  CUSTOMER_OTP_VERIFY:    '/auth/customer/otp/verify',
  CUSTOMER_CHECK_PHONE:   '/auth/customer/check-phone',
  CUSTOMER_PASSWORD_LOGIN:'/auth/customer/login',
  CUSTOMER_SESSION_CHECK: '/auth/customer/check',
  CUSTOMER_FORGOT_PASSWORD: '/auth/customer/forgot-password',
  CUSTOMER_RESET_PASSWORD:  '/auth/customer/reset-password',

  // Customer
  CUSTOMER_ME:              '/customer/me',
  CUSTOMER_ORDERS:          '/customer/orders',
  CUSTOMER_COMPLETE_PROFILE:'/customer/complete-profile',
  CUSTOMER_CHANGE_PASSWORD: '/customer/change-password',

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
  KDS_ORDER_BUMP:     (id: number) => `/kds/orders/${id}/bump`,
  KDS_ORDER_RECALL:   (id: number) => `/kds/orders/${id}/recall`,

  // Opening hours
  OPENING_HOURS_STATUS:    '/opening-hours/status',
  OPENING_HOURS_SCHEDULE:  '/opening-hours',

  // Pre-orders
  CUSTOMER_PRE_ORDERS: '/customer/pre-orders',

  // Daily specials
  SPECIALS:             '/specials',
  ADMIN_SPECIALS:       '/admin/specials',
  ADMIN_SPECIAL_BY_ID:  (id: number) => `/admin/specials/${id}`,

  // Push notifications
  PUSH_SUBSCRIBE:   '/push/subscribe',
  PUSH_UNSUBSCRIBE: '/push/unsubscribe',

  // Favorites
  FAVORITES:               '/customer/favorites',
  FAVORITE_TOGGLE:         (itemId: number) => `/customer/favorites/${itemId}/toggle`,
  QUICK_REORDER:           (orderId: number) => `/customer/orders/${orderId}/reorder`,

  // Reviews
  REVIEWS:             '/reviews',
  ITEM_REVIEWS:        (itemId: number) => `/items/${itemId}/reviews`,
  CUSTOMER_REVIEWS:    '/customer/reviews',
  ADMIN_REVIEWS:       '/admin/reviews',
  ADMIN_REVIEW_MOD:    (id: number) => `/admin/reviews/${id}/moderate`,

  // Reservations
  RESERVATIONS:              '/reservations',
  RESERVATIONS_AVAILABILITY: '/reservations/availability',
  RESERVATION_CANCEL:        (id: number) => `/reservations/${id}`,
  ADMIN_RESERVATIONS:        '/admin/reservations',
  ADMIN_RESERVATION_STATUS:  (id: number) => `/admin/reservations/${id}/status`,
  ADMIN_RESERVATION_SETTINGS: '/admin/reservations/settings',

  // Streams (SSE)
  STREAM_ORDERS:           '/stream/orders',
  STREAM_KDS:              '/stream/kds',
  STREAM_ORDER_STATUS:     (orderId: number) => `/stream/orders/${orderId}/status`,
  STREAM_PUBLIC_STATUS:    (orderId: number) => `/stream/order-status/${orderId}`,
  STREAM_TICKET:           (orderId: number) => `/orders/${orderId}/stream-ticket`,

  // Customer
  CUSTOMER_PROFILE:        '/customer/profile',
  CUSTOMER_ORDER_BY_ID:    (id: number) => `/customer/orders/${id}`,

  // Delivery
  DELIVERY_ORDER_UPDATE:   (id: number) => `/orders/${id}/delivery`,

  // Payments
  PARTIAL_PAYMENT:         '/payments/online/initiate-partial',

  // Operations
  WAIT_TIME:               '/wait-time',

  // Item photos
  ITEM_PHOTOS:             (itemId: number) => `/items/${itemId}/photos`,
  ITEM_PHOTO_DELETE:       (itemId: number, photoId: number) => `/items/${itemId}/photos/${photoId}`,

  // Admin utilities
  ADMIN_UPLOAD_IMAGE:      '/admin/upload-image',

  // Analytics
  ADMIN_ANALYTICS_PEAK_HOURS:   '/admin/analytics/peak-hours',
  ADMIN_ANALYTICS_RETENTION:    '/admin/analytics/retention',
  ADMIN_ANALYTICS_PROFITABILITY: '/admin/analytics/profitability',
  ADMIN_ANALYTICS_FORECAST:     '/admin/analytics/forecast',
  ADMIN_ANALYTICS_CUSTOMER_LTV: '/admin/analytics/customer-ltv',
} as const;
