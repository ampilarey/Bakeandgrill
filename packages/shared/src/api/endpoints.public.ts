// ── Public API endpoints — no auth required ─────────────────────────────────
//
// Endpoints that are reachable WITHOUT a Sanctum token. The marketing
// site, the online ordering app's first paint, the BML webhook handler,
// and the PWA service worker all live here. Anything added to this
// file should be deliberately safe to expose to the public internet —
// they're rate-limited at the route level, but they don't carry actor
// context. If a route NEEDS to know who's calling it, it belongs in
// `endpoints.customer.ts` or `endpoints.staff.ts` instead.

export const PUBLIC_ENDPOINTS = {
  // Menu (read-only public menu)
  CATEGORIES:                '/categories',
  ITEMS:                     '/items',
  ITEM_REVIEWS:              (itemId: number) => `/items/${itemId}/reviews`,
  ITEM_PHOTOS:               (itemId: number) => `/items/${itemId}/photos`,
  SPECIALS:                  '/specials',

  // Customer-facing auth (pre-token)
  CUSTOMER_OTP_REQUEST:      '/auth/customer/otp/request',
  CUSTOMER_OTP_VERIFY:       '/auth/customer/otp/verify',
  CUSTOMER_CHECK_PHONE:      '/auth/customer/check-phone',
  CUSTOMER_PASSWORD_LOGIN:   '/auth/customer/login',
  CUSTOMER_SESSION_CHECK:    '/auth/customer/check',
  CUSTOMER_FORGOT_PASSWORD:  '/auth/customer/forgot-password',
  CUSTOMER_RESET_PASSWORD:   '/auth/customer/reset-password',
  CUSTOMER_GUEST_SESSION:    '/auth/customer/guest-session',
  STAFF_PIN_LOGIN:           '/auth/staff/pin-login',

  // Gift card balance check (intentionally public — anyone holding the
  // physical card should be able to read its balance without an account).
  // POST-only so the code never lands in URL access logs.
  GIFT_CARD_BALANCE_POST:    '/gift-cards/balance',
  EVENT_QUOTE:               '/event-quotes',

  // Opening hours / ordering eligibility (drives the storefront banner)
  OPENING_HOURS_STATUS:      '/opening-hours/status',
  OPENING_HOURS_SCHEDULE:    '/opening-hours',
  ORDERING_ELIGIBILITY:      '/ordering/eligibility',
  ORDERING_STATUS:           '/ordering/status',
  ORDERING_DELIVERY_STATUS:  '/ordering/delivery-status',
  ORDERING_DELIVERY_FEE_PREVIEW: '/ordering/delivery-fee-preview',
  ORDERING_CHECKOUT_FEES_PREVIEW: '/ordering/checkout-fees-preview',
  PICKUP_SLOTS:                '/ordering/pickup-slots',
  REVIEWS_FEATURED:            '/reviews/featured',
  CORPORATE_INQUIRIES:         '/corporate-inquiries',
  CATERING_REQUESTS:           '/catering-requests',
  WAIT_TIME:                 '/wait-time',

  // Promo / referral validation that doesn't require auth
  PROMOTIONS_VALIDATE:       '/promotions/validate',

  // Customer SSE — read-only status stream keyed by order id
  STREAM_PUBLIC_STATUS:      (orderId: number) => `/stream/order-status/${orderId}`,

  // Webhooks (server-to-server, signature-verified)
  BML_WEBHOOK:               '/payments/bml/webhook',
} as const;
