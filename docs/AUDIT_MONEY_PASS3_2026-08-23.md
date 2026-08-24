# Money & Calculations Audit — Third Pass — 2026-08-23

Scope: the ring around the order engine — places where money is **counted,
split, or exported** after the order is done. The first two passes (see
`AUDIT_MONEY_2026-08-23.md`) covered pricing, totals, GST, payments, refunds,
loyalty, credit and trade invoicing; every finding there is fixed. This pass
covers what had never been opened:

- Shift cash reconciliation (`expected_cash`, blind counts, variance)
- The two totals pipelines that run outside `OrderTotalsCalculator`
  (catering quotes, gift-card purchases)
- Payment commissions and their expense booking
- Customer deposits ledger
- Trade credit exposure
- Xero sync
- Recipe cost / expense budget calculators

Audited against `main` at `53284d79c`. Same caveat as before: this was traced
by reading, with assumptions checked against schema and callers where they
mattered, but not by attacking a running system. The first audit's own error
rate (two findings wrong in some respect) is the reason every remedy below says
*verify before fixing*.

> **Status (2026-08-24): all nine findings fixed.** Each is marked below with
> what was done. Two carried an assumption that is stated in the code and
> repeated here, because they are judgement calls rather than defects:
>
> - **T5** assumes the bank keeps its fee when an order is refunded, so the
>   booked expense is right and the summary was the side that understated. If
>   BML actually reverses the fee, the correct fix is to reverse the expense —
>   not to re-hide the row.
> - **T8** attributes an owner's shiftless cash payout to the single open
>   drawer when exactly one is open, and to nothing when none or several are.
>
> One residual is **not** closed by code: **T3** can only be made fully
> authoritative by setting `XERO_SALES_TAX_TYPE` / `XERO_EXPENSE_TAX_TYPE` to
> the rate codes in your own Xero organisation. Until they are set, Xero still
> applies the account default to the amounts we now send explicitly. And
> expenses **already pushed** to Xero carry the wrong date (T2) — that is
> corrected in Xero, not here.

## Bottom line

No path to losing money silently was found. What this pass did find is one
**process gap with human stakes** — a refund approved after the requesting
shift closes debits the wrong drawer's expectation, which can make an innocent
cashier count short — and two **Xero export defects** that misstate dates and
GST in the books if Xero is actually relied on. The rest is small: a
settings-change window in catering quotes, commission tracking blind spots,
and a handful of latent races that today are closed by upstream locking rather
than by the code that owns the data.

The strongest result is negative space: gift-card purchase/fulfillment, trade
credit exposure, and the deposit ledger's core paths were checked and came out
clean — locks held in the right places, caps checked inside them, idempotency
backed by real unique constraints.

---

## Findings

### T1 — A refund approved after its shift closes debits the wrong drawer
**Severity: Medium — no money is lost, but a cashier can be blamed for a shortage that isn't theirs** · **Fixed 2026-08-24**
· `app/Domains/Finance/Services/RefundWorkflowService.php:182` (shift pinned at request)
· `app/Http/Controllers/Api/RefundController.php:128` (approver must have an open shift — which is then ignored)
· `app/Http/Controllers/Api/ShiftController.php:85-94` (`expectedCashFor` counts `approved/processed` refunds by that pinned `shift_id`)
· `app/Http/Controllers/Api/ShiftController.php:302` (`summary()` recomputes live, even for closed shifts)

The sequence:

1. Cashier requests a cash refund during shift A. The `Refund` row is created
   `pending` with `shift_id = A`. Pending refunds are correctly excluded from
   expected cash — no money has moved.
2. Shift A closes. Its `expected_cash` and `variance` are persisted. Fine.
3. Next day the manager approves (the OTP/dual-approval workflow makes
   overnight pendings entirely normal). The refund becomes `approved` —
   **still `shift_id = A`**. The approver's own open shift is checked at the
   door (`Open a shift before approving`) and then never used.
4. The cash physically leaves whatever drawer is open now — shift B.

Two things are now wrong at once:

- **Shift B counts short.** Its `expectedCashFor` never subtracts the payout
  (the refund belongs to shift A), so at close the drawer is down by the
  refund and the cashier has to explain a variance they didn't cause.
- **Shift A's record forks.** The stored `expected_cash`/`variance` were
  computed at close, but `summary()` recomputes live — so shift A's summary
  now shows a lower expected than what was stored and signed off, a
  retroactive phantom overage. Two views of a closed shift disagree.

The obvious remedy — re-attribute `shift_id` to the approver's open shift at
approval time — needs care: owner self-approve at request time (the common
case) already works correctly, and a refund whose *request* and *approval*
happen in the same still-open shift must not move. Verify against how the
counter actually runs refunds before changing attribution. An alternative is
to leave attribution alone and freeze `summary()` for closed shifts to the
stored numbers, which at least stops the record forking.

**Fixed — both halves.** New nullable `refunds.drawer_shift_id`, stamped at
approval with the approver's open shift; `expectedCashFor` now matches on
`COALESCE(drawer_shift_id, shift_id)`, so refunds approved before the column
existed keep their old attribution and history does not move. `shift_id`
still drives reporting — which shift the refund *belongs* to is a different
question from which till paid it. Owner request+approve in one action passes
its own shift, so the ordinary counter case is unchanged. Separately,
`summary()` now reports a closed shift's stored `expected_cash` rather than
recomputing it, so a signed-off drawer cannot move afterwards.
`RefundDrawerShiftAttributionTest` covers all of it, including the legacy
fallback and pending/rejected refunds moving no money.

### T2 — Every expense pushed to Xero is dated the day of the push
**Severity: Medium if Xero is relied on; cosmetic otherwise** · **Fixed 2026-08-24**
· `app/Domains/Accounting/Services/XeroSyncService.php:139`

`pushExpense` reads `$expense->date ?? now()->toDateString()`. The `expenses`
table has no `date` column — the model stores `expense_date` (cast at
`app/Models/Expense.php:42`) — so the left side is **always null** and every
expense lands in Xero dated on push day. Push July's expenses in August and
July's books are empty while August is double-weighted. Same null-column
pattern as the withdrawn L1 and the dead `refunds.amount_laar` read: code
addressing a column that doesn't exist, silently falling through.

Fix is one word (`expense_date` for `date`), but records already pushed carry
the wrong date in Xero and would need correcting there.

**Fixed.** `XeroSyncService::pushExpense` reads `expense_date`. Anything
already pushed still carries the push date in Xero and has to be corrected
there — this only stops it happening again.

### T3 — Xero derives GST from its own account defaults, not from what was charged
**Severity: Medium if Xero is used for anything tax-adjacent; informational otherwise** · **Fixed 2026-08-24 (needs a config value)**
· `XeroSyncService.php:66-80` (invoice), `:131-146` (expense)

Both pushes send a single roll-up line, `LineAmountTypes: Inclusive`, with
**no `TaxType`** — so Xero computes the GST portion from whatever tax rate is
configured as the default on account `200`/`400` in Xero. The invoice's actual
`tax_laar` — the number the MIRA-ready `GstReportService` declares — is never
sent. If the Xero account default is "No GST", Xero under-reports output tax;
if it's 8%, Xero's rounding on a roll-up line can still differ laari-for-laari
from the per-line ledger. The books in Xero and the GST return can disagree
while both look internally consistent.

Also worth knowing (observation, not defect): only trade `Invoice`s and
`Expense`s are pushed, manually from the admin (`XeroController`). Daily POS
and online sales never reach Xero — it is a partial ledger by design.

**Fixed, with one thing left for you.** Both pushes now send
`LineAmountTypes: Exclusive` with the net amount and an explicit `TaxAmount`
taken from the invoice's own `tax_laar` (and, for expenses, the gross less
`tax_laar`) — so the figures Xero receives are the ones that were charged and
declared, not a gross lump for it to split. Xero only honours an explicit
`TaxAmount` against a tax rate it recognises, and nobody here can know the
codes in your Xero organisation, so **set `XERO_SALES_TAX_TYPE` and
`XERO_EXPENSE_TAX_TYPE`** to your 8% output/input rate codes. Left unset (the
default) the amounts are still sent but the account default governs, exactly
as before. `XeroPushPayloadTest` pins the payload, including a regression
guard on the old `/100` scaling bug.

### T4 — A catering quote is validated at send time but charged against a total recalculated at approval time
**Severity: Low-Medium** · **Fixed 2026-08-24** · `app/Domains/Catering/Services/CateringQuoteService.php:124-146`,
`app/Domains/Catering/Services/CateringQuoteApprovalService.php:95-105`

At **send**, the payment amount is validated against `taxPreview` (full
payment must equal the quote total; deposits may not exceed it). At
**approval** — possibly days later — the order is rebuilt through
`OrderTotalsCalculator::recalculateAndPersist` with **live** settings, and the
customer is charged the *stored* `quote_payment_laar`. Line prices are frozen
on the quote lines, so the drift window is settings: GST rate, tax-inclusive
mode, `packaging_fee_taxable` — the last of which became admin-editable
today. Flip a setting between send and approval and the customer pays the
quoted amount while the order records a different total; the event still
confirms (`ConfirmCateringEventOnPaymentListener` checks coverage of
`quote_payment_laar`, not the order total), leaving a residual balance or
overpayment nobody chose.

The window is real but narrow, and the right fix is a decision, not a patch:
either freeze the tax snapshot into the quote and build the order from it, or
re-validate `quote_payment_laar` against the rebuilt total at approval and
refuse to initiate payment on a mismatch.

**Fixed with the second option** — fail closed rather than freeze a snapshot,
because a stale quote should be re-sent by a human rather than silently
honoured at old tax. `assertQuotedAmountStillMatchesOrder` runs after the
order is rebuilt and before BML is called: a full payment must equal the order
total, a deposit must not exceed it, and a mismatch throws, rolling the order
back and leaving the quote awaiting the customer. The same guard runs on the
resume path so a retry cannot pay a quote that already disagreed.

Writing the test exposed that `EventQuotePhase4Test`'s fixture had been
stamping a **tax-exclusive** payment amount — its own comment called it
"approximate" — which `CateringQuoteService::send()` would have rejected
outright. The fixture now stamps what `send()` stamps, and one assertion that
had been pinned to the unrealistic figure (MVR 450 with no GST) now expects
MVR 486.

### T5 — Refunds make the commission summary and the expense ledger disagree
**Severity: Low** · **Fixed 2026-08-24 (on a stated assumption)** · `app/Domains/Payments/Services/PaymentCommissionService.php:135-140`,
`PaymentCommissionExpenseService.php:37-41`

When a payment settles, a commission `Expense` is booked. When the order is
later **fully refunded**, its status leaves `SALE_STATUSES`, so the commission
summary drops both the gross and the commission — but the booked expense row
stays. The two views of "what did card processing cost us" now differ by every
refunded order. Which one is *right* depends on what BML actually does with
its fee on a refund (banks typically keep it, which would make the expense row
correct and the summary the one that understates). Needs the real BML
behaviour confirmed before touching either side.

**Fixed on the stated assumption** that the bank keeps its fee. The summary
filters on a new `COMMISSIONED_ORDER_STATUSES` — deliberately its own list
rather than a change to the shared `ReportMoneySql::SALE_STATUSES`, which is
about sales and is used elsewhere — that includes `refunded` and
`partially_refunded` but still excludes `cancelled`. The expense row and the
summary now agree. **If BML does reverse its fee on refund, reverse the booked
expense; do not re-hide the row here.**

### T6 — Stripe payments never accrue commission
**Severity: Low, conditional on Stripe use** · **Fixed 2026-08-24** · `PaymentCommissionService.php:21-24,49-63`

`resolveChannel` matches gateway `bml` and methods
`bml_connect/bml_pay/bml/online/card/card_pos/qr`. A Stripe payment (method
`stripe`, per `StripeController.php:146`) matches nothing → channel `null` →
no commission, no expense. If Stripe is ever switched on, its ~3% cost is
invisible to profit reporting. One list entry to fix, when and if Stripe goes
live.

**Fixed.** `stripe` joins `GATEWAY_METHODS`, so a Stripe payment accrues
commission at the online-gateway rate the day it is switched on rather than
silently costing nothing on paper.

### T7 — Latent: the negative-cash-payment sum has no status filter
**Severity: Low, latent** · **Fixed 2026-08-24** · `ShiftController.php:72-76`

`cashRefundsRawLaar` sums `Payment` rows with `method=cash, amount<0` and **no
status constraint** — a pending or failed negative payment would reduce
expected cash. Today nothing in the codebase creates negative `Payment` rows
at all (verified across all `Payment::create` sites), so the term is always
zero; it exists to absorb legacy data. If a negative-payment path is ever
added, this filter gap becomes live. A status filter costs nothing.

**Fixed.** The sum is now restricted to settled statuses, matching the
positive cash-sales term directly above it.

### T8 — An owner cash deposit-payout without a shift leaves the drawer untracked
**Severity: Low** · **Fixed 2026-08-24 (on a stated assumption)** · `app/Domains/Deposits/Services/DepositLedgerService.php:337-359`

Cash deposit payouts require an open shift — except for owners, who may pay
out with none. With no shift there is no `CashMovement`, so if the owner takes
that cash from an open drawer, that drawer will count short with no record.
The bypass is deliberate (owners aren't drawer-bound), but the money is still
physical. Worth either recording a movement against the open drawer when one
exists, or accepting it as policy with eyes open.

**Fixed, on a stated assumption.** When an owner pays out cash with no shift
of their own, the movement is recorded against the single open drawer if
exactly one is open — the same single-open-shift reasoning the POS header
already uses to attribute gateway payments. With no drawer open, or several,
nothing is recorded, because guessing which till the note came from would be
worse than silence. A cashier or an owner *with* a shift still charges their
own drawer, unchanged.

### T9 — Latent: deposit-reversal idempotency is check-then-insert
**Severity: Low, latent** · **Fixed 2026-08-24** · `DepositLedgerService.php:390-392`

`reverseUsageForOrderRefund` guards on `refund_id + type='reversal'` existing
— checked **outside** the transaction, with no unique constraint behind it
(unlike usage, where `unique(payment_id)` at the schema level makes the same
pattern safe). Two concurrent reversals for one refund would double-credit the
wallet. Today this cannot happen: the refund workflow serializes approval
under a row lock and fires the event once. The guard is only as strong as
that upstream discipline — a `unique(refund_id, type)` index would make it
unconditional.

**Fixed.** `unique(refund_id, type)` added, with duplicates collapsed first so
the index builds on real data (the migration does not unwind the balance those
rows created — a silent correction to a customer's money belongs in a
considered adjustment with an audit trail, not a schema migration). The
existence check also moved inside the account lock. NULL `refund_id` rows —
top-ups, payouts, usage — are unaffected, since NULLs are distinct in a unique
index on both MySQL and SQLite.

---

## Checked and found sound (no action)

- **Gift-card purchase & fulfillment** (`GiftCardPurchaseService`,
  `GiftCardPurchaseFulfillmentService`). Whole-MVR face values clamped
  50–5000; order total = face value with tax 0 — the correct GST treatment
  for vouchers, since the redeeming order is taxed in full with the card as
  tender. Fulfillment is locked and idempotent via the `gift_card_id` guard;
  the code is persisted encrypted before send so delivery failure can't lose
  a paid card; the main calculator's gift-card bypass is deliberate and
  documented.
- **Trade credit exposure** (`TradeCreditExposureService`). Exposure = owed +
  unbilled holding at stamped line prices; disputes and chargeable missing
  stock count *against* the customer until resolved (conservative);
  `TradeDispatchService` locks the customer row before the gate and dispatch
  is idempotent by key. One note: the holding scan walks every delivery line
  the customer ever had — correct, but it will slow with years of history.
- **Shift close mechanics.** `close()` and `countAttempt()` both take row
  locks (double-tap safe); blind-count role gating hides the expected total
  of an open drawer from non-managers; every count attempt is logged; a
  non-zero variance requires notes. `forceClose` stamps variance 0 with
  closing := expected — acceptable, and distinguishable from a real count by
  its null `cash_count_method`.
- **Deposit ledger core.** Every balance move locks the account;
  `assertCanUseDeposit` runs inside the lock; payout is capped inside the
  lock; usage idempotency is backed by a real `unique(payment_id)` index;
  cash top-ups and payouts write `CashMovement` rows, so deposit cash flows
  through expected-cash correctly (the `deposit_cash_*` fields in the shift
  summary are display slices, not a second accounting).
- **Catering quote arithmetic.** Line quantities are `unsignedInteger` (the
  int cast cannot truncate); per-line tax uses the shared `GstTaxCalculator`;
  packaging uses the shared calculator and taxable flag; the accepted quote
  becomes an order through the audited main pipeline; deposit ≤ total is
  enforced; re-approval is idempotent and BML idempotency keys are
  version-scoped.
- **Commission math.** Integer laari, `floor` (understates cost, never
  overstates), rates clamped 0–10%, `applyToPayment` idempotent via the
  `commission_channel` stamp, expense booking locked per payment.
- **Recipe cost / expense budgets.** Display-and-advisory only; month
  windows and status filters correct.

## Observations (informational)

- **`RefundDrawerCashService` is a mirror, not a source.** It re-implements
  the reversal formulas of three listeners "reference only" — if any listener
  formula changes, the drawer split silently drifts from the actual ledger
  moves. A shared formula would remove the class of bug.
- **The margin floor reads `items.cost` directly**
  (`OrderTotalsCalculator::maxMerchandiseDiscountUnderMarginFloor`), not
  `RecipeCostCalculator::effectiveCost` — items costed only through a recipe
  impose no discount floor.
- **A stale stored `recipes.total_cost` wins** over the live ingredient
  roll-up (`RecipeCostCalculator::forRecipe` short-circuits on it).
- **Catering delivery is never charged a delivery fee** anywhere in the
  pipeline — if delivery to a venue costs money, it must be priced into a
  quote line by hand. Now that delivery fees are GST-taxable, note that a
  hand-added custom "Delivery" line is standard-rated automatically (custom
  lines default to standard), which happens to be the right treatment.

## What this pass did not do

No running-system attack, no concurrency testing under real load, and no
verification of BML's actual fee-on-refund behaviour (T5 needs that answer
from the bank or the statement). Payroll does not exist in this codebase, so
staff pay was out of scope by absence.
