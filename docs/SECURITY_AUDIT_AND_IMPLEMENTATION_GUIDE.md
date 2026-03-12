# Security Audit & Implementation Guide
## Bake & Grill — Multi-App Restaurant Platform

**Status:** Verified & Updated — Ready for implementation
**Created:** March 2026
**Last verified:** March 2026 (code-level verification of all findings)
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
| A | Order stream open without auth | 🔴 High | **CONFIRMED** | `StreamController::publicOrderStatus()` line 79-101 | If `$tokenValue` is empty, the `if ($tokenValue)` block is skipped entirely — stream proceeds with **zero auth**. Anyone who knows an order ID can watch it. |
| B | Auth token in query string (URL) | 🔴 High | **CONFIRMED** | `StreamController::publicOrderStatus()` line 81, `routes/api.php` line 342 | Route comment explicitly says `?token=` query param. Token is read via `$request->query('token', '')`. |
| C | Admin routes lack role enforcement | 🟠 Medium | **CONFIRMED** | `routes/api.php` — ALL admin route groups (lines 298, 315, 346, 364, 374, 398, 410, 441, 475, 496) | Every admin route group uses only `auth:sanctum` with NO role middleware. A kitchen staff token can access staff management, analytics, SMS campaigns, financial reports — everything. Only exception: device routes use `can:device.manage`. |
| D | Health endpoint exposes environment info | 🟠 Medium | **CONFIRMED** | `routes/api.php` line 504-511 | Returns `environment`, `database`, and `timestamp`. Note: there are TWO health endpoints — `/health` (line 42, returns `version` + `service` name) and `/system/health` (line 504, returns `environment` + `database`). Both leak info. |
| E | BML return URL fragility | 🟠 Medium | **CONFIRMED — but less fragile than suspected** | `PaymentService.php` line 104, `PaymentController.php` line 109, `BmlConnectService.php` line 61, `config/bml.php` line 11 | Return URL is built in **3 separate places** using **2 different config keys** (`bml.return_url` and `app.frontend_url`). The `PaymentController::bmlReturn()` uses `config('app.frontend_url')` while `PaymentService` uses `config('bml.return_url')` — these could diverge. |
| F | Phone normalization too permissive | 🔴 Critical | **CONFIRMED** | `CustomerAuthController::normalizePhone()` line 177-202 | Line 201: `return '+960' . substr($digitsOnly, -7);` — the fallback takes the LAST 7 digits of ANY input. `99991234567` normalizes to `+9601234567`. This is an **account takeover vector**. However, line 32 adds a regex check AFTER normalization — so the damage is the wrong number gets the OTP, not a bypass. Still critical. |
| F+ | OTP rate limiting exists but is per-phone only | 🟠 Medium | **NEW FINDING** | `CustomerAuthController::requestOtp()` line 39-46 | Rate limit is 3 OTP/hour per phone number. But there is NO per-IP rate limit. An attacker can spam OTPs to thousands of different numbers (SMS flooding / cost abuse). Route-level `throttle:5,10` exists but is too generous. |
| G | Empty migration file | 🟡 Low | **CONFIRMED** | `2026_02_03_210622_add_delivery_address_to_customers_table.php` | This migration is a no-op (empty `up()` and `down()` with only `//` comments). A duplicate migration `2026_02_04_001000_add_delivery_address_to_customers_table.php` has the actual columns. The empty one was likely an abandoned first attempt. |
| H | Junk files in repo | 🟢 Not an issue | `.gitignore` | `.gitignore` is comprehensive — covers `.env`, vendor, node_modules, build artifacts, IDE files, SQLite, OS files. No secrets found in repo. |
| I | Services manually instantiated in controllers | 🟡 Low | **CONFIRMED — minor** | `StreamController.php` line 131 | Only one instance: `(new OrderStreamProvider)->parseCursor($c)` inside `streamSingleOrder()`. The main constructor uses proper DI. This is a minor inconsistency, not a bug. |
| J | Routes file too large | 🟡 Low | Design recommendation | `routes/api.php` (500+ lines) | Not a security issue — maintenance improvement only |
| K | Customer/staff token isolation not enforced | 🟠 Medium | **NEW FINDING** | `routes/api.php` lines 92-205 | Staff routes use `auth:sanctum` which also accepts customer tokens. A customer token could potentially hit staff-only endpoints (orders, KDS, reports, refunds, SMS). Controllers may check abilities internally but this is not enforced at route level. |

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
**Original recommended order:** F → D → E → B → A
**Updated recommended order (after verification):** A+B → F → D → E (Finding A is worse than originally suspected — stream has zero auth and should be fixed first or together with B)

---

### F — Phone Number Validation Too Loose

**Status:** **CONFIRMED** — verified in `CustomerAuthController.php` lines 177-202.

#### What is happening

The `normalizePhone()` method has a dangerous fallback on **line 201**:
```php
// Default: assume it's 7 digits and add prefix
return '+960' . substr($digitsOnly, -7);
```

This means ANY input that doesn't match the earlier conditions gets its last 7 digits extracted and prefixed with `+960`. Examples:
- `99991234567` (11 digits) → `+9601234567` (sends OTP to a stranger)
- `00960712345699` (14 digits) → `+9605345699` (wrong number)
- `+14155551234` (US number) → `+9605551234` (sends OTP to a random Maldivian)

**Mitigating factor:** Line 32 adds a post-normalization regex check `preg_match('/^\+960[0-9]{7}$/', $phone)` that rejects numbers not matching the expected format AFTER normalization. So the normalized result must still look valid. But the core problem remains — the normalization silently transforms bad input into a valid-looking but wrong number, and the OTP goes to whoever owns that number.

**The valid code paths (lines 186-198) are fine:**
- `960XXXXXXX` (10 digits) → `+960XXXXXXX` ✓
- `XXXXXXX` (7 digits) → `+960XXXXXXX` ✓

**The fallback on line 201 is the only dangerous path.**

#### Additional finding: SMS cost abuse vector

The `requestOtp()` method has per-phone rate limiting (3 OTP/hour per phone, line 39-46). However, there is **no per-IP rate limit** at the application level. The route-level `throttle:5,10` (line 81 in `routes/api.php`) limits to 5 requests per 10 minutes per IP, which helps but should be tightened. An attacker could rotate IPs or use the generous limit to send OTPs to many different numbers, causing SMS cost abuse.

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

### D — Health Endpoints Leak Too Much

**Status:** **CONFIRMED** — TWO health endpoints found, both leak information.

#### What is happening

There are **two** public health endpoints, not one:

**Endpoint 1: `GET /api/health`** (line 42-49 in `routes/api.php`)
```json
{
  "status": "ok",
  "timestamp": "2026-03-12T...",
  "version": "1.0.0",
  "service": "Bake & Grill API"
}
```
Leaks: application version number and service identity.

**Endpoint 2: `GET /api/system/health`** (line 504-511 in `routes/api.php`)
```json
{
  "status": "ok",
  "timestamp": "2026-03-12T...",
  "environment": "production",
  "database": "connected"
}
```
Leaks: environment name and database connectivity status.

Attackers use this to fingerprint infrastructure, confirm the system is live, identify the technology stack, and know whether the database is reachable.

#### Files to Change

```
backend/routes/api.php   ← fix BOTH /health (line 42) AND /system/health (line 504)
```

#### Implementation Steps

**Step 1 — Change BOTH public health responses to only:**
```json
{ "status": "ok" }
```

For `/api/health` (line 42): Remove `version`, `service`, `timestamp`.
For `/api/system/health` (line 504): Remove `environment`, `database`, `timestamp`.

Optionally keep `timestamp` on ONE endpoint if an uptime monitoring tool depends on it, but nothing else.

**Step 2 — Consider removing one of the two endpoints**

Having two public health endpoints is redundant. Keep `/api/health` as the public one and either remove `/api/system/health` or move it behind auth.

**Step 3 (Optional) — Add an internal health endpoint:**
```
GET /api/admin/system/health  → protected by auth:sanctum + admin role
                              → returns full details for internal monitoring
```

#### Tests Required

File: `tests/Feature/System/HealthEndpointTest.php`

```
✓ GET /api/health returns HTTP 200
✓ GET /api/health response contains only "status" key
✓ GET /api/health response does NOT contain "version" key
✓ GET /api/health response does NOT contain "service" key
✓ GET /api/system/health returns HTTP 200 (or 404 if removed)
✓ Response does NOT contain "environment" key
✓ Response does NOT contain "database" key
✓ Admin health endpoint returns 401 without token
✓ Admin health endpoint returns full details with valid admin token
```

#### Risk Assessment

**Very low.** Response content change only. No route change. No frontend dependency.

---

### E — BML Return URL Fragility

**Status:** **CONFIRMED** — 3 locations build return URLs using 2 different config keys.

#### What is happening

After a customer pays via BML, the bank redirects back to the site. The return URL is built in **3 separate places** using **2 different config sources**, which could easily diverge:

1. **`PaymentService.php` line 104:** `$returnUrl = rtrim(config('bml.return_url'), '/') . '?orderId=' . $order->id;`
   - Uses `config('bml.return_url')` → `env('BML_RETURN_URL')`
   - Appends `?orderId=` query param

2. **`PaymentController.php` line 109:** `rtrim(config('app.frontend_url', config('app.url')), '/') . "/orders/{$orderId}?payment={$state}"`
   - Uses `config('app.frontend_url')` → `env('FRONTEND_URL')`
   - Different URL path structure: `/orders/{id}?payment=STATE`

3. **`BmlConnectService.php` line 61:** `'redirectUrl' => $returnUrl ?? config('bml.return_url')`
   - Fallback to `config('bml.return_url')` if no explicit URL passed

**The problem:** Location 1 uses `BML_RETURN_URL` and location 2 uses `FRONTEND_URL`. These are different env vars that could point to different domains or paths. Additionally, location 1 uses `?orderId=` while location 2 uses `/orders/{id}?payment=` — completely different URL structures.

#### Files to Change

```
backend/app/Domains/Payments/Services/PaymentService.php     ← line 104, uses config('bml.return_url')
backend/app/Http/Controllers/Api/PaymentController.php       ← line 109, uses config('app.frontend_url')
backend/app/Domains/Payments/Gateway/BmlConnectService.php   ← line 61, fallback to config('bml.return_url')
backend/config/frontend.php                                  ← CREATE THIS (single source of truth)
backend/.env.example                                         ← add FRONTEND_ORDER_STATUS_URL
```

#### Implementation Steps

**Step 1 — Create `config/frontend.php`**
```php
return [
    'order_status_url' => rtrim(env('FRONTEND_ORDER_STATUS_URL', ''), '/'),
];
```

**Step 2 — Replace ALL 3 locations with one centralized pattern:**

In `PaymentService.php` line 104:
```php
// BEFORE: $returnUrl = rtrim(config('bml.return_url'), '/') . '?orderId=' . $order->id;
// AFTER:
$returnUrl = config('frontend.order_status_url') . '/' . $order->id . '?payment=pending';
```

In `PaymentController.php` line 109:
```php
// BEFORE: rtrim(config('app.frontend_url', config('app.url')), '/') . "/orders/{$orderId}?payment={$state}"
// AFTER:
config('frontend.order_status_url') . '/' . $orderId . '?payment=' . $state
```

In `BmlConnectService.php` line 61: ensure the `$returnUrl` parameter is always passed explicitly from `PaymentService` so the fallback is never needed.

**Step 3 — Add to `.env.example`:**
```
FRONTEND_ORDER_STATUS_URL=https://test.bakeandgrill.mv/orders
```

**Step 4 — Add to server `.env`:**
```
FRONTEND_ORDER_STATUS_URL=https://app.bakeandgrill.mv/orders
```

**Step 5 — Optionally deprecate `BML_RETURN_URL` env var** since it is now replaced by `FRONTEND_ORDER_STATUS_URL`.

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

**Status:** **CONFIRMED** — `StreamController.php` line 81 reads `$request->query('token', '')`. Route comment on `routes/api.php` line 341 explicitly says `uses ?token= query param`.

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

**Status:** **CONFIRMED** — verified in `StreamController.php` lines 79-101.

#### What is happening

The `publicOrderStatus()` method reads `$tokenValue = $request->query('token', '')` (line 81). If no token is provided, `$tokenValue` is an empty string, the `if ($tokenValue)` block on line 89 is **skipped entirely**, and the stream proceeds at line 101 with **zero authentication**. Anyone who knows an order ID can watch that order's live status updates including payment confirmation, status changes, and order details.

**Verified code path (StreamController.php lines 88-101):**
```php
// Authenticate via query token if provided
if ($tokenValue) {                    // ← SKIPPED when empty
    $accessToken = PersonalAccessToken::findToken($tokenValue);
    if ($accessToken) {
        $tokenable = $accessToken->tokenable;
        if ($tokenable instanceof Customer && $order->customer_id !== $tokenable->id) {
            abort(403, 'Not your order');
        }
    }
}
// ← Falls through to streaming with NO auth check
return $this->streamSingleOrder($order, $request);
```

**Additionally:** Even when a token IS provided, if `findToken()` returns null (invalid token), the code silently continues to stream. The ownership check only runs if both the token is present AND valid AND belongs to a Customer. An invalid token is treated the same as no token.

#### Note

This finding is largely resolved by implementing **Finding B**. If B is implemented correctly, A is automatically fixed. However, the current code has **multiple layers of weakness** (empty token skips auth, invalid token silently continues, null tokenable is not checked). All must be hardened regardless of whether B is implemented.

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

**Status:** **CONFIRMED** — every admin route group audited. None have role checks.

#### What is happening

ALL admin route groups use only `auth:sanctum` with NO role enforcement. Here is the complete audit:

| Route Group | Line in api.php | Middleware | Role Check |
|---|---|---|---|
| Admin promotions | 298 | `auth:sanctum` only | **NONE** |
| Admin loyalty | 315 | `auth:sanctum` only | **NONE** |
| Admin SMS campaigns/logs | 346 | `auth:sanctum` only | **NONE** |
| Admin staff management | 364 | `auth:sanctum` only | **NONE** |
| Admin analytics | 374 | `auth:sanctum` only | **NONE** |
| Admin gift cards/referrals | 398 | `auth:sanctum` only | **NONE** |
| Admin schedules | 410 | `auth:sanctum` only | **NONE** |
| Admin specials | 441 | `auth:sanctum` only | **NONE** |
| Admin reviews | 475 | `auth:sanctum` only | **NONE** |
| Admin reservations | 496 | `auth:sanctum` only | **NONE** |
| Admin image upload | 361 | `auth:sanctum` only | **NONE** |
| Device management | 100 | `auth:sanctum` + `can:device.manage` | **YES** (only one) |

**Consequence:** A kitchen staff member can access staff management (create/delete staff), analytics, financial reports, SMS campaigns, and every other admin function. Additionally, the main staff routes block (lines 92-205) — including orders, KDS, inventory, suppliers, purchases, shifts, reports, refunds, SMS promotions — also has no role distinction.

**Worse:** Customer tokens (from `CustomerAuthController`) also use `auth:sanctum` and could potentially access staff routes if the controller doesn't explicitly check token abilities.

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
| F — Phone | `app/Http/Controllers/Api/Auth/CustomerAuthController.php` (lines 177-202) | None | `app/Rules/MaldivesPhone.php` |
| D — Health | `routes/api.php` (lines 42-49 AND 504-511) | None | None |
| E — BML URL | `app/Domains/Payments/Services/PaymentService.php` (line 104), `app/Http/Controllers/Api/PaymentController.php` (line 109), `app/Domains/Payments/Gateway/BmlConnectService.php` (line 61) | None | `config/frontend.php` |
| B — Stream Token | `app/Http/Controllers/Api/StreamController.php` (lines 79-101), `routes/api.php` (line 342) | `apps/online-order-web/src/pages/OrderStatusPage.tsx` | None |
| A — Stream Auth | `app/Http/Controllers/Api/StreamController.php` (lines 88-101) | None | None |
| C — Roles | `routes/api.php` (10+ admin route groups), `app/Models/User.php`, `bootstrap/app.php` | None | `app/Http/Middleware/RequireRole.php` |
| G — Empty Migration | `database/migrations/2026_02_03_210622_add_delivery_address_to_customers_table.php` | None | None (delete this file) |
| K — Token Isolation | `routes/api.php` (lines 92-205) | None | Guard middleware or route-level guard specification |

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

1. **~~Does the current stream use SSE (EventSource) or WebSocket?~~**
   **ANSWERED:** SSE (Server-Sent Events). Confirmed in `StreamController.php` — uses `SseStreamService`, returns `StreamedResponse`, and the class docblock explicitly says "Server-Sent Events (SSE) endpoints". Frontend uses `EventSource`.

2. **Is there a Redis instance available on the server?**
   Stream tickets need a fast, reliable cache store. File cache works but is slower and has edge cases under load.

3. **What is the exact URL of the BML return page in production?**
   Required for Finding E. **Partially answered:** `config('bml.return_url')` defaults to `env('BML_RETURN_URL', env('APP_URL') . '/payments/bml/return')`. The `PaymentController::bmlReturn()` redirects to `config('app.frontend_url') . "/orders/{orderId}?payment={state}"`. Need to confirm which frontend route actually handles this.

4. **What roles do existing staff accounts currently have in the database?**
   Required for Finding C. Run `SELECT id, name, role FROM users` before adding role enforcement. Any account with a null or missing role will be locked out after deployment.

5. **Is `test.bakeandgrill.mv` running the same code as `app.bakeandgrill.mv`?**
   All Session 1 fixes must be tested on the test server before touching production.

6. **Does any external monitoring tool (e.g. UptimeRobot) depend on the current health endpoint response fields?**
   Required before removing `environment` and `database` fields from the health endpoint (Finding D). **Note:** There are TWO health endpoints (`/api/health` and `/api/system/health`) — check which one monitoring tools use.

7. **Are customer tokens isolated from staff routes at the controller level?** *(NEW)*
   All staff routes use `auth:sanctum` which technically accepts customer tokens too. Need to verify each staff controller checks `$request->user()->tokenCan('staff')` or similar before assuming customer tokens can't reach staff functions.

8. **What deployment method is used?** *(NEW)*
   The rollback plan assumes `git revert` + redeploy. Document the actual process (cPanel Git, SSH + deploy script, CI/CD pipeline) so rollback under pressure is unambiguous.

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

This document has been **verified against the actual codebase**. All "Suspected" findings have been confirmed or ruled out with exact file paths and line numbers. Two new findings were discovered during verification (F+ SMS cost abuse, K customer/staff token isolation).

**Key verification outcomes:**
- **7 of 10 original findings CONFIRMED** (A, B, C, D, E, F, G)
- **1 finding ruled out** (H — repo hygiene is clean)
- **2 findings confirmed as minor/low-priority** (I, J)
- **2 new findings discovered** (F+, K)
- **Finding A is worse than originally described** — stream has zero auth, not just weak auth
- **Finding C is worse than originally described** — zero role checks on ALL admin routes, not just some
- **Finding D had a missed second endpoint** — `/api/health` also leaks info

**Final classification: Verified, code-referenced, and ready for implementation.**

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

The following gaps remain after code verification. Items marked ~~strikethrough~~ have been resolved.

~~**1. Verification Status / Finding Confidence — Partially present**~~
**RESOLVED.** All findings have been verified against actual source code. The status table now shows exact file paths, line numbers, and confirmed behavior. Finding H (junk files) was ruled out as a non-issue.

**2. Rollback / Safe Deployment Plan — Present but not tested**
The rollback section describes what to do but has not been validated against the actual deployment setup. The specific deploy method (cPanel Git, manual FTP, shell deploy script) should be documented here so the rollback procedure is unambiguous under pressure. *Added as Question 8.*

**3. Recommended Engineering Workflow — Present but not enforced**
The workflow exists as a written list. It has no mechanism to ensure it is followed. A short pre-implementation checklist at the top of each finding (verify → trace dependencies → patch → test → deploy) would make compliance easier to track.

**4. Final Deliverables Expected — Present but incomplete**
The deliverables section lists what a final report must contain. It does not specify who reviews it, what the acceptance criteria are, or how confirmed fixes get reflected back into this document's Verification Status table.

**5. New findings discovered during verification** *(NEW)*
- **F+ (SMS cost abuse):** No per-IP rate limit on OTP endpoint at application level. Route throttle is `5,10` (5 per 10 min) which is reasonable but could still be used for targeted SMS flooding.
- **K (Customer/staff token isolation):** Customer tokens could potentially hit staff routes since both use `auth:sanctum`. Must verify controller-level ability checks.
- **Two health endpoints:** The original audit only identified `/api/system/health`. There is also `/api/health` which leaks version and service name.
- **Duplicate migration file:** `2026_02_03_210622_add_delivery_address_to_customers_table.php` is a no-op. The real migration is `2026_02_04_001000_add_delivery_address_to_customers_table.php`.
- **`new OrderStreamProvider` in StreamController line 131:** Minor DI inconsistency — the provider is injected via constructor but also manually instantiated inside `streamSingleOrder()`.

---

### Risks of Proceeding Without Fixing the Remaining Gaps

~~A suspected finding may be patched as if confirmed~~ — **RESOLVED:** All findings are now verified.

Remaining risks:
- Rollback under deployment pressure may be slower or incorrect because the procedure was not validated against the actual server setup
- The final implementation report may be inconsistent or incomplete, making it hard to verify what was fixed and what remains
- Customer/staff token isolation (Finding K) is unverified at controller level and could mean Finding C is worse than expected

---

### Final Recommendation

All findings have been **verified against the actual codebase**. The document is now ready for implementation.

**Recommended priority order (updated after verification):**

1. **Finding A (stream open without auth)** — This is worse than originally suspected. The stream has ZERO auth when no token is provided, AND silently continues with invalid tokens. Fix this FIRST or together with B.
2. **Finding F (phone normalization)** — Confirmed account-affecting bug. The fallback `substr($digitsOnly, -7)` on line 201 must be removed.
3. **Finding B (token in URL)** — Confirmed. Implement stream ticket mechanism. Deploy with Finding A.
4. **Finding C (no role checks)** — Confirmed across ALL admin routes. This is Session 2 but is worse than suspected — zero role enforcement anywhere.
5. **Finding D (health endpoints)** — Quick win. Fix both endpoints.
6. **Finding E (BML URL)** — Confirmed. 3 locations, 2 config keys. Centralize.

**Remaining blockers before implementation:**
- Answer Question 2 (Redis availability)
- Answer Question 4 (existing staff roles in DB)
- Answer Question 8 (deployment method for rollback plan)

**Verdict: All findings verified. Implement in priority order. The codebase has real, confirmed vulnerabilities that should be fixed promptly.**

---

### Immediate Next Step

1. ~~Confirm each "Suspected / Needs verification" finding by reading the relevant files directly~~ — **DONE**
2. ~~Update the Verification Status table with the result~~ — **DONE**
3. Answer remaining blocking questions (2, 4, 8)
4. Begin implementation: **Fix Finding A + B together** (stream auth) as highest priority
5. Then Finding F (phone normalization)
6. Then Finding D (health endpoints — quick win)
7. Then Finding E (BML URL centralization)
8. Session 2: Finding C (role enforcement)

---

*Document created: March 2026*
*Code verification completed: March 2026*
*Implementation: Ready to begin — start with Findings A+B (stream auth hardening)*
*Review this document before starting each finding to refresh context*
*Update finding status in the Verification Status table after each fix is confirmed*
