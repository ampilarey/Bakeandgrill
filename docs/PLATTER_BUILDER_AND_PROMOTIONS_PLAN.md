# Build-Your-Own Platter + Promotions — Plan

Status: proposed, not yet built.

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
| Day / time windows on promotions | Promotions have only `starts_at` and `expires_at`. No "3–5pm daily". Happy hour is impossible without one promo per day. |
| Combos do not reduce child stock | **Selling a combo does not decrement the stock of the items inside it.** Verified: no combo handling anywhere in `OrderCreationService` or `StockManagementService`. |
| Lead time | `items.pre_order_lead_time_minutes` exists, is fillable and cast, and **nothing reads or writes it**. |

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

### Stage A — Platter definition (admin)

- New table for choice groups belonging to a platter item: name, rule type (`exactly` / `min` / `range`), min count, max count, sort order.
- New table for allowed items in a group: item, optional surcharge (default 0), sort order.
- Extend the existing combo concept rather than creating a parallel system — a platter is an item flagged as a bundle whose contents are chosen, not fixed.
- Admin UI in the item editor: define groups, pick allowed items, set the rule. Plain wording — "Choose any 6", not "cardinality constraint".
- Tiered sizes: allow a platter to have several sizes, each with its own count and price.

### Stage B — Customer picker

- Opening a platter shows its groups. The customer picks until each rule is satisfied.
- Add to cart is blocked until every rule is met, with a plain running hint — "Pick 2 more".
- Cart and receipt list what was chosen inside the platter, not just "Platter".
- Unavailable items are not selectable, and the picker must respect **tomorrow mode** — in tomorrow mode, items that are sold out today are still selectable if they are ticked for tomorrow.

### Stage C — Money and stock (highest risk)

- Price is the platter price plus any surcharges. Never the sum of the child items.
- **Fix the existing combo stock bug as part of this**: selling a platter must decrement each chosen child item's stock, and a refund or cancellation must give it back. Today combos do not touch child stock at all, which means selling 20 platters of 6 short eats leaves stock counts meaningless.
- GST must be applied on the platter price, consistently with how combos are taxed today. Check before changing anything.
- Collect-tomorrow: a platter ordered for tomorrow must follow the same rules already built — every chosen item must be ticked for tomorrow, and the per-item daily make-limit must count each chosen item.

### Stage D — Promotion scheduling (the other real gap)

- Add day-of-week and time-of-day windows to promotions, so "3–5pm daily, 20% off short eats" is one promotion rather than seven.
- Reuse `App\Support\ScheduleWindows`, already built for the feature gates. Do not write a fourth copy of schedule parsing.
- This also enables end-of-day clearance, which for a bakery is the difference between selling stock and binning it.

### Stage E — Lead time (optional, small)

- `items.pre_order_lead_time_minutes` already exists and is unused. A platter is exactly what it was meant for — "order 3 hours ahead".
- Either use it here or leave it alone. Do not add a second column for the same idea.

---

## 4. Risks

1. **Combo child stock is already wrong** (Stage C). Platters make it much worse, because one platter consumes six items. Fix it with this work, not after.
2. **Price must never be derived from child items.** A platter whose price moves when the customer picks defeats the entire point.
3. **Tomorrow + platter interaction.** Both the allow-tomorrow rule and the daily make-limit must apply per chosen item, not per platter.
4. **Refunds.** A refunded platter must return every child item to stock.
5. **Promotions on platters.** Decide explicitly whether a percentage promotion applies to a platter price. Recommendation: allow it, but never allow buy-X-get-Y to treat platter children as qualifying lines — that would give away free items twice.

---

## 5. Test plan

- A group requiring exactly 6 rejects 5 and 7, accepts 6.
- A minimum-2 group accepts 2 and 5, rejects 1.
- Price equals the platter price plus surcharges, never the child sum.
- Selling a platter decrements each chosen child item's stock; refunding returns it.
- A platter ordered for tomorrow rejects any chosen item not ticked for tomorrow.
- Each chosen item counts against its own daily make-limit.
- A time-windowed promotion applies inside its window and not outside, evaluated in local time.
- Buy-X-get-Y does not treat platter children as qualifying lines.

---

## 6. Sequencing

Stage D (promotion time windows) is small, independent, and pays off daily — it can land first while the platter work is specified.

Then A → B → C together, because a platter that cannot be priced and stock-tracked is not shippable.

Stage E last, or never.
