# CMS Customer Wording Audit — Implementation Report

**Date:** 2026-05-22  
**Scope:** Marketing copy on Blade public site, menu/pre-order blades, and React online-order app. Admin → Settings → Website Settings is the single source of truth.

## Summary

- **Migration:** `backend/database/migrations/2026_06_07_100000_cms_public_wording_settings.php` seeds ~22 new keys and marks ~60+ customer-facing keys `is_public = true`.
- **React:** `SiteSettingsContext` expanded with typed fields, JSON parsers, and `text()` helper; all targeted pages read from `GET /api/site-settings/public`.
- **Blade:** `layout`, `menu`, `pre-order/*`, and `home` open/closed badges wired to CMS.
- **Admin:** Custom JSON editors for `about_values`, `preorder_confirm_steps`, and `footer_links`.
- **Tests:** `backend/tests/Feature/PublicSiteSettingsTest.php`
- **Build:** `./scripts/build-all.sh order` → `backend/public/order/`

Deploy note: run **full deploy** on test (`php artisan migrate --force`) so the new migration runs.

---

## Hardcoded → CMS mapping

| Old hardcoded text | New setting key | Edited in Admin | Files changed |
|--------------------|-----------------|-----------------|---------------|
| Our Complete Menu | `menu_page_title` | Website Settings → Menu | `menu.blade.php` |
| Browse and add items to your cart | `menu_page_subtitle` | Website Settings → Menu | `menu.blade.php` |
| Pre-Order for Event | `preorder_page_title` | Website Settings → Pre-Order | `pre-order/create.blade.php`, `PreOrderPage.tsx` |
| Order in advance for events | `preorder_page_subtitle` | Website Settings → Pre-Order | `pre-order/create.blade.php`, `PreOrderPage.tsx` |
| 📅 Submit Pre-Order | `preorder_submit_label` | Website Settings → Pre-Order | `pre-order/create.blade.php`, `PreOrderPage.tsx` |
| Pre-Order Received! | `preorder_confirm_title` | Website Settings → Pre-Order | `pre-order/confirmation.blade.php`, `PreOrderPage.tsx` |
| Your pre-order request has been submitted… | `preorder_confirm_message` | Website Settings → Pre-Order | `pre-order/confirmation.blade.php`, `PreOrderPage.tsx` |
| What's Next? (3 steps) | `preorder_confirm_steps` (JSON) | Website Settings → Pre-Order | `pre-order/confirmation.blade.php`, `PreOrderPage.tsx`, `WebsiteSettingsSubPage.tsx` |
| About Bake & Grill | `about_page_title` | Website Settings → About | `AboutPage.tsx` |
| Our Story paragraphs | `about_page_story` (textarea, `{address}`) | Website Settings → About | `AboutPage.tsx` |
| VALUES array (4 cards) | `about_values` (JSON) | Website Settings → About | `AboutPage.tsx`, `WebsiteSettingsSubPage.tsx` |
| Contact Us / intro | `contact_page_title`, `contact_page_subtitle` | Website Settings → Pages | `ContactPage.tsx` |
| Opening Hours / holiday note | `hours_page_title`, `hours_page_note` | Website Settings → Pages | `HoursPage.tsx` |
| Privacy Policy (full body override) | `legal_privacy_body`, `privacy_page_title` | Website Settings → Legal | `PrivacyPage.tsx` |
| Complete your order | `order_checkout_title` | Website Settings → Order App | `CheckoutPage.tsx` |
| Secure payment · Straight to the kitchen | `order_checkout_subtitle` | Website Settings → Order App | `CheckoutPage.tsx` |
| BML / MVR compliance blurb | `order_payment_compliance` | Website Settings → Order App | `CheckoutPage.tsx` |
| OTP privacy line | `order_auth_privacy_line` | Website Settings → Order App | `AuthBlock.tsx` |
| Hero fallback eyebrow / headline / sub | `home_hero_fallback_title`, `home_hero_fallback_subtitle` | Website Settings → Homepage | `HomePage.tsx` |
| Category cards (CATEGORIES constant) | `homepage_categories` (JSON) | Website Settings → Homepage | `HomePage.tsx` |
| What we're known for / Made for Malé | `home_categories_eyebrow`, `home_categories_title` | Website Settings → Homepage | `HomePage.tsx` |
| Today's Specials / Limited time | `home_specials_title`, `home_specials_eyebrow` | Website Settings → Homepage | `HomePage.tsx` |
| Popular right now / Most ordered | `home_featured_title_handpicked`, `home_featured_eyebrow_handpicked` | Website Settings → Homepage | `HomePage.tsx` |
| Loved by locals / What customers say | `home_proof_eyebrow`, `proof_label` | Website Settings → Homepage | `HomePage.tsx` |
| Hungry? Browse the menu. (CTA band) | `cta_band_headline`, `cta_band_subtext` | Website Settings → Homepage | `HomePage.tsx`, `home.blade.php` (already wired) |
| Questions? We reply fast. | `home_location_title`, `home_location_subtitle` | Website Settings → Homepage | `HomePage.tsx` |
| We're open / Closed now | `home_open_badge_text`, `home_closed_badge_text` | Website Settings → Homepage | `home.blade.php` |
| Order Now → (header CTA) | `nav_order_cta_text` | Website Settings → Footer | `layout.blade.php`, `HomePage.tsx` |
| Quick Links / Location / Contact headings | `footer_quick_links_heading`, `footer_location_heading`, `footer_contact_heading` | Website Settings → Footer | `layout.blade.php`, `Layout.tsx` |
| All rights reserved. | `footer_rights_suffix` | Website Settings → Footer | `layout.blade.php`, `Layout.tsx` |
| Footer tagline / copyright blurb | `footer_text` | Website Settings → Footer | `Layout.tsx`, `layout.blade.php` |
| Footer legal links JSON | `footer_links` | Website Settings → Footer | `Layout.tsx`, `WebsiteSettingsSubPage.tsx` |
| Document title site name | `site_name` | Website Settings → General | `usePageTitle.ts`, `PreOrderPage.tsx` |
| Trust strip / hero slides | `trust_items`, `hero_slide_1..3` | Website Settings → Homepage | `HomePage.tsx` (already partial; now public) |
| Office catering block | `office_orders_*` | Website Settings | `HomePage.tsx` (already wired) |
| Announcement bar | `announcement_*` | Website Settings | `Layout.tsx` (already wired) |

---

## Intentionally left hardcoded

- Nav labels: Menu, Hours, Contact, Cart, Checkout form fields
- Order flow mechanics: Add to cart, Pay, quantity, empty-cart messages
- `OrderStatusPage` status labels and kitchen SLA copy
- Prayer-times blades, customer auth blades, 404/500 pages
- API-driven content: item names, prices, hours schedule rows

---

## Smoke test checklist

1. Admin → change `cta_band_headline` → verify Blade `/` and React `/order/` home CTA band.
2. Change `menu_page_title` → verify `/menu`.
3. Set `legal_privacy_body` → verify React `/order/privacy` shows CMS paragraphs; clear it → hardcoded fallback returns.
4. `GET /api/site-settings/public` includes `menu_page_title`, `order_checkout_title`, `about_values`.

---

## Files touched (by area)

**Backend:** migration, `PublicSiteSettingsTest.php`, Blade views (`layout`, `menu`, `home`, `pre-order/*`)

**React order app:** `SiteSettingsContext.tsx`, `usePageTitle.ts`, `HomePage`, `Layout`, `AboutPage`, `ContactPage`, `HoursPage`, `PrivacyPage`, `CheckoutPage`, `AuthBlock`, `PreOrderPage`

**Admin:** `WebsiteSettingsSubPage.tsx` (AboutValuesEditor, PreorderStepsEditor, FooterLinksEditor)
