// ── API endpoint registry ────────────────────────────────────────────────────
//
// Endpoints are split into three actor-scoped files so editing one
// channel's surface doesn't sit beside another's. Pick the right
// import based on which app you're touching:
//
//   - PUBLIC_ENDPOINTS    — no auth (menu, opening hours, webhooks…)
//   - CUSTOMER_ENDPOINTS  — customer.token (online ordering app)
//   - STAFF_ENDPOINTS     — staff.token (admin / POS / KDS / driver)
//
// The legacy flat `ENDPOINTS` object below merges all three so existing
// callers (`import { ENDPOINTS } from '@shared/api'`) keep working.
// NEW code should prefer the scoped imports so the call site documents
// which audience the endpoint belongs to — easier to spot when a route
// rename should ripple across apps and when it definitely shouldn't.

import { PUBLIC_ENDPOINTS } from './endpoints.public';
import { CUSTOMER_ENDPOINTS } from './endpoints.customer';
import { STAFF_ENDPOINTS } from './endpoints.staff';

export { PUBLIC_ENDPOINTS, CUSTOMER_ENDPOINTS, STAFF_ENDPOINTS };

/**
 * Backwards-compatible flat union. New code should import the
 * actor-scoped object instead — see file header.
 *
 * Where the same KEY appears in more than one scoped file (currently
 * none — they're deliberately partitioned), the order below wins.
 */
export const ENDPOINTS = {
  ...PUBLIC_ENDPOINTS,
  ...CUSTOMER_ENDPOINTS,
  ...STAFF_ENDPOINTS,
} as const;
