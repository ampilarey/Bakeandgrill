# Full Commercial Audit Discovery
## Bake & Grill — Malé, Maldives

> Audit date: April 2026 · Repo: monorepo at `/Users/vigani/Website/Bake&Grill`

---

## 1. Apps and modules found

| App / Module | Path | Type | Status |
|---|---|---|---|
| **Public website** | `backend/resources/views/` | Laravel Blade | Live, CMS-driven |
| **Online order app** | `apps/online-order-web/` | React 18 + TypeScript | Live |
| **Admin dashboard** | `apps/admin-dashboard/` | React 18 + TypeScript | Live |
| **Shared types** | `apps/shared/` | TypeScript library | Used by order + admin |
| **Backend API** | `backend/` | Laravel 11, PHP 8.2 | Live |
| **KDS** | `apps/admin-dashboard/src/pages/KDSPage.tsx` | Embedded in admin | Live |
| **Delivery management** | `apps/admin-dashboard/src/pages/DeliveryPage.tsx` | Embedded in admin | Live |
| **POS / staff orders** | Admin → Orders → in-person | Via admin dashboard | Live |

---

## 2. Key business flows found

### Customer-facing
1. **Browse menu** → categories + items, specials from API, favourites (login required)
2. **Online pickup order** → Auth → Build cart → Checkout → BML payment → OTP → Kitchen → SMS confirmation
3. **Delivery order** → same flow + address + delivery fee calculation per island
4. **Pre-order (events)** → Date/time selection → item selection → submit → confirmation
5. **Reservation** → date/party/time slot picker → SMS confirmation
6. **Account management** → profile, loyalty, referrals, favourites, reviews, pre-orders
7. **Order tracking** → SSE live tracking + push notification opt-in + driver contact
8. **Reorder** → from order history, adds previous items to cart

### Backend / operations
9. **KDS** → order queue by status, start/bump/recall
10. **Delivery management** → assign driver, location tracking, status updates
11. **Staff POS** → in-person ordering, cash/card, split payments, shift management
12. **Inventory** → low-stock alerts, waste logging, purchase orders
13. **Promotions** → percentage/fixed/free-item, min order, per-customer limits
14. **Loyalty** → earn 1 pt/MVR 1, redeem 100 pts = MVR 1, tier multipliers
15. **Gift cards** → issue, balance check, apply to order, debit on payment
16. **Referrals** → code generation, referee discount, referrer reward (recorded but not auto-paid)
17. **SMS campaigns** → Dhiraagu, segment calculation, campaign/automation/template management
18. **Xero accounting** → connect, push invoices/expenses (integration page built)

---

## 3. Current customer acquisition features

| Feature | Status | Quality |
|---|---|---|
| Public website with hero / category showcase | ✅ Live | Good — CMS-driven |
| Online ordering (pickup + delivery) | ✅ Live | Good |
| Pre-order / events | ✅ Live | Basic but functional |
| Reservations | ✅ Live | Good |
| SMS marketing campaigns | ✅ Built | Admin-only, not self-serve |
| Referral programme | ✅ Built | Partially exposed in checkout/account |
| WhatsApp / Viber contact | ✅ Live | Visible in multiple surfaces |
| Prayer times widget | ✅ Live | Strong local differentiation |
| Open/closed status badge | ✅ Live | Good real-time trust signal |
| Specials on homepage | ✅ Live | API-driven |
| Featured / bestsellers | ✅ Live | API-driven |
| Announcement banner | ✅ Built | CMS-toggleable |
| Google Maps link | ✅ Built | CMS-configurable |
| Dark mode | ✅ Live | Preference retained |

---

## 4. Current retention / repeat-order features

| Feature | Status | Quality |
|---|---|---|
| Loyalty points earn/redeem | ✅ Built | Good backend, checkout UI present |
| Order history + "Order again" | ✅ Built | Good — one-tap reorder |
| Account with saved details | ✅ Built | Phone + name + email |
| Referral programme | ✅ Built | Code visible in account |
| Push notification opt-in (order tracking) | ✅ Built | Good on order status page |
| Order confirmation SMS | ✅ Live | "Payment received, Track: URL" |
| Order completion SMS | ✅ Live | On delivered/completed |
| Favourites (menu items) | ✅ Built | Login required |
| Loyalty tier multipliers | ✅ Built | Backend only, not displayed to customer |
| Post-order review prompt | ✅ Built | On order status + account |
| Loyalty account page | ✅ Built | Shows points, how to earn/redeem |

---

## 5. Current trust-building features

| Feature | Status | Notes |
|---|---|---|
| BML BankConnect payment | ✅ Live | Strong — "no card storage" copy present |
| Privacy policy (detailed) | ✅ Live | Specific to BML, Dhiraagu, OTP |
| Refund/terms pages | ✅ Built | Links in checkout |
| SSL / "secure checkout" copy | ✅ Live | "Payment processed securely by Bank of Maldives" |
| Card brand logos (Visa/MC) | ✅ Live | In checkout |
| Business phone/email/WhatsApp | ✅ Live | Multiple surfaces |
| Physical address + maps | ✅ Live | Footer + contact page |
| Open/closed live badge | ✅ Live | Homepage + menu page |
| Trust strip ("Baked at 5am", family-owned) | ✅ Live | CMS-driven |
| Social proof stat ("500+ orders/week") | ✅ Live | Unverified claim, no source |
| Post-order reviews | ✅ Built | Account + item modal |
| Prayer times | ✅ Live | Strong local cultural signal |

---

## 6. Obvious conversion gaps

1. **No guest checkout** — customers must log in before seeing checkout. Friction especially for first-time visitors on mobile.
2. **No visible social proof on homepage** — no star ratings, review count, or customer testimonials outside admin-managed `proof_stat`.
3. **No upsells in cart** — cart drawer shows items only. No "add a drink", "complete your breakfast", "people also order" moments.
4. **No bundle / combo prompting** — items are sold individually. No "meal deal" or bundle suggestions.
5. **No first-order incentive** — no visible promo for new customers on homepage or at checkout entry.
6. **Loyalty points not visible in cart** — customers don't see "you'll earn X pts" until checkout summary.
7. **Profile setup blocks checkout** — after OTP, "One last step" screen had no actual skip button (now fixed).
8. **Menu search is checkout-agnostic** — no "add to cart" from search results; must navigate to item.
9. **No reorder shortcut on homepage** — returning customers see the same homepage as first-timers.
10. **Category links in homepage seeded as `/menu`** — may not route to online order app's `/menu` correctly.

---

## 7. Obvious commercial opportunities

1. **Combo / bundle builder** — backend has `free_item` promo type. A "build your breakfast combo" UI would increase AOV significantly.
2. **First-order promo banner** — use the existing promo system + announcement banner for a prominent new-customer offer.
3. **Loyalty tier visibility** — backend has silver/gold/platinum tiers with multipliers. Showing this to customers creates aspiration and increases order frequency.
4. **"Your usual" / reorder block on homepage** — for logged-in returning customers, show last order with one-tap reorder button on homepage.
5. **Referral viral loop** — referrer reward is recorded but never paid. Completing this would turn every order into a potential acquisition channel.
6. **SMS promotions** — full SMS promotion system exists in backend. Admin can run targeted campaigns to existing customers.
7. **Office/corporate ordering** — pre-order flow already exists. A dedicated "office breakfast" landing section with min order and delivery to specific addresses would unlock B2B revenue.
8. **Review visibility on menu** — reviews exist in the system. Showing star ratings on menu cards and in item modals would increase add-to-cart conversion.
9. **Specials on menu page** — specials only appear on homepage. Showing them prominently on the menu page (where most add-to-cart happens) would increase uptake.
10. **Delivery free threshold** — backend has free-delivery threshold logic scaffolded but not wired. Surfacing "add MVR X more for free delivery" in cart would increase AOV.
