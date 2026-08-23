# Money & Calculations Audit — 2026-08-23

Scope of this first pass: the paths where money is computed, taken, or given
back. Read-only — nothing in this report has been changed. Findings are ranked
by what they could actually cost, not by how many there are.

Audited against `main` at `c38c91155`.

> **Status (2026-08-23, same day): all findings closed.** M1, M2, L2 and L3 were
> fixed. **L1 was withdrawn — it was wrong**, and the correction is recorded
> under that heading rather than deleted, because a retracted finding is worth
> more than a quietly removed one. **L2's stated remedy was also wrong** and had
> to be reworked during implementation; see the note under it.
>
> **Second pass (same day) is also complete** — GST, loyalty, customer credit,
> fee edges and trade invoicing. It found one **High**: GST output tax was
> under-declared because credit notes and refunds were subtracted twice. Fixed.
> See "Second pass" below.
>
> **M3 was held open** for a tax answer rather than guessed at. The owner gave
> it the same day — delivery charges are taxable in the Maldives — and it is now
> fixed too. Nothing in this report is outstanding in code. What remains is an
> accounting question, not an engineering one: **past GST returns filed from the
> H1 bug under-declared tax for any period containing a refund, and past
> delivery orders under-collected it.** Both belong with whoever files the
> returns.

## Bottom line

The core money engine is in good shape. Prices are resolved server-side and
client-sent prices are ignored on order creation; totals run through one
calculator in integer laari; payment confirmation re-verifies with the gateway
and fails closed; refunds are capped inside a lock with dual approval; gift-card
redemption is locked and idempotent. I did not find a way to pay less than owed,
be refunded more than paid, or redeem a gift card twice.

What I did find is a spread of **medium and low** issues — mostly display-vs-charge
mismatches and a couple of staff-trust input gaps. None is an open door to theft;
several are the kind of thing that produces a wrong number on a screen or an
argument at the counter. They are listed below worst-first.

The severity scale: **High** = direct money loss or a customer/attacker can pay
less / take more. **Medium** = wrong figure shown, or a staff member can exceed a
limit the system means to enforce. **Low** = cosmetic, drift of ≤1 laari, or
defence-in-depth hardening.

---

## Findings

### M1 — Web menu hides item-level auto-promotions, so the shown price can differ from the charged price
**Severity: Medium** · `backend/resources/views/menu.blade.php:541` (`$priceFor`),
`backend/resources/views/menu-item.blade.php:26`, vs
`backend/app/Services/EffectivePriceService.php:22`

The price a customer is **charged** comes from `EffectivePriceService::resolveUnitPrice`,
which considers *both* daily specials *and* item-level auto-promotions and takes
the lower (`best_wins`). The price the Blade `/menu` and `/menu/{id}` pages
**show** comes from `$priceFor`, which only reads the daily-special rows
(`menuSpecialsByItemId`) and never consults `EffectivePriceService`.

So an item discounted by an **item-level auto-promotion** (not a daily special)
shows its full price on the public web menu, while the order-app card
(`ItemController::index` → `EffectivePriceService`, `backend/app/Http/Controllers/Api/ItemController.php:160`)
and the actual charge apply the discount.

- Direction is customer-favourable — they are charged *less* than the web menu
  shows, so this is not a loss. But it is a real inconsistency: the web menu
  under-advertises a live discount, and a customer comparing the web menu to
  the app sees two different prices for the same item.
- Daily specials *are* shown correctly on both Blade pages; this gap is
  specifically auto-promotions.
- Note the earlier plan item ("specials pricing not ported to the Blade menu")
  is now **stale** — daily specials are ported. Auto-promotions are the
  remaining gap.

**Impact if left:** confusing pricing on the SEO-facing menu; support questions;
under-stated discounts on the one surface Google indexes.

---

### M2 — Legacy offline-sync endpoint does not validate modifier or child quantities
**Severity: Medium (staff-trust)** · `backend/app/Http/Controllers/Api/OfflineSyncController.php:47`
vs `backend/app/Http/Requests/PosOfflineSyncRequest.php` /
`StoreOrderRequest.php:45`

The online order requests clamp modifier quantity (`min:1|max:10`) and child
quantity (`min:1|max:99`). The batch offline-sync path at `POST /api/offline/sync`
validates only `items.*.quantity` (`min:1`, no max) and does not validate
`modifiers.*.quantity` or `children.*.quantity` at all. `OrderCreationService`
then multiplies `modifier_price * modifier_quantity`
(`backend/app/Domains/Orders/Services/OrderCreationService.php:804`) with no
clamp, and item `quantity` has no upper bound on this path.

- Both offline routes are staff-gated (`permission:pos.ring_sales` + `device.active`),
  so this is not customer-reachable — it is a data-integrity gap, not an
  external hole. A malformed or malicious device could ring a line with a
  10,000× modifier or a negative-looking quantity.
- The online path already enforces these bounds; the offline path should match
  so the same order cannot be created two ways with two different rule sets.

**Impact if left:** a bad offline payload produces a distorted total that then
flows into GST, shift cash reconciliation, and reporting.

---

### L1 — ~~Refund cap mixes integer laari and rounded-decimal~~ — **WITHDRAWN, not a defect**
**Severity: none** · `backend/app/Domains/Finance/Services/RefundWorkflowService.php:618`

**This finding was wrong.** I asserted that summing prior refunds with
`COALESCE(SUM(ROUND(amount * 100)), 0)` could drift against `paid_laar`. It
cannot, for two reasons I did not check before writing it down:

1. `refunds.amount` is `decimal(10, 2)`
   (`database/migrations/2026_01_27_193012_create_refunds_table.php:22`), not a
   float. MySQL DECIMAL is exact, so `amount * 100` is exact and `ROUND` of an
   already-integral value changes nothing. There is no drift to accumulate.
2. The other side of the comparison uses the *same* expression —
   `sumAmountLaarForOrder` is `COALESCE(SUM(COALESCE(amount_laar, ROUND(amount * 100))), 0)`
   (`EloquentPaymentRepository:84`), over a `payments.amount` that is likewise
   `decimal(10, 2)`. The two representations are consistent by construction.

The suggested remedy was also unbuildable as written: there is **no
`amount_laar` column on `refunds`** at all. Acting on the recommendation would
have meant adding and backfilling a column to fix a problem that does not
exist.

Nothing was changed. Left in place, struck through, as a record of a false
positive.

---

### L2 — BML webhook confirmation does not assert the payload amount against the reserved amount
**Severity: Low (defence-in-depth)** · `backend/app/Domains/Payments/Services/PaymentService.php:751` (`confirmPaymentOnce`)

The webhook path advances the payment using the server-reserved `amount_laar`
and never reads an amount from the (signed) webhook body, which is the correct
design — the amount is the one the server chose at initiation, and the body is
HMAC-verified. The **return-url** path goes further and explicitly checks the
gateway-reported amount against `payment->amount_laar`
(`confirmFromReturnUrl:531`).

For symmetry and defence-in-depth, the webhook path could also assert
`payload amount == payment->amount_laar` and log a mismatch. Today a
(correctly signed) confirmation for an unexpected amount would be accepted on
the webhook path because the amount is simply not consulted there. No known way
to produce that without the signing secret; hence Low.

> **Correction found while fixing this.** The remedy as written above —
> comparing the payload amount to `amount_laar` directly — would have rejected
> **every legitimate webhook**. We send laari and the status API answers in
> laari, but the webhook body carries a decimal MVR string: the codebase's own
> fixtures use `'amount' => '100.00'` against a reservation of `10000`
> (`tests/Feature/Payment/BmlFailedWebhookRetryTest.php:54,77`). Shipping the
> literal recommendation would have stopped BML settlement outright.
>
> **What was actually built:** tolerant of unit, strict on value. A payload is
> accepted when it matches the reservation read *either* as laari *or* as MVR,
> and refused only when it matches neither — which is what a genuinely wrong
> amount looks like under both conventions. An absent or non-numeric amount is
> not treated as a mismatch, since some event shapes omit it and inventing a
> failure there would strand a real payment. On a true mismatch it fails closed
> and leaves the delivery retryable.

---

### L3 — `min()` / `subtract()` clamp on Money can silently absorb an ordering bug
**Severity: Low** · `backend/app/Domains/Shared/ValueObjects/Money.php:63` (`subtract`)

`Money::subtract` does `max(0, a - b)` and the constructor throws on a negative
amount. This is a deliberate guard, and it is the right default for money. The
flip side is that a genuine logic error (subtracting more than available) is
silently floored to zero rather than surfaced. Given how much of the totals
pipeline leans on `subtract`, a stray over-subtraction would show as a €0 line
rather than an exception.

Not a bug today — noted so that if a "why is this line zero?" ticket ever
appears, this clamp is the first place to add a diagnostic.

---

## What was checked and found sound (no action)

These are recorded so the next audit can start from a known-good baseline rather
than re-deriving it.

- **Server-side pricing on order creation.** `OrderCreationService` always
  resolves unit price from the catalog / variant and ignores any client-sent
  `unit_price` (`:641-643`). Line total is `(unitPrice + modifierTotal) * quantity`
  with a negative-total abort (`:816-819`).
- **One totals calculator.** `OrderTotalsCalculator` is the single writer of
  `subtotal_laar` / `tax_laar` / `total_laar`, all in integer laari, with a
  documented rounding policy (floor on % discounts, round on tax). Per-item tax
  is allocated by post-discount ratio per tax code, not a blended rate.
- **Discount allocation.** `EffectiveDiscount::allocate` proportionally scales
  stacked discounts to the subtotal and gives the remainder to the last bucket,
  so allocations always sum exactly to the effective total. Gift-card tender is
  correctly treated as payment, not a pre-tax discount.
- **Manual discount cap.** `ManualDiscountPolicy` is a single choke point:
  permission-gated, reason-gated, capped by role, and approval never raises the
  cap. The offline path routes through the same policy.
- **BML payment intake.** Webhook signature verified before any DB row is
  minted; idempotency by `transactionId` with `processed`/`ignored` terminal
  and in-flight protection; state machine transitions; return URL re-verifies
  server-to-server via the status API, **fails closed** on API outage, and
  matches transaction id + amount before settling.
- **Stripe webhook.** HMAC over `t.body`, 5-minute timestamp tolerance,
  `hash_equals` comparison.
- **Zero-balance completion.** `completeZeroBalanceOnlineOrder` locks the order,
  checks ownership, and recomputes remaining balance server-side — a customer
  cannot self-confirm an order that still owes money.
- **Refund caps.** `refundable = min(paid, total)`, checked inside a locked
  transaction, recomputed at both request and approval, with dual-approval
  (cannot approve your own).
- **Gift-card redemption.** `lockForUpdate`, idempotency checked before *and*
  after the lock, balance re-verified at payment time, insufficient-balance
  aborts.
- **No controller writes order totals from client input.** The only `'total' =>`
  writes from request data are pagination counts.

---

## What was done

| # | Outcome |
|---|---|
| M1 | **Fixed.** `MenuPageController` resolves each item's price through `EffectivePriceService` — the resolver the order pipeline itself uses — and passes a `menuPriceByItemId` map to both Blade views. Sized items resolve every active variant and keep the lowest effective price with its own original beside it, so a promotion targeting only the large size no longer shows the wrong "was". |
| M2 | **Fixed.** Both offline-sync entrances now carry the same bounds as `StoreOrderRequest`: item quantity `max:999`, modifier quantity `min:1 max:10`, child quantity `min:1 max:99`, plus `exists` checks on modifier and child ids. |
| L1 | **Withdrawn — the finding was wrong.** See above. No change made. |
| L2 | **Fixed, with a corrected remedy.** See the correction note above. |
| L3 | **Fixed.** `Money::subtract` still clamps to zero, but reports when the clamp engages. No call site legitimately overdraws, so a clamp is an invariant violation rather than routine — the diagnostic is guarded so a missing container can never break arithmetic. |

Every fix was break-tested: the change was reverted and the matching test
confirmed to fail.

---

# Second pass — GST, loyalty, credit, fees, trade

Covering everything the first pass deferred.

## H1 — Credit notes and refunds were subtracted from output tax twice
**Severity: High — under-declared GST** · `backend/app/Domains/Gst/Services/GstReportService.php:22`
· **Fixed**

`sumOutput()` deliberately spans `direction IN (output, adjustment)` so the
sales lines read net of credit notes. That means adjustments were **already
inside** `$outputStandard['tax_laar']`. The summary then did:

```php
$outputTaxBeforeAdj = $outputStandard['tax_laar'];      // already net of adjustments
$creditNoteTax = $adjustments->where('tax_laar', '<', 0)->sum('tax_laar');
$netOutputTax = $outputTaxBeforeAdj + $creditNoteTax;   // subtracts them a second time
```

Every credit note and every refund reduced declared output tax by twice its
value. Measured, not inferred — the two failing assertions before the fix:

| Scenario | Reported | Correct |
|---|---|---|
| MVR 100 sale, fully credited | `net_output_tax_laar` = **−800** | 0 |
| MVR 100 sale, MVR 25 refunded | `net_output_tax_laar` = **400** | 600 |

The direction of the error is **under-payment**: the return declares less GST
than is owed. `net_gst_payable_laar` clamps a negative to zero, so a fully
credited period looks merely harmless; a partially refunded one silently
under-declares by the tax on the refunded amount.

Two smaller faults in the same three lines:

- Filtering to `tax_laar < 0` dropped **positive** adjustments entirely. Both
  the reclassify-into-an-open-period path (`GstLedgerPoster`, the locked-period
  branch) and `postManualAdjustment` can post one, and a manual adjustment
  correcting an under-declaration is exactly the thing that must not vanish.
- `output_tax_before_adjustments_laar` was read off a figure that already had
  adjustments in it, so the field's name was untrue and the three published
  numbers did not reconcile.

**Fix.** Adjustments are summed once, both signs. "Before adjustments" is now
genuinely output-direction only. Net is stated as `before + adjustments` rather
than read back off `sumOutput()`, so the three published figures reconcile by
construction even if a manual adjustment carries a non-standard tax code. The
sales lines are untouched — they stay net of credit notes as before.

## M3 — Delivery and small-order fees are never GST-taxed; packaging is
**Severity: Medium** · **Fixed 2026-08-23** · `backend/app/Domains/Orders/Services/OrderTotalsCalculator.php:288-310`

`recalculateAndPersist` applies GST to the packaging fee when
`packaging_fee_taxable` is on (default on). The **delivery fee** and the
**small-order fee** get no tax treatment at all, and no
`delivery_fee_taxable` / `small_order_fee_taxable` setting exists anywhere.

This looks deliberate rather than forgotten — someone added packaging
taxability explicitly, with a migration and a setting, and did not add the
others. But if Maldivian GST does apply to a delivery charge, every delivery
order under-collects GST on that line, which is the same class of liability as
H1 above.

**Not changed on purpose** *(when this was written)*. Whether a delivery charge
is a taxable supply is a tax question, not a code question, and quietly altering
tax treatment on my own reading could create a different liability than the one
it fixes. This needs an answer from whoever files the returns. If the answer is
"yes, taxable", the fix is small: mirror the packaging block, with its own
setting so it can be turned on from a known date rather than retroactively.

**Answered and fixed — 2026-08-23.** The owner confirmed delivery charges are
taxable in the Maldives. Both fees are now taxed, each behind its own switch:

- `App\Domains\Orders\Services\OrderFeeTaxCalculator` — one class that answers
  "GST on the fees" for packaging, small-order and delivery. Both the totals
  pipeline and `GstLedgerPoster` call it, so the tax charged on an order and
  the taxable base declared for it come from the same arithmetic. They did not
  before: the poster carried its own copy of the packaging rule.
- New settings `delivery_fee_taxable` and `small_order_fee_taxable`, seeded on
  by `2026_08_23_140000_seed_delivery_and_small_order_fee_taxable`. The seed
  will not overwrite a value the owner has already set.
- Admin switches: delivery under Ordering Control Center → Zones & Fees;
  packaging and small-order under Online Ordering → Order fees & limits.
  `packaging_fee_taxable` had been readable but not writable since it was
  introduced — that is now fixed too.
- The tip stays untaxed. It is not consideration for a supply.

Historic orders are untouched. This changes what is collected from here on; it
does not restate what was already invoiced. Whether the shortfall on past
delivery orders needs declaring is the same question as H1 below and belongs
with whoever files the returns.

## Checked and found sound (no action)

- **GST tax math** (`GstTaxCalculator`). Integer laari throughout; inclusive
  extraction uses `amount * rate / (10000 + rate)` matching `Money`; a missing
  or empty `tax_code` resolves to standard-rated, so lines are never silently
  under-taxed.
- **Ledger direction.** Credit notes and refunds post `Adjustment` with
  negative taxable/tax/total; refund GST is allocated against the
  taxable-plus-tax portion so delivery, packaging and tips do not dilute the
  tax share. Posting into a locked period redirects to the next open one.
- **Loyalty** (`PointsCalculator`, `LoyaltyLedgerService`). Earn base is
  discounted merchandise; `floor()` everywhere, so rounding favours the
  merchant. Earn is idempotent per order+customer under a row lock, so a
  webhook and a return-URL arriving together cannot both credit. Redemption
  holds lock the account. Both reversals are capped — redemption restore at
  *consumed minus already restored*, earn reversal at
  `min(pointsToReverse, balance)` with lifetime points capped separately — so
  a refund cannot drive a balance negative or claw back more than was given.
- **Customer credit** (`CreditLedgerService`, `CreditEligibilityService`).
  Every mutation runs `Customer::lockForUpdate()`, and `assertCanCharge` runs
  **inside** that lock, so two concurrent charges cannot both fit under one
  headroom. Limit raises above the configured maximum require an owner
  override plus a reason. The one path that deliberately skips the eligibility
  check (invoicing consigned stock) documents why: the exposure was already
  gated at dispatch and re-checking would double-count.
- **Packaging and small-order fees.** Per-line fee capped at `MAX_FIXED_MVR`,
  quantities coerced to non-negative integers, non-positive fees skipped,
  per-line vs per-unit modes explicit. Small-order fee only applies to pickup
  and delivery and only below the threshold.
- **Delivery fee.** Free-delivery threshold measured against *discounted*
  merchandise; zone match is case-insensitive and exact, with an unknown island
  falling back to the default fee rather than to zero.
- **Trade invoicing.** Totals are integer laari with decimal columns derived by
  `round($laar / 100, 2)`. Receivable payments lock payment, invoice and
  customer, and are idempotent against `CustomerCreditLedger.payment_id`
  checked both before and after the lock.

## One loose thread (informational) — **closed 2026-08-23**

`GstLedgerPoster::postRefund` read `$refund->amount_laar ?? round(amount * 100)`.
There is no `amount_laar` column on `refunds`, so the left side was always null
and the fallback always ran. Harmless — Eloquent returns null for an unknown
attribute — but it was dead code anticipating a column that was never added, and
it was the same wrong assumption that produced the withdrawn L1. The dead read
has been removed; the decimal-to-laari conversion is now the stated, only path,
with a comment warning against reintroducing it.

## A note on this audit's own accuracy

Two of the five findings were wrong in some respect — L1 entirely, L2 in its
prescribed remedy — and both only came to light because the fix was attempted
and the assumptions checked against the schema and the existing fixtures. A
reading audit is a hypothesis; it is worth about as much as the verification
behind it. The "found sound" list above carries the same caveat: it was traced
by reading, not by attacking a running system.
