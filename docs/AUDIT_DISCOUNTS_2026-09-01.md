# Discount Audit — 2026-09-01

Every path that can reduce what a customer pays: who may open it, what bounds
it, and what is recorded. Read-only — nothing in this report has been changed.
Findings are ranked by what they could actually cost.

Audited against `main` at `b5d275734`.

## Bottom line

The **gates** are good. Every discount is computed server-side from the order's
own line items — no endpoint takes a subtotal or a price from the client and
believes it. Manual discounts run through one policy class with a permission
check, a role-aware cap, an optional reason, an optional SMS approval code, and
an audit entry. Promo codes check date range, campaign cap, per-customer cap,
minimum spend, budget, and first-order status, and they do it under a row lock
so two tills cannot race the last redemption.

The **hole is in what happens afterwards.** Every discount is calculated once,
against the cart as it stood at that moment, and then stored as a fixed number
of laari. Nothing re-checks it when the cart changes. Take items off the ticket
after a discount is applied and the discount does not shrink with it — it stays
at its original size and eats whatever is left.

I measured this rather than inferred it. Both cases below are reproductions run
against the real endpoints:

| | Cart at apply | Discount | Cart after edit | Customer pays |
|---|---|---|---|---|
| Promo code `BIG200` (MVR 200 off, min spend MVR 500) | MVR 600 | MVR 200 | **MVR 100** | **MVR 0.00** |
| Manual discount, MVR 200 | MVR 600 | MVR 200 | **MVR 100** | **MVR 0.00** |

In both cases the order records a total of zero and the food goes out the door
free. The promo's MVR 500 minimum is not re-checked; the manual discount's cap
is not re-checked.

This is one structural fault with several faces, not several bugs. It is
finding **H1** and it is the only thing here I would treat as urgent.

---

## H1 — A discount is never re-checked against the cart it applies to

**What happens.** `OrderTotalsCalculator::recalculateAndPersist()`
(`backend/app/Domains/Orders/Services/OrderTotalsCalculator.php:240`) reads the
five stored discount columns verbatim:

```php
$discounts = new DiscountsInput(
    promoDiscountLaar: (int) ($order->promo_discount_laar ?? 0),
    loyaltyDiscountLaar: (int) ($order->loyalty_discount_laar ?? 0),
    manualDiscountLaar: (int) ($order->manual_discount_laar ?? 0),
    ...
```

Those numbers were written when the discount was applied. Nothing recomputes
them. `EffectiveDiscount::allocate()`
(`backend/app/Domains/Orders/Support/EffectiveDiscount.php:42`) then clamps the
*sum* to the subtotal — which is what stops the total going negative, and is
also what silently converts an over-large discount into a 100% one.

**Why each layer misses it.**

- **Coded promos.** `PromotionEvaluator::applyAutomatic()`
  (`:68`) deletes stale drafts, but only `whereHas('promotion', auto_apply =
  true)`. A coded promo's draft is deliberately left alone, so its
  `discount_laar` and the order's `promo_discount_laar` both survive any cart
  change.
- **Manual discounts.** `OrderItemController`
  (`backend/app/Http/Controllers/Api/Orders/OrderItemController.php:181`)
  re-runs `ManualDiscountPolicy` only `if (array_key_exists('discount_amount',
  $validated))`. Editing the items without touching the discount field skips
  the cap check entirely.
- **Loyalty and referral.** Same shape — `loyalty_discount_laar` and
  `referral_discount_laar` are frozen at hold/apply time.

**How it happens for real.** Not as fraud, mostly. A cashier rings six items,
applies the code, the customer changes their mind and drops four, and the
cashier does not think to re-apply anything. The screen shows a total the
cashier has no reason to distrust.

**Recommendation.** Re-evaluate on every recalculation rather than trusting the
stored figure. Concretely: have `recalculateAndPersist()` re-run each live
discount source against the current subtotal before allocating — re-validate
coded promos through `PromotionEvaluator` (dropping them, with a reason, when
they no longer qualify) and re-clamp the manual discount to
`DiscountSettings::effectiveCapLaar()`. Where a discount is dropped or reduced,
say so on the ticket so the cashier sees it happen rather than discovering it at
the till.

A cheaper stopgap, if the full fix is too big to take now: refuse to *settle* an
order whose stored discounts exceed what the current cart would allow, and make
the cashier re-apply. That closes the money leak without touching the edit path.

---

## M1 — The approval record names the wrong approver

`DiscountApprovalService::confirm()`
(`backend/app/Domains/Orders/Services/DiscountApprovalService.php:226`):

```php
$approvers = DiscountSettings::approvers();
$approvedBy = $approvers[0]['user_id'] ?? null;
```

The SMS code goes to *every* configured approver. Whoever reads it back to the
cashier, the order and the audit log both record **the first approver in the
list**. With one approver configured this is harmless. With two or more, the
record of who authorised a discount is wrong — and the record is the entire
point of the approval flow.

**Recommendation.** Either bind the code to a single approver at request time
(pick one, send to one, record that one), or issue a distinct code per approver
so the code that comes back identifies who gave it.

---

## M2 — Nothing bounds the total giveaway across layers

Discounts stack in five independent layers, applied in this order:

1. **Line price** — daily special vs item-level auto-promo, resolved by
   `EffectivePriceService`. These two compete: `best_wins` takes the lower.
2. **Order-level auto promos** — `PromotionEvaluator::applyAutomatic()`,
   again `best_wins` among themselves.
3. **Coded promo**
4. **Loyalty points**, **referral credit**
5. **Manual discount**

`discount_stacking_policy` (default `best_wins`) governs competition *within*
layers 1 and 2. **Across** layers, everything stacks unconditionally. A dish can
be on special, carry an auto-promo, take a code, absorb loyalty points and then
a manual discount — bounded only by the subtotal.

The one global brake is the margin floor
(`DiscountSettings::MARGIN_FLOOR_ENABLED`), which clamps stacked merchandise
discounts so no line falls below cost × (1 + floor%). **It defaults to off**
(`backend/app/Domains/Orders/Support/DiscountSettings.php:150`), and it only
binds on lines whose `cost` is set — a line with no cost recorded imposes no
floor at all and contributes its whole value to the allowance
(`OrderTotalsCalculator.php:410`).

This is a policy question, not a defect. But it is worth knowing that the
system's only structural protection against selling below cost is switched off
by default and depends on cost prices being filled in.

**Recommendation.** Turn the margin floor on with a modest percentage, and check
how many active items have no cost — those are the ones it cannot protect.

---

## M3 — "Once per customer" does not bind a walk-in

`PromotionEvaluator::evaluateAgainstOrder()` (`:338`):

```php
if ($customerId && $promotion->max_uses_per_customer) {
```

With no customer attached — a POS walk-in, or a guest checkout — the
per-customer cap is skipped. `first_order_only` is skipped for the same reason
(`:796`, explicitly). Only the campaign-wide `max_uses` still applies.

This is deliberate and documented in the code, and `registered_only` is the
switch that closes it. But it is opt-in, so a code created without thinking about
it is effectively unlimited per person at the till.

**Recommendation.** For any code meant as one-per-person, set `registered_only`.
Consider making that the default for codes that set `max_uses_per_customer`, so
the two settings cannot contradict each other silently.

---

## L1 — Budget and campaign caps can overshoot under concurrency

`budgetGate()` (`:752`) carries its own honest comment: `spent_laar` increments
at redemption, the check runs at apply time, so concurrent pending carts can
overshoot slightly before any of them pay. Campaign `max_uses` is handled better
— `applyToOrder` re-checks it under `lockForUpdate` — but the budget is not.

Low, because the overshoot is bounded by how many carts are open at once.

---

## What is solid

Worth stating plainly, since an audit that only lists problems misleads:

- **No client-supplied money.** Every discount path computes the subtotal from
  the order's own line items. The one endpoint that accepts
  `promo_discount_laar` from the client (`LoyaltyController::posHoldPreview`) is
  preview-only; the real hold resolves everything from `order_id`.
- **Manual discount policy is a genuine choke point.** Permission
  (`promotions.discounts`), role-aware cap, reason list, approval gate and audit
  entry all live in one class, and the cap is a ceiling that approval cannot
  raise (`ManualDiscountPolicy.php:68`).
- **The approval OTP is properly built** — hashed code, TTL, attempt limit,
  amount binding on confirm, cap re-checked at confirm, throttled routes.
- **Promo application is race-safe** — order and promotion both locked, campaign
  cap re-checked inside the transaction, non-stackable promos released before
  the new one lands.
- **Per-customer caps count pending carts**, not just confirmed redemptions, so
  opening five tabs does not multiply a once-per-customer code.
- **Gift cards are treated as tender, not discount** — they never reduce the GST
  base, which is correct and easy to get wrong.

---

## Suggested order of work

1. **H1** — the only finding that gives food away. Fix the settle path first if
   the full re-evaluation is a bigger job than you want right now.
2. **M1** — small change, and it restores the meaning of the approval record.
3. **M2** — decide the policy, then turn the margin floor on and fill in the
   missing cost prices.
4. **M3** — a settings review of existing codes, not a code change.
5. **L1** — only if promo budgets start mattering.
