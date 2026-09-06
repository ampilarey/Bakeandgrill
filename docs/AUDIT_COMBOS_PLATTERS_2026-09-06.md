# Bundles, combos and platters — audit

**Date:** 2026-09-06
**Asked:** "can u audit and explain bundle/combo/platter and explain me how it works"
**Scope:** what the three names mean, how one is priced, how stock moves, what
each surface does with them, and where the seams are.

**Audited read-only.** Findings are listed with what each one costs you, in
the order I would fix them.

**Update, same day — all seven are fixed.** The owner read this and said "Fix
all". Each finding below now carries a *Fixed:* note saying what it does
instead; the "If you want these fixed" section at the end is kept as the record
of the order they were done in. No combos or platters exist on the live menu
today, so every change here is latent until one is created — including F1's
change to what a discounted bundle charges.

---

## The short version

There are not three things. There is **one flag and two shapes**.

`items.is_combo` marks a menu item as a bundle. It is still one row in `items`,
with its own name, price, photo, category and channel switches — everything an
ordinary dish has. What makes it a bundle is what hangs off it:

| Shape | Defined by | Contents | Customer |
|---|---|---|---|
| **Fixed bundle / combo** | `combo_items` rows | Set by you | Takes what is in it |
| **Choice platter** | `platter_groups` + `platter_group_items` | Chosen at order time | Picks from your lists |

An item is a platter when it has at least one choice group — that is the whole
test (`Item::isPlatter()`). Nothing else distinguishes them. In the admin
editor this is the "How customers get what's inside" radio: **fixed** or
**choose**.

"Bundle", "combo" and "platter" are used interchangeably in the interface. In
the code, *combo* means the flag and the fixed shape, *platter* means the
choice shape.

---

## What a bundle costs

**The bundle's own price, and nothing else.** The parent item's `base_price`
(or the price of the size the customer chose) runs through
`EffectivePriceService` exactly like any dish, so specials and discounts apply
to it normally.

The children are **free**. A fixed bundle's contents add nothing. A platter's
picks add nothing *unless* that pick carries a surcharge in
`platter_group_items.surcharge` — that is the only way a child moves money.

So a "Family Bundle" at MVR 250 charges 250. What is inside is a
composition instruction, not a calculation.

### Sizes on a platter

A platter can have sizes like any item, and `platter_groups.size_counts` maps
each size to how many picks it requires — `{"12": 6, "13": 9}` means the size
with variant id 12 needs six picks and id 13 needs nine. When a size is
chosen, its count overrides the group's own `min_count` / `max_count`.

Group rules are `exactly`, `min`, or a `range` (min and max).

---

## What the order looks like afterwards

**A platter writes real rows.** Each pick becomes an `order_items` row with
`parent_order_item_id` pointing at the platter line, priced at its surcharge
(usually 0). Quantity scales: two platters doubles every pick. This is why the
KDS can show a platter's contents, and why refunds and stock work on the picks
individually.

**A fixed bundle writes one row.** The bundle line, and nothing else. Its
contents exist only in `combo_items`, as a definition.

---

## What happens to stock

| | Fixed bundle | Choice platter |
|---|---|---|
| The bundle's own stock | Deducted if the bundle tracks stock | Same |
| Children | `ComboChildStockService` deducts each **required** child that tracks stock, quantity × how many bundles | Not applicable — picks are real lines and deduct through the normal path |
| Optional children | **Never** deducted | Not applicable |
| Nested bundles | Expanded; loops stop safely | — |

The two paths are deliberately exclusive: a platter never also deducts through
`combo_items`, or the same stock would be taken twice.

Recipe-driven ingredient deduction (flour, oil) is separate and works off each
item's own recipe, as usual.

---

## What each surface does

| Surface | Fixed bundle | Choice platter |
|---|---|---|
| **Order app** | Lists contents under "Includes" | Full picker, validates counts, sends picks |
| **Website menu** (Blade) | Name and price only | Name and price only — no sign it is choose-your-own |
| **POS** (till) | Sells as a normal item | **Cannot sell it — see F2** |
| **KDS** (kitchen) | One line, the bundle's name | Parent line plus each pick |
| **Admin** | Item editor → "Bundle / combo / platter" | Same, with choice groups |

---

## Findings

### F1 — "Bundle discount (%)" does nothing at all. *(High)*

`combo_discount_pct` is a field in the item editor, validated on save, stored
in the database and returned by the API. **It is never read by any
calculation, anywhere.** I grepped the backend, all four front-end apps and the
shared package: every reference is storage or display.

Set it to 20% and the customer is charged the bundle's full `base_price`. The
control looks like it discounts a bundle and does not.

*Cost:* you may believe a bundle is discounted when it is not, or price a
bundle low on the assumption the field is not applying, and never find out
which. Either the field should compute the price from the children, or it
should be removed.

*Where:* `items.combo_discount_pct`; `MenuItemEditorModal.tsx` line ~1393.

*Fixed:* it computes the price. `BundlePricingService` reads the percentage off
the bundle's contents — **the bundle sells for what its contents come to, less
that percentage** — and `EffectivePriceService` resolves it, so the website
menu, the order app, the POS and the order all say the same number. Pricing
from the contents rather than off the bundle's own price is what keeps it
honest as its children change: put the price of chicken up and the bundle
follows. Leave the box empty and nothing changes.

### F2 — The POS cannot sell a platter. *(High)*

The POS order payload has no `children` field, and pos-web has no platter
picker — there is no mention of platters in the till app at all. A platter
appears in the till like any other item, so a cashier can tap it and take
money; on submit `PlatterOrderService::resolveChildren` refuses the order with
*"Choose items for X before ordering."*

*Cost:* a customer standing at the counter cannot buy a platter, and the
cashier gets an error they cannot act on. Platters are effectively
online-and-catering only, which is not something the interface says anywhere.

*Where:* `apps/pos-web/src/api/orders.ts`; `PlatterOrderService.php` line ~36.

*Fixed:* the till has a picker. `PosPlatterPicker` shows each choice group with
how many picks it needs and what any surcharge costs, the Add button says
"Pick 2 more" until the rules are met, and the payload carries `children` on
all three POS paths (counter, delivery, offline sync). The endpoint always
accepted them — the till is what could not ask. The rules moved to
`@shared/utils` so the count a cashier is held to is the count the customer
sees.

### F3 — A fixed bundle sells when its contents are sold out. *(Medium-high)*

`ItemAvailabilityService` — the thing that decides `available_now` on the menu
— has no combo awareness whatsoever. Nothing about a bundle's availability
looks at its children.

The only child check happens at order time, in `ComboChildStockService`, and it
checks **stock only**, for children with `track_stock` *and*
`availability_type = 'stock_based'`. A child switched off with the "Sold out"
toggle — which is how most kitchens 86 a dish — is skipped entirely.

*Cost:* two different bad days. A stock-tracked child that runs out gives the
customer a 422 at the last step of checkout ("Insufficient stock for X"), after
they have entered their details. A child that is simply marked sold out gives
no error at all — the bundle sells and the kitchen cannot make it.

Worth noting the asymmetry: **platter picks do check `is_available`**
(OrderCreationService line ~862). Only fixed bundles skip it.

*Fixed:* both. `ItemAvailabilityService` now looks at the required children at
each of its return points, so a bundle whose contents cannot be made is off the
menu rather than sold and then refused. `assertChildrenAvailable` checks the
flags — active, available, not snoozed — before it checks stock, so the "Sold
out" toggle counts. A child's *channel* switches are deliberately left out: the
bundle has its own, and the child may not be sold separately at all.

### F4 — A bundle's cost and margin are wrong. *(Medium)*

`RecipeCostCalculator` has no combo awareness: a bundle's cost comes from the
bundle's own recipe. Unless you re-enter every child's ingredients on the
bundle itself, a bundle costs 0 as far as the system is concerned.

*Cost:* the margin badge on the menu list, the profit figures in the recipe
editor and the break-even calculator all treat a bundle as almost pure profit.
Bundles are usually the lowest-margin thing on a menu, so this is wrong in the
most expensive direction.

*Fixed:* `RecipeCostCalculator` rolls a bundle's cost up from its children when
the bundle has no cost of its own — nested bundles included, with a depth
guard. A cost entered on the bundle itself still wins, and a bundle with
nothing costed inside it stays unknown rather than becoming zero.

### F5 — "Optional" children are a label with no mechanism. *(Medium)*

`combo_items.is_optional` renders as "(optional)" beside a child in the order
app. The customer cannot opt in or out, nothing records whether they took it,
and its stock is never deducted.

The service documents this as deliberate, pending a later stage, and warns
against "fixing" it by deducting optionals — that is the right call given
nothing records the choice. But from your chair it is a switch that changes one
word on a screen.

*Where:* `ComboChildStockService.php` lines 16–21.

*Fixed:* it is a choice now. `combo_items` gained a `surcharge` (default 0 —
what every bundle does today), the item editor prices it, the order app offers
a checkbox per optional component, and what the customer ticks becomes a child
order line exactly as a platter's pick does: on the kitchen ticket, through the
ordinary stock path, refundable on its own. Quantity and price come from the
definition, never from the payload — otherwise a request for fifty free dips
would be an order for fifty free dips. This is the "stage 4" the service's own
docblock was waiting for.

### F6 — The kitchen ticket for a fixed bundle does not say what is in it. *(Low-medium)*

A platter prints its picks, because they are real order lines. A fixed bundle
prints one line with the bundle's name. The kitchen has to know the recipe of
the bundle from memory or a printed sheet.

*Fixed:* the ticket lists the required contents under the bundle line, scaled
by the line — two family meals is four portions of fries, and the kitchen
counts portions. Platters send nothing here, and neither do optional extras:
both are already lines of their own, and printing them twice reads as a double
order.

### F7 — The website menu does not describe bundles. *(Low)*

The order app lists a bundle's contents and offers the platter picker. The
Blade menu shows name and price only — a customer reading the website cannot
tell that "Mixed Platter" is choose-your-own, or what a bundle contains.

*Fixed:* `/menu/{id}` says what is inside a fixed bundle, or what you choose
from and how many on a platter; a discounted bundle shows the saving against
buying the same food separately. The grid marks each one "Bundle" or "Choose
your own", and a bundle is findable by what is in it — searching "chicken"
reaches the family meal that contains chicken.

---

## What is solid

Worth saying plainly, because most of this is careful work:

- **Platter picks are validated server-side and client prices are ignored.**
  The surcharge is read from your definition, never from the payload. Group
  counts, allowed items and unknown groups are all checked.
- **Picks are resolved before the parent row is created**, so a bad pick cannot
  leave an orphan platter line on an order.
- **The two stock paths cannot both fire**, so a platter can never be
  double-deducted.
- **Nested bundles expand and cycles stop safely** rather than looping.
- **Zero-price picks are `out_of_scope` for GST**; only a real surcharge is
  taxed, at the child's own rate.
- Covered by tests: `ComboCompositionTest`, `PlatterCompositionTest`,
  `ComboChildStockTest`, `PlatterOrderLinesTest`.

---

## If you want these fixed

My order, by what it costs you per week:

1. **F1** — decide what "Bundle discount %" means, then make it mean that or
   take it out. Smallest change, largest gap between what the screen promises
   and what happens.
2. **F3** — make a bundle unavailable when a required child is. One service,
   and it stops selling food you cannot make.
3. **F4** — roll a bundle's cost up from its children so margins are real.
4. **F2** — a platter picker in the POS. The biggest build of the five; worth
   it only if you actually want to sell platters at the counter.
5. **F5/F6/F7** — smaller, and only worth doing once the above are done.
