# Go-Live Test Checklist

Work through this on the **test install** first, then repeat the money tests on production
before opening. Tell me the test number if one fails — that is enough for me to find it.

Rules while testing:
- Use a real phone, not a desktop browser pretending to be one.
- After any code change, **deploy before retesting.** Three problems in the last week were
  correct code on a stale server.
- If something looks wrong, note the test number and move on. Do not fix as you go.

**Automation:** Playwright `--project=local` (`LOCAL_BASE_URL=http://127.0.0.1:8000`). Shared staging
`https://test.bakeandgrill.mv` is for the existing non-destructive suite only. Spec titles include
`@checklist-N.N` so “6.4 failed” maps to a spec. Destructive specs refuse a remote `baseURL` and
enable the SMS kill switch (refund screens use `SMS_LIVE=false` demo instead — see 2.x notes).

| Status | Meaning |
|---|---|
| **AUTOMATED** | Permanent Playwright spec under `e2e/tests/go-live/` (local project). |
| **HUMAN ONLY** | Explicitly skipped in `human-only.spec.ts` — you must do it. |
| **NOT COVERED** | Skipped with a written blocker in Coverage / `not-covered.spec.ts`. |

```bash
npx playwright test --project=local
```

---

## Part 0 — Before you start (5 minutes)

| # | Do this | Should happen | Coverage | Spec |
|---|---|---|---|---|
| 0.1 | Run `./scripts/prod-preflight.sh` on the server | No FAIL lines. `APP_DEBUG` must be false, `APP_ENV` production | **HUMAN ONLY** — server shell on sg-s2 | `human-only.spec.ts` |
| 0.2 | Run `php artisan app:verify-production-config` | Passes | **HUMAN ONLY** — server shell on sg-s2 | `human-only.spec.ts` |
| 0.3 | Run `./scripts/post-deploy-smoke.sh test` | All URLs respond | **HUMAN ONLY** — server shell on sg-s2 | `human-only.spec.ts` |
| 0.4 | Run `./scripts/backup.sh` and confirm a backup file appears | A dated file exists and is not empty | **HUMAN ONLY** — server filesystem | `human-only.spec.ts` |
| 0.5 | Check the deployed commit matches what you merged | Same short SHA | **HUMAN ONLY** — server `git log` | `human-only.spec.ts` |

**Do not continue if 0.4 fails.** Everything below can be undone from a backup; nothing can be
undone without one.

---

## Part 1 — Money (do these first, they matter most)

| # | Do this | Should happen | Coverage | Spec |
|---|---|---|---|---|
| 1.1 | Place an online order and pay with a real card | Order paid, receipt SMS arrives, order appears in POS and KDS | **HUMAN ONLY** — real card + handset SMS | `human-only.spec.ts` |
| 1.2 | **Double-click the pay button** as fast as you can | Charged **once**. One payment row, one order | **AUTOMATED** — skips if BML sandbox credentials missing (no HTTP mock of `BmlConnectService`) | `01-payment-race.spec.ts` |
| 1.3 | Start a payment, then **close the tab** at the bank page | Order stays unpaid. No half-paid state. Retrying works | **HUMAN ONLY** — real bank redirect UI | `human-only.spec.ts` |
| 1.4 | Start a payment and let it sit 10 minutes before completing | Payment still lands correctly, or fails cleanly with a retry | **HUMAN ONLY** — real bank session timeout | `human-only.spec.ts` |
| 1.5 | Pay a second order while the first is still open | Both correct, no crossed payments | **NOT COVERED** — needs two live bank/card sessions; no trustworthy local BML mock | `not-covered.spec.ts` |
| 1.6 | Place a **cash** order in POS and take payment | Drawer total increases by the right amount | **NOT COVERED** — requires observing a physical cash drawer float | `not-covered.spec.ts` |
| 1.7 | Give change on a cash order | Change and counted totals are right | **NOT COVERED** — requires physical change-making at the till | `not-covered.spec.ts` |
| 1.8 | Pay part cash, part card | Split recorded correctly; both show on the receipt | **NOT COVERED** — requires a real card terminal tender | `not-covered.spec.ts` |
| 1.9 | Apply a discount, then pay | GST calculated on the discounted amount, not the original | **AUTOMATED** (cash pay; compares `tax_laar`) | `01-discount-gst.spec.ts` |

---

## Part 2 — Refunds (the controls you asked for)

| # | Do this | Should happen | Coverage | Spec |
|---|---|---|---|---|
| 2.1 | As a **cashier**, request a refund | Goes to pending. No money moves. Owner gets an SMS | **AUTOMATED** (POS screen; SMS is demo via `SMS_LIVE=false` — kill switch aborts the request) | `02-refunds-screens.spec.ts` |
| 2.2 | As the cashier, try to approve **your own** request | Refused | **AUTOMATED** (no Approve in POS; `/admin/refunds` Access Denied) | `02-refunds-screens.spec.ts` |
| 2.3 | As owner, approve it — customer OTP required | Money moves only after the code is entered | **NOT COVERED** — OTP body redacted in `sms_logs` (`[otp redacted]`); cannot read code from DB | `02-refunds-screens.spec.ts` |
| 2.4 | Check the drawer after a cash refund | Reduced by exactly the refund amount | **NOT COVERED** — blocked on 2.3 (OTP unreadability) | `02-refunds-screens.spec.ts` |
| 2.5 | Try to refund an order that was never paid | Refused with a clear message | **AUTOMATED** (POS screen message) | `02-refunds-screens.spec.ts` |
| 2.6 | Refund an online order paid by card | Correct handling, customer notified | **NOT COVERED** — card settlement + handset SMS | `not-covered.spec.ts` |

API-level refund workflow remains covered by `RefundApprovalWorkflowTest` (14 cases). Specs above check the screens.

---

## Part 3 — Closing the shift (blind count)

| # | Do this | Should happen | Coverage | Spec |
|---|---|---|---|---|
| 3.1 | As a **cashier**, open Close Shift | **No expected total anywhere on screen** | **AUTOMATED** | `03-shift-close.spec.ts` |
| 3.2 | Enter counts and tap Review & close | Popup says match or does not match — **no amounts shown** | **AUTOMATED** | `03-shift-close.spec.ts` |
| 3.3 | Deliberately count wrong, then "Count again" | Both counts recorded. You can see the recount later | **AUTOMATED** | `03-shift-close.spec.ts` |
| 3.4 | Close with a difference | Reason required. Shift closes. You get the real numbers | **AUTOMATED** | `03-shift-close.spec.ts` |
| 3.5 | Open "More notes & coins" | MVR 1000 and rare coins are there | **AUTOMATED** | `03-shift-close.spec.ts` |
| 3.6 | Check the screen fits without scrolling | Phone and iPad, default state | **AUTOMATED** | `03-shift-close.spec.ts` |

---

## Part 4 — Ordering journeys

| # | Do this | Should happen | Coverage | Spec |
|---|---|---|---|---|
| 4.1 | Order for **pickup** | Correct through to collection | **AUTOMATED** | `04-ordering-journeys.spec.ts` |
| 4.2 | Order for **delivery** with a saved address | Address correct on the ticket and driver app | **AUTOMATED** | `04-ordering-journeys.spec.ts` |
| 4.3 | Order for delivery with **two saved addresses** | You can switch; it warns before paying if using the default | **AUTOMATED** | `04-ordering-journeys.spec.ts` |
| 4.4 | Scan the **dine-in QR** and order | Table correct on the ticket | **AUTOMATED** (skips if gate/seed blocks) | `04-ordering-journeys.spec.ts` |
| 4.5 | Order **for tomorrow** | Does not appear on today's kitchen screen | **AUTOMATED** | `04-ordering-journeys.spec.ts` |
| 4.6 | Turn online ordering **off**, then open the menu | Items still clickable and readable. Only checkout is blocked | **AUTOMATED** | `04-ordering-journeys.spec.ts` |
| 4.7 | With ordering off, order a tomorrow item | Allowed. Same-day order still refused | **AUTOMATED** | `04-ordering-journeys.spec.ts` |
| 4.8 | Order the **last unit** of a stock-tracked item | Sold out afterwards, for everyone | **AUTOMATED** | `04-ordering-journeys.spec.ts` |
| 4.9 | Two people order the last unit at the same time | Only one succeeds | **AUTOMATED** | `04-last-unit-race.spec.ts` |

---

## Part 5 — Kitchen and staff

| # | Do this | Should happen | Coverage | Spec |
|---|---|---|---|---|
| 5.1 | Send an order to the kitchen screen | Appears promptly | **AUTOMATED** | `05-kitchen-staff.spec.ts` |
| 5.2 | Mark it ready | Customer gets the ready SMS | **HUMAN ONLY** — handset SMS | `human-only.spec.ts` |
| 5.3 | Log in as a **real cashier account** (not owner) | Can do their job; cannot see reports, settings, wholesale or complaints | **AUTOMATED** (cashier lacks `admin.access`; POS job + admin login refused) | `05-kitchen-staff.spec.ts` |
| 5.4 | Try to reach an admin page as that cashier by typing the URL | Blocked | **AUTOMATED** (admin auth gate + deep-link sign-in wall + API 4xx) | `05-kitchen-staff.spec.ts` |
| 5.5 | Print a receipt on the real printer | Correct and legible | **HUMAN ONLY** — physical printer | `human-only.spec.ts` |

---

## Part 6 — After the sale (new)

| # | Do this | Should happen | Coverage | Spec |
|---|---|---|---|---|
| 6.1 | Open the receipt link from the SMS on your phone | Loads, readable, totals correct | **HUMAN ONLY** — handset | `human-only.spec.ts` |
| 6.2 | Tap "Something wrong?", pick a category, tap Send | **Two taps, no typing.** You get an SMS. Customer sees a reference | **AUTOMATED** | `06-after-sale.spec.ts` |
| 6.3 | Pick **two** categories at once | Both recorded | **AUTOMATED** | `06-after-sale.spec.ts` |
| 6.4 | Pick "charged the wrong amount" | Flagged for refund review. **No refund created** | **AUTOMATED** | `06-after-sale.spec.ts` |
| 6.5 | Pick food safety / allergy | Urgent alert, different wording, top of the queue | **AUTOMATED** | `06-after-sale.spec.ts` |
| 6.6 | Reopen the receipt after complaining | You see your case, reference and plain-word status | **AUTOMATED** | `06-after-sale.spec.ts` |
| 6.7 | In admin, write a customer reply and close the case | Customer gets it by SMS and sees it on the receipt | **NOT COVERED** — checklist requires handset SMS delivery of the reply | `not-covered.spec.ts` |
| 6.8 | Check the internal note is **not** on the receipt page | Never visible to the customer | **AUTOMATED** | `06-after-sale.spec.ts` |
| 6.9 | Rate the receipt, then rate it again differently | One rating, updated. Not two | **AUTOMATED** | `06-after-sale.spec.ts` |
| 6.10 | Open someone else's receipt link and try to see their complaints | Nothing revealed | **AUTOMATED** | `06-after-sale.spec.ts` |

---

## Part 7 — Wholesale rehearsal (one shop, end to end)

Only needed before you supply a real shop. **Automation is LOCAL ONLY** (stock / invoices).

| # | Do this | Should happen | Coverage | Spec |
|---|---|---|---|---|
| 7.1 | Create a trade account and a price list | Prices resolve; preview shows which rule was used | **AUTOMATED** (ordered scenario 7.1–7.9) | `07-wholesale-rehearsal.spec.ts` |
| 7.2 | Dispatch a delivery | Stock leaves. Shop gets an SMS. No sale recorded anywhere | **AUTOMATED** | same |
| 7.3 | Check the online menu after dispatch | Cannot sell the stock that went out | **AUTOMATED** | same |
| 7.4 | Reconcile: some sold, some returned good, some spoiled | Good stock returns; spoiled logged as waste at cost | **AUTOMATED** | same |
| 7.5 | **Deliberately report a wrong sold number** vs the count | Flagged as a mismatch. Cannot invoice until resolved | **AUTOMATED** | same |
| 7.6 | Resolve the mismatch and invoice | One invoice, correct amount, shop's balance rises once | **AUTOMATED** | same |
| 7.7 | Take a **part** payment in cash | Balance right; appears in the shift close as a credit repayment | **AUTOMATED** | same |
| 7.8 | Check the P&L for the period | Wholesale revenue appears, separate from retail | **AUTOMATED** | same |
| 7.9 | Try to dispatch beyond the credit limit | Refused, naming what is owed and what is held | **AUTOMATED** | same |

---

## Part 8 — Content and the home page

| # | Do this | Should happen | Coverage | Spec |
|---|---|---|---|---|
| 8.1 | Turn a home page section off in admin, view both apps | Section gone; nothing else moves | **AUTOMATED** | `08-content.spec.ts` |
| 8.2 | Reorder two sections | Order changes on that app only | **AUTOMATED** | `08-content.spec.ts` |
| 8.3 | Add a text block | Appears where you put it | **AUTOMATED** | `08-content.spec.ts` |
| 8.4 | Try to remove the order mode cards | Refused, with a reason | **AUTOMATED** | `08-content.spec.ts` |
| 8.5 | Edit hero slides | Both apps update | **AUTOMATED** | `08-content.spec.ts` |

---

## Part 9 — The one nobody does

| # | Do this | Should happen | Coverage | Spec |
|---|---|---|---|---|
| 9.1 | **Restore your backup onto the test install** | Completes. Site works. Data is there | **HUMAN ONLY** — server restore | `human-only.spec.ts` |
| 9.2 | Check migrations ran cleanly during the restore | No errors | **HUMAN ONLY** — server restore | `human-only.spec.ts` |
| 9.3 | Confirm the queue worker is running | `php artisan queue:work redis` alive | **HUMAN ONLY** — server process | `human-only.spec.ts` |
| 9.4 | Confirm cron is running | Scheduled tasks fire | **HUMAN ONLY** — server crontab | `human-only.spec.ts` |
| 9.5 | Turn on maintenance mode, then off | Customers see the notice, then normal service | **HUMAN ONLY** — live traffic notice | `human-only.spec.ts` |

**9.1 is the most important test in this document.** A backup you have never restored is not a
backup. Everything else on this list is recoverable if you have proven this one works.

---

## Part 10 — Real-world sanity

| # | Do this | Should happen | Coverage | Spec |
|---|---|---|---|---|
| 10.1 | Order on a phone using **mobile data**, not wifi | Usable at real speeds | **HUMAN ONLY** — real device + mobile data | `human-only.spec.ts` |
| 10.2 | Have someone who has never used it place an order, and say nothing | They complete it without help | **HUMAN ONLY** — real stranger | `human-only.spec.ts` |
| 10.3 | Run the POS for one full real shift | Open, sell, refund, close, with real staff | **HUMAN ONLY** — real staff shift | `human-only.spec.ts` |

**10.2 tells you more than the other 60 tests combined.**

---

## SMS handset delivery

| # | Test | Coverage | Spec |
|---|---|---|---|
| — | Real SMS arriving on a handset | **HUMAN ONLY** — physical handset | `human-only.spec.ts` |

Local automation expects `SMS_LIVE=false`. Demo/queued/disabled logs may exist; carrier delivery is never asserted. Refund OTP bodies are stored as `[otp redacted]` in `sms_logs`.

---

## Notes for the owner

1. Read the **Coverage** column — anything **HUMAN ONLY** or **NOT COVERED** is still on you.
2. A green suite does **not** replace 1.1/1.3/1.4 (real card), 5.5 (printer), 9.1 (backup), or 10.x (people).
3. Never point `--project=local` at `test.bakeandgrill.mv`. Specs fail closed if `baseURL` is remote.

## Local run notes (this agent)

- Destructive specs use Playwright `--project=local` + `LOCAL_BASE_URL=http://127.0.0.1:8000`.
- SMS: most specs enable `sms_global_kill_switch`. Refund screen specs (2.1/2.2/2.5) **disable** it because the kill switch aborts OTP send and the refund request (422); they rely on `SMS_LIVE=false` demo instead.
- **FINDING (ops):** MariaDB rejects migration `2026_08_10_140000_stage_d_trade_invoicing` CHECK `payments_order_xor_invoice_chk` (error 1901). Local E2E used SQLite to boot.
- **1.2:** skipped when BML returns 401 Unauthorized (no sandbox credentials).
