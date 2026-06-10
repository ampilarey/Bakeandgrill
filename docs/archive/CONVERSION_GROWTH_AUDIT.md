# Conversion Growth Audit
## Bake & Grill — Think Like a Growth Strategist

> **Superseded for prioritization (2026-05-29):** Use [docs/FEATURE_ROADMAP_AUDIT.md](docs/FEATURE_ROADMAP_AUDIT.md) and [docs/FEATURE_IMPLEMENTATION_WAVES.md](docs/FEATURE_IMPLEMENTATION_WAVES.md) as the source of truth for what to build next. This document remains useful for UX rationale but several items below are **out of date** relative to current code.

### Status corrections (code verified)

| Item | This doc says | Current code |
|------|---------------|--------------|
| **QW2** Cart upsell | Missing | **Built** — `apps/online-order-web/src/components/CartDrawer.tsx` “Add to your order” |
| **QW6** Free delivery progress | Missing / backend not wired | **Built** — `DeliveryFeeCalculator` + cart progress bar (`CartDrawer.tsx`); sync threshold with backend public settings still recommended |
| **QW7** Menu star ratings | Missing | **Built** — `MenuCard.tsx` |
| **MT2** Referral reward never pays out | Missing | **Built** — `RecordReferralRedemptionListener.php` credits referrer on paid order (verify on staging) |
| **MT4** Loyalty tiers invisible | Missing | **Built** — `AccountPage.tsx` tier progress |

Still valid / partial: QW1, QW3, QW5, QW8, MT1, MT3, MT5, MT6, and later sections.

---

> This audit assumes a visitor who arrives on the homepage for the first time and
> attempts to complete an order. Every friction point and missed opportunity is noted.

---

## HIGH-IMPACT QUICK WINS

### QW1 — First-order incentive is invisible
**Impact:** Very High  
**Problem:** The promo system is fully built. There is no new-customer offer on the homepage, no "first order 10% off" banner, no popover, nothing. The announcement banner exists but is disabled.  
**Fix:** Enable the announcement banner in CMS with a first-order promo code. Example: "🎉 First order? Use code FIRST10 for 10% off." Takes 10 minutes to configure. The promo logic already handles it.

### QW2 — No upsell or cross-sell in cart
**Impact:** High (direct AOV improvement)  
**Problem:** The cart drawer shows items and a checkout button. There is no prompt to add a drink, dessert, or complementary item. Research shows "add-on" prompts in cart increase AOV by 15–25%.  
**Fix:** Add a small "You might also like" or "Add a drink?" block at the bottom of the cart drawer, pulling from a category like "Drinks" or a featured add-on item. Can be hardcoded initially as "Also popular" with a few items.

### QW3 — Loyalty points not visible until checkout summary
**Impact:** High (loyalty engagement + repeat orders)  
**Problem:** Customers don't see how many points they're earning until the final checkout summary. This is a missed motivational moment. Points visibility during browsing and in the cart creates "loyalty momentum."  
**Fix:** Show a small "⭐ You'll earn ~X pts" line in the cart drawer when the customer is logged in. The earn rate is known (1 pt per MVR 1), so it can be calculated client-side from cart total.

### QW4 — Profile setup blocks checkout (FIXED)
**Impact:** Very High  
**Problem:** After OTP, customers were trapped in a mandatory profile setup screen with no skip option. This is the #1 conversion killer in mobile e-commerce.  
**Status:** ✅ Fixed — "Skip for now — go to checkout" added.

### QW5 — Specials on homepage but not on menu page
**Impact:** High  
**Problem:** "Today's Specials" section appears on the homepage but not on the menu page where the actual add-to-cart decision is made. Special offers should be at the point of conversion, not just in the awareness stage.  
**Fix:** Add a "Today's Specials" pill or collapsible section at the top of the menu page (above or inside the first category), pulling from the same `/ordering/specials` API call the homepage uses.

### QW6 — No "free delivery" progress bar
**Impact:** High (AOV improvement for delivery orders)  
**Problem:** The backend has free-delivery threshold logic scaffolded (`delivery.php` config, `subtotalLaar` parameter) but the `DeliveryFeeCalculator::calculate()` doesn't use it. Even if it did, the cart shows no progress indicator.  
**Fix (backend):** Wire the subtotal threshold in `DeliveryFeeCalculator`. Fix (frontend): Add "Add MVR X more for free delivery" progress bar in the cart drawer when a delivery order is being built. This is one of the most effective AOV-boosting tactics in food delivery.

### QW7 — Reviews exist but are invisible on menu
**Impact:** High  
**Problem:** Customers write reviews (in account + order status). Items have review data in the API. But the menu cards show no star rating or review count. Customers buy based on social proof — showing "⭐ 4.8 (23)" on a menu card dramatically increases add-to-cart conversion for popular items.  
**Fix:** Add star rating + review count to `MenuCard.tsx`, sourced from the existing item reviews API. Even showing just top-rated items with a "⭐ Popular" badge is a meaningful improvement.

### QW8 — "Order again" is buried in Order History
**Impact:** Medium–High (repeat order rate)  
**Problem:** The "🔁 Order again" button only exists in the order history page. Returning customers who land on the homepage see the same first-time experience. A "welcome back" block on the homepage for logged-in users (showing last order + reorder CTA) would dramatically improve repeat order conversion.  
**Fix:** Add a conditional block on the homepage: if customer is logged in and has prior orders, show "Welcome back, [name]! Last order: [items summary]. [🔁 Order again] [Browse menu]". API supports this via `/api/customer/orders`.

---

## MEDIUM-TERM GROWTH IMPROVEMENTS

### MT1 — No bundle or combo meals
**Impact:** Very High (AOV)  
**Problem:** All items are sold individually. There is no "Breakfast Combo", "Family Pack", or "Office Bundle." The backend promo system supports `free_item` type promos and item scoping — this is the closest to bundle logic but not a true bundle builder.  
**Fix:** Create admin-managed "bundle" items (special menu items representing combos at a fixed price). Alternatively, build a combo suggestion modal: "Add a drink for MVR 15 more and save MVR 10." This requires a new menu item type or a promotional pairing feature.

### MT2 — Referral reward never pays out
**Impact:** High (acquisition)  
**Problem:** The referral system records a referral with `reward_paid = false` but no listener completes the payment. Referrers who share their code and see a friend order get nothing. This completely nullifies the referral programme as an acquisition channel.  
**Fix:** Backend — implement referrer reward credit (loyalty points or store credit) in `RecordReferralRedemptionListener`. This is a backend business logic fix — highest priority backend task.

### MT3 — No homepage personalisation for returning customers
**Impact:** High (repeat order rate)  
**Problem:** Returning logged-in customers see the same homepage as anonymous visitors. There is no "welcome back" moment, no recent order shortcut, no personalised recommendation.  
**Fix:** Add server-side or client-side conditional block on homepage/order app that checks `localStorage('online_token')` and, if present, fetches last order and renders a reorder CTA. See QW8.

### MT4 — Loyalty tiers are invisible
**Impact:** High (retention)  
**Problem:** Backend has silver/gold/platinum tiers with point multipliers. Customers have no idea. Tier systems only drive behaviour when they're visible — progress bars, "you're 200 pts from Gold" notifications.  
**Fix:** Add tier progress UI to the Account → Loyalty tab. Show: current tier, tier benefits (multiplier), points needed for next tier, a progress bar. Surface "you're near a tier upgrade" on the checkout confirmation.

### MT5 — No post-order re-engagement
**Impact:** Medium  
**Problem:** After an order completes, the customer sees order tracking. There is no re-engagement prompt: no "rate your order" prompt timed to 30 min after delivery, no "order again" reminder, no loyalty milestone notification.  
**Fix:** On the order status page when status is `completed`/`delivered`, surface: (a) the review prompt (already exists, could be more prominent), (b) a "🎁 You just earned X pts" celebration moment, (c) a "Order again in one tap" button. All data is available.

### MT6 — No delivery ETA comparison against pickup
**Impact:** Medium  
**Problem:** The checkout only shows the selected order type. There's no moment where the customer sees "Pickup: ready in 15 min | Delivery: 30–45 min + MVR X fee" — the comparative information that nudges smart ordering decisions.  
**Fix:** In the Order Type selector on checkout, show estimated time + fee for each option side-by-side. Data is available from `/api/ordering/delivery-status` and the site settings delivery_time.

---

## LATER ADVANCED ENHANCEMENTS

### AE1 — Smart cross-sell prompts
When a customer adds a specific item (e.g. "Bajiya"), suggest a complementary pairing ("Also popular with this: Tea, MVR 12 → Add"). Requires an item → recommendation mapping, either admin-configured or popularity-based.

### AE2 — Abandoned cart re-engagement
If a customer adds items and doesn't check out within 30 min, send a WhatsApp message: "Still hungry? Your cart is waiting." The SMS system is in place; this needs a scheduled job triggered by cart inactivity.

### AE3 — Loyalty milestone notifications
When a customer crosses a points tier, send a congratulatory SMS: "You've reached Gold! Your points now earn 1.5x faster." This creates emotional investment in the programme.

### AE4 — Seasonal / time-based promotions
A breakfast deal that's only valid 7–10am, a Ramadan special, a National Day menu. The promo system supports `starts_at`/`ends_at` — the admin UI for scheduling is in place. This is an ops/marketing workflow, not a tech gap.

### AE5 — Customer-visible delivery tracking on map
The backend has driver location data. The order status page has a `📍 Track on Map` link but it goes to Google Maps with static coordinates. A live map embed showing driver position would significantly improve the delivery experience and reduce "where is my order?" support messages.

### AE6 — Social sharing after order
After a completed order, a "Share your order" or "Tell a friend" moment with pre-filled referral link. Low cost to build, potentially high acquisition value if the food photography/product names are appetising.

---

## Conversion funnel summary

| Stage | Current state | Gap |
|---|---|---|
| **Awareness** (Homepage) | Good hero, categories, trust strip | No social proof (reviews), no first-order offer visible |
| **Discovery** (Menu browse) | Clean menu, search, categories | No star ratings on cards, no specials on menu page |
| **Intent** (Cart) | Clean cart drawer | No upsells, no free-delivery progress, no loyalty points preview |
| **Auth** (Login) | OTP flow, smooth | Skip button now fixed; still required (no guest checkout) |
| **Checkout** | Comprehensive (promo, loyalty, gift, referral) | Referral reward never pays; delivery ETA not compared |
| **Confirmation** | SSE live tracking, push notification | No points celebration, no re-engagement prompt |
| **Retention** | Order history + reorder | No homepage personalisation, no tier visibility |
