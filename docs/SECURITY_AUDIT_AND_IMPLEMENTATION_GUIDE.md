# Security Audit & Implementation Guide
## Bake & Grill — Multi-App Restaurant Platform

**Status:** Documented — Not yet implemented  
**Created:** March 2026  
**Priority:** Implement Session 1 first, Session 2 separately after testing

---

## Original Prompt (Source Brief)

> The following is the original prompt that was used to generate this audit and implementation guide. Kept here for reference so you don't need to go back to ChatGPT.

```
You are Cursor acting as a principal Laravel 12 architect, security auditor, and full-stack refactor engineer.

You have full access to this codebase. Your job is to perform a careful static audit and then implement the fixes and improvements described below WITHOUT breaking existing production flows.

==================================================
PROJECT CONTEXT
==================================================

This repository is a multi-app restaurant platform for Bake & Grill.

It includes:
- Laravel backend in /backend
- customer online ordering frontend
- POS frontend
- KDS frontend
- admin dashboard frontend
- print proxy service

This is NOT just a simple restaurant website. It is an operations platform handling:
- public website
- online ordering
- checkout
- customer auth
- POS
- KDS
- reservations
- loyalty
- promotions
- delivery
- analytics
- SMS
- inventory
- printing
- BML payment integration

==================================================
PRIMARY OBJECTIVE
==================================================

Audit the codebase and implement bug fixes, security hardening, authorization cleanup, repo hygiene cleanup, and architecture improvements.

DO NOT do random rewrites.
DO NOT break any current route unless absolutely necessary.
DO NOT change public API payload shapes unless required for security, and if changed, preserve backwards compatibility where possible.

==================================================
NON-NEGOTIABLE RULES
==================================================

1. Do NOT break current production ordering, payment, POS, KDS, or reservation flows.
2. Preserve route paths unless change is required for security.
3. Preserve BML webhook and return flow compatibility.
4. Controllers must remain thin.
5. Business logic should live in domain services/actions.
6. Add or improve automated tests for all critical fixes.
7. No secrets in repo.
8. Improve security first, then cleanup, then architecture.
9. Any fix that may affect frontend behavior must be traced through both backend and frontend usage before changing.
10. When uncertain, prefer backward-compatible hardening over breaking redesigns.

==================================================
HIGH-PRIORITY FINDINGS TO FIX
==================================================

A) PUBLIC ORDER STATUS STREAM AUTHORIZATION BUG
B) QUERY STRING TOKEN LEAKAGE IN STREAMING
C) ADMIN AUTHORIZATION IS TOO WEAK / INCONSISTENT
D) PUBLIC HEALTH ENDPOINT LEAKS TOO MUCH INFO
E) BML RETURN URL / FRONTEND PATH FRAGILITY
F) OVERLY FORGIVING OTP PHONE NORMALIZATION
G) EMPTY / NO-OP MIGRATION
H) REPO HYGIENE / COMMITTED ARTIFACTS
I) STREAM CONTROLLER / SERVICE INSTANTIATION CLEANUP
J) ROUTE ORGANIZATION IMPROVEMENT

Full details for each finding are in the sections below.
```

---

## Table of Contents

1. [Overview](#overview)
2. [Verification Status / Finding Confidence](#verification-status--finding-confidence)
3. [Recommended Engineering Workflow](#recommended-engineering-workflow)
4. [Frontend Dependency Map](#frontend-dependency-map)
5. [Authorization Matrix](#authorization-matrix)
6. [Idempotency and State Transition Checklist](#idempotency-and-state-transition-checklist)
7. [Session 1 — Security Fixes](#session-1--security-fixes)
8. [Session 2 — Authorization & Role Enforcement](#session-2--authorization--role-enforcement)
9. [Rollback / Safe Deployment Plan](#rollback--safe-deployment-plan)
10. [Deployment Order](#deployment-order)
11. [Files Impact Reference](#files-impact-reference)
12. [Testing Requirements](#testing-requirements)
13. [Additional Security Notes](#additional-security-notes)
14. [Questions to Answer Before Starting](#questions-to-answer-before-starting)
15. [Final Deliverables Expected](#final-deliverables-expected)

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

> **Rule:** Do not patch a suspected issue as if it were confirmed without first verifying the affected files and all frontend dependencies.

---

## Verification Status / Finding Confidence

Findings are classified into three categories:

- **Confirmed** — Verified directly in the current codebase. Safe to implement the fix.
- **Suspected / Needs verification** — Likely based on audit signals but must be confirmed in code before patching.
- **Design recommendation** — No confirmed exploit, but improvement reduces risk or improves maintainability.

| ID | Finding | Severity | Status | Affected Area | Notes |
|----|---------|----------|--------|---------------|-------|
| A | Order stream open without auth | 🔴 High | Suspected / Needs verification | StreamController, SSE endpoint | Must audit conditional token check before patching |
| B | Auth token in query string (URL) | 🔴 High | Confirmed | StreamController, EventSource in frontend | Current design passes token as `?token=` param — confirmed behavior |
| C | Admin routes lack role enforcement | 🟠 Medium | Suspected / Needs verification | All `/admin` route groups | Must audit each group; some may already have role checks |
| D | Health endpoint exposes environment info | 🟠 Medium | Confirmed | `routes/api.php` `/system/health` | Current response includes `environment` and `database` fields |
| E | BML return URL fragility | 🟠 Medium | Suspected / Needs verification | BmlWebhookController, payment flow | Must count how many places build the URL before centralizing |
| F | Phone normalization too permissive | 🔴 Critical | Suspected / Needs verification | CustomerAuthController | Logic appears to take last 7 digits — must verify exact code path |
| G | Empty migration file | 🟡 Low | Suspected / Needs verification | `database/migrations/` | Must confirm which file is empty and whether it was ever run |
| H | Junk files in repo | 🟡 Low | Suspected / Needs verification | `.gitignore`, repo root | Must audit before removing anything |
| I | Services manually instantiated in controllers | 🟡 Low | Suspected / Needs verification | StreamController and others | Must audit before refactoring |
| J | Routes file too large | 🟡 Low | Design recommendation | `routes/api.php` | Not a security issue — maintenance improvement only |

---

## Recommended Engineering Workflow

Follow this sequence for every individual finding, without skipping steps:

1. **Verify the finding in current code** — open the affected file(s), confirm the issue exists exactly as described. Do not assume the audit description is 100% accurate.
2. **Identify all affected routes, controllers, services, and frontend consumers** — use the Frontend Dependency Map below.
3. **Design a backward-compatible patch** — prefer the smallest change that fixes the issue without changing public API shapes.
4. **Write or update tests first where feasible** — define expected behavior before changing code.
5. **Implement the smallest secure change** — do not over-engineer.
6. **Validate frontend behavior** — manually test the affected user-facing flow on `test.bakeandgrill.mv`.
7. **Deploy with rollback awareness** — know exactly how to revert if something breaks.
8. **Document the confirmed outcome** — update the finding status in this document to Confirmed + Fixed after implementation.

---

## Frontend Dependency Map

Before changing any backend behavior, trace which frontend apps are affected. No backend auth or URL change should be implemented without checking this table first.

| Change Area | Backend Concern | Frontend / Service Impacted | What Must Be Checked |
|------------|-----------------|----------------------------|----------------------|
| Stream ticket (Finding B) | Replace `?token=` with `?ticket=` on stream endpoint | **Online ordering frontend** (`apps/online-order-web`) | Find exact file where `EventSource` is created. Frontend must request ticket first, then open stream. Both must deploy together. |
| Stream auth hardening (Finding A) | Reject requests with no valid auth | **Online ordering frontend** | If any path opens stream without a token today, it will break. Audit all EventSource usages. |
| BML return URL (Finding E) | Centralize URL building | **Online ordering frontend** — `OrderStatusPage` | Verify the frontend SPA route path matches the centralized backend config value exactly. |
| Phone validation (Finding F) | Reject previously-tolerated phone formats | **Online ordering frontend** — login/OTP screens | If frontend does its own phone formatting before sending to API, check for mismatches. |
| Admin authorization (Finding C) | Add role middleware to admin routes | **Admin dashboard** (`apps/admin-dashboard`) | Any route that gets a new role restriction could break a manager or cashier workflow. Test every dashboard page. |
| Health endpoint (Finding D) | Reduce public response | No frontend currently uses this endpoint | Verify no internal monitoring tool or uptime checker depends on the `environment` field. |
| Print proxy auth | If auth changes affect print jobs | **Print proxy service** (`print-proxy/`) | Verify print job auth flow is not broken by staff auth changes. |
| KDS auth | Role restriction on KDS routes | **KDS frontend** (`apps/kds-web`) | Verify kitchen staff role can still access all KDS endpoints after role enforcement. |
| POS auth | Role restriction on POS routes | **POS frontend** (`apps/pos-web`) | Verify cashier role can still access all POS endpoints after role enforcement. |

---

## Authorization Matrix

This matrix defines what each role should be able to access. Implement this during Session 2 (Finding C).

> `auth:sanctum` alone is not sufficient for admin areas. Route naming alone is not authorization. Middleware, gates, or policies must enforce this matrix.

| Area | Customer | Cashier | Kitchen | Manager | Admin / Owner |
|------|----------|---------|---------|---------|---------------|
| Own profile / account | Own only | — | — | — | Full |
| Own orders | Own only | — | — | — | Full |
| Own reservations | Own only | — | — | — | Full |
| Own loyalty balance | Own only | — | — | — | Full |
| POS order creation | No | Yes | No | Yes | Full |
| POS payment acceptance | No | Yes | No | Yes | Full |
| KDS / order prep updates | No | No | Yes | Yes | Full |
| Reservation management | No | No | No | Yes | Full |
| Menu management | No | No | No | Yes | Full |
| Promotions management | No | No | No | Yes | Full |
| Loyalty administration | No | No | No | Yes | Full |
| SMS / campaign tools | No | No | No | Yes | Full |
| Analytics & reports | No | No | No | Yes | Full |
| Inventory & purchasing | No | No | No | Yes | Full |
| Supplier management | No | No | No | Yes | Full |
| Invoices & expenses | No | No | No | Yes | Full |
| Refunds & financial actions | No | No | No | Limited | Full |
| Staff management | No | No | No | No | Full |
| System configuration | No | No | No | No | Full |
| Any admin route | No | No | No | No | Full |

**Customer token isolation:**  
Customer tokens (issued by `CustomerAuthController`, authenticated via `customers` guard) must never be accepted by any staff or admin route. This is a hard boundary — not just a role check.

---

## Idempotency and State Transition Checklist

Use this checklist when implementing or auditing the payment and order flows.

### Payment Safety
- [ ] Duplicate BML webhook call does not create a duplicate payment effect
- [ ] Webhook is the source of truth for payment confirmation — return URL alone cannot finalize a payment
- [ ] Return URL page shows status by reading order state from the DB, not from URL params
- [ ] A failed or cancelled payment does not mark the order as paid
- [ ] A retried payment attempt on the same order does not cause double-charging
- [ ] Payment state transitions are validated — an order cannot move from `pending` to `completed` without a confirmed payment event

### Order State Safety
- [ ] Order status transitions are explicit and validated (no jumping from `pending` to `delivered` in one step)
- [ ] Cancelling an already-paid order triggers a refund process, not a silent state change
- [ ] POS order creation is idempotent — duplicate requests with the same data do not create duplicate orders

### Loyalty & Promotions Safety
- [ ] Loyalty points are awarded once per order — not once per webhook or return URL hit
- [ ] Promotion codes cannot be applied twice to the same order
- [ ] Loyalty holds cannot be double-released or double-applied
- [ ] Referral bonuses are awarded once per qualifying event

### Refund Safety
- [ ] Refunds require an explicit role check (manager or admin only)
- [ ] A refund cannot be issued twice for the same order/payment
- [ ] Partial refunds track cumulative amount to prevent over-refunding

### Webhook Replay Protection
- [ ] BML webhook validates a signature or secret header before processing
- [ ] Webhook processor checks if the order is already in the target state before applying changes (idempotent check)
- [ ] Webhook failures are logged clearly with enough detail to debug without re-triggering

---

## Session 1 — Security Fixes

**Goal:** Fix the 5 highest-risk security issues with minimal risk of breaking production.  
**Recommended order:** F → D → E → B → A

---

### F — Phone Number Validation Too Loose

**Status:** Suspected / Needs verification — verify `normalizePhone()` logic in `CustomerAuthController` before patching.

#### What is happening

The OTP auth flow appears to accept any string as a phone number and attempts to "fix" it by taking the last 7 digits and prepending `+960`. If confirmed, this means entering `99991234567` would strip to `4567` and send an OTP to `+9604567` — a completely different person's number. That person could then log in as the original customer.

**Verify in code first:** Open `CustomerAuthController` and locate `normalizePhone()`. Confirm whether this behavior exists before implementing the fix.

#### Files to Change

```
backend/app/Http/Controllers/Api/Auth/CustomerAuthController.php   ← update normalizePhone()
backend/app/Rules/MaldivesPhone.php                                ← CREATE THIS (new validation rule)
```

#### Implementation Steps

**Step 1 — Create `app/Rules/MaldivesPhone.php`**

A new Laravel custom validation rule that:
- Accepts only these formats:
  - `7XXXXXX` — 7 digits starting with 7 (local mobile)
  - `9XXXXXX` — 7 digits starting with 9 (local mobile)
  - `3XXXXXX` — 7 digits starting with 3
  - `960XXXXXXX` — 10 digits with country code (no +)
  - `+960XXXXXXX` — 11 chars with + prefix
- Strips spaces, dashes, and parentheses before checking
- Returns a clear, user-friendly error message on rejection
- **Never auto-corrects. Always rejects bad input.**

**Step 2 — Update `normalizePhone()` in `CustomerAuthController`**

```
1. Strip spaces, dashes, parentheses
2. If starts with +960 → validate the next 7 digits are numeric
3. If starts with 960  → validate the next 7 digits are numeric → prepend +
4. If exactly 7 digits starting with 3, 7, or 9 → prepend +960
5. Anything else → throw ValidationException: "Invalid Maldivian phone number"
```

**Step 3 — Apply `MaldivesPhone` rule everywhere phone is accepted**

- `CustomerAuthController::sendOtp()`
- `CustomerAuthController::verifyOtp()`
- Checkout / order creation flows
- Reservation store flow
- Any customer profile update flow

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

**Low.** Only affects OTP login. Worst case: a user with a currently-tolerated malformed number gets a validation error and must re-enter correctly. That is the safe and correct behavior.

---

### D — Health Endpoint Leaks Too Much

**Status:** Confirmed — current response includes `environment` and `database` fields.

#### What is happening

There is a public URL — no login required — that currently returns:
```json
{
  "status": "ok",
  "timestamp": "2026-03-12T...",
  "environment": "production",
  "database": "connected"
}
```

Attackers use this to fingerprint infrastructure and confirm the system is live and actively connected to a database.

#### Files to Change

```
backend/routes/api.php   ← find the /system/health route
```

#### Implementation Steps

**Step 1 — Change the public health response to only:**
```json
{ "status": "ok" }
```

Remove `environment`, `database`. Optionally keep `timestamp` if an uptime monitoring tool depends on it, but nothing else.

**Step 2 (Optional) — Add an internal health endpoint:**
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
✓ Admin health endpoint returns 401 without token
✓ Admin health endpoint returns full details with valid admin token
```

#### Risk Assessment

**Very low.** Response content change only. No route change. No frontend dependency.

---

### E — BML Return URL Fragility

**Status:** Suspected / Needs verification — must audit how many places build the return URL before centralizing.

#### What is happening

After a customer pays via BML, the bank redirects back to the site using a URL built by string concatenation in the backend. If `APP_FRONTEND_URL` has a trailing slash, wrong domain, or incorrect path, the customer lands on a broken page after a successful payment and may attempt to pay again.

**Verify in code first:** Search for `APP_FRONTEND_URL`, `frontend_url`, `/order/status`, `return_url`, `redirect_url` across the backend. Count every place a return URL is assembled.

#### Files to Change

```
backend/app/Http/Controllers/Api/BmlWebhookController.php   ← centralize URL building
backend/config/frontend.php                                  ← CREATE THIS
backend/.env.example                                         ← add FRONTEND_ORDER_STATUS_URL
```

#### Implementation Steps

**Step 1 — Create `config/frontend.php`**
```php
return [
    'order_status_url' => rtrim(env('FRONTEND_ORDER_STATUS_URL', ''), '/'),
];
```

**Step 2 — Replace all ad-hoc URL building with one pattern:**
```php
config('frontend.order_status_url') . '/' . $orderId . '?payment=CONFIRMED'
```

**Step 3 — Add to `.env.example`:**
```
FRONTEND_ORDER_STATUS_URL=https://test.bakeandgrill.mv/order/status
```

**Step 4 — Add to server `.env`:**
```
FRONTEND_ORDER_STATUS_URL=https://app.bakeandgrill.mv/order/status
```

#### Tests Required

File: `tests/Feature/Payment/BmlReturnUrlTest.php`

```
✓ Return URL is correctly formed with order ID appended
✓ Return URL matches actual frontend SPA route structure
✓ No double slashes in the generated URL
✓ Missing config value falls back safely and logs a clear warning
✓ Webhook and return URL both reference the same order
```

#### Risk Assessment

**Low** if only centralizing — the URL value stays the same, only where it is defined changes. Do not change the URL structure itself.

---

### B — Auth Token Passed in URL for Streaming

**Status:** Confirmed — current design passes `?token=` on the stream endpoint.

#### What is happening

To authenticate the live order status stream, the customer's real auth token is passed in the URL:
```
GET /api/stream/order/123?token=abc123xyz
```

This URL — including the real token — is saved in browser history, server access logs, CDN logs, and HTTP Referer headers. Anyone with log access gets real customer tokens.

#### Files to Change

```
backend/app/Http/Controllers/Api/StreamController.php          ← validate ticket instead of token
backend/routes/api.php                                          ← add stream-ticket endpoint
apps/online-order-web/src/pages/OrderStatusPage.tsx            ← request ticket before opening stream
  (verify exact file first — see Frontend Dependency Map)
```

#### Implementation Steps

**Step 1 — Audit the frontend first**

Find the exact file and line where `EventSource` is created:
```js
new EventSource(`/api/stream/order/${orderId}?token=${token}`)
```
Note the file name and line number. Do not change the backend until the frontend dependency is confirmed.

**Step 2 — Create a stream ticket endpoint**

```
POST /api/orders/{orderId}/stream-ticket
  Auth required: yes (auth:sanctum, customer token)
  Validates: authenticated customer owns this order
  Returns: { "ticket": "signed-string", "expires_in": 60 }

  Ticket properties:
    - Signed with app key (HMAC)
    - Contains: order_id, customer_id, expires_at (now + 60s)
    - Stored in cache with 60-second TTL
    - One-time use only (deleted from cache after first use)
```

**Step 3 — Update StreamController validation**

```
Current: GET /api/stream/order/{orderId}?token={real_auth_token}
New:     GET /api/stream/order/{orderId}?ticket={short_lived_ticket}

Validation sequence (all must pass — any failure aborts immediately):
  1. ticket param present            → else abort(401, "No stream ticket")
  2. Ticket signature valid          → else abort(401, "Invalid ticket")
  3. Ticket not expired              → else abort(401, "Ticket expired")
  4. ticket.order_id == {orderId}    → else abort(403, "Ticket mismatch")
  5. ticket.customer_id owns order   → else abort(403, "Unauthorized")
  6. Delete ticket from cache
  7. Begin streaming
```

**Step 4 — Update frontend (deploy together with backend)**

```
1. POST /api/orders/{orderId}/stream-ticket → get { ticket }
2. new EventSource(`/api/stream/order/${orderId}?ticket=${ticket}`)
```

The frontend and backend changes must be deployed in a single coordinated deploy.

#### Tests Required

File: `tests/Feature/Stream/OrderStreamAuthTest.php`

```
✓ Customer gets a stream ticket for their own order
✓ Customer cannot get a ticket for another customer's order (403)
✓ Unauthenticated ticket request fails (401)
✓ Stream connection works with valid ticket
✓ Stream connection fails with no ticket (401)
✓ Stream connection fails with expired ticket (401)
✓ Stream connection fails with ticket for a different order (403)
✓ Ticket cannot be reused after first use
✓ Real auth token in URL is no longer accepted
```

#### Risk Assessment

**Medium.** Most complex change in Session 1. Touches backend and frontend. Must deploy both together. If backend is deployed first without frontend, the stream breaks until frontend catches up.

---

### A — Order Stream Open Without Auth

**Status:** Suspected / Needs verification — must audit StreamController for conditional token checks before patching.

#### What is happening

The stream endpoint appears to allow access when no token is supplied, because ownership validation may only run inside an `if ($token)` conditional. This would allow anyone who knows an order ID to watch that order's live status updates.

**Verify in code first:** Open `StreamController`, look for any `if ($token)`, try/catch, or default/fallback that allows the stream to begin without valid credentials.

#### Note

This finding is largely resolved by implementing **Finding B**. If B is implemented correctly, A is automatically fixed. This step is verification and explicit hardening.

#### Files to Change

```
backend/app/Http/Controllers/Api/StreamController.php
```

#### Implementation Steps

**Step 1 — Audit StreamController**

Look for:
- Any `if ($token)` that skips validation when token is absent
- Any `try/catch` blocks that silently swallow auth failures
- Any fallback that lets the stream start without valid auth

**Step 2 — Harden regardless**

At the very top of the stream action, before any other logic:
```
if no ticket/token present   → immediately abort(401)
if ticket/token invalid      → immediately abort(401)
No optional paths. No soft failures.
```

**Step 3 — Audit related order endpoints for IDOR**

```
GET /api/orders/{id}          → must verify order belongs to auth'd customer
GET /api/orders/{id}/status   → same check
Any polling alternative to SSE
```

A customer must not be able to access another customer's order by guessing the ID.

#### Tests Required

```
✓ Stream request with no credentials → 401
✓ Stream request for own order with valid credentials → 200
✓ Stream request for another customer's order → 403
✓ GET /api/orders/{id} for another customer's order → 403
✓ Unauthenticated order detail request → 401
```

#### Risk Assessment

**Low** once Finding B is implemented. Largely a verification and hardening step.

---

## Session 2 — Authorization & Role Enforcement

**Do this separately — only after Session 1 is deployed, tested, and confirmed stable.**

---

### C — No Role Checks on Admin Routes

**Status:** Suspected / Needs verification — must audit each route group before adding middleware.

#### What is happening

Most admin routes appear to check only `auth:sanctum` — "is this person logged in?" — without checking the person's role. A kitchen staff member with a valid token may be able to access financial reports, SMS campaigns, or staff management.

**Verify in code first:** Go through `routes/api.php` and list every admin route group. Note which ones already have role-based middleware and which do not. Do not assume all are unprotected.

#### Files to Change

```
backend/app/Http/Middleware/RequireRole.php      ← CREATE THIS
backend/bootstrap/app.php                        ← register middleware alias
backend/routes/api.php                           ← apply middleware to route groups
backend/app/Models/User.php                      ← add role constants and helpers
```

#### Implementation Steps

**Step 1 — Add role constants and helpers to `User.php`**

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

**Step 2 — Create `RequireRole` middleware**

```
- Takes allowed roles as parameter
- Checks auth()->user()->role is in the allowed list
- Returns 403 if role is not allowed
- Returns 401 if user is unauthenticated
```

**Step 3 — Register alias in `bootstrap/app.php`**

```php
->withMiddleware(function (Middleware $middleware) {
    $middleware->alias(['role' => \App\Http\Middleware\RequireRole::class]);
})
```

**Step 4 — Apply to route groups (see Authorization Matrix above)**

| Route Group | Allowed Roles |
|-------------|--------------|
| KDS / Kitchen routes | owner, admin, manager, kitchen |
| POS / Cashier routes | owner, admin, manager, cashier |
| Reservations management | owner, admin, manager |
| Reports & analytics | owner, admin, manager |
| Promotions management | owner, admin, manager |
| SMS campaigns | owner, admin, manager |
| Loyalty admin | owner, admin, manager |
| Menu & pricing | owner, admin, manager |
| Inventory & finance | owner, admin, manager |
| Staff management | owner, admin |
| System configuration | owner, admin |

**Step 5 — Enforce customer token isolation**

Customer tokens (from `CustomerAuthController`, `customers` guard) must never pass through to staff or admin routes. Verify this at middleware level, not just at role check level.

**Critical pre-condition:** Before deploying, verify that all existing staff accounts in the production database have a valid role value set. Any account with a null or unrecognized role will be locked out immediately after deployment.

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

**Medium-High.** Touches every admin route. A wrong role or missing route group breaks a staff workflow. Requires thorough testing on `test.bakeandgrill.mv` before deploying to production.

---

## Rollback / Safe Deployment Plan

### A. Order Stream Auth / Ticketing (Findings B + A)

**What could break:**
- The customer order tracking page stops updating live status
- Any frontend that opens an EventSource with the old `?token=` param breaks immediately

**What to monitor:**
- Customer complaints about order status page not updating
- 401/403 errors in server logs for the `/api/stream/` path

**How to roll back:**
- If frontend and backend were deployed together: revert both to previous commit and redeploy
- Keep the previous working version tagged in git before deploying this change

**Temporary compatibility mode (if needed):**
- During transition only, the stream endpoint could accept either `?token=` (old) or `?ticket=` (new) simultaneously
- Remove the old `?token=` path as soon as the new ticket flow is confirmed working
- Do not leave the dual-mode running longer than one deploy cycle

---

### B. Admin Authorization Tightening (Finding C)

**What could break:**
- A manager or cashier is blocked from a route they legitimately use
- A staff member with a null `role` in the database gets locked out entirely

**What to monitor:**
- Staff reports of "403 Forbidden" on pages they previously accessed
- Admin dashboard page errors in the browser console

**How to roll back:**
- Revert `routes/api.php` changes — remove the `role:` middleware from route groups
- Redeploy backend only (no frontend changes needed for rollback)

**Before deploying:**
- Run a query on the production database: `SELECT id, name, role FROM users WHERE role IS NULL OR role NOT IN ('owner','admin','manager','cashier','kitchen')`
- Assign correct roles to any accounts returned by that query before the deployment

---

### C. Payment Redirect / BML Return Logic (Finding E)

**What could break:**
- Post-payment redirect lands on a 404 page if `FRONTEND_ORDER_STATUS_URL` is misconfigured on the server
- Customer sees a broken page after a successful payment

**What to monitor:**
- Check server `.env` has `FRONTEND_ORDER_STATUS_URL` set correctly before deploying
- After deploying, do a test payment on `test.bakeandgrill.mv` and confirm the redirect lands on the correct page

**How to roll back:**
- Revert `config/frontend.php` and `BmlWebhookController.php` to previous version
- The URL value itself is not changing — only where it is defined — so rollback is low risk

---

### D. Phone Validation Tightening (Finding F)

**What could break:**
- A customer whose phone number was previously accepted in a non-standard format now gets a validation error and cannot log in
- This is a very edge case but possible for customers who entered numbers like `00960XXXXXXX` in the past

**What to monitor:**
- OTP login error rates after deployment
- Customer support reports of "cannot log in"

**How to roll back:**
- Revert `CustomerAuthController::normalizePhone()` to previous version
- The `MaldivesPhone` rule can be left in place as it does not affect existing data

**Mitigation:**
- Before deploying, check the `customers` table for any stored phone numbers in non-standard formats: `SELECT phone FROM customers WHERE phone NOT REGEXP '^\\+960[0-9]{7}$'`
- Normalize any found records to `+960XXXXXXX` format in a one-time migration before enforcing strict validation

---

## Deployment Order

### Recommended Timeline

```
Week 1 — Session 1 (Security Fixes):

  Day 1: Fix F (Phone Validation)
    → Verify normalizePhone() behavior in code
    → Audit customer table for non-standard phone numbers
    → Implement MaldivesPhone rule
    → Update CustomerAuthController
    → Test all phone formats manually on test server
    → Deploy to test.bakeandgrill.mv
    → Verify OTP login still works

  Day 2: Fix D (Health Endpoint)
    → Confirm current response fields
    → Change response to { "status": "ok" } only
    → Deploy to test.bakeandgrill.mv
    → Verify endpoint returns correct response

  Day 3: Fix E (BML URL Centralization)
    → Audit all places that build the return URL
    → Create config/frontend.php
    → Update all URL building to use config
    → Add FRONTEND_ORDER_STATUS_URL to server .env
    → Do a test payment on test environment
    → Confirm redirect lands on correct page
    → Deploy

  Day 4-5: Fix B + A (Stream Ticket)
    → Audit frontend to find EventSource usage
    → Implement backend stream ticket endpoint
    → Update StreamController validation
    → Update frontend to request ticket first
    → Test stream manually in browser on test server
    → Deploy BOTH backend and frontend together
    → Verify live order status updates still work

Week 2 — Verify Session 1:
  → Run all Session 1 tests
  → Test all critical user flows end-to-end on test server
  → Deploy to production only after all tests pass

Week 3-4 — Session 2 (Roles):
  → Audit all admin route groups — list which have role checks and which do not
  → Query production DB for users with null or invalid role values
  → Assign correct roles to all staff accounts
  → Implement RequireRole middleware
  → Apply to route groups incrementally (one group at a time)
  → Test every role on test server
  → Deploy to production with rollback plan ready
```

---

## Files Impact Reference

| Finding | Backend Files | Frontend Files | New Files |
|---------|--------------|----------------|-----------|
| F — Phone | `CustomerAuthController.php` | None | `app/Rules/MaldivesPhone.php` |
| D — Health | `routes/api.php` | None | None |
| E — BML URL | `BmlWebhookController.php` | None | `config/frontend.php` |
| B — Stream Token | `StreamController.php`, `routes/api.php` | `OrderStatusPage.tsx` (verify exact file) | None |
| A — Stream Auth | `StreamController.php` | None | None |
| C — Roles | `routes/api.php`, `User.php`, `bootstrap/app.php` | None | `Middleware/RequireRole.php` |

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

### Payment & Idempotency Tests

| Test File | Covers |
|-----------|--------|
| `tests/Feature/Payment/WebhookIdempotencyTest.php` | Duplicate webhook, state transitions |
| `tests/Feature/Payment/ReturnUrlSafetyTest.php` | Return URL cannot finalize payment alone |

---

## Additional Security Notes

These should be verified during implementation. They are lower priority but should not be ignored.

- **IDOR on order detail** — Verify `GET /api/orders/{id}` checks that the order belongs to the authenticated customer
- **IDOR on reservations** — Verify customers can only cancel or view their own reservations
- **Mass assignment** — Verify all models use `$fillable` (not `$guarded = []`)
- **Webhook signature** — Verify BML webhook validates a signature or shared secret before processing
- **Duplicate webhook** — Verify that receiving the same BML webhook twice does not double-process a payment
- **Refund authorization** — Verify only admin or manager can issue refunds

---

## Questions to Answer Before Starting

Answer these before beginning implementation. Some findings cannot be safely patched without these answers.

1. **Does the current stream use SSE (EventSource) or WebSocket?**  
   Required before implementing Finding B. The ticket mechanism differs slightly for each.

2. **Is there a Redis instance available on the server?**  
   Stream tickets need a fast, reliable cache store. File cache works but is slower and has edge cases under load.

3. **What is the exact URL of the BML return page in production?**  
   Required for Finding E. The centralized config value must match the real frontend SPA route exactly.

4. **What roles do existing staff accounts currently have in the database?**  
   Required for Finding C. Run `SELECT id, name, role FROM users` before adding role enforcement. Any account with a null or missing role will be locked out after deployment.

5. **Is `test.bakeandgrill.mv` running the same code as `app.bakeandgrill.mv`?**  
   All Session 1 fixes must be tested on the test server before touching production.

6. **Does any external monitoring tool (e.g. UptimeRobot) depend on the current health endpoint response fields?**  
   Required before removing `environment` and `database` fields from the health endpoint (Finding D).

---

## Final Deliverables Expected

When implementation is complete, a report or PR should contain the following:

### 1. Confirmed Findings List
For each finding, state:
- Was it confirmed in code or not found?
- What exactly was the issue?

### 2. Affected Files
- Full list of files changed
- Files created
- Files deleted

### 3. What Changed
- Summary of each code change
- Any API payload or route changes
- Frontend changes made

### 4. Backward Compatibility Notes
- Any change that affects existing client behavior
- Any change that requires a server config update (e.g. new `.env` variable)
- Any database migration or data fix required

### 5. Tests Added or Updated
- List of new test files
- List of test cases added to existing files
- Confirmation that all new tests pass

### 6. Rollout Risks
- Any change that required extra care during deployment
- Any issue encountered and how it was resolved

### 7. Follow-Up Items Not Addressed
- Anything discovered during implementation that needs a separate task
- Any finding that turned out to be a false positive — document why

---

## Full Verdict

### Overall Assessment

This document is a strong, practical security and implementation guide. It is substantially more useful than a generic prompt-to-Cursor instruction. It has been upgraded to include frontend dependency awareness, an authorization matrix, payment idempotency guidance, rollback plans, and a structured engineering workflow. However, it is not yet fully complete as an execution-governance document. Several implementation-control sections are either partially present or still missing.

**Final classification: Partially updated, technically strong, but not yet fully complete.**

---

### What Is Already Strong

- **Clear prioritization** — high-risk findings are identified, ordered correctly, and separated from lower-priority cleanup tasks
- **Finding confidence levels** — each finding is classified as Confirmed, Suspected, or Design Recommendation, which prevents engineers from patching unverified issues as if they were certain
- **Frontend dependency map** — documents which frontend apps are affected by each backend security change, reducing the risk of a backend fix silently breaking a frontend flow
- **Authorization matrix** — defines a clear role-vs-capability table covering every platform area, giving Session 2 a concrete enforcement target rather than vague guidance
- **Payment and idempotency checklist** — actionable checklist covering duplicate webhooks, state transitions, loyalty/promotion safety, and refund controls
- **Rollback plans** — per-finding rollback guidance covering what breaks, what to monitor, and how to revert safely
- **Recommended engineering workflow** — step-by-step process that enforces verification before patching and frontend validation before deployment
- **Final deliverables section** — defines what a completed implementation must produce, making the output measurable

---

### What Is Still Missing

Despite the upgrades, the following gaps remain. Each one increases implementation risk if left unresolved before coding begins.

**1. Verification Status / Finding Confidence — Partially present**  
The table exists and classifies findings correctly. However, the "Status" column has not been updated after any actual code inspection. All findings still carry their initial classification. Before implementation starts, each finding marked "Suspected / Needs verification" must be confirmed or ruled out by directly reading the relevant files.

**2. Rollback / Safe Deployment Plan — Present but not tested**  
The rollback section describes what to do but has not been validated against the actual deployment setup. It assumes `git revert` and redeployment are straightforward. The specific deploy method (cPanel Git, manual FTP, shell deploy script) should be documented here so the rollback procedure is unambiguous under pressure.

**3. Recommended Engineering Workflow — Present but not enforced**  
The workflow exists as a written list. It has no mechanism to ensure it is followed. A short pre-implementation checklist at the top of each finding (verify → trace dependencies → patch → test → deploy) would make compliance easier to track.

**4. Final Deliverables Expected — Present but incomplete**  
The deliverables section lists what a final report must contain. It does not specify who reviews it, what the acceptance criteria are, or how confirmed fixes get reflected back into this document's Verification Status table.

---

### Risks of Proceeding Without Fixing the Gaps

Without resolving the above before implementation:

- A suspected finding may be patched as if confirmed, potentially introducing a regression in a flow that was not actually broken
- A frontend dependency may be missed during a backend security fix, breaking a customer-facing flow silently
- Rollback under deployment pressure may be slower or incorrect because the procedure was not validated against the actual server setup
- The final implementation report may be inconsistent or incomplete, making it hard to verify what was fixed and what remains

---

### Final Recommendation

This document is good enough to use as a working implementation guide right now for low-risk findings (D, F). For medium and high-risk findings (B, A, C), it is safer to:

1. Confirm each finding by reading the actual code before patching
2. Update the Verification Status table with confirmed file locations and exact behavior
3. Validate the rollback procedure on the test server before touching production

The document should be treated as a living reference. Update the finding status column after each fix is confirmed. Do not leave it permanently in "Suspected" state after implementation.

**Verdict: Use this document. Verify before you patch. Update it as you go.**

---

### Immediate Next Step

- Confirm each "Suspected / Needs verification" finding by reading the relevant files directly, update the Verification Status table with the result, then begin implementation in the order defined by the deployment timeline.

---

*Document created: March 2026*  
*Implementation: Pending — start with Session 1 when ready*  
*Review this document before starting each finding to refresh context*  
*Update finding status in the Verification Status table after each fix is confirmed*
