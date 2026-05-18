// ── Staff API endpoints — auth via staff.token Sanctum ability ──────────────
//
// Routes used by the admin dashboard, POS register, KDS, and driver
// apps. Every entry should be protected server-side by `staff.token`
// (see `EnsureStaffToken`). Admin-only endpoints additionally carry a
// `permission:*` middleware that the backend enforces, but at the URL
// level they all share the same auth surface.

export const STAFF_ENDPOINTS = {
  // Auth / current user
  AUTH_ME:                     '/auth/me',

  // POS-specific (cashier register only)
  POS_CUSTOMER_SUMMARY:        (id: number) => `/customers/${id}/pos-summary`,
  POS_LOYALTY_PREVIEW:         '/pos/loyalty/preview',
  POS_LOYALTY_HOLD:            '/pos/loyalty/hold',
  POS_LOYALTY_RELEASE:         (orderId: number) => `/pos/loyalty/hold/${orderId}`,
  POS_ORDER_GIFT_CARD:         (orderId: number) => `/pos/orders/${orderId}/gift-card`,

  // Order ops (POS hold / resume / payments)
  ORDER_HOLD:                  (id: number) => `/orders/${id}/hold`,
  ORDER_RESUME:                (id: number) => `/orders/${id}/resume`,
  ORDER_PAYMENTS:              (id: number) => `/orders/${id}/payments`,

  // KDS
  KDS_ORDERS:                  '/kds/orders',
  KDS_ORDER_START:             (id: number) => `/kds/orders/${id}/start`,
  KDS_ORDER_BUMP:              (id: number) => `/kds/orders/${id}/bump`,
  KDS_ORDER_RECALL:            (id: number) => `/kds/orders/${id}/recall`,
  STREAM_ORDERS:               '/stream/orders',
  STREAM_KDS:                  '/stream/kds',

  // Devices (POS register / KDS station / printer registration)
  DEVICES:                     '/devices',
  DEVICE_REGISTER:             '/devices/register',
  DEVICE_DISABLE:              (id: number) => `/devices/${id}/disable`,
  DEVICE_ENABLE:               (id: number) => `/devices/${id}/enable`,

  // Refunds (cashier or admin)
  REFUNDS:                     '/refunds',
  REFUND_BY_ID:                (id: number) => `/refunds/${id}`,
  ORDER_REFUNDS:               (orderId: number) => `/orders/${orderId}/refunds`,

  // Admin-only (additionally permission-gated server-side)
  ADMIN_UPLOAD_IMAGE:          '/admin/upload-image',
  ADMIN_SPECIALS:              '/admin/specials',
  ADMIN_SPECIAL_BY_ID:         (id: number) => `/admin/specials/${id}`,
  ADMIN_REVIEWS:               '/admin/reviews',
  ADMIN_REVIEW_MOD:            (id: number) => `/admin/reviews/${id}/moderate`,
  ADMIN_RESERVATIONS:          '/admin/reservations',
  ADMIN_RESERVATION_STATUS:    (id: number) => `/admin/reservations/${id}/status`,
  ADMIN_RESERVATION_SETTINGS:  '/admin/reservations/settings',
  ADMIN_ANALYTICS_PEAK_HOURS:    '/admin/analytics/peak-hours',
  ADMIN_ANALYTICS_RETENTION:     '/admin/analytics/retention',
  ADMIN_ANALYTICS_PROFITABILITY: '/admin/analytics/profitability',
  ADMIN_ANALYTICS_FORECAST:      '/admin/analytics/forecast',
  ADMIN_ANALYTICS_CUSTOMER_LTV:  '/admin/analytics/customer-ltv',

  // Item maintenance (admin)
  ITEM_PHOTO_DELETE:           (itemId: number, photoId: number) => `/items/${itemId}/photos/${photoId}`,
} as const;
