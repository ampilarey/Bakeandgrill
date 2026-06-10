# PUBLIC LAUNCH COPY — FIXES LOG

---

## FILES CHANGED

### `backend/resources/views/terms.blade.php`
- **Before:** `{{ date('F j, Y') }}` — auto-generated today's date on every page load
- **After:** `{{ \App\Models\SiteSetting::get('legal_last_updated_date', 'April 2026') }}`
- **Why:** Legal policy dates must not change automatically every day. This was legally misleading — the Terms appeared to be updated "today" even when nothing changed. Now controlled, admin-editable.

### `backend/resources/views/refund.blade.php`
- **Before:** `{{ date('F j, Y') }}` — same auto-date problem
- **After:** `{{ \App\Models\SiteSetting::get('legal_last_updated_date', 'April 2026') }}`
- **Why:** Same as above. Refund policy date was regenerated daily.

### `backend/resources/views/privacy.blade.php`
- **Before:** `{{ date('F d, Y') }}` — auto-date AND different format from other policies (zero-padded day)
- **After:** `{{ \App\Models\SiteSetting::get('legal_last_updated_date', 'April 2026') }}`
- **Why:** Two fixes in one: stopped the daily auto-change, and unified the date format across all three policies.

### `backend/resources/views/layout.blade.php` (desktop greeting)
- **Before:** `Hi, {{ $dispPhoneDesk }}` → showed `Hi, 7972434`
- **After:** `Hi, {{ !empty($cust->name) ? $cust->name : $dispPhoneDesk }}` → shows `Hi, Ahmed` (or phone if name not set)
- **Why:** Greeting a customer with their raw 7-digit phone number is jarring and impersonal. Any customer who has set their name should see it.

### `backend/resources/views/layout.blade.php` (mobile greeting)
- **Before:** `👤 {{ $dispPhone }}` → showed `👤 7972434`
- **After:** `👤 {{ !empty($cust->name) ? $cust->name : $dispPhone }}`
- **Why:** Same reason as desktop greeting — use name where available.

### `apps/online-order-web/src/components/CartDrawer.tsx`
- **Label fix:** `Total` → `Subtotal`
  - Before: Cart drawer showed `Total: MVR 85.00` for pre-tax, pre-delivery item sum
  - After: Shows `Subtotal` — honest labeling since checkout applies GST + delivery on top
- **Closed button fix:** `"We're Closed"` → `"Closed — not taking orders right now"`
  - Before: Disabled button said "We're Closed" — reads like a broken actionable label
  - After: Clear, informative message that explains the state
- **Empty cart button fix:** `t('cart.empty')` → `"Add items to continue"`
  - Before: Empty-cart state showed the paragraph text ("Your cart is empty") as the button label
  - After: Distinct, actionable placeholder text

### `apps/online-order-web/src/pages/CheckoutPage.tsx`
- **Error banner fix:** `"Payment failed"` → `"Something went wrong"`
  - Before: Any `globalError` showed "Payment failed" — even errors before payment was attempted
  - After: Neutral, accurate message for all error types
- **Section title fix:** `"Friend's referral code"` → `"Friend's Referral Code"`
  - Before: Lowercase inconsistent with all other section titles (Order Type, Promo Code, Gift Card)
  - After: Consistent title case
- **Edge case wording:** `"Place order (no payment due)"` → `"Place order — no payment due"`
  - Minor: parentheses felt like a footnote; dash reads cleaner
- **Pending referral note:** Added `⏳ Referral discount will be confirmed and applied after your order is created.` below the Pay button when a referral code is in pending state
  - Before: Customer applied referral code, saw "⏳ applied at checkout" in the section, but the Pay button showed full price with no explanation
  - After: Clear note explains that the discount is real but calculated server-side post-order

---

## ISSUES INTENTIONALLY LEFT UNCHANGED

| Issue | Reason |
|---|---|
| CTA band "No fuss, no wait" copy | Settings-driven — admin must update in Admin → Settings → Website Settings → `cta_band_subtext` |
| Delivery card "no exceptions within the city" | Settings-driven — admin must update `home_delivery_subtitle` |
| Privacy email `privacy@bakeandgrill.mv` | Cannot verify deliverability from code — needs manual check by owner |
| Hero carousel slides | Content decision — admin must set real images in CMS |
| Trust strip / categories content | Content decision — admin must populate in CMS |
| Proof stats (`500+`) | Marketing claim — must be verified against real order count |
| Footer "Staff Dashboard" link | Intentionally very faint; acceptable for UAT, discuss for main launch |
| Login page "Welcome back" for new users | Cannot detect new vs. returning before phone is entered |

---

## SETTINGS/ADMIN CONTENT ITEMS STILL NEEDING MANUAL REVIEW

These are not bugs — they are content decisions that must be made by the owner before public launch:

1. **`legal_last_updated_date`** — Set to the real date your policies were reviewed (e.g. `April 18, 2026`)
2. **`privacy_email`** — Verify `privacy@bakeandgrill.mv` exists; change if needed
3. **`cta_band_subtext`** — Remove "No fuss, no wait" claim; suggest: `Order online in seconds — fresh food at your door`
4. **`home_delivery_subtitle`** — Soften "no exceptions" claim; suggest: `We deliver across Malé — subject to availability`
5. **`proof_stat`** / `proof_label` / `proof_details`** — Set to real, verified numbers
6. **`trust_items`** — Populate 4 trust signals with real content
7. **`homepage_categories`** — Ensure 4 categories have real images
8. **`hero_slide_1`** — Ensure at least one hero slide is configured with a real image
9. **`announcement_enabled`** — Set to `true` only when you have a real opening/promo announcement

---

## FINAL VERDICT

### Main Website (Blade / Laravel)
**PUBLIC-LAUNCH READY WITH MINOR COPY CAVEATS**

The critical legal issue (auto-updating policy dates) is now fixed. Header greeting is fixed. The remaining issues are all admin-editable content decisions — not code bugs.

### Order App / Checkout Flow (React)
**PUBLIC-LAUNCH READY WITH MINOR COPY CAVEATS**

Cart labeling, error messages, button text, and referral pending note are all fixed. The remaining caveat is that the cart drawer checkout button shows item subtotal (labeled correctly as "Subtotal"), while the final payment includes GST + delivery — this is an inherent UX limitation of a pre-checkout summary, not a bug.

---

*Audit and fixes by AI coding agent, April 2026. All code changes were minimal, safe, and do not affect business logic, routing, or API payloads.*
