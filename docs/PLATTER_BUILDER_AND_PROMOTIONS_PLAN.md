# Build-Your-Own Platter + Promotions — Plan

Status: proposed, not yet built. Revised 2026-08-05 after verifying every claim against the codebase — promotion time windows turned out to already exist, and the order-line storage model is now decided (child lines).

Owner decisions already given:
- Admin sets the platter **price**.
- Admin picks **which items** can go in it.
- Rules like **"any 6 from this list"**, or **"minimum 2"**, or an exact count.

---

## 1. What already exists — do not rebuild any of this

The audit found the promotions engine is far more capable than it appears.

| Capability | State |
|---|---|
| Buy 1 get 1 / buy 3 get 1 | **Built.** `buy_x_get_y` with `buy_qty`, `get_qty`, `get_discount_pct` (100 = free, 50 = half price), and cheapest-or-dearest choice. Editable in admin (`PromotionsPage.tsx`). |
| Spend-more-save-more | **Built** (`tiered`). |
| Quantity breaks | **Built** (`quantity_break`). |
| Free delivery over a spend | **Built** (`free_delivery` + `min_order_laar`). |
| Percentage / fixed / free item | **Built.** |
| Apply without a code | **Built** (`auto_apply`). |
| Limit per customer / total | **Built** (`max_uses`, `max_uses_per_customer`). |
| Scope to items or categories, with exclusions | **Built** (`promotion_targets`, `is_exclusion`). |
| Stop two discounts stacking | **Built** (`stackable`, enforced at `PromotionController.php:170`). |
| Works on POS as well as online | **Yes** — both go through `OrderCreationService`. |
| Loyalty, gift cards, referrals, first-order discount | **Built.** |

**Nothing above needs code.** If the owner wants buy-3-get-1 tomorrow, it is a setup task in admin.

### What genuinely does not exist

| Gap | Detail |
|---|---|
| Choose-your-own platter | `combo_items` is a **fixed** list (`combo_id`, `item_id`, `quantity`, `is_optional`). No "pick any 6 from these 12". Modifiers are flat name+price with no selection rules. |
| Combos do not reduce child stock | **Selling a combo does not decrement the stock of the items inside it.** Verified: no combo handling in `OrderCreationService`, `StockManagementService`, or `StockReservationService`. Note the fix spans **four paths**: POS deduction (only runs when `!$isOnlineOrder`), online reservations (`StockReservationService`), and restore in three places — POS cancel/void (`OrderStatusController`), refunds (`RefundController`), online cancel (`ReleasePreparedStockOnCancelListener`). |
| Platter contents on order lines | `order_items` has no parent/child support. Selections would land in `notes` (free text) — **and the KDS never renders `notes`**, so the kitchen would not see what is inside a platter. See Stage C for the fix. |
| Lead time | `items.pre_order_lead_time_minutes` exists, is fillable and cast, and **nothing reads or writes it**. |
| Promotions have no **trigger** condition | A promotion's targets say *what gets discounted*, never *what must be bought to unlock it*. Verified across every promotions migration (`2026_02_09`, `2026_04_23`, `2026_07_19`, `2026_07_23`, `2026_07_25`, `2026_08_03`) and `PromotionEvaluator::qualifyingLines`. Conditions that DO exist: min order value, date range, day/time window, `first_order_only`, `registered_only`, `restricted_customer_id`, budget and usage caps. Nothing expresses "the basket must contain item X". |

### Correction: promotion day/time windows already exist

An earlier draft listed "no happy-hour windows" as a gap. That is out of date. Migration
`2026_07_23_120000_add_auto_apply_to_promotions.php` added `days_of_week`, `starts_time`, `ends_time`
to promotions; they are enforced in `Promotion::isValid()` → `matchesScheduleWindow()` (including
overnight windows), and the admin form already has the fields. "3–5pm daily, 20% off short eats"
works **today** as an auto-apply promotion.

What remains is cosmetic: `PromotionsPage.tsx` only shows the schedule fields when auto-apply is
ticked, so a **coded** happy-hour promo cannot set a window from the UI (the API accepts it).
There is also no multi-window-per-day, which nobody has asked for.

---

## 2. Business design

### 2.1 The core model

A **platter** is an item the customer assembles from groups the owner defines.

- Admin sets **one price** for the platter. The customer always knows what they will pay.
- Admin defines one or more **choice groups**. Each group has a list of allowed items and a rule.
- Rules supported: **exactly N**, **minimum N**, **between N and M**.

Example — "Hedhikaa Platter, MVR 120": one group, "Choose any 6", from a list of 12 short eats.

Example — "Mixed Platter, MVR 150": group 1 "Choose 4 savoury", group 2 "Choose 2 sweet".

### 2.2 Recommended commercial options

**Tiered sizes — build this, it is where the money is.**
Offer the same platter at 6 / 9 / 12 pieces for rising prices. It upsells without a salesperson: a customer choosing between MVR 120 and MVR 165 for half again as much food very often takes the bigger one. One platter definition, three sizes.

**Fixed price, exact count — the default.**
"Any 6 for MVR 120" markets itself. It fits on a sign, an SMS, a signage slide. Variable pricing that changes as the customer picks is harder to advertise and harder to trust.

**Premium surcharge — margin protection without confusing pricing.**
Some short eats cost far more to make than others. Rather than variable pricing, allow an optional per-item surcharge inside a group (default zero). Most items add nothing; a costly one adds, say, MVR 5, shown plainly next to the item. The headline price stays honest.

**Balance groups — better product, controlled cost.**
"Choose 4 savoury + 2 sweet" stops a customer taking six of the single most expensive item, and produces a better platter.

**Ramadan / iftar platters — the biggest seasonal opportunity, and mostly already built.**
Collect-tomorrow, the per-item daily make-limit, and the kitchen hold together are exactly what an iftar pre-order needs: order the day before, cap what the kitchen can produce, tickets appear on the morning. A platter builder on top makes it a product. Worth having ready *before* Ramadan, not during.

### 2.3 Recommendation

Build **fixed price + exact count + tiered sizes** first, with groups and the optional surcharge supported but not required. That covers the owner's ask, adds the upsell, and keeps the customer-facing message simple.

### 2.4 Trigger-and-reward promotions

Two promotions the owner asked for, neither possible today:

1. *"Buy this meal during this period, get a free drink from a list."*
2. *"Buy this item, get X% off these other items."*

Both are blocked by the **same single gap**: a promotion can only name one set of
items, and that set is what gets discounted. There is no way to say "only if the
basket contains X".

**This is not merely a missing feature — as things stand it is a money leak.**
`free_item` (`PromotionEvaluator::freeItemDiscount`) makes the *cheapest targeted
item already in the basket* free. Set up scenario 1 today and **every customer who
adds a drink gets it free, whether or not they bought the meal.** The trigger is
simply not checked, because it cannot be expressed.

Likewise `buy_x_get_y` operates on a single pool from `qualifyingLines` — buy N from
a group, get M from *that same group*. "Buy a burger, get 20% off fries" needs two
distinct sets and cannot be expressed either.

**One change unlocks both**: give `promotion_targets` rows a role — **trigger** or
**reward**. Rows with no role keep today's meaning exactly (reward), so every
existing promotion is unaffected.

With that in place, and configurable in admin with no further code:

- Buy this meal → free drink chosen from that list
- Buy this item → X% off those items
- Buy from this category → discount on that category
- Combined freely with the date range, day/time window, per-customer caps and
  budget that already exist

### 2.5 The reward picker is part of v1 — and it is NOT the platter picker

An earlier draft deferred the "choose your free drink" step, on the reasoning that it
was the same problem as the platter picker. **That was wrong.** They share only the
surface fact of choosing from a list; underneath they are different things:

| | Platter picker | Reward picker |
|---|---|---|
| Purpose | Configure the product being bought | Claim something already earned |
| Choice | Several groups, count rules, min/max | One item, from one list |
| Price | Fixed platter price plus surcharges | Free — no price effect |
| When | On opening the product | When the basket qualifies |
| Blocking | Cannot add to cart until valid | Never blocks; the order stands without it |

Building the platter picker first and bending it into a reward picker would drag count
rules, groups and surcharge logic into a screen that needs none of them.

**Without a picker the promotion barely functions.** `free_item` only discounts a drink
the customer already added. A customer who does not happen to add one gets nothing, never
learns they were entitled, and the offer you are paying for buys no goodwill. That is a
hidden discount, not a promotion.

Worse, the audit found offers are surfaced on the **home page, menu, dine-in menu and
signage — and nowhere in the cart or checkout.** There is currently no surface at all at
the moment a basket qualifies. So the reward picker is also the first cart-level offer
surface, and should be built as one.

Scope for v1:
- When the basket satisfies a promotion's trigger and the reward is a choice of items,
  show a clear, non-blocking prompt at the cart: *"You've earned a free drink — choose one."*
- One tap picks it. The chosen item joins the order at zero price.
- Declining is always allowed, and the order proceeds untouched.
- If the customer changes the basket so it no longer qualifies, the free item is removed
  and they are told plainly — never silently charged for it.
- Reuse the promotion the server already evaluated. The client must not decide
  entitlement; it only presents what the server says has been earned.

---

## 3. The build

### The load-bearing decision: platter children are child order lines

How a chosen platter is stored on the order determines how hard Stage C is. Decision:
**each chosen item becomes its own `order_items` row with a new `parent_order_item_id`
pointing at the platter line.** Child lines carry unit price 0 (or the surcharge, so
totals sum naturally) and the real `item_id` and `item_name`.

Why this and not a JSON blob or `notes`:

- **Stock** deduct/reserve/restore already iterates order lines on all four paths
  (POS deduct, online reserve, cancel/void restore, refund restore). Child lines get
  correct stock handling nearly free; a JSON blob means re-implementing all of it.
- **Daily make-limit**: `TomorrowDailyCapacityService` counts committed quantity per
  order line. Each chosen item counts against its own tomorrow limit automatically.
- **Refunds**: refund restore is per line — a refunded platter returns every child
  to stock without new code.
- **Kitchen**: the KDS renders order lines and modifiers but never renders `notes`.
  With child lines the kitchen sees real contents; the only UI work is indenting
  children under their parent in `apps/kds-web` and admin `KDSPage.tsx`.
- **Promotions**: "never treat platter children as qualifying lines" becomes a
  one-line filter in `PromotionEvaluator` — skip lines with a parent.

### Stage A — Platter definition (admin)

- New table for choice groups belonging to a platter item: name, rule type (`exactly` / `min` / `range`), min count, max count, sort order.
- New table for allowed items in a group: item, optional surcharge (default 0), sort order.
- Extend the existing combo concept rather than creating a parallel system — a platter is an item flagged as a bundle whose contents are chosen, not fixed.
- Admin UI in the item editor: define groups, pick allowed items, set the rule. Plain wording — "Choose any 6", not "cardinality constraint".
- **Tiered sizes use the existing `variants` table**, not a new size table. A 6 / 9 / 12-piece platter is one item with three variants, each with its own price (per-variant pricing and stock machinery already exist); the choice group stores a per-size count. Do not build a parallel pricing system.

### Stage B — Customer picker (v1 is the online order app only)

- Scope decision: **v1 ships in the customer order app only.** A picker on POS is a
  second full UI; staff keep using fixed combos on POS until there is demand.
- Opening a platter shows its groups. The customer picks until each rule is satisfied.
- Add to cart is blocked until every rule is met, with a plain running hint — "Pick 2 more".
- Cart and receipt list what was chosen inside the platter, not just "Platter".
- Unavailable items are not selectable, and the picker must respect **tomorrow mode** — in tomorrow mode, items that are sold out today are still selectable if they are ticked for tomorrow, and an item whose `tomorrow_remaining` is 0 (the per-item daily make-limit, already live) is **not** selectable.
- Re-ordering a past platter (order history / favourites) must replay the child selections, or fall back to opening the picker fresh — never silently produce an empty platter.

### Stage C — Money and stock (highest risk)

- Price is the platter price plus any surcharges. Never the sum of the child items.
  With child lines this is enforced by construction: children carry price 0 or the surcharge only.
- **Fix the existing combo stock bug first, as its own shippable change** (see Sequencing): selling a combo/platter must decrement each child item's stock, and a refund or cancellation must give it back. The fix must cover all four paths — POS deduction (`OrderCreationService`, POS-only branch), online reservation (`StockReservationService`), POS cancel/void restore (`OrderStatusController`), refund restore (`RefundController`) — plus the online-cancel listener.
- GST: item tax is snapshotted per line (`tax_rate`, `tax_code`) and inclusive/exclusive is a global setting. Tax the **platter parent line** at the platter item's own tax code; child lines at price 0 contribute nothing, surcharge lines follow their item's code. Verify against `OrderTotalsCalculator::calculatePerItemTax` before changing anything.
- Collect-tomorrow: a platter ordered for tomorrow must follow the same rules already built — every chosen item must be ticked for tomorrow, and the per-item daily make-limit must count each chosen item. With child lines both fall out of the existing per-line checks.

### Stage D — Promotion scheduling (rescoped: mostly built)

- Day/time windows already exist and are enforced (see the correction in section 1).
- Remaining work is one small admin change: show the days-of-week and start/end time
  fields in `PromotionsPage.tsx` for **coded** promotions too, not only auto-apply.
- Happy hour and end-of-day clearance are setup tasks in admin today, not code.

### Stage F — Trigger-and-reward promotions

Unlocks both promotions in §2.4. Small, self-contained, and independent of the platter work.

- Add a role to `promotion_targets` rows: **trigger** or **reward**. Default/null = reward,
  so every existing promotion behaves exactly as it does today. This must be true by
  construction, not by a data migration — no backfill.
- `PromotionEvaluator`: before any discount is computed, if the promotion has trigger rows,
  the basket must satisfy them or the promotion yields zero. Then `qualifyingLines` resolves
  against the **reward** rows only.
- Trigger rows must support a minimum quantity (buy 2 meals, not just 1). Reuse the existing
  metadata pattern rather than adding columns for one type.
- A line already consumed as a trigger must not also be discounted as a reward. Decide and
  state it plainly in code: a trigger line is never its own reward.
- Admin: in `PromotionsPage.tsx` the target picker must let the owner say which side each
  target is on. Plain wording — "Customer must buy" and "They get" — never "trigger"/"reward"
  in the UI.
- Applies on POS and online alike; both go through `OrderCreationService`, so there is one
  enforcement point, not two.
- **Reward picker at the cart** (see §2.5) — its own small surface, not the platter picker.
  The server decides what has been earned and offers the choice list; the client only
  presents it. Non-blocking, declinable, and the free line is withdrawn with a plain
  message if the basket stops qualifying. This is also the first offer surface in the
  cart at all — today offers appear only on home, menu and signage.
- The customer's chosen reward must be validated server-side on submit. A client that
  claims a free item the basket never earned is rejected, not trusted.

### Stage E — Lead time: closed, do nothing

- `items.pre_order_lead_time_minutes` stays untouched and unused. It is reserved for a
  future "order N hours ahead" feature; platters do not need it, and adding a second
  column for the same idea is forbidden. This stage is closed, not optional.

---

## 4. Risks

1. **Combo child stock is already wrong today**, before any platter work. Platters make it much worse, because one platter consumes six items. Fix it first, as a standalone change, and remember the fix spans four deduct/restore paths, not one.
2. **Price must never be derived from child items.** A platter whose price moves when the customer picks defeats the entire point. Child lines carry 0 or surcharge only.
3. **Tomorrow + platter interaction.** Both the allow-tomorrow rule and the daily make-limit must apply per chosen item, not per platter. The child-line model gives this for free; a JSON-blob model would silently miss it.
4. **Refunds.** A refunded platter must return every child item to stock — again free with child lines, hand-rolled otherwise.
5. **Promotions on platters.** Decide explicitly whether a percentage promotion applies to a platter price. Recommendation: allow it, but never allow buy-X-get-Y to treat platter children as qualifying lines — that would give away free items twice. Implementation: `PromotionEvaluator` skips lines with `parent_order_item_id`.
6. **Kitchen blindness.** Any storage model where platter contents live only in `notes` means the KDS shows "Platter x1" and nothing else — the kitchen cannot make it. This is why the child-line decision is not optional.
7. **Existing promotions must not change behaviour when roles are added** (Stage F). Every current promotion has targets with no role. If null is not treated as "reward", live promotions silently stop applying — or worse, start applying to everything. This is the single highest risk in Stage F and needs a test that predates the change.
8. **Trigger lines double-dipping** (Stage F). Without an explicit rule, the item that unlocks the offer can also be the item discounted by it — the customer buys one burger and gets that same burger free. Decide once, enforce in code, test it.
9. **A trigger promotion combined with platter child lines** (Stage F + Stage C). Platter children must never satisfy a trigger, or a customer assembles a platter and unlocks offers six times over. Same filter as risk 5 — skip lines with `parent_order_item_id`.

---

## 5. Test plan

- A group requiring exactly 6 rejects 5 and 7, accepts 6.
- A minimum-2 group accepts 2 and 5, rejects 1.
- Price equals the platter price plus surcharges, never the child sum.
- Selling a platter decrements each chosen child item's stock; refunding returns it — verified on all four paths (POS deduct, online reserve, cancel/void restore, refund restore).
- A platter ordered for tomorrow rejects any chosen item not ticked for tomorrow.
- Each chosen item counts against its own daily make-limit, and an item with `tomorrow_remaining` 0 is not selectable in the picker in tomorrow mode.
- The KDS shows the platter with its chosen contents indented beneath it.
- Re-ordering a past platter reproduces the same child selections.
- Buy-X-get-Y does not treat platter children as qualifying lines.
- A coded promotion with a day/time window applies inside its window and not outside (existing enforcement; the new admin UI just exposes the fields).

Stage F (trigger and reward):
- **Every existing promotion, with no roles set, behaves exactly as before.** Write this test against the current code first, so it passes before the change and must keep passing after.
- Basket without the trigger item → no discount at all.
- Basket with the trigger item → the reward items are discounted, and only those.
- Trigger requiring quantity 2 is not satisfied by 1.
- A trigger line is not also discounted as its own reward.
- Platter child lines never satisfy a trigger.
- The free-drink scenario end to end: meal in basket → drink free; drink alone in basket → **full price** (this is the money leak the feature exists to close).
- Works identically on a POS order and an online order.
- The reward prompt appears at the cart when the basket qualifies, and does not appear when it does not.
- Declining the reward leaves the order otherwise unchanged.
- Removing the trigger item withdraws the free line and says so — the customer is never silently charged for it.
- A client submitting a free reward the basket did not earn is **rejected server-side**.

---

## 6. Sequencing

1. **Combo child-stock fix, standalone and first.** It is a live bug today regardless of platters, and fixing it first means the platter work builds on correct stock handling instead of piling onto a broken base.
2. **Promo schedule UI tweak** (show day/time fields for coded promos) — tiny, independent, can ride along with anything.
3. **Stage F — trigger and reward.** Small, self-contained, and it unlocks two promotions the owner wants now. It also closes a live money leak: scenario 1 set up on today's engine gives the free drink to everyone, meal or not. Ahead of the platter work because it is smaller, faster to ship, and earns immediately.
4. **Stages A → B → C together**, built on the child order-line model, because a platter that cannot be priced and stock-tracked is not shippable.

Stage E is closed — nothing to sequence.
