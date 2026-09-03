# Discount Audit — 2026-09-01

Every path that can reduce what a customer pays: who may open it, what bounds
it, and what is recorded. Read-only — nothing in this report has been changed.
Findings are ranked by what they could actually cost.

Audited against `main` at `b5d275734`.

> **Status (2026-09-01, same day): H1, M1 and L1 are fixed.** The reproductions
> below are now regression tests. M2 and M3 were left open as owner decisions;
> **on 2026-09-02 the owner decided**: "a cashier must not apply a random
> discount any amount without manager/admin approval". Both are now closed —
> see the note under each.
>
> One thing changed during implementation. My first attempt at H1 held every
> manual discount to the *share* it was approved at, which read well until a
> test caught what it did to an innocent case: MVR 30 off a ticket edited down
> from MVR 600 to MVR 200 became MVR 10, punishing a customer for an edit that
> had nothing to do with their discount. The share now applies only when the
> discount no longer fits the ticket. Recorded here because the wrong version
> was plausible and the test is the only reason it did not ship.

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

## H1 — A discount is never re-checked against the cart it applies to  ·  **FIXED**

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

**Fixed.** `DiscountRevalidator` re-measures the discounts on every
recalculation of an unlocked order, before they are read. The stored figures
became a request rather than an answer:

- **Coded and automatic promos** are re-run through
  `PromotionEvaluator::revalidateOrderPromotions()`. One that no longer
  qualifies is *released* — half a promo nobody earned is not a kinder answer
  than none — which also frees the campaign and per-customer counts it was
  holding. One that still qualifies is re-priced, so a percentage promo follows
  the cart down.
- **Manual discounts** are held to `effectiveCapLaar()` on the current cart —
  the same check the apply path runs, which the edit path skipped whenever the
  discount field itself was not being changed. A discount that still fits is
  untouched. Only when it no longer fits does the newly recorded basis
  (`orders.manual_discount_subtotal_laar`) decide how much survives, falling
  back to the share that was approved: MVR 200 off MVR 600 becomes MVR 33.33 on
  a MVR 100 ticket rather than swallowing it whole.
- **Loyalty and referral** are clamped to the merchandise left after the others.
- **Discounts never grow.** A cart that gets bigger does not earn more off than
  the cashier gave.
- **Settled orders are left alone** — re-pricing a paid ticket would rewrite
  what somebody already handed over.

Both reproductions in the table above are now regression tests, along with the
cases that must *not* change:
`backend/tests/Feature/Promotions/StaleDiscountTest.php`.

---

## M1 — The approval record names the wrong approver  ·  **FIXED**

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

**Fixed** by the second option, which keeps "any manager can approve" intact.
Each approver is now texted their own code, and the code that comes back
identifies who gave it (`ApprovalOtpCoder::assertValidAny()`). Expiry and the
attempt count still belong to the request as a whole, so one manager's typo
cannot lock the others out. Approvers configured by phone alone have no user row
to point at, so `discount_approvals.approved_label` carries the name — without
it the record would say nothing rather than something wrong.

---

## M2 — Nothing bounds the total giveaway across layers  ·  **ADDRESSED 2026-09-02**

> The bound is now a person. A manual discount of any size needs somebody who
> holds `promotions.discount_override` — the managers, and owner/admin by role.
> A cashier gets an SMS code from one of them; a manager applies directly and
> is recorded as the approver. The old "require approval" switch is gone.
> The margin floor stays a setting, and stays off: it clamps manual discounts
> too, so switching it on would silently cut a manager's deliberate 100% comp
> on a complaint. The admin Discount controls page now shows how many active
> items have no cost price, which is what the floor cannot protect.

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

## M3 — "Once per customer" does not bind a walk-in  ·  **FIXED 2026-09-02**

> A promotion with `max_uses_per_customer` or `first_order_only` is now
> refused on an order with no customer, with a message that says to sign in
> or have the cashier add the customer. `registered_only` still exists for
> offers that want an account even without a per-customer limit.

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

## L1 — Budget and campaign caps can overshoot under concurrency  ·  **FIXED**

`budgetGate()` (`:752`) carries its own honest comment: `spent_laar` increments
at redemption, the check runs at apply time, so concurrent pending carts can
overshoot slightly before any of them pay. Campaign `max_uses` is handled better
— `applyToOrder` re-checks it under `lockForUpdate` — but the budget is not.

Low, because the overshoot is bounded by how many carts are open at once.

**Fixed.** `PromotionController::applyToOrder` already re-checked campaign
`max_uses` on the locked promotion row; the budget is now re-checked in the same
place, so only one of several concurrent carts can take the last of a campaign's
money.

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

## What is left, and why it is left

**M2 and M3 are settings, not defects**, and both change what customers are
charged. Turning the margin floor on, or making `registered_only` a default,
would quietly alter live pricing on the strength of an audit nobody asked to
act on yet. They are yours to decide:

- **M2** — set `discount_margin_floor_pct` to a percentage you are happy with
  and enable the floor. Before that, check how many active items have no cost
  price, because those are the ones it cannot protect. Note also that
  `discount_max_percent` ships at **100**, which is why H1's manual-discount fix
  can only hold a discount to the whole ticket by default — set a real cap and
  it holds to that instead.
- **M3** — set `registered_only` on any code meant as one-per-person. Nothing
  in the code needs to change; the existing codes need reviewing.
