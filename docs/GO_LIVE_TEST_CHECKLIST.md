# Go-Live Test Checklist

Work through this on the **test install** first, then repeat the money tests on production
before opening. Tell me the test number if one fails — that is enough for me to find it.

Rules while testing:
- Use a real phone, not a desktop browser pretending to be one.
- After any code change, **deploy before retesting.** Three problems in the last week were
  correct code on a stale server.
- If something looks wrong, note the test number and move on. Do not fix as you go.

---

## Part 0 — Before you start (5 minutes)

| # | Do this | Should happen |
|---|---|---|
| 0.1 | Run `./scripts/prod-preflight.sh` on the server | No FAIL lines. `APP_DEBUG` must be false, `APP_ENV` production |
| 0.2 | Run `php artisan app:verify-production-config` | Passes |
| 0.3 | Run `./scripts/post-deploy-smoke.sh test` | All URLs respond |
| 0.4 | Run `./scripts/backup.sh` and confirm a backup file appears | A dated file exists and is not empty |
| 0.5 | Check the deployed commit matches what you merged | Same short SHA |

**Do not continue if 0.4 fails.** Everything below can be undone from a backup; nothing can be
undone without one.

---

## Part 1 — Money (do these first, they matter most)

| # | Do this | Should happen |
|---|---|---|
| 1.1 | Place an online order and pay with a real card | Order paid, receipt SMS arrives, order appears in POS and KDS |
| 1.2 | **Double-click the pay button** as fast as you can | Charged **once**. One payment row, one order |
| 1.3 | Start a payment, then **close the tab** at the bank page | Order stays unpaid. No half-paid state. Retrying works |
| 1.4 | Start a payment and let it sit 10 minutes before completing | Payment still lands correctly, or fails cleanly with a retry |
| 1.5 | Pay a second order while the first is still open | Both correct, no crossed payments |
| 1.6 | Place a **cash** order in POS and take payment | Drawer total increases by the right amount |
| 1.7 | Give change on a cash order | Change and counted totals are right |
| 1.8 | Pay part cash, part card | Split recorded correctly; both show on the receipt |
| 1.9 | Apply a discount, then pay | GST calculated on the discounted amount, not the original |

---

## Part 2 — Refunds (the controls you asked for)

| # | Do this | Should happen |
|---|---|---|
| 2.1 | As a **cashier**, request a refund | Goes to pending. No money moves. Owner gets an SMS |
| 2.2 | As the cashier, try to approve **your own** request | Refused |
| 2.3 | As owner, approve it — customer OTP required | Money moves only after the code is entered |
| 2.4 | Check the drawer after a cash refund | Reduced by exactly the refund amount |
| 2.5 | Try to refund an order that was never paid | Refused with a clear message |
| 2.6 | Refund an online order paid by card | Correct handling, customer notified |

---

## Part 3 — Closing the shift (blind count)

| # | Do this | Should happen |
|---|---|---|
| 3.1 | As a **cashier**, open Close Shift | **No expected total anywhere on screen** |
| 3.2 | Enter counts and tap Review & close | Popup says match or does not match — **no amounts shown** |
| 3.3 | Deliberately count wrong, then "Count again" | Both counts recorded. You can see the recount later |
| 3.4 | Close with a difference | Reason required. Shift closes. You get the real numbers |
| 3.5 | Open "More notes & coins" | MVR 1000 and rare coins are there |
| 3.6 | Check the screen fits without scrolling | Phone and iPad, default state |

---

## Part 4 — Ordering journeys

| # | Do this | Should happen |
|---|---|---|
| 4.1 | Order for **pickup** | Correct through to collection |
| 4.2 | Order for **delivery** with a saved address | Address correct on the ticket and driver app |
| 4.3 | Order for delivery with **two saved addresses** | You can switch; it warns before paying if using the default |
| 4.4 | Scan the **dine-in QR** and order | Table correct on the ticket |
| 4.5 | Order **for tomorrow** | Does not appear on today's kitchen screen |
| 4.6 | Turn online ordering **off**, then open the menu | Items still clickable and readable. Only checkout is blocked |
| 4.7 | With ordering off, order a tomorrow item | Allowed. Same-day order still refused |
| 4.8 | Order the **last unit** of a stock-tracked item | Sold out afterwards, for everyone |
| 4.9 | Two people order the last unit at the same time | Only one succeeds |

---

## Part 5 — Kitchen and staff

| # | Do this | Should happen |
|---|---|---|
| 5.1 | Send an order to the kitchen screen | Appears promptly |
| 5.2 | Mark it ready | Customer gets the ready SMS |
| 5.3 | Log in as a **real cashier account** (not owner) | Can do their job; cannot see reports, settings, wholesale or complaints |
| 5.4 | Try to reach an admin page as that cashier by typing the URL | Blocked |
| 5.5 | Print a receipt on the real printer | Correct and legible |

---

## Part 6 — After the sale (new)

| # | Do this | Should happen |
|---|---|---|
| 6.1 | Open the receipt link from the SMS on your phone | Loads, readable, totals correct |
| 6.2 | Tap "Something wrong?", pick a category, tap Send | **Two taps, no typing.** You get an SMS. Customer sees a reference |
| 6.3 | Pick **two** categories at once | Both recorded |
| 6.4 | Pick "charged the wrong amount" | Flagged for refund review. **No refund created** |
| 6.5 | Pick food safety / allergy | Urgent alert, different wording, top of the queue |
| 6.6 | Reopen the receipt after complaining | You see your case, reference and plain-word status |
| 6.7 | In admin, write a customer reply and close the case | Customer gets it by SMS and sees it on the receipt |
| 6.8 | Check the internal note is **not** on the receipt page | Never visible to the customer |
| 6.9 | Rate the receipt, then rate it again differently | One rating, updated. Not two |
| 6.10 | Open someone else's receipt link and try to see their complaints | Nothing revealed |

---

## Part 7 — Wholesale rehearsal (one shop, end to end)

Only needed before you supply a real shop.

| # | Do this | Should happen |
|---|---|---|
| 7.1 | Create a trade account and a price list | Prices resolve; preview shows which rule was used |
| 7.2 | Dispatch a delivery | Stock leaves. Shop gets an SMS. No sale recorded anywhere |
| 7.3 | Check the online menu after dispatch | Cannot sell the stock that went out |
| 7.4 | Reconcile: some sold, some returned good, some spoiled | Good stock returns; spoiled logged as waste at cost |
| 7.5 | **Deliberately report a wrong sold number** vs the count | Flagged as a mismatch. Cannot invoice until resolved |
| 7.6 | Resolve the mismatch and invoice | One invoice, correct amount, shop's balance rises once |
| 7.7 | Take a **part** payment in cash | Balance right; appears in the shift close as a credit repayment |
| 7.8 | Check the P&L for the period | Wholesale revenue appears, separate from retail |
| 7.9 | Try to dispatch beyond the credit limit | Refused, naming what is owed and what is held |

---

## Part 8 — Content and the home page

| # | Do this | Should happen |
|---|---|---|
| 8.1 | Turn a home page section off in admin, view both apps | Section gone; nothing else moves |
| 8.2 | Reorder two sections | Order changes on that app only |
| 8.3 | Add a text block | Appears where you put it |
| 8.4 | Try to remove the order mode cards | Refused, with a reason |
| 8.5 | Edit hero slides | Both apps update |

---

## Part 9 — The one nobody does

| # | Do this | Should happen |
|---|---|---|
| 9.1 | **Restore your backup onto the test install** | Completes. Site works. Data is there |
| 9.2 | Check migrations ran cleanly during the restore | No errors |
| 9.3 | Confirm the queue worker is running | `php artisan queue:work redis` alive |
| 9.4 | Confirm cron is running | Scheduled tasks fire |
| 9.5 | Turn on maintenance mode, then off | Customers see the notice, then normal service |

**9.1 is the most important test in this document.** A backup you have never restored is not a
backup. Everything else on this list is recoverable if you have proven this one works.

---

## Part 10 — Real-world sanity

| # | Do this | Should happen |
|---|---|---|
| 10.1 | Order on a phone using **mobile data**, not wifi | Usable at real speeds |
| 10.2 | Have someone who has never used it place an order, and say nothing | They complete it without help |
| 10.3 | Run the POS for one full real shift | Open, sell, refund, close, with real staff |

**10.2 tells you more than the other 60 tests combined.**
