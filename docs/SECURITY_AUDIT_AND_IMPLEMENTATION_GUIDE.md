# Security Audit & Implementation Guide
## Bake & Grill — Multi-App Restaurant Platform

**Status:** Documented — Not yet implemented  
**Created:** March 2026  
**Priority:** Implement Session 1 first, Session 2 separately after testing  

---

## Table of Contents

1. [Overview](#overview)
2. [Findings Summary](#findings-summary)
3. [Session 1 — Security Fixes](#session-1--security-fixes)
   - [F — Phone Number Validation](#f--phone-number-validation-too-loose)
   - [D — Health Endpoint Exposure](#d--health-endpoint-leaks-too-much)
   - [B — Token in URL](#b--auth-token-passed-in-url-for-streaming)
   - [A — Stream Open Without Auth](#a--order-stream-open-without-auth)
   - [E — BML Return URL Fragility](#e--bml-return-url-fragility)
4. [Session 2 — Authorization & Roles](#session-2--authorization--role-enforcement)
   - [C — No Role Checks on Admin Routes](#c--no-role-checks-on-admin-routes)
5. [Deployment Order](#deployment-order)
6. [Files Impact Reference](#files-impact-reference)
7. [Testing Requirements](#testing-requirements)

---

## Overview

This document is a full security audit and implementation plan for the Bake & Grill platform.

The platform is NOT just a restaurant website. It is a full operations system handling:
- Public website + online ordering
- Customer auth (OTP-based)
- Checkout + BML payment integration
- POS, KDS, printing
- Reservations, loyalty, promotions
- Delivery, analytics, SMS campaigns
- Inventory & finance management

**Non-negotiable rules during implementation:**
1. Do NOT break production ordering, payment, POS, KDS, or reservation flows
2. Preserve all route paths unless change is required for security
3. Preserve BML webhook and return flow compatibility
4. Test after every individual fix before moving to the next
5. Deploy Session 1 fully and confirm stable before starting Session 2

---

## Findings Summary

| ID | Finding | Risk | Affects Users? | Session |
|----|---------|------|---------------|---------|
| F  | Phone OTP sent to wrong person | 🔴 Critical | Yes — auth bypass risk | 1 |
| A  | Anyone can watch any order's stream | 🔴 High | Yes — data privacy | 1 |
| B  | Real auth token exposed in browser URL | 🔴 High | Yes — token theft | 1 |
| D  | Health endpoint leaks environment info | 🟠 Medium | Indirect — helps attackers | 1 |
| E  | BML redirect URL fragile | 🟠 Medium | Yes — broken post-payment UX | 1 |
| C  | No role checks on admin routes | 🟠 Medium | Staff only | 2 |
| G  | Empty migration file in repo | 🟡 Low | No | 2 |
| H  | Junk files committed to repo | 🟡 Low | No | 2 |
| I  | Services manually instantiated in controllers | 🟡 Low | No | 2 |
| J  | Routes file too large and mixed | 🟡 Low | No | 2 |

---

## Session 1 — Security Fixes

**Goal:** Fix the 5 highest-risk security issues with minimal risk of breaking production.  
**Recommended order:** F → D → E → B → A  

---

### F — Phone Number Validation Too Loose

#### What is happening

The OTP auth flow accepts any string as a phone number and tries to "fix" it by taking the last 7 digits and prepending `+960`. This means if someone enters `99991234567`, the system strips it to `4567` and sends an OTP to `+9604567` — a completely different person's number. That person could then log in as the original customer.

#### Files to Change

```
backend/app/Http/Controllers/Api/Auth/CustomerAuthController.php   ← update normalizePhone()
backend/app/Rules/MaldivesPhone.php                                ← CREATE THIS (new validation rule)
```

#### Implementation Steps

**Step 1 — Create `app/Rules/MaldivesPhone.php`**

This is a new Laravel custom validation rule. It should:
- Accept only these formats:
  - `7XXXXXX` — 7 digits starting with 7 (local mobile)
  - `9XXXXXX` — 7 digits starting with 9 (local mobile)
  - `3XXXXXX` — 7 digits starting with 3
  - `960XXXXXXX` — 10 digits with country code (no +)
  - `+960XXXXXXX` — 11 chars with + prefix
- Strip spaces, dashes, and parentheses before checking
- Return a clear, user-friendly error message on rejection
- **Never auto-correct. Always reject bad input.**

**Step 2 — Update `normalizePhone()` in `CustomerAuthController`**

Replace current permissive logic with:
```
1. Strip spaces, dashes, parentheses
2. If starts with +960 → validate the next 7 digits are numeric
3. If starts with 960 → validate the next 7 digits are numeric → prepend +
4. If exactly 7 digits starting with 3, 7, or 9 → prepend +960
5. Anything else → throw ValidationException with message "Invalid Maldivian phone number"
```

**Step 3 — Apply `MaldivesPhone` rule everywhere phone is accepted**

Search the codebase for all places that accept a phone number as input:
- `CustomerAuthController::sendOtp()`
- `CustomerAuthController::verifyOtp()`
- Checkout/order creation flows
- Reservation store flow
- Any customer profile update flow

Apply the rule to all of them consistently.

#### Tests Required

File: `tests/Feature/Auth/PhoneNormalizationTest.php`

```
✓ +9607654321  → accepted, normalized to +9607654321
✓ 9607654321   → accepted, normalized to +9607654321
✓ 7654321      → accepted, normalized to +9607654321
✓ 9654321      → accepted, normalized to +9609654321
✓ 99991234567  → REJECTED (too many digits)
✓ 123          → REJECTED (too short)
✓ abcdefg      → REJECTED (not numeric)
✓ +1234567890  → REJECTED (not Maldivian)
✓ 00960XXXXXXX → REJECTED (00 prefix not accepted)
```

#### Risk Assessment

**Low.** Only affects the OTP login flow. Worst case: a user with a currently-accepted malformed number gets a validation error and must re-enter their number correctly. That is the correct and safe behavior.

---

### D — Health Endpoint Leaks Too Much

#### What is happening

There is a public URL — no login required — that returns:
```json
{
  "status": "ok",
  "timestamp": "2026-03-12T...",
  "environment": "production",
  "database": "connected"
}
```

Attackers use this to fingerprint your infrastructure. Knowing you are on "production" with a live database connection tells them the system is active and what to target.

#### Files to Change

```
backend/routes/api.php   ← find the /system/health route and reduce its response
```

#### Implementation Steps

**Step 1 — Change the public health route response to only:**
```json
{ "status": "ok" }
```

Remove: `environment`, `database`, `timestamp` (or keep timestamp if your uptime monitoring needs it, but nothing else).

**Step 2 (Optional but recommended) — Add an internal health endpoint:**
```
GET /api/admin/system/health  → protected by auth:sanctum + admin role
                              → returns full details for internal monitoring
```

#### Tests Required

File: `tests/Feature/System/HealthEndpointTest.php`

```
✓ GET /api/system/health returns HTTP 200
✓ Response contains "status" key
✓ Response does NOT contain "environment" key
✓ Response does NOT contain "database" key
✓ Response does NOT contain version or infrastructure info
✓ Admin health endpoint (if created) returns 401 without token
✓ Admin health endpoint returns full details with valid admin token
```

#### Risk Assessment

**Very low.** This is a response content change only. No route change, no frontend dependency. Nothing in the frontend calls this endpoint.

---

### E — BML Return URL Fragility

#### What is happening

After a customer pays via BML bank, the bank redirects the customer back to the site. The URL for that redirect is built by string concatenation in multiple places across the codebase. If the `APP_FRONTEND_URL` config value is slightly wrong (trailing slash, wrong domain, etc.), the customer gets redirected to a broken page after successfully paying — and may try to pay again.

#### Files to Change

```
backend/app/Http/Controllers/Api/BmlWebhookController.php   ← centralize URL building
backend/config/frontend.php                                  ← CREATE THIS (new config file)
backend/.env.example                                         ← add FRONTEND_ORDER_STATUS_URL
```

#### Implementation Steps

**Step 1 — Audit the BML flow first**

Search the codebase for all of these:
- `APP_FRONTEND_URL`
- `frontend_url`
- `/order/status`
- `return_url`
- `redirect_url`

List every place a URL string is built by concatenation. Count how many places exist.

**Step 2 — Create `config/frontend.php`**

```php
return [
    'order_status_url' => rtrim(env('FRONTEND_ORDER_STATUS_URL', ''), '/'),
];
```

**Step 3 — Replace all ad-hoc URL building with:**
```php
config('frontend.order_status_url') . '/' . $orderId . '?payment=CONFIRMED'
```

Use this single line everywhere instead of multiple different string concatenations.

**Step 4 — Add to `.env.example`**
```
FRONTEND_ORDER_STATUS_URL=https://test.bakeandgrill.mv/order/status
```

**Step 5 — Add to production `.env` on the server**
```
FRONTEND_ORDER_STATUS_URL=https://app.bakeandgrill.mv/order/status
```

#### Tests Required

File: `tests/Feature/Payment/BmlReturnUrlTest.php`

```
✓ Return URL is correctly formed with order ID appended
✓ Return URL matches the actual frontend SPA route structure
✓ No double slashes in the generated URL
✓ Missing config value falls back safely and logs a clear warning
✓ Webhook and return URL both reference the same order correctly
```

#### Risk Assessment

**Low** if you only centralize — the URL value stays the same, you just move where it is defined. Do not change the URL structure itself, only how it is assembled.

---

### B — Auth Token Passed in URL for Streaming

#### What is happening

To authenticate the live order status stream (SSE / EventSource), the customer's real auth token is passed in the URL:
```
GET /api/stream/order/123?token=abc123xyz
```

This URL — including the real token — is saved in:
- Browser history
- Server access logs
- CDN and proxy logs
- HTTP Referer headers

A support person reading server logs, or an attacker who gains log access, gets real customer tokens for free.

#### Files to Change

```
backend/app/Http/Controllers/Api/StreamController.php          ← update to validate ticket
backend/routes/api.php                                          ← add stream-ticket endpoint
apps/online-order-web/src/pages/OrderStatusPage.tsx            ← update to request ticket first
  (or wherever EventSource is created — audit this file first)
```

#### Implementation Steps

**Step 1 — Audit the frontend first**

Find the exact file and line where `EventSource` is created. It will look something like:
```js
new EventSource(`/api/stream/order/${orderId}?token=${token}`)
```
Note the file name and line number. You cannot update backend until you know the frontend dependency.

**Step 2 — Create a stream ticket endpoint in the backend**

```
POST /api/orders/{orderId}/stream-ticket
  Auth required: yes (auth:sanctum, customer token)
  Validates: the authenticated customer owns this order
  Returns:
    { "ticket": "signed-string-here", "expires_in": 60 }
  
  Ticket is:
    - Signed with app key (HMAC or Laravel's Str::signedUrl equivalent)
    - Contains: order_id, customer_id, expires_at (60 seconds from now)
    - Stored in cache with 60-second TTL
    - One-time use only (deleted from cache after first use)
```

**Step 3 — Update StreamController to validate ticket instead of token**

```
Current: GET /api/stream/order/{orderId}?token={real_auth_token}
New:     GET /api/stream/order/{orderId}?ticket={short_lived_ticket}

Validation sequence (all must pass, any failure = abort immediately):
  1. ticket param must be present          → else abort(401, "No stream ticket")
  2. Decode and verify ticket signature    → else abort(401, "Invalid ticket")
  3. Check ticket is not expired           → else abort(401, "Ticket expired")
  4. Check ticket.order_id == route {orderId} → else abort(403, "Ticket mismatch")
  5. Check ticket.customer_id owns order  → else abort(403, "Unauthorized")
  6. Delete ticket from cache (one-time use)
  7. Begin streaming
```

**Step 4 — Update frontend**

Replace the direct EventSource creation with a two-step process:
```
1. POST /api/orders/{orderId}/stream-ticket → get { ticket }
2. new EventSource(`/api/stream/order/${orderId}?ticket=${ticket}`)
```

The frontend change and backend change must be deployed at the same time.

#### Tests Required

File: `tests/Feature/Stream/OrderStreamAuthTest.php`

```
✓ Customer can get a stream ticket for their own order
✓ Customer cannot get a stream ticket for another customer's order (403)
✓ Unauthenticated request to get ticket fails (401)
✓ Stream connection works with valid ticket
✓ Stream connection fails with no ticket (401)
✓ Stream connection fails with expired ticket (401)
✓ Stream connection fails with ticket for a different order (403)
✓ Ticket cannot be reused after first successful connection (one-time use)
✓ Real auth token in URL is no longer accepted by stream endpoint
```

#### Risk Assessment

**Medium.** This is the most complex change in Session 1. It touches both backend and frontend. Key rule: **deploy backend and frontend together**. If you deploy backend only first, the stream breaks until frontend is also deployed. Plan a single coordinated deploy for this change.

---

### A — Order Stream Open Without Auth

#### What is happening

The stream endpoint may allow access when no token is provided, because ownership validation appears to be conditional (only runs `if token exists`). This means someone who knows an order ID could potentially watch that order's live status updates without being the customer.

#### Files to Change

```
backend/app/Http/Controllers/Api/StreamController.php   ← harden validation
```

#### Note

This finding is largely resolved by implementing **Finding B** above. If B is implemented correctly — where the stream requires a valid scoped ticket — then A is automatically fixed. However, an explicit audit should still be done.

#### Implementation Steps

**Step 1 — Audit StreamController carefully**

Look for:
- Any `if ($token)` conditional that skips validation when token is absent
- Any `try/catch` blocks that silently catch auth failures and continue
- Any default/fallback behavior that allows the stream to start without valid auth

**Step 2 — Harden regardless**

At the very top of the stream action method, add unconditional checks:
```
if no ticket/token present   → immediately abort(401) — no fallthrough
if ticket/token invalid      → immediately abort(401) — no fallthrough
No optional paths. No soft failures.
```

**Step 3 — Audit related endpoints**

Check these routes for similar ownership issues:
```
GET /api/orders/{id}          → does it verify order belongs to auth'd customer?
GET /api/orders/{id}/status   → same check
Any polling alternative to SSE
```

For each: verify that a customer cannot access another customer's order even if they guess the ID. This is called an Insecure Direct Object Reference (IDOR) vulnerability.

#### Tests Required

```
✓ GET stream with no credentials → 401
✓ GET stream with valid token for own order → 200
✓ GET stream with valid token for another customer's order → 403
✓ GET /api/orders/{id} with another customer's order ID → 403
✓ Unauthenticated order detail request → 401
```

#### Risk Assessment

**Low** once Finding B is implemented. If B is done first, this is just a verification + hardening step.

---

## Session 2 — Authorization & Role Enforcement

**Do this separately — only after Session 1 is deployed, tested, and confirmed stable on the server.**

---

### C — No Role Checks on Admin Routes

#### What is happening

Most admin routes check only `auth:sanctum` — meaning "is this person logged in?" — but do not check what role that person has. So a kitchen staff member with a valid token could technically access financial reports, SMS campaign tools, staff management, or anything else.

#### Files to Change

```
backend/app/Http/Middleware/RequireRole.php      ← CREATE THIS (new middleware)
backend/bootstrap/app.php                        ← register new middleware alias
backend/routes/api.php                           ← apply middleware to route groups
backend/app/Models/User.php                      ← add role constants + helper methods
```

#### Implementation Steps

**Step 1 — Define the role system in `User.php`**

Add constants:
```php
const ROLE_OWNER   = 'owner';
const ROLE_ADMIN   = 'admin';
const ROLE_MANAGER = 'manager';
const ROLE_CASHIER = 'cashier';
const ROLE_KITCHEN = 'kitchen';

public function hasRole(string ...$roles): bool
{
    return in_array($this->role, $roles, true);
}

public function isAdmin(): bool
{
    return in_array($this->role, [self::ROLE_OWNER, self::ROLE_ADMIN], true);
}
```

**Step 2 — Create `app/Http/Middleware/RequireRole.php`**

```
Takes allowed roles as parameter in route definition
Checks auth()->user()->role is in the allowed list
Returns 403 with clear message if role is not allowed
Returns 401 if user is not authenticated at all
```

**Step 3 — Register middleware alias**

In `bootstrap/app.php` (Laravel 11 style):
```php
->withMiddleware(function (Middleware $middleware) {
    $middleware->alias(['role' => \App\Http\Middleware\RequireRole::class]);
})
```

**Step 4 — Apply to route groups**

Authorization matrix to enforce:

| Route Group | Allowed Roles |
|-------------|--------------|
| KDS / Kitchen routes | owner, admin, manager, kitchen |
| POS / Cashier routes | owner, admin, manager, cashier |
| Reservations management | owner, admin, manager |
| Reports & analytics | owner, admin, manager |
| Promotions management | owner, admin, manager |
| SMS campaigns | owner, admin, manager |
| Loyalty admin actions | owner, admin, manager |
| Menu & pricing management | owner, admin, manager |
| Staff management | owner, admin |
| System configuration | owner, admin |
| Inventory & finance | owner, admin, manager |
| Supplier management | owner, admin, manager |

**Step 5 — Ensure customer token isolation**

Customer tokens come from `CustomerAuthController` and authenticate against the `customers` table (or guard). Staff tokens authenticate against the `users` table. Verify at middleware level that customer tokens cannot reach ANY staff/admin route.

#### Authorization Matrix (Full)

```
Customer:
  ✓ Own account only
  ✓ Own orders only
  ✓ Own reservations only
  ✓ Own loyalty view only
  ✗ No staff or admin access whatsoever

Kitchen Staff:
  ✓ KDS view and order status updates
  ✓ Order prep state transitions
  ✗ No payment data
  ✗ No customer personal data
  ✗ No admin or finance access

Cashier:
  ✓ Create and manage POS orders
  ✓ Accept payments
  ✓ Basic order operations
  ✗ No staff management
  ✗ No system configuration
  ✗ No analytics exports
  ✗ No finance reports

Manager:
  ✓ Everything Cashier can do
  ✓ Menu management
  ✓ Reservations management
  ✓ Operational reports
  ✓ Promotions management
  ✓ Inventory management
  ✗ No staff management
  ✗ No system configuration

Admin:
  ✓ Everything Manager can do
  ✓ Staff management
  ✓ System configuration
  ✗ Cannot change owner settings

Owner:
  ✓ Full access to everything
```

#### Tests Required

File: `tests/Feature/Auth/RoleAuthorizationTest.php`

```
✓ Kitchen staff can access KDS routes
✓ Kitchen staff cannot access financial reports (403)
✓ Kitchen staff cannot access staff management (403)
✓ Cashier can access POS routes
✓ Cashier cannot access staff management (403)
✓ Cashier cannot access analytics exports (403)
✓ Manager can access reports
✓ Manager cannot access staff management (403)
✓ Admin can access staff management
✓ Admin can access reports
✓ Customer token cannot reach any /admin route (403)
✓ Unauthenticated request to any admin route (401)
```

#### Risk Assessment

**Medium-High.** This touches every admin route. Any mistake — wrong role in middleware, missing route group — breaks a staff workflow. Must be done with thorough testing on the test server before deploying to production. Plan at least one full day of testing.

---

## Deployment Order

### Recommended Timeline

```
Week 1 — Session 1 (Security Fixes):

  Day 1: Fix F (Phone Validation)
    → Implement MaldivesPhone rule
    → Update CustomerAuthController
    → Test all phone formats manually
    → Deploy to test.bakeandgrill.mv
    → Verify OTP login still works

  Day 2: Fix D (Health Endpoint)
    → Change response to { "status": "ok" } only
    → Deploy to test.bakeandgrill.mv
    → Verify health URL returns correct response

  Day 3: Fix E (BML URL Centralization)
    → Create config/frontend.php
    → Update all URL building to use config
    → Add FRONTEND_ORDER_STATUS_URL to .env on server
    → Test a full payment flow on test environment
    → Deploy

  Day 4-5: Fix B + A (Stream Ticket)
    → Implement backend stream ticket endpoint
    → Update StreamController validation
    → Update frontend to request ticket first
    → Test stream connection manually in browser
    → Deploy BOTH backend and frontend together in one deploy
    → Verify live order status updates still work

Week 2 — Verify Session 1:
  → Run all Session 1 tests
  → Test all critical user flows end to end on test server
  → Deploy to production only after all tests pass

Week 3-4 — Session 2 (Roles):
  → Plan role assignments for existing staff accounts
  → Implement middleware and role system
  → Test every role thoroughly
  → Deploy to test server
  → Test again
  → Deploy to production with rollback plan ready
```

---

## Files Impact Reference

| Finding | Backend Files | Frontend Files | New Files |
|---------|--------------|----------------|-----------|
| F — Phone | `CustomerAuthController.php` | None | `app/Rules/MaldivesPhone.php` |
| D — Health | `routes/api.php` | None | None |
| E — BML URL | `BmlWebhookController.php` | None | `config/frontend.php` |
| B — Stream Token | `StreamController.php`, `routes/api.php` | `OrderStatusPage.tsx` | None |
| A — Stream Auth | `StreamController.php` | None | None |
| C — Roles | `routes/api.php`, `User.php` | None | `Middleware/RequireRole.php` |

---

## Testing Requirements

### Session 1 Tests

| Test File | Covers |
|-----------|--------|
| `tests/Feature/Auth/PhoneNormalizationTest.php` | Finding F |
| `tests/Feature/System/HealthEndpointTest.php` | Finding D |
| `tests/Feature/Payment/BmlReturnUrlTest.php` | Finding E |
| `tests/Feature/Stream/OrderStreamAuthTest.php` | Findings B + A |

### Session 2 Tests

| Test File | Covers |
|-----------|--------|
| `tests/Feature/Auth/RoleAuthorizationTest.php` | Finding C |

---

## Additional Security Notes (Found During Audit Planning)

These should be verified during implementation but are lower priority:

- **IDOR on order detail** — Verify `GET /api/orders/{id}` checks that the order belongs to the authenticated customer
- **IDOR on reservations** — Verify customers can only cancel/view their own reservations
- **Mass assignment** — Verify all models use `$fillable` (not `$guarded = []`)
- **Webhook signature** — Verify BML webhook validates a signature or secret before processing
- **Duplicate webhook** — Verify that receiving the same BML webhook twice does not double-process a payment
- **Refund authorization** — Verify only admin/manager can issue refunds, not cashier or customer

---

## Questions to Answer Before Starting Implementation

1. **Does the current stream use SSE (EventSource) or WebSocket?**  
   Answer before implementing Finding B.

2. **Is there a Redis instance available on the server?**  
   Stream tickets need a fast cache store. If only file cache is available, that still works but is slower.

3. **What is the exact URL of the BML return page in production?**  
   Needed for Finding E — to make sure the centralized URL matches the actual frontend route.

4. **What roles do existing staff accounts currently have in the database?**  
   Needed for Finding C — before adding role enforcement, all existing users must have a valid role assigned or they will be locked out.

5. **Is `test.bakeandgrill.mv` running the same code as `app.bakeandgrill.mv`?**  
   All Session 1 fixes should be tested on test environment before touching production.

---

*Document created: March 2026*  
*Implementation: Pending — start with Session 1 when ready*  
*Review this document before starting each finding to refresh context*
