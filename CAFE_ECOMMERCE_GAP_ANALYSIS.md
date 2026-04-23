# Café E-Commerce Gap Analysis
## What high-converting café/restaurant ordering sites have vs. what Bake & Grill has

> Reference: Square for Restaurants, Toast, Deliveroo/merchant side, Talabat-style UX,
> top-performing Maldives SME ordering sites (Ooredoo, STO Food, etc.)

---

## What strong restaurant/café ordering sites always have

| Feature | Category |
|---|---|
| Star ratings + review count on menu cards | Trust / conversion |
| "X people ordered this today" or "bestseller" badge | Social proof / conversion |
| One-tap reorder for returning customers | Retention |
| Free delivery threshold progress in cart | AOV |
| First-order incentive prominently displayed | Acquisition |
| Cart upsell / "add a drink" prompt | AOV |
| Guest checkout (no login required) | Conversion |
| Bundle / combo offers | AOV |
| Allergy / dietary filter on menu | Trust / accessibility |
| Live estimated wait time | Operational clarity |
| Order confirmation push + SMS | Retention |
| Loyalty tier progress visible | Retention |
| Halal certification (in Muslim markets) | Trust |
| "Trending" or "staff picks" category | Discovery |
| Photo-first menu cards | Discovery / conversion |
| Delivery fee visible before checkout | Trust / conversion |
| Social share of order / refer a friend | Acquisition |
| Reorder from order history | Retention |
| Post-order review prompt | Trust / social proof |
| Birthday or milestone offer | Retention |

---

## What Bake & Grill already has (strong foundation)

| Feature | Status | Notes |
|---|---|---|
| Online ordering (pickup + delivery) | ✅ Excellent | Both flows, BML payment |
| Real-time order tracking (SSE) | ✅ Excellent | Push notification opt-in too |
| Driver tracking + contact | ✅ Good | |
| Pre-order (events/catering) | ✅ Good | Full form flow |
| Table reservations | ✅ Good | SMS confirmation |
| Loyalty points system | ✅ Good | Earn/redeem, tiers in backend |
| Gift cards | ✅ Good | Full issue/apply flow |
| Referral system | ✅ Built | Reward payout incomplete |
| Promo codes | ✅ Excellent | Full evaluator, stacking, per-customer limits |
| SMS marketing campaigns | ✅ Excellent | Dhiraagu, segments, automations |
| Post-order reviews | ✅ Good | Account + status page |
| Order history + reorder | ✅ Good | "Order again" in history |
| Favourite items | ✅ Good | Login required |
| Prayer times widget | ✅ Excellent | Strong local differentiation |
| Open/closed live badge | ✅ Good | |
| CMS-driven homepage content | ✅ Excellent | Hero, categories, trust strip |
| WhatsApp/Viber support links | ✅ Good | Multiple surfaces |
| Privacy policy (BML-specific) | ✅ Good | |
| Dark mode | ✅ Good | |
| Dhivehi language support (partial) | ✅ Built | No visible toggle |

---

## What it lacks

| Feature | Gap level | Priority |
|---|---|---|
| Star ratings on menu cards | High gap | Must have for social proof |
| First-order incentive on homepage | High gap | Launch week |
| Cart upsell / "add a drink" | High gap | First 30 days |
| Free delivery progress bar in cart | High gap | First 30 days |
| "Your usual" reorder block on homepage | High gap | First 30 days |
| Loyalty tier progress visible to customer | High gap | First 30 days |
| Combo / bundle meals | High gap | First 30 days (ops + item creation) |
| Referral reward payout | High gap | First 30 days |
| Guest checkout | Medium gap | 60–90 days |
| Allergy / dietary filters | Medium gap | 60–90 days |
| Halal badge (explicit) | Medium gap | Before launch (CMS content) |
| Delivery fee visible on menu before checkout | Medium gap | First 30 days |
| Live wait time on checkout | Medium gap | First 60–90 days |
| Birthday / milestone offer | Low–medium gap | First 60–90 days |
| Social sharing after order | Low gap | First 90 days |
| "X people ordered today" real-time badge | Low gap | First 90 days |

---

## Weakly implemented (exists but underperforms)

| Feature | Current State | What's Missing |
|---|---|---|
| Loyalty programme | Points earn/redeem works; tier system in backend | Tier progress invisible; referrer reward never paid |
| Referral system | Code generation, referee discount, recording | Referrer never gets paid; weakly promoted |
| Reviews | Can write reviews; shows in account | No star ratings on menu cards; reviews not shown on homepage |
| Specials | Shown on homepage | Not shown on menu page where conversion happens |
| Category homepage cards | Good visual design | Links seeded as `/menu` — may route to wrong URL |
| Dhivehi language | Strings implemented | No visible language toggle on any page |
| Delivery ETA | Shows "30–45 min" | Static string, not live; no wait time API surfaced in UI |
| Checkout trust | "Secure by BML" copy present | No satisfaction guarantee; no allergy disclosure flow |

---

## What is especially important for the Maldives/Malé market

### 1. WhatsApp is the primary support channel — lean into it
Maldivians default to WhatsApp for any business communication. The app already has WhatsApp buttons in multiple places. Reinforce this with response time promises ("We reply within 10 minutes" — the app already says this in one place, should be on every page footer and checkout).

### 2. Prayer times = respect = trust
The prayer times widget is a genuine differentiator. Businesses that show cultural awareness build stronger brand loyalty in Muslim markets. This is already well-implemented — protect it and keep it accurate.

### 3. Halal is table stakes, not a feature
In any other market, halal would be a selling point. In Maldives, it's an expectation. Not displaying it doesn't hurt you, but displaying "✅ 100% Halal" in the trust strip signals awareness and care. Worth adding as content.

### 4. BML BankConnect is trusted locally
Being explicit about BML as the payment processor ("Processed by Bank of Maldives") is a strong local trust signal. This is already done well. Maintain it prominently.

### 5. Mobile-first is not optional — it's the only device
90%+ of orders in Malé will come from phones. Every friction point on mobile (slow loads, small touch targets, forced login, long forms) directly translates to lost orders. The current app is mobile-responsive, but touch targets at 32px (below 44px WCAG minimum) are still noted in the admin panel audit — check if the same applies to the order app.

### 6. SMS is your retention channel — WhatsApp is acquisition
Dhiraagu SMS reaches every customer even offline. The SMS marketing campaign system is a significant competitive advantage. Building a customer list and running monthly campaigns is the highest-ROI marketing activity available.

### 7. Island-specific delivery pricing builds trust
The delivery fee calculator already handles per-island pricing. Surface this clearly: "Delivery to Malé: MVR 15 · Hulhumalé: MVR 25" before checkout. Island context matters to Maldivian customers who know delivery logistics are non-trivial.

---

## Priority improvement sequence (Maldives context)

1. Add "100% Halal" to trust strip (CMS, 5 min)
2. Fix category `/menu` → `/order/menu` links (CMS, 5 min)
3. Enable first-order promo + announcement banner (CMS + admin, 30 min)
4. Complete referral reward payout (backend, 2–4 hrs)
5. Add loyalty tier progress bar (frontend, 3–4 hrs)
6. Add "earn X pts" preview in cart (frontend, 1 hr)
7. Add cart upsell block (frontend, 3–4 hrs)
8. Add free delivery progress bar (backend + frontend, 4–6 hrs)
9. Add star ratings to menu cards (backend endpoint + frontend, 4–6 hrs)
10. Add "welcome back + last order" block to homepage (frontend, 3–4 hrs)
