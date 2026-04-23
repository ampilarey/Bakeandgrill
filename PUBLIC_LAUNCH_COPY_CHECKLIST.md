# PUBLIC LAUNCH COPY CHECKLIST
> Use this before going live on the main production server.  
> Every item must be checked by a human — not automated.

---

## SECTION 1 — BUSINESS INFORMATION (Verify on Admin → Settings)

- [ ] **`site_name`** — Confirm the exact legal trading name ("Bake & Grill" vs "Bake and Grill") is consistent across settings, policies, and footer
- [ ] **`business_phone`** — Is `+960 912 0011` the correct, monitored number for customer contact?
- [ ] **`business_email`** — Is `hello@bakeandgrill.mv` monitored and working? Test by sending an email.
- [ ] **`business_address`** — Is "Kalaafaanu Hingun, Malé, Maldives" the exact, correct delivery/visit address?
- [ ] **`business_landmark`** — Is "Near H. Sahara" still accurate?
- [ ] **`business_maps_url`** — Open the Google Maps link and confirm it pins the right location
- [ ] **`business_whatsapp`** — Does `wa.me/9609120011` open a WhatsApp conversation with the correct number?
- [ ] **`business_viber`** — Does the Viber link open the correct contact?

---

## SECTION 2 — LEGAL POLICY DATES

- [ ] **`legal_last_updated_date`** (Admin → Settings) — Set this to the actual real date the policies were last reviewed/revised. Default is `April 2026`. **Do not leave as "April 2026" if it is no longer accurate.**
- [ ] Read all three policy pages on the live site and confirm the date shown is real and correct:
  - `/terms` → Terms & Conditions
  - `/refund` → Refund & Cancellation Policy
  - `/order/privacy` → Privacy Policy (order app route)
  - `/privacy` → Privacy Policy (main site route, if exists)
- [ ] Confirm the contact email and phone shown in each policy page are real and monitored.

---

## SECTION 3 — PRIVACY POLICY EMAIL

- [ ] **`privacy_email`** — Default is `privacy@bakeandgrill.mv`. Verify this email **exists and is monitored**. If not, change it in Admin → Settings to a real address (`hello@bakeandgrill.mv` or similar) before launch.
- [ ] Test: send an email to the address shown in the Privacy Policy and confirm it arrives.

---

## SECTION 4 — MARKETING CLAIMS (Verify Against Real Operations)

- [ ] **Delivery time claim** — "30–45 minutes" is stated in Terms, delivery card, and CTA band. Confirm this is achievable in real operation during peak hours.
- [ ] **Delivery area claim** — "all of Malé" / "within the city" — are there any buildings or areas you currently can't deliver to? If so, update the copy.
- [ ] **"No exceptions within the city"** — If this is still the default, change it in Admin → Settings (`home_delivery_subtitle`) to something less absolute: `We deliver across Malé — subject to availability`
- [ ] **CTA band copy** — Check `cta_band_subtext` setting. If it still says "No fuss, no wait", change to something that doesn't contradict the 30–45 minute delivery time.
- [ ] **Free delivery threshold** — `delivery_threshold` setting defaults to `MVR 200`. Confirm this is your intended threshold and it matches checkout behaviour.
- [ ] **"Baked fresh at 5am daily"** — The fallback hero slide says "Fresh daily from 5am". Confirm this is accurate for your operating hours.

---

## SECTION 5 — HOMEPAGE SETTINGS (Visual Content)

- [ ] **Hero carousel slides** — Are all 3 hero slides configured in Admin with real images? If not, the fallback generic slide appears. Set at least 1 slide with a real hero image before launch.
- [ ] **Trust strip** (`trust_items`) — Are 4 trust items configured with real headings and subtexts? Empty = trust strip is blank.
- [ ] **Category cards** (`homepage_categories`) — Are 4 categories configured with real images and hooks? Empty = category grid is blank.
- [ ] **Proof stat** (`proof_stat`) — Is `500+` accurate? Change to a real number or a safe claim before launch.
- [ ] **Proof label** (`proof_label`) — Is "orders delivered in Malé every week" accurate? Change if not yet true.
- [ ] **Proof details** (`proof_details`) — Are the 3 detail pills (e.g. "98% on time", etc.) real? Empty = no pills shown.

---

## SECTION 6 — ORDER APP WORDING SANITY CHECK

- [ ] Visit `/order/` and add items to cart. Confirm:
  - Cart drawer shows **"Subtotal"** (not "Total") ✅ Fixed
  - Cart button shows **"Checkout — MVR X.XX →"** (not "Total — MVR X.XX") 
  - When store is closed, button says **"Closed — not taking orders right now"** ✅ Fixed
  - Empty cart button says **"Add items to continue"** ✅ Fixed
- [ ] Go through checkout with a logged-in customer who has a name set. Confirm the header shows **"Hi, [Name]"** not a phone number ✅ Fixed
- [ ] Apply a promo code. Confirm checkout shows the discount clearly.
- [ ] Apply a gift card. Confirm balance and discount are shown clearly.
- [ ] Apply a friend's referral code. Confirm the `⏳ Referral discount will be confirmed after order creation` note appears ✅ Fixed
- [ ] Trigger an error at checkout. Confirm banner says **"Something went wrong"** not "Payment failed" ✅ Fixed
- [ ] Complete a real test order. Confirm:
  - Order status page shows correct status wording
  - SMS confirmation is received
  - Receipt page is readable and professional

---

## SECTION 7 — LEGAL PAGES READABILITY CHECK

- [ ] Read `/terms` top to bottom. Confirm:
  - Business name, address, phone, email are correct
  - Delivery area description matches actual operations
  - Refund window (5–7 business days) is achievable
  - "Last updated" date is real (not auto-generated daily) ✅ Fixed
- [ ] Read `/refund` top to bottom. Confirm:
  - "Before kitchen confirmation: free cancellation" — is this enforced in the app?
  - Contact channels listed are all monitored
  - "Last updated" date is real ✅ Fixed
- [ ] Read `/order/privacy` (in the order app). Confirm:
  - Privacy email is monitored
  - Dhiraagu named as SMS provider — this is accurate
  - "Last updated" date is real ✅ Fixed

---

## SECTION 8 — FOOTER CHECK

- [ ] Footer shows correct year (uses `date('Y')` — dynamic, always current ✅)
- [ ] All four footer columns have real content
- [ ] "Staff Dashboard" link in footer legal area is barely visible (15% opacity) — acceptable for launch but consider removing for full public polish
- [ ] Social/contact links in footer: WhatsApp and Viber buttons work correctly

---

## SECTION 9 — TRUST SIGNALS

- [ ] Logo appears correctly in header (desktop + mobile) and footer
- [ ] Favicon is set (not just the logo.png fallback)
- [ ] Open Graph image (`og_image`) is set and looks professional if the page is shared on social media
- [ ] Visa + Mastercard icons appear on the checkout page ✅ (hardcoded, always shown)
- [ ] "Payment processed securely by Bank of Maldives" note appears at checkout ✅

---

## SECTION 10 — ANNOUNCEMENT BANNER

- [ ] `announcement_enabled` is `false` (default — no banner). Set to `true` only if you have a real announcement at launch (e.g. "Now open for delivery!").
- [ ] If enabled: `announcement_text` is professional, not test copy.
- [ ] If enabled: `announcement_style` is correct (`info`, `warning`, or `promo`).

---

## FINAL SIGN-OFF

Before marking PUBLIC LAUNCH READY, all of the following must be confirmed:

- [ ] All SECTION 1–10 items above reviewed and checked
- [ ] Policies reviewed by a human (not just the developer)
- [ ] At least one complete test order done on the production server
- [ ] SMS confirmation works end-to-end
- [ ] BML payment gateway live credentials are in `.env` (not test credentials)
- [ ] `APP_ENV=production` and `APP_DEBUG=false` on the production server
