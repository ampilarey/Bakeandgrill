# Receipt Complaints, Feedback and the Invoice Page — Plan

Status: proposed, not yet built.

Owner's ask, in their words: *"I want to add a complain option to the receipt… if there is a
mistake in the receipt there should be easy way to inform… all the mistakes and complaints must
be addressed and documented and customer must be notified… the complaint form must be easy…
less input from the customer. Most customers won't write anything."*

Owner decisions already taken:
- **The owner gets an SMS** when a complaint is raised.
- Whether receipt ratings feed staff performance reporting was left to me. See §8.

---

## 1. What exists today — and why it is worse than nothing

| Thing | Where | Reality |
|---|---|---|
| Feedback form on the receipt | `receipt.blade.php` 178-197, `ReceiptPageController::feedback`, `receipt_feedback` table | **Saves to a table nobody reads.** No event, no SMS, no email, no admin screen. `ReceiptFeedback` appears in 5 files, all write-side. |
| "Something wrong with this receipt?" | `partials/document-mistake-cta.blade.php`, used by `receipt.blade.php` and `invoice.blade.php` | **Opens WhatsApp.** Nothing is recorded. If the owner misses the message, or replies and forgets, there is no trace it ever happened. |
| Rating input | `<select>` with 5 options | A dropdown on a phone. Two taps and a scroll to say "good". |
| Public reviews | `Review` model (`customer_id`, `order_id`, `item_id`, `rating`, `comment`, `type`, `status`) | Built, used for home page featured reviews. Separate from receipt feedback. |
| Staff SMS routing | `StaffNotificationDispatcher`, `StaffNotificationPref` | Built. Nothing routes feedback through it. |
| Customer + staff SMS pairs with per-type toggles | Refund templates: `sms_customer_refund_requested_enabled`, `sms_customer_refund_completed_enabled`, `sms_staff_refund_requested_enabled` | Built. **Copy this exact shape** — do not invent a second pattern. |
| Refund request workflow | `RefundWorkflowService` — cashier requests, owner/manager approves, OTP, audit | Built. Nothing connects a customer complaint to it. |

**The honest summary:** the shop currently invites customers to complain into a drawer that does
not open, and offers a WhatsApp button that documents nothing. Both must change together.

---

## 2. The design principle

> **A useful complaint in two taps and zero typing.**

Most customers will not write a sentence. Every design decision below follows from that. If a
choice adds a field, it has to earn its place against the chance the customer abandons.

Two things we already know and must never ask for:
- **Who they are** — they arrived from an SMS link carrying a receipt token.
- **Their phone number** — it is on the order. Asking for a callback number is friction for
  information we already hold.

---

## 3. The complaint flow

### 3.1 One entry point, not two

Replace the WhatsApp-only CTA. The button stays where it is and keeps its plain wording —
"Something wrong with this receipt?" — but it opens a short in-page form instead of WhatsApp.

### 3.2 The form: one required tap

**Step 1 — what kind of problem.** Large tap targets, one row each, no dropdown:

- Wrong item
- Something missing
- Food quality
- Charged the wrong amount
- Took too long
- Something else

Tapping one is enough to submit. Everything after this is optional.

**Step 2 — which item (only for "wrong item", "something missing", "food quality").**
The receipt already lists what they bought. Show those lines as tap targets and let them tap the
one affected. Still zero typing, and it converts "the food was bad" into "the chicken momo on
Tuesday's 14:32 ticket", which is a kitchen fix.

**Step 3 — optional extras, collapsed by default.**
- Add a photo (one tap, opens the camera). Reuse the existing media plumbing.
- A comment box, clearly marked optional and visibly secondary.

**Submit** → confirmation naming a real person: *"Got it. We'll look at this today and call you
on 77xxxxx."*

### 3.3 WhatsApp is kept — but after the record exists

The owner already runs on WhatsApp and customers like it. Do not remove it; **reorder it.**
After the complaint is logged, the confirmation offers "Continue on WhatsApp" with the reference
number pre-filled in the message. The conversation still happens where it always did, but a
record now exists whether or not anyone replies.

### 3.4 Ratings stay, separately

The rating is the passive path and should not be tangled with the complaint path. Change the
`<select>` to five tappable stars — one tap, no scroll. A 4 or 5 star rating invites a public
review through the existing `Review` model, turning happy customers into the proof on the home
page. A 1 or 2 star rating opens the complaint form with "Something else" preselected.

---

## 4. What happens next — the part that matters

A complaint that is not routed is the current bug. The lifecycle:

1. **Recorded** — a `receipt_complaint` row: receipt, order, category, item lines, photo,
   optional comment, status, timestamps, and the shift and cashier who served the order.
2. **Owner is notified by SMS immediately.** Category, order number, customer name, amount.
   Through `StaffNotificationDispatcher`, respecting existing staff preferences.
3. **Customer is acknowledged immediately** — one SMS, with the reference number.
4. **Status:** `new` → `seen` → `resolved`, with who and when at each step. A resolution note is
   required to close — "resolved" with no explanation is how a complaint system rots.
5. **Customer is told when it closes** — one SMS. Optional per complaint, because some are
   resolved by the phone call itself and a second message is noise.

**Two messages maximum per complaint.** Acknowledgement and resolution. Respect
`customers.sms_opt_out`. Follow the refund SMS template shape exactly, with per-type enable
flags so the owner can turn any of them off without a deploy.

---

## 5. "Charged the wrong amount" → the refund queue

This is the highest-value connection in the plan.

Today, an overcharged customer's only route is to phone the shop and ask a cashier to raise a
refund. That is precisely the path the owner tightened the refund workflow to control — the
cashier is both the reporter and the beneficiary.

A customer reporting a billing error **in their own words, from their own receipt, with a
timestamp** is better evidence than a cashier's word.

So: a "charged the wrong amount" complaint creates a **refund request** in the existing
`RefundWorkflowService` queue, marked `initiated_by => 'customer_complaint'`, with the complaint
text and the customer's identity attached.

**It creates a request. It never creates a refund.** Owner or manager approval is still
required, unchanged, OTP and all. A complaint form that can move money is a free-money button.

---

## 6. What the owner sees

- **A complaints screen** in admin: open complaints first, oldest first, with category, order,
  customer, amount and age.
- **Open count and oldest age** somewhere seen daily — otherwise complaints rot quietly.
- **Complaint attached to the order**, visible in POS and admin, so whoever is at the till knows
  when that customer walks back in.
- **Patterns over time:** complaints by category, by item, by day. "Wrong item, 40% of
  complaints, and 30 of those were the same product" is an operational fix, not a mystery.

---

## 7. The invoice page — audit and enhancements

`invoice.blade.php` is 192 lines and shows: masthead, bill-to, dates, line items, totals, notes,
PDF/print buttons, the WhatsApp CTA. Findings, worst first:

**1. There is no way to pay.** The page shows "Balance due: MVR X" in warning brown and offers
Download PDF and Print. Stage D built an invoice-keyed payment path, and the wholesale shop
portal uses it — but anyone who receives an invoice link by SMS cannot pay from it. **Add a Pay
button** to the public invoice page for unpaid invoices, using the Stage D path. This is the
single biggest miss on the page and it costs money directly.

**2. No payment history.** The receipt lists payments; the invoice does not. A shop that has
part-paid sees "Balance due" with no record of what they already paid, which is exactly the
condition that produces a phone call. **Show payments received against the invoice.**

**3. Overdue is invisible.** The due date renders in muted grey whether it is next week or three
weeks past. **Show overdue clearly** — "Overdue by 12 days" — with the same visual weight the
balance already gets.

**4. Trade invoices do not show what they cover.** Stage D built `trade_invoice_allocations`
precisely so an invoice can be traced to the deliveries behind it, and the customer-facing page
ignores it. A shop asking "what is this MVR 4,200 for?" cannot self-serve. **List the deliveries
and dates behind a trade invoice.**

**5. Credit notes are not shown.** If a credit note has been issued against an invoice, the
invoice page does not mention it. A customer looking at a bill they have already been credited
for will chase it. **Show credit notes against the invoice.**

**6. Same undocumented WhatsApp CTA** as the receipt — fix it the same way. On an invoice the
categories differ: wrong amount, wrong items billed, already paid, other. No food-quality
categories on a bill.

**7. No feedback block, and that is correct.** A bill is not a service moment. Do not add
star ratings to invoices.

---

## 8. My decision on ratings and staff performance

The owner left this to me. **Attach the shift and cashier to every complaint and rating for
investigation. Do not feed receipt ratings into a cashier performance score.**

Reasoning:
- Knowing who served a customer is essential to investigating a complaint. That is context.
- Turning it into a score is different, and worse. A receipt rating is confounded — the customer
  is rating the food, the wait, the weather and the price all at once, and only some of that is
  the cashier's doing. Per-cashier sample sizes will be small enough that noise looks like signal.
- The incentive it creates is the real problem: if ratings become a scorecard, the rational move
  for a cashier is to stop handing out receipt links, or to lean on customers who look unhappy.
  That suppresses exactly the information the owner is trying to collect.

So: investigate with it, do not score with it. If the owner later wants staff performance
signals, complaint *categories* attributable to service — "took too long", "wrong item" — are a
fairer basis than a star average, and should be a separate, deliberate decision.

---

## 9. Risks

1. **A complaint that moves money.** Never. Requests only, existing approval unchanged (§5).
2. **The drawer that does not open, again.** The routing and the admin screen are not optional
   extras — they are the feature. Do not ship the form without them.
3. **Notification fatigue.** Two customer messages per complaint, maximum. Owner SMS respects
   existing staff preferences. An owner who mutes the alerts is back where he started.
4. **Abuse of the public token.** The receipt token is the only authentication. Rate-limit
   submissions per token and per IP, and cap photo uploads. One complaint per receipt is the
   normal case; allow a small number, not unlimited.
5. **Privacy.** Receipt feedback and complaints are private. Public reviews are public. Never
   let one leak into the other — a complaint containing a phone number must never reach the home
   page.
6. **Friction killing the signal.** Every extra required field cuts completion. If the build
   drifts toward "please also tell us X", the feature has failed on its own terms.
7. **Guest customers.** Most receipts go to phone numbers with no account. Nothing may require
   a login.

---

## 10. Test plan

- Submitting a complaint with only a category succeeds — no other field is required.
- The owner receives one SMS on submission; the customer receives one acknowledgement.
- `sms_opt_out` suppresses the customer message and does not suppress the owner's.
- A "charged the wrong amount" complaint creates a refund **request**, never an approved refund,
  and the existing approval path is unchanged.
- Resolving a complaint requires a note and optionally messages the customer once.
- Two customer messages maximum per complaint, whatever happens.
- A complaint records the shift and cashier, and no rating is written to any staff score.
- Rate limiting blocks a flood of submissions on one token.
- A complaint is visible on the order in POS and admin.
- A receipt token cannot read or submit against another receipt.
- The invoice page shows a working Pay button for an unpaid invoice and none for a paid one.
- The invoice page shows payments received, overdue status, and for a trade invoice the
  deliveries behind it.
- A credit note appears on the invoice it was raised against.
- No public review is created without the customer explicitly choosing to leave one.

---

## 11. Build order

**A — Make the existing drawer open.** Route today's feedback and the new complaint record to
the owner by SMS, acknowledge the customer, add the admin complaints screen and the status
lifecycle. This is the fix for a live gap and should land first, even before the nicer form.

**B — The two-tap form.** Categories, item tapping, optional photo and comment, star rating,
WhatsApp handoff after logging.

**C — The refund connection.** "Charged the wrong amount" raises a refund request.

**D — The invoice page.** Pay button, payments, overdue, trade deliveries, credit notes, and the
same complaint flow with invoice-appropriate categories.

A and D are independent and could run in parallel. C depends on A. B depends on A.
