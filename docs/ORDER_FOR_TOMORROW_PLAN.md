# Order for Tomorrow — Plan

Status: **Built.** Owner decision on payment: **pay now at checkout.**

Migrations that prove it landed:

| Migration | Role |
|---|---|
| `add_fulfil_date_to_orders_table` | Collection/fulfil date on ordinary orders |
| `add_order_for_tomorrow_cutoff_site_setting` | Cutoff time site setting |
| `add_tomorrow_daily_capacity_to_items_table` | Per-item daily capacity cap (added after this plan was written) |

**Added after the plan:** a per-item tomorrow daily capacity cap
(`tomorrow_daily_capacity` / `TomorrowDailyCapacityService`).

**Wider bugs found while building this** (not tomorrow-only):

- Paid-but-unstarted orders could not be refunded at all — affected every online order.
- The closed-shop guard blocked checkout entirely (including paths that should still work for
  tomorrow).

Treat “proposed, not yet built” framing in the body below as obsolete.

---

## 1. What we are building, in plain language

A customer shopping in the order app can choose **Today** or **Tomorrow** at
checkout. They pay straight away, as they do now. The order is an ordinary
order with a collection date on it.

Only items the owner has ticked in admin can be ordered for tomorrow.

When the shop is closed for today, those ticked items can still be bought for
tomorrow — so a closed shop stops being a dead end.

---

## 2. What already exists and must be reused

This audit found that most of the plumbing is already in the codebase, unused.

| Thing | Where | State |
|---|---|---|
| `items.allow_pre_order` | `2026_02_03_191236_add_stock_management_to_items_table.php:28` | Column exists, default false. On the model as fillable + cast (`Item.php:52,151`). **Nothing reads or writes it.** |
| `items.pre_order_lead_time_minutes` | same migration, line 29 | Same — exists, unused. |
| "Hold the ticket back from the kitchen" | `Order.fired_at`, `KdsController.php:65-68` | Working. Catering orders stay off the kitchen screen until fired. Exactly the behaviour tomorrow orders need. |
| Per-item availability controls in admin | `apps/admin-dashboard/src/pages/MenuPage/ItemSnoozeControls.tsx` | Working precedent for where the new toggle goes. |
| Shop-open settings pattern | `OnlineOrderingController.php:166-208` via `SiteSetting` | Working pattern for the cutoff-time setting. |

**Revive `allow_pre_order`. Do not add a new column for the same idea.**

---

## 3. What we are deliberately NOT doing

- **Not reviving the `pre_orders` table.** It exists
  (`2026_02_03_192000_create_pre_orders_table.php`) with its own dates, statuses
  and approval workflow, and **nothing in `app/` ever writes to it**. Using it
  would mean rebuilding payments, refunds, GST, discounts, loyalty, order
  history, SMS updates and the kitchen screen a second time, and would give
  staff a second place they must remember to check. That is how orders get
  missed.
- **Not extending the events/catering wizard.** That is a quote-and-approval
  flow with no cart and no instant payment — right for a wedding, far too heavy
  for "I want bread tomorrow".
- **Not building a date picker.** Tomorrow only, with a cutoff. See §4.

---

## 4. Decisions

| Question | Decision | Why |
|---|---|---|
| When does the customer pay? | **At checkout, now.** | Owner's call. Protects against no-shows on food made to order. The refund path already exists. |
| Cart has a today item and a tomorrow-only item? | **One collection date for the whole order.** If anything in the cart is tomorrow-only, the whole order becomes a tomorrow order, shown clearly before payment. | One order, one collection, one ticket. Splitting into two orders doubles order numbers, receipts and payments and confuses staff. |
| How far ahead? | **Tomorrow only, with an owner-set cutoff time** (e.g. 20:00). After the cutoff, "tomorrow" means the day after. | Matches the ask. Stops a 2am order landing on the kitchen as same-day work. |
| Where does the date live? | A new nullable datetime column on `orders`. | Orders already carry everything else. |

---

## 5. The build

### Stage A — Admin can tick items

- Expose `allow_pre_order` in `StoreItemRequest` / `UpdateItemRequest`
  (currently **absent from both**, so the column can never be set).
- Add it to the admin item API type (`apps/admin-dashboard/src/api/menu.ts`)
  and to `menuItemForm.ts`.
- Add a toggle in `MenuItemEditorModal.tsx`, next to the existing snooze
  controls. Plain wording — "Can be ordered for tomorrow".
- Leave `pre_order_lead_time_minutes` alone for now. It is for a later
  "needs 3 hours notice" feature and is not required here.

### Stage B — The order carries a collection date

- Migration: add `fulfil_date` (nullable date) to `orders`, plus an index.
  Nullable means every existing order stays a normal same-day order — no
  backfill, no behaviour change.
- Add to the `Order` model fillable + casts.
- Accept it on customer order creation, validated to be either today or the
  single allowed tomorrow date. **Never trust a date sent by the browser** —
  recompute the allowed tomorrow server-side from the cutoff setting and reject
  anything else.

### Stage C — Keep tomorrow's orders off today's kitchen

This is the highest-risk part. `KdsController::index` currently returns **every**
order in the KDS statuses with no date filter, so without this the kitchen
screen fills with tomorrow's food.

- Reuse the existing hold pattern: a tomorrow order is created with
  `fired_at` NULL, and the KDS query excludes future-dated orders that have not
  been fired — mirroring the catering condition already at
  `KdsController.php:65-68`.
- Staff need a way to see and fire tomorrow's orders when the day comes. Prefer
  extending the existing Open Tickets / Events firing surface over building a
  new screen.

### Stage D — Stock must not be eaten early

`StockReservationService::getAvailableStock` is `stock_quantity` minus live
reservations. If a tomorrow order reserves stock today, today's customers will
wrongly see items as sold out.

- A tomorrow order must **not** consume today's available stock.
- Recommended: skip stock reservation for tomorrow lines at creation, and let
  the existing deduction happen when the order is fired on the day.
- This needs a test proving that ordering the last unit for tomorrow leaves it
  buyable today.

### Stage E — Checkout picker

- Today / Tomorrow choice at checkout, defaulting to Today when the shop is
  open and to Tomorrow when it is closed.
- When the cart forces tomorrow (§4), say so plainly **before** payment.
- Show the collection date on the confirmation screen, the order history row
  and the receipt.

### Stage F — The closed-shop connection

`OnlineOrderingGateService::assertOpen()` is called at
`OrderCreationController.php:295` and `DeliveryOrderController.php:58` and
currently blocks **all** customer orders while the shop is closed.

- It must keep blocking same-day orders exactly as it does now.
- It must allow an order whose collection date is tomorrow and whose lines are
  all `allow_pre_order`.
- This is the one place where a mistake could let same-day orders through while
  closed. It needs its own test on both sides: tomorrow order allowed,
  today order still rejected with the existing 422.

---

## 6. Risks found in the audit

1. **KDS flooding** — Stage C. Highest risk. No date filter exists today.
2. **Stock eaten early** — Stage D. Would show items sold out that are in fact
   available.
3. **Weakening the closed-shop guard** — Stage F. Must not become a hole.
4. **Revenue date confusion** — an order paid today and collected tomorrow.
   Decide explicitly which date the sales reports use, state it in the code, and
   do not let the two silently differ. Recommendation: payment date for revenue
   (money moved today), collection date for kitchen planning.
5. **Cancellations** — pay-now means a cancelled tomorrow order needs a refund.
   The existing refund path covers it; confirm it is reachable for an order that
   never reached the kitchen.

---

## 7. Test plan

- Item cannot be ordered for tomorrow unless `allow_pre_order` is on.
- A browser-supplied date that is not the allowed tomorrow is rejected.
- After the cutoff, "tomorrow" rolls to the day after.
- Tomorrow order does not appear on KDS; appears once fired.
- Last unit ordered for tomorrow is still buyable today.
- Shop closed: tomorrow order succeeds, same-day order still 422s.
- Mixed cart moves the whole order to tomorrow and says so before payment.

---

## 8. Sequencing

Stages A and B are safe on their own and can land first. C, D and F carry the
real risk and should land together with their tests. E is the visible part and
lands last.
