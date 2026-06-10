# Customer Growth Feature Recommendations
## Bake & Grill — Concrete, Prioritised, Grounded in the Real Repo

---

## A. CUSTOMER ACQUISITION

### A1 — First-order promo banner (homepage)
**Why it helps:** The most direct acquisition lever in food ordering. "10% off your first order" converts curious visitors into first-time customers. The promo backend is fully built.  
**Expected impact:** +15–30% first-order conversion rate  
**Difficulty:** Low  
**Repo support:** Full — promo system + announcement banner CMS key  
**Implementation:** Enable `announcement_enabled` in CMS, set `announcement_text` to "🎉 New? Use code FIRST10 for 10% off your first order." Create a `FIRST10` promo (1 use per customer, percentage type) in admin.  
**Priority:** Launch week

### A2 — Halal badge + food safety signal
**Why it helps:** In the Maldives, halal is an assumed default but stating it explicitly converts skeptical visitors, especially tourists. "100% Halal" in the trust strip is a minimal change with significant cultural resonance.  
**Expected impact:** Increased trust, especially for non-regular visitors  
**Difficulty:** Low (content)  
**Repo support:** CMS trust_items supports this  
**Implementation:** Admin → Settings → trust_items → add "✅ 100% Halal" entry  
**Priority:** Before launch

### A3 — Social proof on homepage (real reviews)
**Why it helps:** The `500+ orders/week` claim is unverifiable. Real customer quotes or star ratings from actual reviews carry far more trust weight.  
**Expected impact:** +10–20% homepage → menu conversion  
**Difficulty:** Medium  
**Repo support:** Review data exists in backend (`/api/admin/reviews`, customer reviews on items). A public endpoint for approved reviews would be needed.  
**Implementation:** Add `GET /api/reviews/featured` endpoint returning top 3–5 approved reviews. Add a testimonial block to `home.blade.php` below the trust strip.  
**Priority:** First 30 days

### A4 — Referral viral loop completion (pay the referrer)
**Why it helps:** Referral programmes only drive acquisition when the referrer gets a real, visible reward. Currently, referrers see their count increment but receive nothing. Every customer who has shared a code and noticed this is now a detractor.  
**Expected impact:** 2–5x referral programme effectiveness; turns customers into active promoters  
**Difficulty:** Medium (backend logic)  
**Repo support:** `ReferralCode`, `Referral` models, `RecordReferralRedemptionListener` — just missing the payout step  
**Implementation:** In `RecordReferralRedemptionListener::handle()`, after recording the referral, call `LoyaltyLedgerService::earn($referrer, $reward, 'referral_reward')` to credit the referrer's loyalty account.  
**Priority:** First 30 days

### A5 — Office / corporate ordering landing section
**Why it helps:** Businesses ordering breakfast for meetings or events is a high-AOV segment. Malé has many government offices, banks, and businesses within delivery range. A dedicated "Office Breakfast" section (with min 10-person orders, group delivery option) unlocks this segment.  
**Expected impact:** Significant AOV uplift (office orders = 5–20x individual orders)  
**Difficulty:** Medium (mostly content + pre-order configuration)  
**Repo support:** Pre-order flow exists; delivery exists; no code changes needed if min-order is handled via promo/policy  
**Implementation:** Add a homepage section "Feeding the team? We've got you." with a link to pre-order. Create a pre-order category or WhatsApp CTA for corporate inquiries.  
**Priority:** First 60 days

### A6 — Seasonal / event campaigns
**Why it helps:** Ramadan, national days, Eid — Maldivian life is event-driven. A timely "Ramadan Suhoor Deals" campaign creates urgency and relevance.  
**Expected impact:** Measurable spike in orders during campaigns  
**Difficulty:** Low (operational, not code)  
**Repo support:** SMS campaigns, specials, announcement banner — all ready  
**Implementation:** Ops workflow: schedule specials in admin, configure announcement banner, send SMS campaign to customer list, update hero slide copy.  
**Priority:** Ops discipline, ongoing

---

## B. AVERAGE ORDER VALUE GROWTH

### B1 — Free delivery progress bar in cart
**Why it helps:** "Add MVR 40 more for free delivery" is the most effective AOV lever in delivery e-commerce. Studies show it increases average cart value by 20–30%.  
**Expected impact:** +15–25% AOV for delivery orders  
**Difficulty:** Medium (backend + frontend)  
**Repo support:** Backend has scaffolding (`DeliveryFeeCalculator` accepts `subtotalLaar`, config has threshold). Frontend cart has the space.  
**Implementation:** (1) Wire threshold in `DeliveryFeeCalculator::calculate()` — return 0 fee if subtotal ≥ threshold. (2) In `CartDrawer.tsx`, if order type is delivery and subtotal < threshold, show "Add MVR X more for free delivery" progress bar.  
**Priority:** First 30 days

### B2 — Add-on / drink upsell in cart
**Why it helps:** A customer ordering Bajiya and Roshi doesn't think about drinks until you prompt them. A single "Add a drink?" prompt at cart stage increases drinks orders by 25–40%.  
**Expected impact:** +10–20% AOV  
**Difficulty:** Low–Medium  
**Repo support:** Item fetching is available; `CartDrawer` has space  
**Implementation:** Add a "People also order" section at the bottom of `CartDrawer`, showing 2–3 items from a configurable "upsell" category (e.g. Drinks). Can be hardcoded initially, config-driven later.  
**Priority:** First 30 days

### B3 — Combo / bundle items
**Why it helps:** "Breakfast Combo — Bajiya + Roshi + Tea for MVR 55 (save MVR 10)" is a classic revenue driver. Customers buy more when value is packaged visually.  
**Expected impact:** +20–35% AOV for combo purchasers  
**Difficulty:** Medium  
**Repo support:** Menu system supports item creation; admin can create a "Combos" category with bundle items at a fixed price  
**Implementation:** Create a "Combos" category in admin. Add 3–5 combo items that represent popular combinations at a slight discount. No code changes needed — these are just regular menu items grouped in a category.  
**Priority:** First 30 days (operational, not code)

### B4 — "Complete your breakfast" in item modal
**Why it helps:** When a customer adds a main item (e.g. Grilled Chicken), showing "Complete your meal — add Roshi for MVR 8" creates a natural upsell without feeling pushy.  
**Expected impact:** +8–15% AOV  
**Difficulty:** Medium  
**Repo support:** Item modal exists, item relationships would need to be configured  
**Implementation:** Add "frequently bought with" section to `ItemModal.tsx`, using a backend endpoint or admin-configured pairing.  
**Priority:** First 60 days

### B5 — Loyalty earn visibility in cart
**Why it helps:** "⭐ You'll earn 340 pts from this order" in the cart creates positive reinforcement — it makes the purchase feel more valuable and subtly encourages topping up the order.  
**Expected impact:** +5–10% AOV; significant increase in loyalty programme engagement  
**Difficulty:** Low  
**Repo support:** Cart total is available client-side; earn rate is known (1 pt/MVR 1)  
**Implementation:** Add a small loyalty earn preview line in `CartDrawer.tsx` for logged-in customers: `⭐ You'll earn ~{Math.floor(cartTotal)} pts from this order`.  
**Priority:** First 30 days

---

## C. RETENTION AND LOYALTY

### C1 — Tier visibility and progress bar
**Why it helps:** "You're 380 pts from Gold tier — Gold members earn 1.5× faster" creates a clear goal. Tier aspiration is one of the strongest retention mechanics in loyalty.  
**Expected impact:** +25–40% increase in points-programme-aware customers' order frequency  
**Difficulty:** Low (frontend only — data is in API)  
**Repo support:** `customer.tier` in `/api/customer/me`, tier multipliers in backend config  
**Implementation:** Update `AccountPage` Loyalty tab: show current tier badge, tier benefits, progress bar to next tier. Show "You're Gold!" celebration on first upgrade.  
**Priority:** First 30 days

### C2 — "Your usual" reorder block on homepage
**Why it helps:** Returning customers (who represent 60–70% of orders in a steady-state restaurant) shouldn't have to browse the menu to reorder their usual. One-tap reorder from homepage is the single strongest repeat-order feature.  
**Expected impact:** +20–30% repeat order rate among returning customers  
**Difficulty:** Medium  
**Repo support:** Customer order history API at `/api/customer/orders`; token in localStorage  
**Implementation:** In `HomePage.tsx` or the order app's main page, if `localStorage('online_token')` is present, fetch last order and render: "Welcome back, [name]! 🔁 [Last order summary] — Order again" card.  
**Priority:** First 30 days

### C3 — Points celebration on order completion
**Why it helps:** "🎉 You just earned 347 points!" at the end of an order creates positive reinforcement. Customers who feel they "won something" are more likely to order again.  
**Expected impact:** Measurable increase in return order rate within 14 days  
**Difficulty:** Low  
**Repo support:** Order status page shows the order total; earn rate is known  
**Implementation:** In `OrderStatusPage.tsx` when status is `completed` or `delivered`, add: "🎉 You earned [total pts] points from this order! Your new balance: [balance]."  
**Priority:** First 30 days

### C4 — Saved favourites with "order from favourites"
**Why it helps:** Customers who have favourited items have signalled intent. A "Quick order from your favourites" CTA on the account page or homepage is a low-friction reorder path.  
**Expected impact:** Moderate — primarily for power users  
**Difficulty:** Low  
**Repo support:** Favourites tab exists in AccountPage  
**Implementation:** Add "Add all to cart" or "Quick-add" buttons to the Favourites tab. Already has the item data.  
**Priority:** First 60 days

### C5 — Birthday / special-day offer
**Why it helps:** A personalised "Happy Birthday! Here's MVR 30 off your next order" SMS on a customer's birthday is one of the highest-ROI retention tactics in hospitality.  
**Expected impact:** Strong individual-level reactivation  
**Difficulty:** Medium (requires DOB field + SMS automation)  
**Repo support:** SMS automation framework exists; customer profile has `email` field but no DOB  
**Implementation:** (1) Add optional DOB to customer profile form. (2) Create a scheduled SMS automation that triggers on birthday month. (3) Generate a personal promo code (restricted to that customer).  
**Priority:** First 60–90 days

### C6 — Complete referral reward cycle
**See A4 above** — referrer reward completion. This is both an acquisition feature (people share when they get rewarded) and a retention feature (referrers who get points become loyal customers).  
**Priority:** First 30 days

---

## D. TRUST AND OPERATIONAL CLARITY

### D1 — Better payment failure recovery
**Why it helps:** Payment failures are the #1 anxiety moment in online food ordering. The current message is cold and gives no specific next step.  
**Expected impact:** Reduce abandonment after payment failure by 30–50%  
**Difficulty:** Low (copy + WhatsApp link)  
**Repo support:** `OrderStatusPage.tsx` has the banner; WhatsApp CTA pattern exists  
**Implementation:** Update payment failure banner to: "Payment didn't go through — your cart is saved. [Try again] or [WhatsApp us]" with the business WhatsApp number.  
**Priority:** Before launch

### D2 — Delivery fee explanation before commitment
**Why it helps:** Customers who discover a delivery fee only at checkout feel surprised and sometimes abandon. Showing "Delivery: MVR X to Malé" earlier (on the menu page or before cart) reduces abandonment.  
**Expected impact:** Reduce checkout abandonment from delivery fee surprise  
**Difficulty:** Low (informational UI)  
**Repo support:** `delivery_threshold` and `delivery_time` are in site settings  
**Implementation:** Add a small info banner on the menu page when delivery zone is selected: "Delivery to [zone]: MVR X · Free over MVR Y · Est. 30–45 min." Data from site settings.  
**Priority:** First 30 days

### D3 — Support block on checkout (not just post-order)
**Why it helps:** Customers who are unsure about an item, an allergy, or a delivery address benefit from a visible "Need help? WhatsApp us" prompt during checkout, not just after ordering.  
**Expected impact:** Reduce checkout abandonment from uncertainty  
**Difficulty:** Low  
**Repo support:** Support WhatsApp block exists post-order; not present at checkout  
**Implementation:** Add a small "Need help placing your order? [WhatsApp us →]" link at the bottom of the checkout page, above the pay button.  
**Priority:** First 30 days

### D4 — Realistic, specific delivery ETA
**Why it helps:** "30–45 min" is a vague range. During busy times, this becomes inaccurate. A "currently about 40 min" that updates based on kitchen load would be far more trustworthy.  
**Expected impact:** Reduced "where is my order?" support messages  
**Difficulty:** High  
**Repo support:** Wait time endpoint exists (`GET /api/ordering/wait-time`)  
**Implementation:** Surface the live wait time from `/api/ordering/wait-time` on the checkout delivery selection and in the cart header.  
**Priority:** First 60–90 days
