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

---

## 6. Sequencing

1. **Combo child-stock fix, standalone and first.** It is a live bug today regardless of platters, and fixing it first means the platter work builds on correct stock handling instead of piling onto a broken base.
2. **Promo schedule UI tweak** (show day/time fields for coded promos) — tiny, independent, can ride along with anything.
3. **Stages A → B → C together**, built on the child order-line model, because a platter that cannot be priced and stock-tracked is not shippable.

Stage E is closed — nothing to sequence.
