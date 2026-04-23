# Public Launch & Trust Audit
## Bake & Grill — Customer-Facing Surfaces

> First-time-customer perspective. Every issue is assessed for commercial impact.

---

## LAUNCH BLOCKERS (must fix before going live)

### L1 — "Staff Dashboard" in public footer
**Severity:** High  
**Files:** `backend/resources/views/layout.blade.php`, `apps/online-order-web/src/components/Layout.tsx`  
**Problem:** Both footers had a "Staff Dashboard" link pointing to `/admin`. A customer clicking it lands on a staff login page, which undermines the polished brand image and signals "internal tool" rather than "premium café."  
**Why it matters:** Erodes trust, confuses first-time visitors, signals unfinished product.  
**Status:** ✅ Fixed in this audit — links removed from both footers.

### L2 — Profile setup "You can skip this" with no skip button
**Severity:** High (conversion blocker)  
**File:** `apps/online-order-web/src/components/AuthBlock.tsx`  
**Problem:** After OTP verification, first-time customers are shown a "One last step" account setup screen with the note "You can skip this — your order will still go through." But there was no skip button. The "Create account" button is disabled until name + password are filled. This traps first-time customers who just want to order.  
**Why it matters:** Forced account creation before the first order is one of the highest-impact conversion killers in e-commerce.  
**Status:** ✅ Fixed — "Skip for now — go to checkout" button added.

### L3 — Category homepage links may 404
**Severity:** High  
**File:** `backend/database/migrations/2026_03_15_100000_add_cms_site_settings.php` (seeded data)  
**Problem:** Homepage category cards are seeded with `"link": "/menu"`. But the order app's URL is `/order/menu` (served from `/order/` prefix). Clicking a category card from the main website could route to a 404 or wrong page.  
**Why it matters:** Broken links from the homepage = immediate bounce. Customers who can't get to the menu won't order.  
**Fix:** Admin → Settings → Website Settings → Homepage Categories → update `link` values to `/order/menu`. This is a **content fix** (CMS), not code.

---

## TRUST / POLISH ISSUES (fix within first week of launch)

### T1 — "No fuss, no wait" CTA band copy
**Severity:** Medium  
**File:** `backend/resources/views/home.blade.php` (CMS default)  
**Problem:** The promise "No fuss, no wait" is unverifiable and literally false during busy periods. When an order takes 45 minutes, this copy feels like a lie.  
**Fix:** ✅ Changed default to "Fresh from our kitchen to your door. Real food, properly made — order online in under a minute." (still compelling, not over-promising delivery speed).

### T2 — "Anytime" in contact page subtitle
**Severity:** Low–Medium  
**File:** `backend/resources/views/contact.blade.php`  
**Problem:** "…call, or message us anytime" — the business has specific hours. "Anytime" is inaccurate and will frustrate customers who message at 3am expecting a reply.  
**Fix:** ✅ Changed default to "Visit us in Malé, call ahead, or drop us a message on WhatsApp or Viber — we're always happy to help."

### T3 — "Open 7 days a week" in hours meta description
**Severity:** Medium  
**File:** `backend/resources/views/hours.blade.php`  
**Problem:** Default meta description claims "open 7 days a week" which may conflict with the actual hours data if any day is marked Closed. Creates false expectations set from Google search results.  
**Fix:** ✅ Changed to "See the latest opening hours for Bake & Grill in Malé, Maldives. Order online or call us to confirm."

### T4 — "500+ orders/week" without any source or context
**Severity:** Medium  
**File:** CMS — `proof_stat` / `proof_label` keys  
**Problem:** The social proof section claims "500+ orders delivered in Malé every week — and counting." This is an assertion with no verification mechanism. Customers who are skeptical will dismiss it. Also, if actual volume is lower, it's misleading.  
**Fix:** Content fix. Options: (a) replace with something verifiable ("Trusted since 2024" / "Loved by Malé since we opened"), (b) add a year ("since we opened"), (c) tie it to reviews ("Rated X/5 by Y customers"). Admin can update via Settings → Website Settings → `proof_stat`.

### T5 — Google Maps embed is a placeholder in default state
**Severity:** Medium  
**File:** CMS — `maps_embed_url` key (contact page)  
**Problem:** The contact page map embed defaults to stub coordinates (`0x0:0x0`) until `maps_embed_url` is set in CMS. Live this shows a blank or incorrect map.  
**Fix:** Admin → Settings → Website Settings → set `maps_embed_url` to the actual Google Maps embed URL for the business location.

### T6 — No halal / food safety signal anywhere
**Severity:** Medium (high for Maldives context)  
**Files:** All public surfaces  
**Problem:** No explicit halal certification or food safety mention on the website, despite the Maldives being a 100% Muslim country where halal status is assumed but not stated. Not mentioning it is a missed opportunity; explicitly stating it ("100% Halal") is a strong trust signal for the local market.  
**Fix:** Content fix. Add "100% Halal" to trust strip (CMS `trust_items`), or as a badge on the homepage. Consider adding it to the footer too.

### T7 — "Promotional banner" alt text for hero images
**Severity:** Low  
**File:** `apps/online-order-web/src/components/HeroCarousel.tsx`  
**Problem:** If a hero slide's title is empty or not set in CMS, the image alt text falls back to "Promotional banner" — generic, unhelpful for accessibility, and flags incomplete content to screen readers.  
**Fix:** Content fix. Ensure all three hero slides have titles set in CMS. Code fallback is acceptable; the risk is low if CMS is properly populated.

### T8 — Payment failed message is too cold
**Severity:** Medium  
**File:** `apps/online-order-web/src/pages/OrderStatusPage.tsx`  
**Problem:** Payment failure shows: "Payment failed / Please try paying again or contact us for help." No empathy, no next step specificity.  
**Fix:** Content fix (or minor code change). Better: "Payment didn't go through — don't worry, your cart is saved. Try again or WhatsApp us at [number] and we'll sort it out."

### T9 — Order cancelled message is cold and unhelpful
**Severity:** Low–Medium  
**File:** `apps/online-order-web/src/pages/OrderStatusPage.tsx` — `STATUS_CONFIG.cancelled`  
**Problem:** "This order was cancelled. Contact us if you have questions." — gives no reason, no resolution path, no warmth.  
**Fix:** Code change. Better: "This order was cancelled. If you weren't expecting this, please WhatsApp us — we'll make it right." with a WhatsApp link button below.

### T10 — Loyalty tier benefits invisible to customers
**Severity:** Medium (retention risk)  
**Files:** `apps/online-order-web/src/pages/AccountPage.tsx` — Loyalty tab  
**Problem:** Backend has silver/gold/platinum tiers with multipliers, but customer-facing loyalty page only shows current points and a generic "earn/redeem" explanation. Customers have no idea a tier system exists.  
**Why it matters:** Tier systems are one of the most effective retention mechanics. Hidden tiers do nothing.  
**Fix:** Add tier progress display to the Loyalty tab — show current tier, points to next tier, and what the multiplier benefit is. Backend supports it via `customer.tier` field from `/api/customer/me`.

### T11 — Referral reward is "pending" forever
**Severity:** High (trust-breaking when users notice)  
**File:** Backend — `RecordReferralRedemptionListener`  
**Problem:** The referral system creates a `Referral` row with `reward_paid = false` and never pays the referrer. If a customer shares their code and their friend orders, they see their referral count go up in the account but receive no reward. This is trust-breaking.  
**Why it matters:** Referral programmes only work if the referrer gets their reward. A programme that promises a reward and silently doesn't deliver it will generate complaints.  
**Fix:** Backend business logic. Implement the referrer reward payout — either as loyalty points credit or store credit. Priority: high.

---

## WORDING POLISH (small improvements that add up)

| Issue | Current | Better | Location |
|---|---|---|---|
| Checkout header sub | "Review, pay, and we'll get it ready" | "Secure payment · Straight to the kitchen" | ✅ Fixed |
| Phone field note | "Your number is used only for order updates. No spam." | "Used for order updates only — we never sell your number or spam you." | ✅ Fixed |
| payment_pending sub | "Confirming your payment — this takes just a moment." | "We're confirming your order — this usually takes under 30 seconds." | ✅ Fixed |
| Cart empty | "Your cart is empty" | "Your cart is empty — add something to get started" | ✅ Fixed |
| "Order again" CTA | plain text | "🔁 Order again" | ✅ Fixed |
| Footer "anytime" | "message us anytime" | "we're always happy to help" | ✅ Fixed |
| Proof claim | "No fuss, no wait" | "order online in under a minute" | ✅ Fixed |
| Order cancelled | cold template text | warm + WhatsApp CTA | Pending — code fix needed |
| Payment failed | cold + minimal | warm + WhatsApp number | Pending — code fix needed |
| Meta hours | "open 7 days a week" | accurate without day claims | ✅ Fixed |
