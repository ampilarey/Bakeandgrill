# Bake & Grill — Final Production Audit Report

**Generated:** 2026-04-10  
**Auditor:** Automated code audit + patch pass  
**Scope:** Post-previous-fixes audit focusing on deployment flow, public endpoint security, auth throttling, and test coverage.

---

## 1. What Was Already Fixed

All items below were verified by reading actual code, not assumed from prior reports.

| Item | Verified by |
|------|------------|
| **Promo auth matrix** — staff `promotions.discounts` permission enforced in `applyToOrder` and `removeFromOrder` | `PromotionController.php` lines 93–103, 167–175 |
| **Promo race condition** — `lockForUpdate` inside `DB::transaction` in both `applyToOrder` and `removeFromOrder` | `PromotionController.php` lines 126, 196 |
| **CustomerDisplayController column names** — `tax_amount`, `discount_amount`, `tip_amount` correctly selected and mapped | `CustomerDisplayController.php` line 30 |
| **Staff PIN auth** — `username` (email) field required, rate limit `5/15min` per `phone+IP`, tests updated | `StaffAuthController.php` lines 23–56, `StaffAuthTest.php` |
| **`$printReceipt` closure scope** — `OrderController::addPayments` transaction closure now captures `$printReceipt` | `OrderController.php` ~line 197 |
| **Migration SQLite compat** — `UPDATE ... JOIN` replaced with correlated subquery; `dropUnique` before `dropColumn` | `2026_03_22_100000_remove_guest_fields_from_orders_table.php` |
| **`PermissionSeeder`** — `promotions.view` and `promotions.discounts` added to `STAFF_GRANTED` | `PermissionSeeder.php` |
| **All 5 frontend apps in CI** — type-check + build for `online-order-web`, `admin-dashboard`, `pos-web`, `kds-web`, `delivery-web` | `.github/workflows/ci.yml` `frontend` job |
| **Frontend assets in repo** — `backend/public/{order,admin,kds,pos,driver}/` committed and deployed via `git pull` | `scripts/build-all.sh`, `scripts/publish.sh` |
| **All new admin pages** — sidebar nav, routes, and API functions for Gift Cards, Reviews, Specials, Refunds, Waste Logs, Inventory, etc. | `navConfig.ts`, `App.tsx`, `api/*.ts` |

---

## 2. Confirmed Remaining Issues (found in this audit)

### Issue 1 — Public display endpoint used guessable `order_number`
- **Severity:** High (privacy / enumeration)
- **Affected files:** `backend/app/Http/Controllers/Api/CustomerDisplayController.php`, `backend/routes/api.php`
- **Root cause:** `GET /api/display/{orderNumber}` looked up orders by `order_number` (e.g. `BG-0042`) — a sequential, low-entropy identifier. Any actor who could guess or increment the number could poll live in-progress orders and see line items and totals without authentication.
- **Verified:** Controller used `->where('order_number', $orderNumber)` on a public, unauthenticated route. The `tracking_token` column (32-char random, set on every order create via `Order::booted()`) existed but was never used by this endpoint.

### Issue 2 — CI `deploy` job did not require `contract` tests
- **Severity:** Medium (deployment footgun)
- **Affected files:** `.github/workflows/ci.yml`
- **Root cause:** `deploy` had `needs: [frontend, test]` — contract tests ran in parallel with deploy and a contract failure would not block production deployment.
- **Verified:** CI YAML line 145 confirmed `needs: [frontend, test]`; `contract` job was a sibling, not a prerequisite.

### Issue 3 — `passwordLogin` had no controller-level rate limiter
- **Severity:** Medium (brute-force risk)
- **Affected files:** `backend/app/Http/Controllers/Api/Auth/CustomerAuthController.php`
- **Root cause:** Route-level `throttle:5,5` was present but applies to any IP broadly. No per-`phone+IP` key tracked consecutive failures, so a single attacker on a rotating IP could attempt far more than 5 guesses before hitting the route throttle.
- **Verified:** `passwordLogin` had no `RateLimiter` call; compared to `StaffAuthController::pinLogin` which does use `RateLimiter::hit($rateKey, 900)`.

---

## 3. Fixes Applied

### Fix 1 — Display endpoint hardened to use `tracking_token`

**`backend/app/Http/Controllers/Api/CustomerDisplayController.php`**
- Route parameter renamed from `$orderNumber` to `$token`
- Query changed from `->where('order_number', $orderNumber)` to `->where('tracking_token', $token)`
- `tracking_token` added to `select()` so the model loads the token for the `whereIn` check
- Docblock updated to document the security intent
- API behavior change: **breaking** — any client using `/api/display/{order_number}` must switch to `/api/display/{tracking_token}`. The POS screen URL displayed to customers must be updated to use the token. The token is always available on the `Order` object at creation time.

**`backend/routes/api.php`**
- Route path changed from `/display/{orderNumber}` to `/display/{token}`
- Comment added explaining why token is used

**`apps/admin-dashboard/src/pages/TestChecklistPage.tsx`**
- Checklist label updated from `:orderNumber` to `:trackingToken` for documentation accuracy

### Fix 2 — CI deploy now requires contract tests

**`.github/workflows/ci.yml`**
- `deploy.needs` changed from `[frontend, test]` to `[frontend, test, contract]`
- A contract test failure now blocks production deployment

### Fix 3 — `passwordLogin` controller-level rate limiter

**`backend/app/Http/Controllers/Api/Auth/CustomerAuthController.php`**
- Added `RateLimiter::tooManyAttempts('customer-login:{phone}:{ip}', 5)` check before password verification
- Failed attempts call `RateLimiter::hit($rateKey, 900)` (15-minute decay)
- Successful login calls `RateLimiter::clear($rateKey)`
- Lockout message: `"Too many login attempts. Try again in N minutes."`
- No API behavior change for successful logins; failed logins beyond 5 now get a friendly 422 before the route's 429.

---

## 4. Public Endpoint Hardening

### `/api/display/{token}` (was `/{orderNumber}`)

| Property | Before | After |
|----------|--------|-------|
| Lookup key | `order_number` (sequential, e.g. `BG-0042`) | `tracking_token` (32-char random alphanumeric) |
| Enumeration risk | High — increment integer suffix to enumerate all live orders | None — token has ~10^47 search space |
| Fields returned | Same minimal set | Same — no customer PII exposed |
| Status filter | Only in-progress statuses returned | Unchanged |
| Throttle | 60 req/min | Unchanged |

**Migration / deprecation:** No migration needed — `tracking_token` has existed on all orders since `2026_03_21_100000_add_tracking_token_to_orders.php`. The column is non-null and has a unique index. The only required operational change is that the POS app must pass the token (not order_number) when constructing the customer display screen URL. The old `/display/{order_number}` URL format will now return 404 for any valid order number, which is the desired behavior.

**Backward compatibility:** **Breaking for any existing customer display screens** currently constructed with order_number URLs. Update the POS display URL to use `order.tracking_token`.

---

## 5. Deployment / Frontend Asset Flow

### Current flow (unchanged — verified correct)

```
Developer machine:
  ./scripts/build-all.sh        ← builds all 5 apps, copies to backend/public/
  git add backend/public/ && git commit && git push

CI (on every push/PR to main):
  1. secret-scan (Gitleaks)
  2. lint (Pint)          ← needs: secret-scan
  3. test (PHPUnit)       ← needs: lint
  4. contract             ← needs: test       [NOW GATES DEPLOY]
  5. frontend (tsc+build) ← needs: secret-scan
  6. deploy (SSH)         ← needs: frontend, test, contract [FIXED]

Server (on deploy):
  git pull origin main
  composer install --no-dev --optimize-autoloader
  php artisan migrate --force
  php artisan config:cache && route:cache && view:clear
  php artisan queue:restart
```

**What changed:** `deploy` now requires `contract` to pass. Frontend assets are pre-built and committed — the server only does `git pull`, never rebuilds. This is deterministic: the assets in the repo are exactly what runs in production.

**Remaining note:** `build-all.sh` uses `declare -A` which requires bash 4+. macOS ships with bash 3. Run this script in CI, Docker, or on Linux. On macOS use `bash-4` from Homebrew or run each build step manually (as done in CI).

---

## 6. Tests Added or Updated

### `backend/tests/Feature/CustomerDisplayTest.php` (rewritten)
15 tests covering:
- `test_display_endpoint_returns_200_for_active_order_via_token` — valid token works
- `test_display_endpoint_returns_correct_order_number_in_body` — order_number still in response body
- `test_display_response_does_not_expose_tracking_token` — token not echoed in response
- `test_display_response_does_not_expose_customer_id` — no PII in response
- `test_display_endpoint_rejects_order_number_as_lookup_key` — old format rejected (404)
- `test_display_endpoint_returns_non_null_numeric_totals` — column mapping correct
- `test_display_endpoint_includes_line_items` — items array present and shaped correctly
- `test_display_endpoint_returns_404_for_unknown_token` — random token → 404
- Terminal state tests (completed, cancelled, paid → 404)
- Active state tests (pending, ready → 200)
- `test_order_has_tracking_token_set_on_creation` — booted() sets token
- `test_two_orders_have_different_tracking_tokens` — uniqueness guaranteed

### `backend/tests/Feature/CustomerPasswordLoginTest.php` (new)
7 tests covering:
- `test_customer_can_login_with_correct_password` — happy path
- `test_wrong_password_returns_422` — wrong credential rejected
- `test_unknown_phone_returns_422` — non-existent account rejected
- `test_inactive_customer_cannot_login` — deactivated account blocked
- `test_rate_limiter_locks_out_after_five_failed_attempts` — lockout occurs (422 or 429)
- `test_login_works_after_limiter_is_cleared` — recovery after cooldown works
- `test_successful_login_clears_rate_limiter` — success resets failure counter

---

## 7. Docs / QA Alignment

| Item | Status |
|------|--------|
| `QA-REPORT.md` is at repo root, not `docs/` | Acceptable — not moved (would break any links) |
| `docs/REMAINING_PRODUCTION_FIX_REPORT.md` | Accurate for items it covers |
| `TestChecklistPage.tsx` checklist label | Updated from `:orderNumber` to `:trackingToken` |
| `backend/routes/api.php` display route comment | Updated to explain token-based lookup |
| `CustomerDisplayController.php` docblock | Updated to document security intent |
| `.cursor/rules/deploy-commands.mdc` | Quick/full deploy commands still accurate |

---

## 8. Remaining Risks

### Low — `DeliveryOrderTest` pre-existing failure
- `tests/Feature/DeliveryOrderTest.php` fails because the test uses `delivery_contact_phone: '+9601234567'` which starts with `1` — failing the controller's regex `^(\+?960)?[379]\d{6}$` that only allows Maldivian prefixes 3, 7, 9.
- **Not introduced by this audit.** Confirmed pre-existing by `git stash` verification.
- **Fix:** Update the test to use a valid Maldivian number (e.g. `+9607890123`) — out of scope for this audit pass.

### Low — `contract` tests are not parallelized with `frontend`
- `contract` runs after `test` (correct), but the deploy pipeline is now ~2 min longer because `contract` must complete before deploy starts.
- Acceptable trade-off for correctness.

### Low — bash 4 requirement for `build-all.sh`
- macOS ships bash 3. `declare -A` (associative arrays) requires bash 4.
- **Workaround:** Always build via CI (Linux), not locally on macOS. Or install bash 4 via Homebrew.
- Not changed — fix is user-facing environment setup, not a code bug.

### Low — BML webhook signature enforcement disabled in non-production
- `bml.enforce_signature` is relaxed in non-production: bad signatures are logged but still processed.
- **Intentional** — allows testing without real BML credentials.
- **Action required before launch:** Set `BML_WEBHOOK_SECRET` in production `.env` and verify `BML_ENFORCE_SIGNATURE=true`.

### Low — OTP accumulation in `otp_verifications` table
- `sendOtp` creates a new row per request; old rows are not cleaned up.
- `verifyAndConsumeOtp` takes the latest valid row — correct.
- Old rows accumulate until a database cleanup job runs.
- **Recommend:** Add a scheduled command to prune `otp_verifications` older than 1 hour.

---

## 9. Manual Verification Checklist

### Display endpoint
- [ ] Create an order via POS, note the `tracking_token` from the API response
- [ ] Open `/api/display/{tracking_token}` — expect 200 with order data
- [ ] Try `/api/display/{order_number}` (e.g. `BG-0001`) — expect 404
- [ ] Try `/api/display/randomgarbage` — expect 404
- [ ] Complete the order (mark paid), then try the token — expect 404

### Password login throttle
- [ ] Call `POST /api/auth/customer/login` with wrong password 5 times
- [ ] 6th attempt should return 422 (controller lockout) or 429 (route throttle)
- [ ] Wait 15 minutes (or clear the cache key in Redis) — login should work again

### CI pipeline
- [ ] Merge a PR to `main` — verify all 6 jobs run in order
- [ ] Intentionally break a contract test — verify `deploy` job is skipped/blocked
- [ ] Confirm production was not updated when contract failed

### Production deploy
- [ ] After `git push`, confirm server runs `git pull` and serves new assets
- [ ] Verify `backend/public/admin/` contains latest admin build
- [ ] Verify `backend/public/driver/` contains latest delivery app build

### BML production readiness
- [ ] Confirm `BML_WEBHOOK_SECRET` is set in production `.env`
- [ ] Confirm `BML_ENFORCE_SIGNATURE=true` (or equivalent) in production
- [ ] Test a real payment end-to-end in staging before go-live
