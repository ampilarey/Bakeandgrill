# Pre-Production Bug Audit — Bake & Grill
*Audit Date: April 2026*  

> **STATUS: ALL 9 BUGS FIXED** — The final verdict at the bottom of this document ("Close, but needs fixes")
> refers to the state *before* the fixes documented within. All 9 bugs were fixed in the same session.
> For current UAT status, see: **CURRENT_UAT_STATUS.md**

---

## Executive Summary

A deep, aggressive audit was performed across the entire Bake & Grill monorepo — backend PHP (Laravel), admin dashboard (React/TS), and customer ordering app (React/TS). The audit covered order creation, payment flows, promotion logic, stock management, queue jobs, scheduled commands, auth, real-time streams, and frontend error handling.

**9 real bugs were found and fixed.** An additional 8 significant risks were identified and documented for manual review. No critical payment or data-corruption bugs were found in the core checkout path, but several high-severity issues existed in queue jobs, the scheduler, and the kitchen display system.

**Verdict: Close — but needs the fixes below before production.**

---

## Bugs Fixed (9 total)

---

### BUG-01 · `SendSmsCampaignRecipientJob` crashes when campaign is deleted
**Severity:** High  
**File:** `backend/app/Domains/Notifications/Jobs/SendSmsCampaignRecipientJob.php`

**What failed:**  
The job accessed `$this->recipient->campaign` as a relation on the serialised model. If the campaign row was deleted between dispatch and execution (or the relation was null for any reason):
- `$campaign->message` → fatal `null` dereference
- The `catch` block then crashed again with `$campaign->id` on a `null`
- The `finally` block crashed a third time calling `$campaign->updateStats()`, making the job unrecoverable and poisoning the queue

**Fix:** Re-load campaign fresh via `SmsCampaign::find()` at the top of `handle()`. If not found, mark recipient failed and return early without rethrowing (no point retrying a deleted campaign).

---

### BUG-02 · `SmsSchedulerService` dispatches duplicate SMS under concurrent runs
**Severity:** High  
**File:** `backend/app/Domains/Sms/Services/SmsSchedulerService.php`

**What failed:**  
`dispatchDue()` fetched due rows with a plain `get()`, then dispatched a job and updated `next_send_at` outside any transaction. If two cron processes ran within the same minute window:
1. Both selected the same rows
2. Both dispatched jobs for the same `id`
3. The second update just overwrote the first, but two `SendScheduledSmsJob` were already in the queue

**Fix:** Wrapped each row in its own `DB::transaction()` with `lockForUpdate()`. The row is advanced/completed **before** the job is dispatched so a second concurrent process sees the already-updated cursor and skips.

---

### BUG-03 · `GenerateRecurringExpenses` duplicates expenses under concurrent runs
**Severity:** Medium–High  
**File:** `backend/app/Console/Commands/GenerateRecurringExpenses.php`

**What failed:**  
Same pattern as BUG-02. The command fetched all due recurring expenses, then created child expenses and updated `next_recurrence_date` sequentially with no locking. Two overlapping cron runs could generate two expense rows for the same parent in the same billing cycle.

**Fix:** Collect IDs first, then wrap each parent in `DB::transaction()` with `lockForUpdate()`. Advance `next_recurrence_date` **inside** the transaction before creating the child, so a second run's lock acquisition sees the already-advanced date.

---

### BUG-04 · KDS page silently drops `preparing` orders — never shown in any column
**Severity:** High  
**Files:** `backend/app/Domains/Realtime/Services/KdsStreamProvider.php`, `apps/admin-dashboard/src/pages/KDSPage.tsx`

**What failed:**  
The `OrderStatus::Preparing` enum value (`'preparing'`) is used in POS/customer-display flows and in `WaitTimeController`. However:
- `KdsStreamProvider::KDS_STATUSES` was `['pending', 'in_progress', 'paid']` — `preparing` orders were **never streamed to the KDS**
- `KDSPage.tsx` cooking column filtered only `t.status === 'in_progress'` — even if a `preparing` order somehow arrived, it would not appear in any column

Any order reaching `preparing` status is completely invisible to kitchen staff.

**Fix:** Added `'preparing'` to `KDS_STATUSES` in the backend stream provider, and added it to the `cooking` column filter in the KDS frontend alongside `in_progress`.

---

### BUG-05 · Admin panel: expired session leaves staff on broken page (no auto-redirect)
**Severity:** High  
**File:** `apps/admin-dashboard/src/App.tsx`

**What failed:**  
The shared API client dispatches a global `'auth_expired'` window event on every 401 response. The online-order and delivery-web apps both listen for this and redirect to login. The **admin dashboard** had no listener. When a staff token expired mid-session, every subsequent API call would silently fail with "Session expired" errors on each page, leaving the user on a broken screen with no clear path to re-authenticate.

**Fix:** Added a `window.addEventListener('auth_expired', …)` in `App.tsx`'s `useEffect` that clears the token, resets user state, and navigates to `/login`.

---

### BUG-06 · SSE hook never passes `Last-Event-Id` on reconnect — loses cursor after disconnect
**Severity:** Medium  
**File:** `apps/admin-dashboard/src/hooks/useSse.ts`

**What failed:**  
The `useSse` hook tracked `curId` locally inside the `connect()` function. On reconnect, it attempted to read `_lastId` from an `AbortController` hack — but `_lastId` was **never set**. Every reconnect started from `id=''`, causing the backend to replay all recent orders from the beginning. Under a bad network, this could cause bursts of duplicate event processing.

**Fix:** Added a `lastEventId` `useRef` to persist the last received event ID across reconnects. Both the retry call and the initial call now correctly pass this cursor to the backend.

---

### BUG-07 · Applying a promo to a `partial` order can make total < amount already paid
**Severity:** High  
**File:** `backend/app/Http/Controllers/Api/PromotionController.php`

**What failed:**  
The `applyToOrder` method blocked `paid`, `completed`, and `cancelled` orders — but **not `partial`**. A `partial` order has already had some payment collected. Applying a discount that lowers the total below the collected amount creates an unsolvable accounting discrepancy (negative amount due, broken split-tender flows).

**Fix:** Added `'partial'` to the blocked statuses in both the pre-check (line 107) and the in-transaction re-check (line 131) of `applyToOrder`. The `removeFromOrder` path is **not** blocked — removing a promo from a partial order increases the total, which is safe.

---

### BUG-08 · `InvoicesPage` sends `NaN` for `tax_rate_bp` when user types invalid input
**Severity:** Medium  
**File:** `apps/admin-dashboard/src/pages/InvoicesPage.tsx`

**What failed:**  
When creating a manual invoice, `tax_rate_bp` was sent as `parseInt(manualForm.tax_rate_bp)`. If the field contained a non-numeric string (e.g. a partially-typed number), `parseInt` returns `NaN`, which is serialised by `JSON.stringify` as `null` and sent to the API without validation.

**Fix:** Added an `isNaN` guard — if parsed value is `NaN`, send `undefined` (field omitted) instead.

---

### BUG-09 · `SendStaffNotificationJob` treats `demo` SMS as a failure, breaking idempotency
**Severity:** Medium  
**File:** `backend/app/Domains/Sms/Jobs/SendStaffNotificationJob.php`

**What failed:**  
All other SMS jobs (`SendSmsCampaignRecipientJob`, `SendSmsPromotionRecipient`) treat `demo` status as success. This job used `=== 'sent'` strictly, so on staging/local environments every staff notification appeared as `failed` in the log. Additionally, the idempotency dedup check only skipped if `status === 'sent'`, so a `demo`-status notification would be retried on the next job run.

**Fix:** Changed status comparison to `in_array($smsLog->status, ['sent', 'demo'], true)` in both the log update and the idempotency check. Also extracted `$success` variable to avoid duplication.

---

## Remaining Risks (documented, not fixed)

These were identified as real issues but require careful architectural review before changing. Forcing a patch would be higher risk than leaving them documented.

---

### RISK-01 · Two competing total calculation models (OrderCreationService vs OrderTotalsCalculator)
**Severity:** High  
**Files:** `backend/app/Services/OrderCreationService.php`, `backend/app/Domains/Orders/Services/OrderTotalsCalculator.php`

**What:** `OrderCreationService::createFromPayload()` computes totals inline with its own tax-then-discount logic. `OrderTotalsCalculator::recalculateAndPersist()` uses a different formula (discount first, then tax). Any flow that creates via the service and then applies a promo via the calculator (which calls `recalculateAndPersist`) will produce a different total than the original creation — taxes and discounts diverge by the order of operations.

**Recommendation:** Standardise all order total calculations through `OrderTotalsCalculator`. The service should not compute its own totals but instead call the calculator after assembling line items.

---

### RISK-02 · Promotion per-user usage limit can be exceeded via multiple concurrent unpaid orders
**Severity:** High  
**Files:** `backend/app/Domains/Promotions/Services/PromotionEvaluator.php`, `backend/app/Domains/Promotions/Listeners/ConsumePromoRedemptionsListener.php`

**What:** `evaluate()` checks `PromotionRedemption` rows (created on `OrderPaid`). A customer can open 5 separate carts, apply a "once per customer" promo to all 5 before any of them are paid, and each will pass validation. All 5 are only consumed at payment time, by which point `max_uses_per_customer` may be long exceeded.

**Recommendation:** Count **pending `OrderPromotion` rows** (status `draft`) alongside confirmed `PromotionRedemption` rows when evaluating per-customer limits.

---

### RISK-03 · Delivery order totals can be inconsistent with calculator fields
**Severity:** Medium  
**File:** `backend/app/Http/Controllers/Api/DeliveryOrderController.php`

**What:** After creating a delivery order, the controller manually patches `total` and `total_laar` with the delivery fee rather than calling `recalculateAndPersist()`. Fields like `subtotal_laar` and `tax_laar` are then never updated. If the calculator is later called (e.g. promo applied), it recomputes from subtotal — without the delivery fee — producing a lower total.

**Recommendation:** Integrate delivery fee into `OrderTotalsCalculator` as a `delivery_fee_laar` component, or call `recalculateAndPersist()` with the fee included after creation.

---

### RISK-04 · Full refund does not restore variant-tracked stock
**Severity:** Medium  
**File:** `backend/app/Http/Controllers/Api/RefundController.php`

**What:** The full-refund stock restore loop checks `$item->track_stock && $item->availability_type === 'stock_based'`. Items with `Variant::track_stock = true` (variant-level tracking) are skipped entirely — their stock is never restored on refund.

**Recommendation:** Check variant `track_stock` in addition to item-level `track_stock` and call the appropriate restore method (`restorePreparedStock` on the variant).

---

### RISK-05 · Stock deduction can go below zero (no floor guard)
**Severity:** Medium  
**Files:** `backend/app/Services/StockManagementService.php`

**What:** `deductPreparedStock()` calls `decrement()` without checking the resulting balance. Admin stock adjustments or bugs can put stock in a state where it goes negative during order deduction, leading to incorrect inventory figures.

**Recommendation:** Add a `max(0, quantity)` floor in the decrement, or add a DB CHECK constraint, and log a critical warning when a deduction would bring stock negative.

---

### RISK-06 · `OrderStatusMachine` and `PaymentConfirmedListener` use conflicting transition maps
**Severity:** Medium  
**Files:** `backend/app/Services/OrderStatusMachine.php`, `backend/app/Domains/Payments/Listeners/PaymentConfirmedListener.php`

**What:** The payment listener moves `payment_pending → pending` when online payment confirms. This transition is **not** in `OrderStatusMachine::TRANSITIONS`. The state machine is not called in the payment listener, but any future hardening that routes the listener through the machine would immediately break online checkout.

**Recommendation:** Add `payment_pending → pending` to `OrderStatusMachine::TRANSITIONS`, and add a comment explaining it is only used by the payment confirmation listener, not KDS.

---

### RISK-07 · `FinanceReportController` accounts payable/receivable queries are unbounded
**Severity:** Medium  
**File:** `backend/app/Http/Controllers/Api/FinanceReportController.php`

**What:** `accountsPayable()` and `accountsReceivable()` load **all matching invoices** with `->get()` — no pagination. Under production load with hundreds of unpaid invoices, these endpoints will exhaust PHP memory.

**Recommendation:** Add pagination (`->paginate(100)`) or at minimum a hard `->limit(500)` with a warning in the response when truncated.

---

### RISK-08 · `AnalyticsController::retention()` loads all orders in date range into memory
**Severity:** Medium  
**File:** `backend/app/Http/Controllers/Api/AnalyticsController.php`

**What:** `retention()` fetches all orders with a customer in the selected range via `->get()` and loops over them in nested weekly iterations. For a busy restaurant with 10,000+ orders over a 90-day range, this will consume significant memory.

**Recommendation:** Rewrite as a DB-side aggregate query (GROUP BY week, customer_id) rather than loading the full result set into PHP.

---

## Files Changed

| File | Change |
|------|--------|
| `backend/app/Domains/Notifications/Jobs/SendSmsCampaignRecipientJob.php` | BUG-01: null campaign guard, fresh DB reload |
| `backend/app/Domains/Sms/Services/SmsSchedulerService.php` | BUG-02: row-level locking to prevent duplicate dispatch |
| `backend/app/Console/Commands/GenerateRecurringExpenses.php` | BUG-03: row-level locking to prevent duplicate expense creation |
| `backend/app/Domains/Realtime/Services/KdsStreamProvider.php` | BUG-04: add `preparing` to KDS stream statuses |
| `apps/admin-dashboard/src/pages/KDSPage.tsx` | BUG-04: add `preparing` to cooking column filter |
| `apps/admin-dashboard/src/App.tsx` | BUG-05: listen for `auth_expired` and redirect to login |
| `apps/admin-dashboard/src/hooks/useSse.ts` | BUG-06: persist and pass last event ID on reconnect |
| `backend/app/Http/Controllers/Api/PromotionController.php` | BUG-07: block promo apply on `partial` orders |
| `apps/admin-dashboard/src/pages/InvoicesPage.tsx` | BUG-08: guard `parseInt` NaN for `tax_rate_bp` |
| `backend/app/Domains/Sms/Jobs/SendStaffNotificationJob.php` | BUG-09: treat `demo` same as `sent` in status and idempotency check |

---

## List of Bugs Fixed

1. `SendSmsCampaignRecipientJob` crash on null campaign (job poisoned queue) — **HIGH**
2. `SmsSchedulerService` duplicate SMS dispatch under concurrent cron — **HIGH**
3. `GenerateRecurringExpenses` duplicate expense creation under concurrent cron — **MEDIUM–HIGH**
4. KDS page silently drops `preparing`-status orders — **HIGH**
5. Admin panel: no `auth_expired` handler, staff left on broken screen — **HIGH**
6. SSE reconnect never passes last event ID (lost cursor) — **MEDIUM**
7. Promo apply allowed on `partial` orders (total < paid amount) — **HIGH**
8. `InvoicesPage` sends `NaN` for `tax_rate_bp` — **MEDIUM**
9. `SendStaffNotificationJob` treats `demo` as failure (broken idempotency on staging) — **MEDIUM**

## List of Remaining Risks

1. Two competing total calculation models (OrderCreationService vs OrderTotalsCalculator) — **HIGH** — architectural debt
2. Promo per-user limit bypassable via multiple concurrent unpaid orders — **HIGH** — needs evaluator change
3. Delivery order total fields inconsistent after manual fee patch — **MEDIUM** — needs calculator integration
4. Full refund does not restore variant-tracked stock — **MEDIUM** — needs variant stock restore
5. Stock deduction can go below zero — **MEDIUM** — needs floor guard
6. `OrderStatusMachine` missing `payment_pending → pending` transition — **MEDIUM** — documentation risk
7. Accounts payable/receivable queries unbounded — **MEDIUM** — memory risk at scale
8. Analytics retention query loads all orders into memory — **MEDIUM** — memory risk at scale

---

## Final Verdict

> **Close, but needs fixes before production.**

The 9 bugs above are real, reproducible, and some will cause visible failures in production (KDS dropping orders, admin session expiry breaking pages, SMS queue jobs crashing). All 9 have been fixed. The remaining 8 risks are architectural issues or edge cases that are lower probability under normal operation but should be tracked and resolved in the next development cycle.
