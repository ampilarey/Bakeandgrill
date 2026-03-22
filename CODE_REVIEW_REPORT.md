# Bake & Grill — Code Review Report

**Date:** 2026-03-22
**Scope:** Full-stack audit — Frontend (React/TypeScript), Backend (Laravel/PHP), Database Migrations, Configuration & Security
**Applications Reviewed:** admin-dashboard, delivery-web, pos-web, online-order-web, kds-web, backend API

---

## Executive Summary

| Severity | Frontend | Backend / DB | Total |
|----------|----------|-------------|-------|
| Critical | 1        | 4           | **5** |
| High     | 5        | 12          | **17** |
| Medium   | 7        | 13          | **20** |
| Low      | 9        | 10          | **19** |
| **Total**| **22**   | **39**      | **61** |

---

## CRITICAL Issues

### C-1. XSS via `dangerouslySetInnerHTML` in HeroCarousel
**File:** `apps/online-order-web/src/components/HeroCarousel.tsx:106,112`
**Issue:** Slide title and subtitle are rendered with `dangerouslySetInnerHTML` using CMS data without sanitization.
```tsx
dangerouslySetInnerHTML={{ __html: slide.title }}
dangerouslySetInnerHTML={{ __html: slide.subtitle }}
```
**Risk:** If a CMS admin injects `<script>` tags or malicious HTML, it executes in every customer's browser.
**Fix:** Remove `dangerouslySetInnerHTML`; use plain text rendering. If rich HTML is required, sanitize with DOMPurify first.

### C-2. Missing `received_quantity` Column in `purchase_items` Migration
**File:** `backend/database/migrations/2026_01_27_193012_create_purchase_items_table.php`
**Issue:** The `PurchaseItem` model references `received_quantity` in its `$fillable` and `$casts`, but the migration never creates that column.
**Risk:** Any write to `received_quantity` will cause a database error at runtime.
**Fix:** Add `$table->decimal('received_quantity', 10, 4)->default(0);` to the migration (or create a new migration).

### C-3. Missing Foreign Key Constraint on `purchases.supplier_id`
**File:** `backend/database/migrations/2026_01_27_193011_create_purchases_table.php:18-19`
**Issue:** `supplier_id` is `foreignId()->nullable()` but never gets a `.constrained()` call. No separate FK migration exists.
**Risk:** Orphaned purchase records when suppliers are deleted; no referential integrity.
**Fix:** Add `->constrained('suppliers')->nullOnDelete()`.

### C-4. Missing `DB` Import Causes Fatal Error in Migration
**File:** `backend/database/migrations/2026_03_13_400000_create_multi_store_foundation.php`
**Issue:** Uses `DB::table('stores')->insert(...)` but never imports `use Illuminate\Support\Facades\DB;`.
**Risk:** Migration fails on execution with a fatal error, blocking all subsequent migrations.
**Fix:** Add the missing `use` statement at the top of the file.

### C-5. BML Webhook Signature Can Be Disabled via Env Variable
**File:** `backend/config/bml.php:50-53`
```php
'enforce_signature' => env('BML_ENFORCE_SIGNATURE', true),
```
**Risk:** Setting `BML_ENFORCE_SIGNATURE=false` completely disables webhook signature verification, allowing anyone to forge payment confirmations.
**Fix:** Remove the env toggle or log a prominent warning when disabled. Add defense-in-depth checks (e.g., verify amount matches order total).

---

## HIGH Issues

### H-1. Missing AbortSignal for Fetch Race Conditions
**Files:**
- `apps/online-order-web/src/components/OrderStatusBar.tsx:45-81`
- `apps/admin-dashboard/src/pages/OrdersPage.tsx:51-53`

**Issue:** `useEffect` hooks fetch data using `cancelled` flags but don't abort the underlying HTTP request. If dependencies change rapidly, stale responses can arrive after new ones.
**Fix:** Use `AbortController` and pass `signal` to fetch calls.

### H-2. EventSource Memory Leak
**File:** `apps/online-order-web/src/pages/OrderStatusPage.tsx:305-326`
**Issue:** EventSource connection has no timeout and may not clean up on all error paths before unmount.
**Fix:** Add connection timeout; verify cleanup in all code paths.

### H-3. Unsafe `JSON.parse` Without Schema Validation
**Files:**
- `apps/online-order-web/src/context/SiteSettingsContext.tsx:69,83`
- `apps/online-order-web/src/context/CartContext.tsx:36`
- `apps/online-order-web/src/hooks/useCheckout.ts:44`
- `apps/admin-dashboard/src/pages/TestChecklistPage.tsx:620`

**Issue:** `JSON.parse` on localStorage data is cast to TypeScript types without runtime validation. Corrupted or tampered data can cause runtime crashes.
**Fix:** Wrap in try/catch with fallback defaults, or validate with Zod.

### H-4. Offline Queue Race Condition (POS)
**File:** `apps/pos-web/src/offlineQueue.ts`
**Issue:** `enqueue()` reads then writes to localStorage without atomicity. Concurrent calls can corrupt the queue.
**Fix:** Use a mutex or migrate to IndexedDB for transactional writes.

### H-5. Missing Promise Error Handlers
**Files:**
- `apps/admin-order-web/src/pages/WebhooksPage.tsx:230`
- `apps/online-order-web/src/components/Layout.tsx:49-57`

**Issue:** `navigator.clipboard.writeText(...).then(...)` with no `.catch()` — silent failures confuse users.
**Fix:** Add `.catch()` handlers with user-facing feedback.

### H-6. Idempotency Key Scoping Issue
**Files:**
- `backend/database/migrations/2026_02_09_100500_create_promotions_tables.php:53,65`
- `backend/database/migrations/2026_02_09_100600_create_loyalty_tables.php:31-46`

**Issue:** `idempotency_key` is globally unique but should be scoped per-resource (e.g., `['order_id', 'idempotency_key']`). Different resources using the same key collide.
**Fix:** Change to composite unique constraint.

### H-7. Missing Indexes on Date Columns Used in Reports
**Files:** Multiple order/payment/invoice/customer migrations
**Issue:** `orders.paid_at`, `orders.completed_at`, `customers.created_at`, `invoices.created_at` lack indexes.
**Risk:** Report queries perform full table scans as data grows.
**Fix:** Add indexes via a new migration.

### H-8. SQL Injection Risk in `DB::raw` Interpolation
**File:** `backend/app/Console/Commands/ExpireLoyaltyHolds.php:32`
```php
'points_held' => DB::raw("MAX(0, points_held - {$pointsHeld})"),
```
**Issue:** While `$pointsHeld` is cast to `(int)` on line 28 (mitigating the risk), using string interpolation inside `DB::raw` is an anti-pattern that's one refactor away from a SQL injection.
**Fix:** Use parameterized expressions: `DB::raw('MAX(0, points_held - ?)')` with bindings.

### H-9. Weak Order Tracking Token Throttle
**File:** `backend/routes/api.php:47-48`
```php
Route::get('/orders/track/{token}', ...)->middleware('throttle:60,1');
```
**Issue:** 60 requests per minute per IP is generous enough for brute-force enumeration of tokens.
**Fix:** Reduce rate limit (e.g., 10 per minute), ensure tokens are sufficiently long (32+ chars), and add per-IP logging.

### H-10. `loyalty_holds.order_id` Unique Constraint Prevents Multiple Holds
**File:** `backend/database/migrations/2026_02_09_100600_create_loyalty_tables.php:52`
**Issue:** `order_id` has a UNIQUE constraint, meaning only one loyalty hold per order. If an order needs both loyalty + promo, only one can be tracked.
**Fix:** Remove the unique constraint or redesign as a one-to-many relationship.

### H-11. Missing Input Length Validation on Search Endpoints
**File:** `backend/app/Http/Controllers/Api/InventoryController.php:37-42`
**Issue:** Search parameter used in `LIKE` queries has no max length validation. Extremely long strings can cause resource exhaustion.
```php
$q->where('name', 'like', "%{$search}%")
```
**Fix:** Add `$request->validate(['search' => 'string|max:100'])` before query.

### H-12. Insecure File Path Derivation in ItemPhotoController
**File:** `backend/app/Http/Controllers/Api/ItemPhotoController.php:85-87`
**Issue:** File deletion path is derived from URL string manipulation rather than stored disk path.
```php
$relativePath = ltrim(str_replace(Storage::url(''), '', $photo->url), '/');
Storage::disk('public')->delete($relativePath);
```
**Risk:** If `Storage::url()` returns unexpected values, path traversal may be possible.
**Fix:** Store the disk-relative path in the database and use that directly.

### H-13. Inadequate Rate Limiting on Gift Card and Referral Endpoints
**File:** `backend/routes/api.php`
**Issue:** Public endpoints for gift card balance (`throttle:20,1`) and referral validation (`throttle:20,1`) allow 20 req/min — enough for code enumeration attacks.
**Fix:** Reduce to `throttle:5,1` and consider CAPTCHA after repeated failures.

### H-14. Missing Resource-Level Authorization on Invoice PDF
**File:** `backend/routes/api_finance.php:25`
**Issue:** `/{id}/pdf` endpoint is protected by `permission:finance.invoices` but doesn't verify the user has access to *this specific* invoice. Any user with the permission can download any invoice PDF.
**Fix:** Add `$this->authorize('view', $invoice)` policy check in the controller.

---

## MEDIUM Issues

### M-1. Dev PINs Hardcoded in Source
**Files:**
- `apps/admin-dashboard/src/pages/LoginPage.tsx:125-129`
- `apps/pos-web/src/pages/LoginPage.tsx:129-133`

Conditional on `import.meta.env.DEV`, but still in source control. Move to documentation or env-only config.

### M-2. Missing Error Boundary Reset
**Files:**
- `apps/admin-dashboard/src/components/ErrorBoundary.tsx`
- `apps/online-order-web/src/components/ErrorBoundary.tsx`

Only option is full page reload. Add component-level retry/reset.

### M-3. Cookie Domain Fails on `localhost`
**File:** `apps/online-order-web/src/context/AuthContext.tsx:29-33`
Domain calculation returns `'localhost'` which may not work for cookies in all browsers.

### M-4. Missing `maxLength` on User Inputs
**File:** `apps/online-order-web/src/components/ReviewForm.tsx:66`
Textarea accepts unlimited text. Add `maxLength` attribute.

### M-5. Timezone Inconsistency in Date Display
**File:** `apps/admin-dashboard/src/pages/OrdersPage.tsx:84`
`toLocaleString()` shows user's local timezone, not business timezone.

### M-6. Stock Quantities Use Integer Instead of Decimal
**File:** `backend/database/migrations/2026_02_03_191236_add_stock_management_to_items_table.php`
Cannot store fractional quantities (e.g., 2.5 kg flour).

### M-7. Missing Invoice Token Index
**File:** `backend/database/migrations/2026_03_22_100001_add_token_to_invoices_table.php`
Public invoice lookups via token (`/invoices/{token}`) may lack an index, causing slow lookups.

### M-8. `APP_DEBUG=true` in `.env.example`
**File:** `.env.example:4`
Developers may copy this to production, exposing stack traces and env vars.

### M-9. `MAIL_MAILER=log` in `.env.example`
**File:** `.env.example:50`
All transactional emails (OTP, receipts, invoices) silently go to logs in production if not changed.

### M-10. Missing Cascade for Soft-Deleted Orders
**File:** `backend/database/migrations/2026_01_27_193010_create_order_items_table.php`
`order_items` has `cascadeOnDelete()` for hard deletes, but soft-deleted orders still show their items.

### M-11. Missing Timestamp Columns on `invoice_items`
**File:** `backend/database/migrations/2026_03_12_100000_create_invoices_table.php:51-65`
No `created_at`/`updated_at`, making audit trails difficult.

### M-12. Webhook Log Index Not Optimized
**File:** `backend/database/migrations/2026_02_09_100400_create_webhook_logs_table.php:31`
Composite index `['gateway', 'gateway_event_id']` doesn't support lookups by `gateway_event_id` alone.

### M-13. Missing `promotion_targets.target_id` Reverse Index
**File:** `backend/database/migrations/2026_02_09_100500_create_promotions_tables.php:40-49`
Queries like "which promotions apply to item #42?" can't use the composite index efficiently.

### M-14. PIN Hash Storage Format Unclear
**File:** `backend/database/migrations/2026_01_27_192958_add_role_id_and_pin_to_users_table.php:18`
`pin_hash` is a plain string column — unclear if bcrypt/argon2 is enforced. 4-digit PINs have limited entropy.

### M-15. No HTTPS Enforcement on API Routes
**File:** `backend/routes/api.php`
No middleware to enforce HTTPS. Payment info and OTPs could be sent over HTTP.

### M-16. Missing `sms_logs` Customer Index
**File:** `backend/database/migrations/2026_02_09_300100_create_sms_logs_table.php`
No composite index on `(customer_id, created_at)` for SMS history queries.

### M-17. Weak Password Minimum Length
**File:** `backend/app/Http/Controllers/Api/CustomerProfileController.php:28`
**Issue:** Customer passwords only require 6 characters (`min:6`). NIST recommends minimum 8 characters.
**Fix:** Change to `min:8`.

### M-18. Case-Sensitive Email Uniqueness
**File:** `backend/app/Http/Controllers/Api/StaffController.php:64`
**Issue:** Email uniqueness check is case-sensitive. `Admin@Example.com` and `admin@example.com` could be registered as separate accounts.
**Fix:** Normalize to lowercase before storage, or use a case-insensitive unique rule.

### M-19. N+1 Query Pattern in Analytics Retention
**File:** `backend/app/Http/Controllers/Api/AnalyticsController.php:65-91`
**Issue:** Retention calculation iterates 12+ weeks with per-week lookups. Could be a single query using window functions.

### M-20. Information Disclosure via Gift Card Error Messages
**File:** `backend/app/Http/Controllers/Api/GiftCardController.php:24`
```php
return response()->json(['error' => 'This gift card is ' . $card->status . '.'], 422);
```
**Issue:** Reveals exact card status (active/expired/disabled), enabling enumeration.
**Fix:** Use generic message: `'This gift card cannot be used.'`

---

## LOW Issues

### L-1. Email Validation Regex Too Permissive
**File:** `apps/admin-dashboard/src/pages/StaffPage.tsx:81`
Simple regex accepts invalid emails. Use `email-validator` package or HTML5 validation.

### L-2. Missing `useCallback` on Cart Functions
**File:** `apps/pos-web/src/hooks/useCart.ts:47-62`
`addToCart` recreates on every render, causing unnecessary child re-renders.

### L-3. Deep Carousel Without Memoization
**File:** `apps/online-order-web/src/components/HeroCarousel.tsx:85-136`
Large slide maps recreated each render. Extract and memoize slide components.

### L-4. Missing Accessibility Labels
**Multiple components** — interactive elements lack `aria-label` attributes for screen readers.

### L-5. Unsafe Type Assertions
**File:** `apps/online-order-web/src/components/OrderStatusBar.tsx:19-29`
`res as Order[]` without runtime validation. API changes could silently break.

### L-6. ESLint Exhaustive-Deps Suppressed
**File:** `apps/online-order-web/src/components/OrderStatusBar.tsx:80-81`
`// eslint-disable-next-line react-hooks/exhaustive-deps` hides potential stale closure bugs.

### L-7. Device ID Stored Unencrypted
**File:** `apps/pos-web/src/App.tsx:25-30`
POS device ID in localStorage is readable via XSS.

### L-8. Missing Retry Logic for Menu Fetch
**File:** `apps/pos-web/src/hooks/useMenu.ts:18-27`
Network failures require manual page refresh. Add exponential backoff retry.

### L-9. Hardcoded Fallback API URLs
**Multiple files** — Fallback to `localhost:8000` in production if env var is missing. Should fail loudly instead.

### L-10. Default `hello@example.com` in Mail Config
**File:** `backend/config/mail.php:56`
Generic from address if not overridden. Transactional emails appear unprofessional.

### L-11. `.env.example` Uses SQLite by Default
**File:** `.env.example:23-28`
Docker uses PostgreSQL, but `.env.example` defaults to SQLite — confusing for new developers.

### L-12. Missing Audit Log Referential Integrity
**File:** `backend/database/migrations/2026_01_27_193017_create_audit_logs_table.php:20-21`
Polymorphic `model_id`/`model_type` have no foreign key. Orphaned records possible.

### L-13. Missing `Order->store()` Relationship
**File:** `backend/app/Models/Order.php`
Has `store_id` column but no `store()` relationship method defined.

### L-14. Silently Skipped Migrations on Fresh Setup
**File:** `backend/database/migrations/2026_03_13_400000_create_multi_store_foundation.php:44`
`Schema::hasTable()` checks skip column additions if tables don't exist yet, which can leave fresh installs incomplete.

### L-15. Missing Date Validation on Query Parameters
**File:** `apps/delivery-web/src/api.ts:50-54`
User-provided date string is interpolated into URL without ISO format validation.

### L-16. Inline Route Closures Bypass Controller Patterns
**File:** `backend/routes/api_finance.php:78-82`
**Issue:** Some admin routes use inline closures instead of controllers. Harder to maintain and lacks centralized error handling.
**Fix:** Extract to dedicated controller methods.

### L-17. Missing Audit Logging on Staff PIN Resets
**File:** `backend/app/Http/Controllers/Api/StaffController.php`
**Issue:** Sensitive operations like PIN resets may not be logged via `AuditLogService`.
**Fix:** Add audit logging for all staff credential changes.

### L-18. Inconsistent Authorization Patterns (tokenCan vs Policies)
**Multiple controllers** mix middleware-based auth with inline `tokenCan()` checks. Consider standardizing on Laravel Policies for resource-level authorization.

### L-19. `selectRaw` Pattern Fragile to Future Refactoring
**Files:**
- `backend/app/Http/Controllers/Api/AnalyticsController.php:25-35`
- `backend/app/Http/Controllers/Api/FinanceReportController.php:163-174`
- `backend/app/Http/Controllers/Api/ForecastController.php:27-38`

**Issue:** Database-driver-specific expressions via `match(DB::getDriverName())` are interpolated into `selectRaw()`/`groupByRaw()`. Currently safe (hardcoded values), but the pattern is one refactor away from SQL injection if user input is ever added.
**Fix:** Add code comments marking these as security-sensitive; consider using query builder abstractions.

---

## Positive Findings

The codebase demonstrates several strong security practices:
- Proper Sanctum token abilities (staff vs customer separation)
- Good middleware layering (EnsureStaffToken, EnsureCustomerToken, permission middleware)
- Mass assignment protection via `$fillable` arrays
- Password hashing via `Hash::make()`
- One-time-use stream tickets for SSE security
- HMAC signature verification for BML webhooks
- SQL parameterization via query builder (no direct string concatenation in user-facing queries)
- Proper use of DB transactions with row locking for payment race conditions
- Request validation through FormRequest classes
- Comprehensive audit logging for order/payment operations

---

## Prioritized Remediation Plan

### Week 1 — Critical & High Security
1. Remove `dangerouslySetInnerHTML` from HeroCarousel (C-1)
2. Add `received_quantity` column migration (C-2)
3. Fix `DB` import in multi-store migration (C-4)
4. Add webhook signature enforcement safeguards (C-5)
5. Replace `DB::raw` interpolation with parameterized queries (H-8)
6. Reduce tracking token rate limit (H-9)

### Week 2 — High Stability
7. Add `AbortController` to all fetch-in-useEffect patterns (H-1)
8. Fix offline queue race condition (H-4)
9. Add promise error handlers (H-5)
10. Fix idempotency key scoping (H-6)
11. Add missing database indexes (H-7)
12. Add foreign key on `purchases.supplier_id` (C-3)

### Week 3 — Medium Improvements
13. Fix `.env.example` defaults (M-8, M-9, L-11)
14. Add HTTPS enforcement (M-15)
15. Change stock quantity to decimal (M-6)
16. Add missing indexes (M-7, M-12, M-13, M-16)
17. Add `maxLength` to all text inputs (M-4)

### Ongoing
18. Add accessibility labels across all apps (L-4)
19. Add runtime schema validation for parsed data (H-3)
20. Add retry logic to critical API calls (L-8)

---

*Report generated by automated code review on 2026-03-22.*
