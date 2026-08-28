# Finance Reporting Audit — 2026-08-26

Scope: the P&L and cash-flow reports in `FinanceReportController` — the
aggregation layer the earlier three money-audit passes did not cover (those
looked at how each order, refund, payment and ledger entry is computed; this
looks at how they are *summed into a management report*).

Read-only. Nothing here is changed in the reports. The findings are
definitional — they change what a number *means*, and redefining a figure the
owner may reconcile against their accountant is a decision, not a patch, the
same way the GST-taxability questions were. The one place they are acted on is
the **new break-even calculator**, which computes its own honest,
GST-exclusive margin rather than inheriting the headline figure — see the note
at the end.

## F1 — P&L "revenue" is GST-inclusive, so gross margin is overstated
`FinanceReportController::profitAndLoss()` · `ReportMoneySql::ORDER_TOTAL_LAAR`

Revenue is summed from `orders.total_laar` — the grand total the customer
paid, which **includes the output GST** the business collects and must remit
to MIRA. Output tax is a liability, not income, so revenue for margin purposes
should be net of it.

The report does surface `tax` as a separate memo line, but never subtracts it:
`net = gross − refunds` is still GST-inclusive, and `gross_margin_pct` and
`net_profit_margin_pct` are both computed against that inflated base. At 8% the
margin percentages read a few points higher than they are.

Not changed, because "revenue" in a management report is a figure the owner
may already reconcile against Xero or their accountant, and silently switching
it to ex-GST would make this period disagree with every prior one. If the
owner wants it ex-GST, it is a one-line change to subtract `tax` — but it
should be a deliberate, dated switch, not a surprise.

## F2 — COGS is purchase-based and GST-inclusive
`profitAndLoss()` · `Purchase::sum('total')`

Two things stacked:

1. **Time basis.** Revenue is by `orders.created_at`; COGS is by
   `purchases.purchase_date`. Purchases are lumpy — a sack of flour is bought
   once and sold over weeks — so the COGS in any single month bears little
   relation to the food actually *sold* that month. Gross margin is therefore
   noisy month to month. Recipe-based COGS (deducting the cost of what each
   sold item consumed) would track sales, but the data plumbing for that is a
   larger piece of work.
2. **GST.** `purchases.total` includes input GST, which for a registered
   business is reclaimable and so is not a real cost. `purchases.subtotal`
   holds the ex-tax figure. COGS is thus overstated by reclaimable input tax.

F1 and F2's GST errors point in opposite directions (revenue too high, COGS
too high) so they partly mask each other in the operating-profit line — which
is exactly why neither is obvious from the headline.

## F3 — Revenue includes tips
`ORDER_TOTAL_LAAR` includes `tip_amount`. If tips pass through to staff they
are not revenue to the business, and including them inflates both revenue and
apparent margin. Whether they pass through is an operational fact I can't read
from the schema — flagged for the owner. (If tips are retained by the house,
this is not a finding.)

## F4 — Cash flow omits every non-cash-adjacent flow
`cashFlow()` treats inflow = order totals and outflow = expenses + purchases.
It is an *accrual-ish* movement report, not true cash flow: it ignores when
money actually moved (an unpaid invoice counts as inflow the day the order was
created), and it omits refunds, deposit movements, gift-card float and owner
draws entirely. Fine as a revenue-vs-spend trend; misleading if read as "cash
in the bank". Worth a rename or a caveat in the UI more than a code change.

## Checked and found sound

- **Refund handling in P&L.** Refunds are subtracted from gross revenue and
  scoped to `approved/processed/completed`, so pending/rejected refunds (money
  still with the merchant) are correctly excluded.
- **Payment processing fees.** Sourced from `PaymentCommissionService`, and the
  auto-booked commission expenses are acknowledged as already inside `opex`
  (the comment at line 88 is correct — no double count).
- **Waste.** `WasteLog` already includes consignment waste; the code
  deliberately does not add `wholesaleWaste` again.
- **Status scoping.** `SALE_STATUSES` is used consistently for revenue across
  P&L, cash flow and daily summary.

## How the break-even calculator handles this

The calculator does **not** seed its margin from the P&L headline, precisely
because of F1–F3. It recomputes from components, GST-exclusive on both sides:

- Revenue = `order total − order tax − refunds` (retail) + `wholesale revenue −
  wholesale tax`.
- Variable cost (COGS) = `purchases.subtotal` (ex input tax).
- Contribution margin ratio = (revenue − COGS) / revenue, on those ex-GST
  figures.
- Fixed costs = approved operating expenses + waste over the window, normalised
  to 30 days.

Every one of these is a **seed the owner can override** in the UI — that is
what makes it an *estimate*. The point of the tool is a defensible starting
number plus a what-if, not a claim of precision the data cannot support. The
tip question (F3) is left to the owner: if tips are pass-through, the seeded
revenue is slightly high and they can trim it.
