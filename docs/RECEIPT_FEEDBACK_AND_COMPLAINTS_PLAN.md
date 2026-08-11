# Receipt Complaints, Feedback and the Invoice Page — Plan

Status: **Stages 1–5 built**, plus the multi-select / customer-reply / one-rating follow-up.
**Revision 2** (external review by Terra + codebase pass) is the design this implementation
followed. The body below still describes the original build; treat “proposed / not yet built”
framing in later sections as obsolete for stages 1–5 and the follow-up listed here.

| Stage / follow-up | State |
|---|---|
| 1 — foundation (model, SMS, queue, permissions) | Built |
| 2 — two-tap public form, windows, open cap, idempotency | Built |
| 3 — private photos, star rating, review invite | Built |
| 4 — billing triage (`needs_refund_review`), manager-led refund link | Built |
| 5 — invoice page Pay/history/credit/overdue/deliveries + bill complaints (§8) | Built |
| Multi-select categories (list, max 4; ANY/longest rules) | Built |
| Internal note vs customer reply; reply on receipt + resolution SMS | Built |
| Customer-visible case list on receipt/invoice | Built |
| One rating per receipt (unique + upsert) | Built |

**Still open (genuine remaining work, not stage backlog):**

1. **End-to-end rehearsal on the test install** — raise a multi-category complaint, close it with
   a customer reply, confirm the reply appears on the receipt and in SMS, and confirm a second
   star rating updates rather than duplicating.
2. Optional later: POS open-complaint badge; performance scoring from categories (§9 decision
   stays: investigate, do not score cashiers on star ratings).

Owner's ask, in their words: *"I want to add a complain option to the receipt… if there is a
mistake in the receipt there should be easy way to inform… all the mistakes and complaints must
be addressed and documented and customer must be notified… the complaint form must be easy…
less input from the customer. Most customers won't write anything."*

Owner decisions already taken:
- **The owner gets an SMS** when a complaint is raised.
- Whether receipt ratings feed staff performance reporting was left to me. See §9.

---

## 1. What exists today — and why it is worse than nothing

| Thing | Where | Reality |
|---|---|---|
| Feedback form on the receipt | `receipt.blade.php` 178-197, `ReceiptPageController::feedback`, `receipt_feedback` table | **Saves to a table nobody reads.** No event, no SMS, no email, no admin screen. `ReceiptFeedback` appears in 5 files, all write-side. |
| "Something wrong with this receipt?" | `partials/document-mistake-cta.blade.php`, used by `receipt.blade.php` and `invoice.blade.php` | **Opens WhatsApp.** Nothing is recorded. Miss the message, or reply and forget, and there is no trace it happened. |
| Rating input | `<select>` with 5 options | A dropdown on a phone. Two taps and a scroll to say "good". |
| Public reviews | `Review` model; `POST /reviews` behind **`auth:sanctum` + `customer.token`** (`catalog.php:94-95`) | Built, but **authenticated customers only**. Most receipt viewers are guests. See §5. |
| Staff SMS routing | `StaffNotificationDispatcher::dispatch(Order $order, string $eventType)` | **Order events only** — a hardcoded map of `new_order`, `order_ready`, `order_out_for_delivery`. **Not a general owner-alert mechanism.** See §4. |
| Refund SMS pattern | `sms_customer_refund_requested_enabled`, `sms_customer_refund_completed_enabled`, `sms_staff_refund_requested_enabled` | Built. **This is the pattern to copy** for complaint SMS. |
| Refund workflow | `RefundWorkflowService::request()` — requires amount, reason category, reason text, shift id. Line 226: **owner requests are auto-approved in one action with no OTP** | Built. A public complaint has none of those inputs and must never reach this. See §6. |
| Media upload | `admin/media` behind `auth:sanctum` + `staff.token` + `permission:media.manage` | **Staff only.** Not reusable for public complaint photos. See §7. |
| Overdue invoices | `invoices:mark-overdue` scheduled command | Built. The page must not depend on it alone. See §8. |
| Trade invoice payment | `TradeReceivablePaymentService` — filters `whereNotNull('trade_account_id')` | **Rejects non-trade invoices.** There is no generic public invoice payment path. See §8. |

**The honest summary:** the shop invites customers to complain into a drawer that does not open,
and offers a WhatsApp button that documents nothing. Both must change together.

---

## 2. The design principle

> **A useful complaint in two taps and zero typing.**

Most customers will not write a sentence. Every decision below follows from that. Any field that
is added has to earn its place against the chance the customer abandons.

Two things we already know and must never ask for:
- **Who they are** — they arrived from an SMS link carrying a receipt token.
- **Their phone number** — it is on the order.

---

## 3. The complaint flow

### 3.1 One entry point

Replace the WhatsApp-only CTA. The button keeps its place and its plain wording — "Something
wrong with this receipt?" — but opens a short in-page form instead of WhatsApp.

### 3.2 The form: tap categories, tap Send

A customer can have two problems at once — a missing item **and** poor quality. The form stores
a **list of categories** (`categories` JSON), not a single `category` column. There is no singular
field kept alongside the list — one source of truth only.

The flow is:

1. Tap one or more categories (minimum 1, maximum 4 — more than that is noise).
2. Tap a large **Send** button.

Selected state must be obvious at a glance on a phone. Everything else is optional. No typing
required. Accidental one-tap submits are still blocked by the separate Send step.

**Categories:**

- Wrong item
- Missing item
- Food quality
- **Food safety or allergy concern** — see §3.5
- Charged the wrong amount
- Took too long
- Delivery problem — shown only on delivery orders
- Something else

**Category-dependent rules use ANY / LONGEST, never “sole choice”:**

- `needs_refund_review` if **any** selected category is billing-related (refund-review set).
- Urgent food-safety alert if **any** selected category is food safety / allergy.
- Complaint windows use the **longest** window among the selected categories, so billing on day
  five is not blocked by a short food window bundled in the same report.

One complaint still has **one** status, **one** internal note and **one** customer reply even
with several categories. Do not build per-category resolution tracking.

**Optional, after the categories (never required):**
- **Which item(s)** — the receipt already lists them; show them as tap targets. Multiple
  selection allowed. Store both the order-item reference **and an immutable snapshot** of item
  name, quantity and price, so a later order edit cannot make the complaint unreadable.
- **A photo** — one tap, opens the camera. Handled per §7.
- **A comment** — collapsed by default, visibly secondary.

**Closing the loop on the receipt.** The receipt and invoice pages always list that document’s
own open and recently-resolved complaints (reference, categories, plain-word status, customer
reply). At the open-complaint cap the list replaces a flat refusal, alongside WhatsApp. A token
must never reveal another document’s complaints. After submit, confirmation shows the new
reference, the same list, and a quiet “Report something else with this order” link when under
the cap.

### 3.3 The confirmation must not over-promise

Revision 1 promised a phone call. That is wrong when the order has no phone number, the receipt
was emailed, or the customer has opted out of SMS.

Promise only what the available contact method supports:
- Valid phone and not opted out → "We'll look at this today and call you on 77xxxxx."
- No usable contact → "We've recorded this. Please quote reference C-1234 if you contact us."

### 3.4 WhatsApp is kept — after the record exists

The owner runs on WhatsApp and customers like it. Do not remove it; **reorder it.** Once the
complaint is logged, the confirmation offers "Continue on WhatsApp" with the reference number
pre-filled. The conversation happens where it always did, and a record exists either way.

WhatsApp conversations will not flow back into the system automatically, so the complaint needs
a **contact log** — free-text entries for calls, WhatsApp exchanges and in-person follow-up, each
stamped with who and when.

### 3.5 Food safety is not an ordinary complaint

An allergy or food-safety report is a different class of problem. It must:
- alert the owner **immediately and distinctly**, marked urgent
- never receive the standard "we'll look at this today" wording
- be visible at the top of the queue regardless of age ordering

### 3.6 Complaint windows

A receipt link is permanent, so complaints cannot be open forever. Food quality needs a short
window (a day or two — the food is gone); billing errors deserve a long one (the money is real).
Set both as settings, state them on the form when a window has closed, and let the owner change
them without a deploy.

### 3.7 Ratings stay, separately — one per receipt, changeable

The rating is the passive path and should not be tangled with complaints. Replace the `<select>`
with five tappable stars. A 1 or 2 star rating opens the complaint form with "Something else"
preselected. A 4 or 5 star rating leads to the review invitation described in §5.

**One feedback row per receipt.** A second submission updates the existing row (unique constraint
on `receipt_id` plus upsert in both `ReceiptPageController::feedback` and
`Api\ReceiptController::feedback`). After rating, the page shows what they rated, with an option
to change it. Complaints remain the opposite: separate events, separate records, up to the cap.

---

## 4. Notification — build it properly, do not borrow the order dispatcher

`StaffNotificationDispatcher` takes an `Order` and a fixed set of order event types. It is the
wrong component and must not be bent into shape.

Follow the **refund SMS pattern**, which already does exactly this job:

- Three new SMS types with editable templates:
  - staff/owner — complaint received
  - customer — complaint acknowledged
  - customer — complaint resolved
- Three enable/disable settings in the SMS Control Centre, so the owner can silence any of them
  without a deploy.
- Send through the existing SMS log with idempotency keys and retry handling.
- Record per complaint whether the owner alert was **sent, suppressed, failed or retried**.

**The complaint is saved even if every SMS fails.** Notification is a consequence of recording,
never a precondition.

**Two customer messages maximum, and that limit counts complaint messages only.** If a refund is
later raised, its request/OTP/completion messages belong to the refund workflow and are counted
separately.

---

## 5. Public reviews need explicit consent and an account

`POST /reviews` requires `auth:sanctum` + `customer.token`. Receipt pages are public token pages
and most viewers are guests, so revision 1's "5 stars invites a public review" cannot work as
written.

- **Never** turn private receipt feedback into a public review automatically.
- A 4-5 star rating shows an **explicit optional invitation** to leave a public review.
- That invitation sends the customer into the authenticated customer area to write it.
- Existing review moderation stays in place before anything appears on the website.

---

## 6. "Charged the wrong amount" — manager-led, never automatic

**This is the most important correction in revision 2.**

Revision 1 said a billing complaint should create a refund request. Checking the code shows why
that is unsafe:

- `RefundWorkflowService::request()` requires an amount, a reason category, a reason text and a
  shift id. A customer complaint has none of them.
- Line 226: **when the requester is the owner, the refund is requested and approved in one
  action, with no OTP.** A public form reaching that path could approve a refund with no human
  decision at all.

The corrected flow:

1. A billing complaint is recorded and flagged **`needs_refund_review`**.
2. A manager investigates the order.
3. If a refund is justified, the manager **creates the refund request themselves**, with the
   correct amount, through the existing workflow, unchanged.
4. The complaint and the refund are linked afterwards, for audit.

Existing approval, OTP, cash drawer and payment controls are untouched. **No public endpoint may
create, request or approve a refund.**

---

## 7. Customer photos — private, stripped, rate-limited

The media library is staff-authenticated (`permission:media.manage`) and must not be reused for
public uploads. Complaint photos need their own narrow path:

- Images only, with strict size and dimension limits.
- **EXIF stripped, including GPS.** A phone photo carries the location it was taken — usually the
  customer's home. Storing that because someone photographed a wrong momo is a privacy failure.
- **Private storage**, not the public media library. No guessable or indexable URL.
- Staff access only, behind a complaint-view permission.
- Rate-limited per receipt token and per IP.
- **A complaint always submits successfully without a photo.** An upload failure must never lose
  the complaint.

---

## 8. The invoice page — audit and corrections

`invoice.blade.php` (192 lines) shows masthead, bill-to, dates, line items, totals, notes,
PDF/print, and the WhatsApp CTA.

### 8.1 Payment — split by invoice type, no generic Pay button

Revision 1 said "add a Pay button to unpaid invoices". `TradeReceivablePaymentService` filters
`whereNotNull('trade_account_id')`, so it rejects sale invoices. There is no generic public
invoice payment path, and inventing one would be a new payment surface built in a hurry.

Correct behaviour, by type:
- **Sale invoice against an unpaid order** — link to the existing order/receipt payment page,
  which already works.
- **Trade invoice** — send the shop to the authenticated trade portal built in Stage E. A public
  token-based trade payment flow is a separate, deliberate design decision, not a button.
- **Never show Pay** for purchase invoices, credit notes, cancelled, void or paid invoices.

### 8.2 Payment history

Show date, method, status and amount. **Do not expose gateway references or transaction ids.**
For sale invoices, avoid double-counting order payments and invoice payments; for trade
invoices, use invoice-linked payments.

### 8.3 Credit notes must change the balance, not just appear

Showing a credit note is not enough. **The balance due must reflect it.** Otherwise the page
tells the customer they were credited while still asking for the original total.

### 8.4 Overdue

`invoices:mark-overdue` sets the status daily. The page should also **calculate "Overdue by X
days" from the due date**, so it stays correct if the scheduled task is late or has not run.

### 8.5 Trade invoices should show what they cover

Stage D built `trade_invoice_allocations` so an invoice can be traced to the deliveries behind
it. Show those deliveries, grouped by date and reference. A shop asking "what is this MVR 4,200
for?" should not need to phone.

### 8.6 Complaints on invoices

Same recorded flow as the receipt, with bill-appropriate categories: wrong amount, wrong items
billed, already paid, something else. **No food categories and no star rating on a bill.**

---

## 9. Ratings and staff performance — my decision

The owner left this to me. **Attach shift and cashier to every complaint and rating for
investigation. Do not feed receipt ratings into a cashier performance score.**

- Knowing who served a customer is essential to investigating. That is context.
- Scoring is different and worse. A receipt rating is confounded — food, wait, price and weather
  all land in one number — and per-cashier samples will be small enough that noise looks like
  signal.
- The incentive is the real problem: once ratings are a scorecard, the rational move is to stop
  handing out receipt links or to lean on unhappy customers. That suppresses the very information
  the owner wants.

Investigate with it; do not score with it. If staff signals are wanted later, complaint
*categories* attributable to service — "took too long", "wrong item" — are a fairer basis, and
that should be a separate, deliberate decision.

---

## 10. Status, history, notes and permissions

**Statuses:** `new` → `in_progress` → `awaiting_customer` → `resolved`, plus `not_actionable`.

Terra proposed eight states including duplicate and spam. For a shop where the owner *is* the
complaints department, eight is a form to fill in rather than a tool. Five covers the real cases;
add duplicate and spam only if volume ever justifies them.

**Two distinct note fields on a complaint:**

| Field | Audience | Closing |
|---|---|---|
| `internal_note` | Staff only — never on any public page, never in any SMS | Optional |
| `customer_reply` | Customer — shown on the receipt/invoice list and used as the resolution SMS body | **Required to close** |

Existing `resolution_note` values migrate into `internal_note` (they were written as private). Do
not publish them retroactively as customer replies. The contact log stays entirely internal — it
records what staff did, not a message to anyone. The admin screen must label which field the
customer will see.

**Every status change records** who, when, the internal note, and the customer reply where
applicable. Full audit history is kept, plus the contact log from §3.4.

**Resolution SMS** uses the owner's `customer_reply` in place of generic wording. This replaces
the existing resolution message; it does not add a third customer complaint SMS (still two
complaint messages maximum).

**Permissions.** Revision 1 said complaints should be visible in POS and admin. That needs
control, because complaints carry customer contact details, photos and internal notes.

- **POS shows a badge only**: "Open customer concern — ask the manager."
- Full text, photos, contact details, internal notes and history require dedicated
  `complaints.view` / `complaints.manage` permissions.
- Owner-only by default, following the manager allowlist rule already established in
  `PermissionCatalog`.

---

## 11. Abuse and integrity

- Double-submit protection and idempotency keys — repeated taps and network retries create one
  complaint, not four.
- Rate limits per receipt token and per IP.
- A small cap on open complaints per receipt.
- Invalid-token and cross-receipt tests: one token can never read or write another's data.
- Tokens must not appear in logs or cache keys in a recoverable form.
- No public endpoint may expose another customer's receipt, complaint or photo.

---

## 12. Test plan

- A category-only complaint submits successfully; nothing else is required.
- Tapping a category alone does **not** submit; Send does.
- Double-click and network retry produce one complaint.
- Rate limits fire per token and per IP; a capped receipt refuses further complaints.
- An invalid or foreign token can neither read nor submit.
- The owner receives one SMS; the customer receives one acknowledgement.
- `sms_opt_out` suppresses the customer message and never the owner's.
- SMS failure still saves the complaint, and the failure is recorded on it.
- Two **complaint** messages maximum; refund workflow messages are counted separately.
- A billing complaint sets `needs_refund_review` and creates **no** refund and **no** refund
  request. Assert directly against `RefundWorkflowService` that nothing was called.
- A food-safety complaint raises an urgent alert with different wording.
- Photos: EXIF including GPS is stripped; storage is private; an unauthenticated fetch fails; a
  complaint still submits when the upload fails.
- No public review is created without the customer explicitly choosing to leave one while
  authenticated.
- Closing without a resolution note is refused; status history records every change.
- POS shows a badge only; full detail requires the complaint permission.
- Complaint windows close correctly, and the form explains why.
- Item snapshots survive a later edit to the order.
- Invoice: Pay appears for a payable sale invoice, routes correctly for a trade invoice, and is
  absent for paid, void, cancelled, credit-note and purchase invoices.
- Invoice: payment history shows no gateway references; a credit note reduces the balance due;
  "overdue by X days" is correct even when the scheduled command has not run.
- Trade invoice lists the deliveries behind it.

---

## 13. Build order

1. **Foundation** — complaint model, statuses, audit history, permissions, private photo
   storage, the three SMS types with settings, and the admin complaint queue. This is the fix for
   the live gap and lands first, before the nicer form.
2. **The form** — categories, item selection, optional photo and comment, the confirmation, the
   WhatsApp handoff.
3. **Rating redesign** — stars, and the authenticated public-review invitation.
4. **Refund linkage** — manager-led triage from `needs_refund_review`.
5. **Invoice page** — payment routing by type, payment history, credit-note-aware balance,
   overdue calculation, trade deliveries, and the invoice complaint flow.

1 comes first. 5 is independent of 2-4 and can run in parallel. 4 depends on 1.

---

## 14. What changed in revision 2

Prompted by Terra's review; every point below was verified against the code before acceptance.

1. **Refund connection made manager-led** (§6). Revision 1 would have fed a public form into
   `RefundWorkflowService`, which requires inputs a complaint does not have and **auto-approves
   for owners with no OTP**. The worst idea in revision 1.
2. **Notification rebuilt on the refund SMS pattern** (§4). `StaffNotificationDispatcher` takes
   an `Order` and only knows order events; revision 1 pointed at the wrong component.
3. **Photos given their own private path** (§7), with **EXIF/GPS stripping** — a privacy risk
   revision 1 missed entirely.
4. **Public reviews require consent and an account** (§5). `POST /reviews` is authenticated;
   revision 1's automatic invitation could not have worked.
5. **Invoice Pay split by type** (§8.1). `TradeReceivablePaymentService` rejects non-trade
   invoices; a generic Pay button would have failed on sale invoices.
6. **Submit flow disambiguated** (§3.2) — category then Send, not category-as-submit.
7. **Confirmation no longer promises a call** it may not be able to make (§3.3).
8. **Food safety and allergy** added as an urgent category (§3.5).
9. **Complaint windows** defined (§3.6).
10. **POS shows a badge only**; full detail is permission-gated (§10).
11. **Credit notes must change the balance**, not merely appear (§8.3).
12. **Overdue calculated on the page**, not trusted to the scheduled command (§8.4).
13. **Item snapshots** stored alongside references (§3.2).
14. **Contact log** added for WhatsApp, phone and in-person follow-up (§3.4).
15. **Abuse protections** expanded (§11).
16. **Statuses kept to five, not eight** — the one place I did not follow the review. Reasoning
    in §10.
