# Multi-App Audit — Calculations, Pricing, Catalog, Order Flows, Events

Status: **Historical audit snapshot — not a living product plan.** Point-in-time calculations/flows audit from an abandoned multi-app audit branch. Findings may already be fixed or obsolete; do not treat unchecked items as current bugs without re-verification.

> Rescued from branch `claude/multi-app-audit-calculations-1ijj9c` (not written fresh on this branch).

---

> Date: 2026-07-19 · Scope: Laravel backend, POS (`apps/pos-web`), online ordering (`apps/online-order-web`), admin dashboard (`apps/admin-dashboard`), main website (Blade views), KDS/delivery apps, `packages/shared`.
>
> **Part A** is the findings report. **Part B** is a self-contained implementation prompt for a coding agent (Cursor) to fix the confirmed bugs.

---

## Executive summary

The money architecture is sound. All financial math is anchored server-side in integer **laari** (1 MVR = 100 laari); the backend never trusts client-supplied prices; refunds and payments are capped and idempotent; money is stored as `decimal(10,2)` mirrors plus authoritative `*_laar` integer columns (no float columns anywhere). Events/catering is a deliberate quote-first workflow with no auto-pricing.

The defects found are concentrated in **client-side preview/display math** that is supposed to mirror the server but has drifted:

| # | Severity | Surface | Issue |
|---|----------|---------|-------|
| 1 | **High** | POS | Tax-inclusive grand total double-counts tax (`useCart.ts:276-279`) |
| 2 | **High** | Online ordering | Checkout discards the `tax_inclusive` flag; always adds exclusive tax (`useCheckout.ts:192-196, 504`) |
| 3 | Medium | POS | Resumed tickets may re-apply loyalty/gift-card rewards (`useOrderCreation.ts:687, 1028-1046`) |
| 4 | Low | Online ordering | Fixed-promo preview capped against total instead of subtotal (`useCheckout.ts:534-537`) |
| 5 | Low | POS + online | Scattered float display math with cent-level drift vs the laari path |
| 6 | Info | Backend | Offline-sync totals validation is `isset`-conditional; payload with only `total` skips subtotal/tax cross-checks |
| 7 | Info | POS | Duplicate tax util has drifted from `useCart`; no tips field; no manager-override flow |

Findings 1 and 2 are latent today (GST config defaults to tax-**exclusive**) but will misprice both apps' displayed totals the moment tax-inclusive mode is enabled. Because the server total is what actually gets charged, customers were never overcharged — these are display/trust divergences, not billing errors.

---

# Part A — Audit findings

## 1. Backend (Laravel) — the money source of truth

### Calculation pipeline

Single authority: `backend/app/Domains/Orders/Services/OrderTotalsCalculator.php`.

Pipeline: subtotal → allocate order-level discounts → discounted subtotal → service charge → per-item GST (+ optional service-charge tax) → grand total; packaging, small-order, delivery fees and tip are added in `recalculateAndPersist()` (lines 202-247). `orderTotalsLocked()` (lines 38-71) freezes totals once an order is paid so post-payment recalcs cannot rewrite a settled bill.

Key components:

- **Money value object** — `app/Domains/Shared/ValueObjects/Money.php`: immutable integer laari; rejects negatives; percentage discounts `floor()` (merchant-favouring); tax extract/add use `round()`; inclusive extraction `amount * rate / (10000 + rate)`.
- **GST** — `app/Domains/Gst/Services/GstTaxCalculator.php`: basis-point math; exclusive `line * bp / 10000`, inclusive `line * bp / (10000 + bp)`; empty `tax_code` defaults to `Standard8` so lines are never silently under-taxed. Default 800 bp (8%), exclusive (`GstSettingsService::defaultAttributes()`).
- **Tax-inclusive branch** — `OrderTotalsCalculator.php:99-135`: when inclusive, tax is *extracted* and `grandTotal = discountedSubtotal + serviceCharge` (tax NOT added); service-charge tax is skipped (line 116). This is the reference behavior the clients must mirror (see findings 1-2).
- **Discount stacking** — `app/Domains/Orders/Support/EffectiveDiscount.php`: five buckets (promo, loyalty, manual, gift_card, referral); proportional scale-down when stacked discounts exceed subtotal; last bucket absorbs the rounding remainder; discounts always applied **before** tax.
- **Service charge** — `app/Domains/Orders/Services/ServiceChargeCalculator.php`: per-order-type gating (`apply_dine_in/_takeaway/_online_pickup/_delivery`), percent capped 100%, fixed capped MVR 500, computed on the **discounted** subtotal.
- **Packaging & small-order fees** — `PackagingFeeCalculator.php`: per-item fee × qty, non-dine-in only; small-order fee for online_pickup/delivery below a threshold, capped MVR 500.
- **Delivery fee** — `app/Domains/Delivery/Services/DeliveryFeeCalculator.php`: zone-based; free-delivery threshold measured on discounted merchandise.
- **Promotions** — `PromotionEvaluator.php`: validity/date/min-order/per-customer checks (counts pending draft redemptions to stop multi-cart abuse); percentage `floor()`, fixed capped at applicable subtotal, free_item = cheapest qualifying line.
- **Loyalty** — `PointsCalculator.php` + `LoyaltyLedgerService.php`: earn base = discounted merchandise only (GST/SC/packaging excluded); redemption capped at `maxRedeemPercent` of post-other-discount merchandise.

### Price trust model (audit-critical) — **server recomputes everything**

- `OrderCreationService::addOrderItems` (`app/Domains/Orders/Services/OrderCreationService.php:411-414`): unit prices always resolved server-side from the catalog/specials; **client `unit_price` is ignored**. Modifier prices re-read from DB models (line 516), not from the request payload.
- Staff POS create (`StoreOrderRequest`): no price fields; only `discount_amount` is a client money input — clamped to `[0, subtotal]` and permission-gated on `promotions.discounts` (`OrderCreationService.php:135-146`).
- Online customer create (`StoreCustomerOrderRequest`): explicitly hardened — only `item_id/variant_id/quantity/modifier_id` accepted.
- Payments: `SettleOrderPaymentAction.php` row-locks the order, replays idempotently via `idempotency_key`, enforces a tender cap (`assertTenderCap`), flips to `paid` when paid laari ≥ order total laari. Paid-sum uses `SUM(COALESCE(amount_laar, ROUND(amount*100)))` — safe for legacy rows.
- Refunds: `RefundController.php:99-108` caps at `min(paidLaar, orderTotalLaar)`, rejects over-refunds, proportionally restores stock on partial refunds.
- Offline sync: `PosOfflineSyncRequest` *does* accept `unit_price` and `totals`, but `OfflineOrderSyncService::totalsMatch()` (lines 325-357) validates the client totals against a server recompute (1-laar tolerance) and records mismatches as conflicts — client totals are **checked, never persisted**. See finding 6 for a gap.

### Order flows

- Order types: `dine_in`, `takeaway`, `online_pickup`, `delivery` (+ `gift_card`). Type drives: service-charge eligibility, packaging/small-order fees (non-dine-in), delivery fee, minimum-order enforcement (skipped for dine-in), and Active-Orders lifecycle.
- Online orders start `payment_pending` with kitchen print suppressed until `OrderPaid`; POS orders start `pending`. Order numbers from a row-locked `daily_sequences` table (`BG-YYYYMMDD-0001`, Maldives business day).
- Tables: open/close/merge/split with dedicated FormRequests; order→table FK.
- Status transitions via `OrderStateMachine` / `OrderStatusTransitionService`; hold/resume actions.

### Events

- **Domain events**: `OrderCreated/Paid/Completed/Cancelled/Refunded/StatusChanged`, `PaymentConfirmed` — dispatched after commit; listeners drive GST posting, loyalty accrual, promo redemption, stock release, printing, notifications.
- **Catering/event bookings**: `CateringRequest` + `CorporateInquiry` are lead/quote workflows. Staff enter `quoted_amount` manually; confirmed jobs are rung through POS. **No auto-pricing engine exists — by design.** Reservations (table bookings) are separate and not price-bearing.

### Storage

All monetary columns are `decimal(10,2)` (display/legacy) or `bigInteger` laari (authoritative): orders (`subtotal/tax/total` + `*_laar` columns, `tax_inclusive`, `tax_rate_bp`), order_items, payments (`amount_laar`, `commission_laar`), refunds, promotions/loyalty (integer laari). **No float money columns found.**

### Test coverage (calculations)

Good coverage exists: `OrderTotalsCalculatorDiscountTest`, `MoneyTest`, `EffectiveDiscountTest`, `DeliveryFeeCalculatorTest`, `PointsCalculatorTest`, `ServiceChargeTest`, `PackagingFeeTest`, `CheckoutFeesPreviewTest`, `GstModuleTest`, `PromotionTest`, `RefundCapTest`, `OverpaymentBlockedTest`, `PartialPaymentTest`, `CustomerOrderSecurityTest` (server-price enforcement), `VariantOrderTest`, `OrderContractTest`.

## 2. POS (`apps/pos-web`)

Cart math lives in `src/hooks/useCart.ts`; shared allocators in `packages/shared/src/utils/effectiveDiscount.ts` and `serviceCharge.ts` explicitly mirror the backend. Order payloads (`src/hooks/useOrderCreation.ts` `buildPayload`, lines 305-357) send only identifiers + quantities — **no line totals, subtotal, tax, or grand total** — and settlement uses the server-returned `order.total`. Change-due and split-tender arithmetic are done in integer laari (`ChargeOverlay.tsx:152-273`).

Flows:
- **Dine-in**: table selection (optional at charge, deliberate), floor actions (open/close/merge), fire-to-kitchen vs hold, add-items-to-existing-order via PATCH `/orders/{id}/items` with kitchen reprint on cart fingerprint change, settlement of the **server** total for resumed tickets.
- **Takeaway**: default type; packaging fee applies (zeroed for dine-in), service charge normally off for takeaway (config default). Pickup/delivery are distinct types; delivery uses a server-previewed fee and cannot be saved/charged offline.
- **Variants/modifiers**: variant price replaces base (not additive); modifiers additive; cart lines merge on item+variant+modifiers+notes.
- **Voids**: require a reason; server refuses voiding paid orders (refund path instead). **Refunds**: client validates only `amount > 0` — the server cap is the real control (verified present).
- **Offline**: IndexedDB queue (cap 100), cached menu, idempotent sync via `local_order_id`, per-order conflict states, exponential backoff. Offline orders ring at cached prices and post client-computed totals with `prepared_locally: true` — the server validates them (see finding 6).

### POS findings

1. **HIGH — tax-inclusive double count** (`useCart.ts:276-279`): `cartTotal = discountedSubtotal + cartServiceCharge + cartTax + cartPackagingFee` always adds `cartTax`. When `tax_inclusive` is on, `cartTax` is the tax *extracted* from `discountedSubtotal` (lines 226-231) — already embedded — so the displayed total overstates by the tax amount. Server reference: `OrderTotalsCalculator.php:128-132` excludes tax from the inclusive grand total. Latent (config defaults to exclusive).
2. **MED — resume + re-apply rewards** (`useOrderCreation.ts:687, 1028-1046`): resuming a ticket hydrates already-applied rewards, then charging re-runs `applyStagedRewards` on the same order — loyalty hold and gift-card application may double-apply. Server idempotency for these endpoints is unverified; needs backend verification before any fix.
3. **LOW — float drift**: `cartSubtotal` accumulates in floats before laari conversion (`useCart.ts:168`); split-item display rounds each slice independently (`components/openTickets/splitItemTotals.ts:16`) so slices need not sum to the order total (display-only; authoritative split is server-side).
4. **INFO — duplicate divergent tax util**: `src/utils/posCartTotals.ts:58-77` ignores `tax_inclusive` and omits service-charge tax; currently imported only by tests but will drift further.
5. **INFO — gaps**: no tips/gratuity field anywhere; no manager-override/second-approver flow — sensitive actions (void, refund, discount, rewards) are gated solely by the cashier's own permission slugs.

## 3. Online ordering (`apps/online-order-web`)

Checkout math in `src/hooks/useCheckout.ts` (integer laari, mirrors shared allocators). Order payloads (`useCheckout.ts:777-810`, `api/orders.ts:17-56`) contain only `item_id/quantity/variant_id/modifier_id`; the charged amount is read back from the server before payment. Cart price snapshots are re-synced from the live menu on channel change (`CartContext.tsx:247-272`) — good staleness defence.

### Online ordering findings

1. **HIGH — `tax_inclusive` ignored** (`useCheckout.ts:192-196`): the GST bootstrap effect keeps only `tax_rate_percent` and discards `tax_inclusive` (which `api/menu.ts:276-297` already returns). Per-line tax (lines 460-472) is always computed exclusive and `totalLaar` (line 504) always adds it. Under inclusive GST the displayed running total is inflated vs the server-charged amount. (The admin app wires the flag correctly — `useGstBootstrap.ts:7` — this is an online-order-web omission.)
2. **LOW — fixed-promo preview cap** (`useCheckout.ts:534-537`): fixed promos previewed with `Math.min(discount_value, totalLaar)` while the backend caps at the merchandise subtotal → preview can overstate savings until corrected post-create.
3. **LOW — float display paths**: `CartContext.tsx:274-283` (`cartTotal`), `CartSummary.tsx:27`, `PreOrderPage.tsx:58` (event pre-order preview) use float `price × qty` — cent-level disagreement possible with the laari checkout subtotal for the same cart.
4. **INFO — fee preview trusts client subtotal** (`api/menu.ts:96, 111-117`): delivery/checkout fee previews POST a client-computed subtotal. Advisory only — the charged fee is recomputed server-side.

## 4. Admin dashboard (`apps/admin-dashboard`)

- Catalog editing (`pages/MenuPage/menuItemForm.ts:83-135`): MVR decimals parsed and POSTed; server FormRequests validate. Margin helper display-only. No client-authoritative pricing.
- Promotions setup (`pages/PromotionsPage.tsx:39-69`): MVR→laari conversion via `Math.round(n*100)` client-side before POST (fine, but server should re-validate ranges — INFO).
- Reports/P&L (`ProfitLossPage.tsx`, `ReportsPage/ReportsTabPanels.tsx`): all figures server-computed; client only formats and sums already-computed rows. `utils/fmt.ts` handles DECIMAL-as-string defensively. **No client-side money derivation.**
- Catering admin (`pages/CateringPage.tsx:133-141`): staff manually enter `quoted_amount`; no auto-calc (by design).

## 5. Main website (Blade views under `backend/resources/views`)

- `home.blade.php`: menu display via `number_format((float)$item->base_price, 2)` and specials' effective/original prices — display-only.
- `receipt.blade.php` (also serves the unpaid bill): renders **persisted** order columns only; sole arithmetic is `max(0, total - refundedTotal)`; explicitly notes totals may change until payment. Same for invoice/PDF/email templates.
- Reservations on the site are phone-driven; no price-bearing web flows.

## 6. KDS & delivery apps

- `kds-web`: no monetary display at all — nothing calculation-critical.
- `delivery-web`: totals parsed from server strings and formatted; earnings from server aggregates. No client money math.

## 7. Backend attention points

1. **INFO — offline-sync validation gap**: `OfflineOrderSyncService::totalsMatch()` (`app/Services/OfflineOrderSyncService.php:325-357`) cross-checks `subtotal`/`tax` only when `isset` — a payload sending only `total` skips those checks (total itself is still validated within 1 laar, and payment amount is bounded by the server order total). Recommend making subtotal/tax checks unconditional or rejecting partial `totals` blocks.
2. **INFO — quantity typing**: FormRequests force integer quantity but `addOrderItems` casts to float to support fractional kg lines — fractional quantities only reachable via internal callers. Document or unify.
3. Manual `discount_amount` is the single client-influenced money input on the staff create path — bounded and permission-gated (acceptable; keep the permission tight).

---

# Part B — Implementation prompt for Cursor

Copy everything inside the fence below into Cursor as the task prompt.

```
You are working in the Bake & Grill monorepo (Laravel backend in `backend/`, React/TS apps in `apps/pos-web`, `apps/online-order-web`, `apps/admin-dashboard`, shared code in `packages/shared`). Currency is MVR handled in integer laari (1 MVR = 100 laari). The Laravel backend is the source of truth for all money: `backend/app/Domains/Orders/Services/OrderTotalsCalculator.php` computes discounts (before tax, proportionally allocated), service charge, per-item GST, packaging/small-order/delivery fees. DO NOT change any backend calculation logic — all fixes below are client-side display/preview math that must MIRROR the backend.

An audit found these confirmed bugs. Fix tasks 1-4; do not attempt task 5 (listed for awareness only).

TASK 1 — POS: tax-inclusive grand total double-counts tax (HIGH)
File: apps/pos-web/src/hooks/useCart.ts
- `cartTax` (~lines 213-247) correctly branches on `taxInclusive`: when inclusive it EXTRACTS embedded tax with round(amount * rate / (100 + rate)); when exclusive it ADDS round(amount * rate / 100).
- BUG: `cartTotal` (~lines 276-279) is always `discountedSubtotal + cartServiceCharge + cartTax + cartPackagingFee`. When `taxInclusive` is true, tax is already embedded in `discountedSubtotal`, so adding `cartTax` overstates the total.
- Reference behavior: backend OrderTotalsCalculator.php lines 128-132 — when inclusive, grandTotal = discountedSubtotal + serviceCharge (tax NOT added); when exclusive, grandTotal = discountedSubtotal + serviceCharge + tax.
- FIX: in `cartTotal`, add `cartTax` only when NOT `taxInclusive`. Keep `cartTax` itself unchanged (it is still displayed as an informational "includes GST x%" line). Packaging fee is always added.
- Acceptance: with tax_inclusive=true, a 100.00 MVR cart at 8% GST shows total 100.00 (tax line ~7.41); with tax_inclusive=false it shows 108.00.

TASK 2 — Online ordering: checkout ignores the tax_inclusive flag (HIGH)
File: apps/online-order-web/src/hooks/useCheckout.ts
- Lines ~192-196: `fetchGstBootstrap().then((b) => setDefaultTaxRatePercent(b.tax_rate_percent))` discards `b.tax_inclusive`, which the API already returns (see apps/online-order-web/src/api/menu.ts, GST bootstrap type, ~lines 276-297).
- Lines ~460-472: per-line tax is always computed exclusive: `itemTaxLaar += Math.round((effectiveLaar * rate) / 100)`.
- Line ~504: `totalLaar = discountedSubtotalLaar + serviceChargeLaar + taxLaar + deliveryFeeLaar + packagingFeeLaar + smallOrderFeeLaar` — always adds tax.
- FIX:
  a. Add state `taxInclusive` (default false) and set it from `b.tax_inclusive` in the bootstrap effect.
  b. In the per-line tax loop: when inclusive, extract embedded tax with Math.round((effectiveLaar * rate) / (100 + rate)) instead of adding on top.
  c. Skip service-charge tax (`scTaxLaar`) when inclusive (backend skips SC tax in the inclusive branch — OrderTotalsCalculator.php line 116).
  d. In `totalLaar`, include `taxLaar` only when NOT inclusive. Delivery/packaging/small-order fees are always added.
- The POS app's useCart.ts `cartTax` memo (after Task 1) is the pattern to mirror.
- Acceptance: with tax_inclusive=true the checkout running total equals discountedSubtotal + serviceCharge + fees (no tax added), matching the server's `order.total` returned after order creation.

TASK 3 — Online ordering: fixed-promo preview capped against wrong base (LOW)
File: apps/online-order-web/src/hooks/useCheckout.ts, ~lines 534-537
- BUG: a pending FIXED promo preview is capped with Math.min(p.discount_value, totalLaar) (total includes tax/fees), while the backend (backend/app/Domains/Orders/Support/EffectiveDiscount.php) caps discounts at the merchandise SUBTOTAL. Preview can overstate savings.
- FIX: cap against `subtotalLaar` instead of `totalLaar`.

TASK 4 — POS: align the duplicate tax util with useCart and add tests
File: apps/pos-web/src/utils/posCartTotals.ts (~lines 58-77) and its test file posCartTotals.test.ts
- BUG: `cartTaxExclusiveMvr` ignores tax_inclusive and omits service-charge tax, so it has drifted from useCart.ts. It is currently only imported by tests.
- FIX: extend the util to accept the tax-inclusive flag and service-charge config so it reproduces useCart's cartTax + cartTotal behavior (including Task 1's fix), then add test cases:
  - exclusive: total = discountedSubtotal + SC + tax + packaging
  - inclusive: total = discountedSubtotal + SC + packaging; tax = extracted embedded amount; no SC tax
  - discount applied before tax, proportionally across lines
- Run existing tests for both apps and make them pass (from repo root: `npm run test --workspace apps/pos-web` and `npm run test --workspace apps/online-order-web`; if a workspace has no test script, run its vitest/jest directly).

TASK 5 — DO NOT IMPLEMENT (needs product/backend verification first; leave code untouched):
- POS resumed tickets re-run applyStagedRewards (apps/pos-web/src/hooks/useOrderCreation.ts ~687 and ~1028-1046), possibly double-applying loyalty/gift-card discounts — needs server idempotency verification.
- backend/app/Services/OfflineOrderSyncService.php totalsMatch() (~325-357): subtotal/tax cross-checks are isset-conditional, so an offline payload sending only `total` skips them.
- No manager-override/second-approver flow and no tips field in POS — product decisions.

Constraints:
- Client-side only (apps/pos-web, apps/online-order-web); no backend changes, no API contract changes.
- Money math in integer laari with Math.round at boundaries, matching existing patterns.
- Keep changes minimal and localized; do not refactor unrelated code.
```
