# PUBLIC LAUNCH COPY AUDIT
> Date of audit: April 2026  
> Scope: All customer-facing surfaces — main website (Blade) + order app (React)

---

## SURFACES REVIEWED

| Surface | File(s) | Copy Source |
|---|---|---|
| Site header & footer | `layout.blade.php` | Settings-driven (`site_name`, `business_*`, `logo`) |
| Homepage hero | `home.blade.php` | Settings-driven (`hero_slide_1/2/3`) with hardcoded fallback |
| Trust strip | `home.blade.php` | Settings-driven (`trust_items`) |
| Category cards | `home.blade.php` | Settings-driven (`homepage_categories`) |
| Proof/stats section | `home.blade.php` | Settings-driven (`proof_stat`, `proof_label`, `proof_details`) |
| Location & delivery cards | `home.blade.php` | Mixed: settings + hardcoded defaults |
| CTA band | `home.blade.php` | Settings-driven (`cta_band_headline`, `cta_band_subtext`) |
| Terms & Conditions | `terms.blade.php` | Mostly hardcoded; title/contact via settings; body overridable |
| Refund & Cancellation Policy | `refund.blade.php` | Mostly hardcoded; title/contact via settings; body overridable |
| Privacy Policy | `privacy.blade.php` | Mostly hardcoded; title/contact via settings; body overridable |
| Customer login | `customer/login.blade.php` | Hardcoded |
| Cart drawer | `CartDrawer.tsx` | Hardcoded + `t()` translations |
| Checkout page | `CheckoutPage.tsx` | Hardcoded + settings-driven contact info |
| Order status page | `OrderStatusPage.tsx` | Hardcoded |
| Order history page | `OrderHistoryPage.tsx` | Hardcoded |
| Account page | `AccountPage.tsx` | Hardcoded |
| Announcement banner | `layout.blade.php` | Settings-driven (`announcement_enabled`, `announcement_text`) |
| Opening hours badge | `home.blade.php` | Dynamic (DB-driven, live) |

---

## ISSUES FOUND

### CRITICAL TRUST ISSUES

#### C-1 — Dynamic "Last Updated" Date on All Three Policy Pages
**Severity:** Critical  
**Files:** `terms.blade.php:145`, `refund.blade.php:124`, `privacy.blade.php:63`  
**Exact current wording:**
- Terms: `Last updated: April 23, 2026` ← changes every single day
- Refund: `Last updated: April 23, 2026` ← changes every single day  
- Privacy: `Last updated: April 24, 2026` ← zero-padded day, different format, changes every day

**Why risky:** Every day the date auto-regenerates to today's date via `date()`. This means:
1. The document claims to be updated "today" when nothing changed — legally misleading.
2. Regulators or card processors auditing the page see an always-current date, which conceals when policies were actually written.
3. The Privacy Policy uses a different PHP format (`F d, Y`) than Terms/Refund (`F j, Y`) — producing different formatting for single-digit days.

**✅ FIXED:** Replaced all three with `SiteSetting::get('legal_last_updated_date', 'April 2026')`. Now controlled, admin-editable, never auto-changes.

---

### HIGH-PRIORITY WORDING / POLISH ISSUES

#### H-1 — Customer Greeted with Raw Phone Number
**Severity:** High  
**Files:** `layout.blade.php:818` (desktop), `layout.blade.php:881` (mobile)  
**Exact current wording:** `Hi, 7972434` and `👤 7972434`  
**Why risky:** Showing a raw 7-digit number as a welcome greeting is jarring and impersonal. It signals that the system doesn't know the customer's name, which erodes trust. First-time users who set a name are still shown their number.

**✅ FIXED:** Now shows `Hi, Amira` (name if set) with fallback to phone number if name is blank. Uses `$cust->name ?? $dispPhone`.

#### H-2 — Cart Drawer "Total" Label (Misleading — Pre-Tax, Pre-Delivery, Pre-Discount)
**Severity:** High  
**File:** `CartDrawer.tsx:92`  
**Exact current wording:** `Total` with `MVR 85.00`  
**Why risky:** The number shown is the raw item subtotal. Checkout then shows a different number (after GST + delivery fee – discounts). Customers are surprised when the checkout total differs from the cart total. Labeling a pre-tax, pre-delivery number as "Total" is incorrect.

**✅ FIXED:** Changed label to `Subtotal`.

#### H-3 — CartDrawer: "We're Closed" as Disabled Button Text
**Severity:** High  
**File:** `CartDrawer.tsx:124`  
**Exact current wording:** Button shows `We're Closed` when the store is closed  
**Why risky:** "We're Closed" is a statement, not a button label. It reads as if the button is broken. Users don't know what to do next.

**✅ FIXED:** Changed to `Closed — not taking orders right now`.

#### H-4 — CartDrawer: Empty Cart Shows Paragraph Text as Button Label
**Severity:** High  
**File:** `CartDrawer.tsx:124`  
**Exact current wording:** Button renders `t('cart.empty')` — the same text shown in the empty-cart paragraph above  
**Why risky:** The button label becomes "Your cart is empty" — which is confusing (it looks like a broken button echoing the paragraph above it).

**✅ FIXED:** Changed to `Add items to continue`.

#### H-5 — "Payment failed" Banner for Non-Payment Errors
**Severity:** High  
**File:** `CheckoutPage.tsx:130`  
**Exact current wording:** Banner title always says `Payment failed` when `globalError` is set  
**Why risky:** `globalError` is set for ALL failures — including API errors before payment even starts (e.g. form validation, eligibility rejection, network error). Saying "Payment failed" when no payment was attempted is alarming and incorrect.

**✅ FIXED:** Changed banner title to `Something went wrong`.

#### H-6 — Referral Discount Not Visible in Pay Button Total (Pending State)
**Severity:** High  
**File:** `CheckoutPage.tsx:242`  
**Exact current wording:** `Pay MVR 85.00 with BML` — when a referral code with `pending: true` is applied, the total shown does NOT include the referral discount (it hasn't been calculated server-side yet).  
**Why risky:** Customer applies referral code, sees "⏳ CODE — applied at checkout", but the pay button still shows the full price. They may think the code didn't work, or be surprised by a lower charge later.

**✅ FIXED:** Added a note below the button: `⏳ Referral discount will be confirmed and applied after your order is created.`

#### H-7 — "Friend's referral code" — Inconsistent Capitalization
**Severity:** Medium-High  
**File:** `CheckoutPage.tsx:365`  
**Exact current wording:** `Friend's referral code` (lowercase)  
**Why risky:** Every other section title is title-cased: "Order Type", "Delivery Details", "Promo Code", "Gift Card", "Loyalty Points". This inconsistency looks like an oversight.

**✅ FIXED:** Changed to `Friend's Referral Code`.

---

### MEDIUM WORDING / POLISH ISSUES

#### M-1 — CTA Band Default Copy: "No fuss, no wait" Contradicts Delivery Time
**Severity:** Medium  
**File:** `home.blade.php:708` (default value of `cta_band_subtext` setting)  
**Exact current wording:** `Fresh from our kitchen to your door in 30–45 minutes. No fuss, no wait — just real food.`  
**Why risky:** "No wait" directly contradicts "30–45 minutes." A 30-minute wait is real — don't dismiss it. Also "No fuss, no wait" is an absolute promise that can backfire during busy periods.  
**Not fixed in code** — this is admin-editable content. See checklist.  
**Recommended wording:** `Fresh from our kitchen to your door in 30–45 minutes. Real food, done right — order online in seconds.`

#### M-2 — Delivery Section: "No exceptions within the city"
**Severity:** Medium  
**File:** `home.blade.php:735` (default of `home_delivery_subtitle` setting)  
**Exact current wording:** `We come to you — no exceptions within the city`  
**Why risky:** "No exceptions" is a very absolute claim. Weather, peak hours, prayer times, or operational issues can mean delivery isn't possible. This sets an expectation you may not always meet.  
**Not fixed in code** — admin-editable. See checklist.  
**Recommended wording:** `We deliver across Malé — subject to availability`

#### M-3 — Privacy Contact Email Default May Not Exist
**Severity:** Medium  
**File:** `privacy.blade.php:52`  
**Exact default:** `privacy@bakeandgrill.mv`  
**Why risky:** If this email address doesn't exist or isn't monitored, customer privacy requests go unanswered. This is a legal liability under data protection obligations.  
**Not fixed in code** — needs manual verification. See checklist.

#### M-4 — "Place order — no payment due" Edge Case Wording
**Severity:** Low-Medium  
**File:** `CheckoutPage.tsx:243`  
**Exact current wording (before fix):** `Place order (no payment due)`  
**✅ FIXED:** Changed to `Place order — no payment due` (dash is cleaner than parentheses).

---

### LOW POLISH NITS

#### L-1 — Cart Button Shows Item Subtotal as If It's the Final Price
**Severity:** Low  
**File:** `CartDrawer.tsx:124`  
**Exact current wording:** `Checkout — MVR 85.00 →`  
**Why confusing:** The `MVR 85.00` is the raw item subtotal. Tax + delivery will be added at checkout. Customers expect the button total to match what they pay. This is an inherent UX limitation of showing a running total before checkout calculations — documented in checklist, no code change needed as the label now says "Subtotal" in the cart body.

#### L-2 — Login Page: "Welcome back" Shown for New Users Too
**Severity:** Low  
**File:** `customer/login.blade.php:167`  
**Exact current wording:** `Welcome back` at the top of the phone-entry step  
**Why confusing:** New users have never been here before. "Welcome back" implies they're a returning customer. On first visit, they've never logged in before.  
**Not fixed** — minor UX nit, the login page can't know yet if the user is new. Acceptable as-is. Documented for awareness.

#### L-3 — Order Status Label "Payment received" for 'pending' Status
**Severity:** Low  
**File:** `layout.blade.php:11`  
**Exact wording:** Internal `pending` status → customer sees `Payment received`  
**Assessment:** Actually correct and customer-friendly (they want confirmation their money was accepted). No change needed.

#### L-4 — Footer "Staff Dashboard" Link Visible to All Visitors
**Severity:** Low  
**File:** `layout.blade.php:974`  
**Exact wording:** `Staff Dashboard` link in footer legal section  
**Why it matters:** Customers see a "Staff Dashboard" link at the bottom of every page. It's styled very faint (15% opacity white), so it's nearly invisible. Technically fine — the admin panel requires login. But it looks slightly unprofessional. Acceptable for launch; remove or rename for full public polish.

---

## SETTINGS-DRIVEN CONTENT SUMMARY

These sections are 100% editable in Admin → Settings → Website Settings. No code change needed — manual review required before launch:

| Setting Key | Displayed Where | Current Default |
|---|---|---|
| `proof_stat` | Homepage proof strip | `500+` |
| `proof_label` | Homepage proof strip | `orders delivered in Malé every week` |
| `proof_details` | Homepage proof strip detail pills | (empty unless seeded) |
| `trust_items` | Trust strip below hero | (empty unless seeded) |
| `homepage_categories` | Category cards | (empty unless seeded) |
| `hero_slide_1/2/3` | Hero carousel | (empty — shows fallback slide) |
| `cta_band_subtext` | CTA band | `No fuss, no wait` (risky — see M-1) |
| `home_delivery_subtitle` | Delivery card | `no exceptions within the city` (risky — see M-2) |
| `business_phone` | Header, footer, policies | `+960 912 0011` |
| `business_email` | Footer, policies | `hello@bakeandgrill.mv` |
| `privacy_email` | Privacy policy contact | `privacy@bakeandgrill.mv` (verify — see M-3) |
| `legal_last_updated_date` | All 3 policy pages | `April 2026` ← NEW, admin-editable |
| `announcement_enabled` | Site-wide announcement banner | `false` |
