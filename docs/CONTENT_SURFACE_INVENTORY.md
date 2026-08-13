# Content Surface Inventory

**Stage 2 deliverable** for `docs/CONTENT_EDITOR_REDESIGN_PLAN.md`.  
Audited from **renderers** (Blade templates and Order App components), not from the `group` field in `backend/config/content.php`.

| Field | Value |
|---|---|
| Audited at | 2026-08-13 (settings-context correction same day) |
| Commit | `a377ebc37` + this correction |
| Machine index | `docs/content_surface_inventory.json` (source of truth for the coverage test) |
| Website keys inventoried | 149 non-deprecated registry keys targeting `website` |
| Order App keys inventoried | 88 non-deprecated registry keys targeting `order_app` |

**Structural surfaces stay distinct:** Website global footer ≠ Order App footer ≠ Mobile bottom navigation. They are never one “footer”.

> **“Reads nowhere I could find” means the documented searches below found nothing — not that the key is unused.** Keys may be read dynamically, via Signage APIs, or on paths this audit missed. **No key may be deleted on the strength of this bucket.**

---

## How to re-run

Three Order App read paths must all be checked. Path 3 was the Stage 2 blind spot: public keys flow through `ContentResolver::for('order_app')->allPublic()` → `useSiteSettingsContext()` → `settings.<key>` without ever calling `text('key')`.

```bash
# Registry keys per app (non-deprecated) + public flag
php -r '$c=include "backend/config/content.php";
foreach(["website","order_app"] as $app){
  foreach($c["blocks"] as $k=>$m){
    if(empty($m["deprecated"]) && in_array($app,$m["apps"]??[],true))
      echo "$app\t".(!empty($m["public"])?"public":"private")."\t".($m["group"]??"")."\t$k\n";
  }
}'

# --- Website ---
# Path W1: Blade content() reads
rg -n -o "content\(\s*['\"]([^'\"]+)['\"]" -r '$1' backend/resources/views --glob '*.blade.php' | sort -u

# Website presenter reads (mode cards)
rg -n "order_mode_|get\('order_mode_" backend/app/Domains/Content/ModeEntryCardsPresenter.php

# Confirm a website key is unread (example)
rg -n "content\(\s*['\"]business_website|content\(\s*['\"]menu_new_days" backend/resources/views --glob '*.blade.php'

# --- Order App (exclude tests) ---
# Path 1: text('key') helper
rg -n -g '!**/*.{test,spec}.{ts,tsx}' -g '!**/__tests__/**' \
  -o "text\(\s*['\"]([^'\"]+)['\"]" -r '$1' apps/online-order-web/src | sort -u

# Path 2: literal settings.<key> (and aliases) — consumer files
rg -n -g '!**/*.{test,spec}.{ts,tsx}' -g '!**/__tests__/**' \
  -e '\bsettings\.[a-zA-Z_][a-zA-Z0-9_]*' \
  -e '\bsiteSettings\.[a-zA-Z_][a-zA-Z0-9_]*' \
  apps/online-order-web/src

# Path 3: useSiteSettingsContext + aliased settings: s → s.<key>
# (only public: true registry keys reach allPublic() into this context)
rg -n -g '!**/*.{test,spec}.{ts,tsx}' -g '!**/__tests__/**' \
  -e 'useSiteSettingsContext' -e 'settings:\s*s\b' -e '\bs\.[a-zA-Z_][a-zA-Z0-9_]*' \
  apps/online-order-web/src

# Cross-check: which public order_app keys appear only via settings/s, not text()
# (re-run the Python/php comparison in the Stage 2 correction notes, or:
rg -n 'business_website|menu_new_days' apps/online-order-web/src --glob '!**/*.{test,spec}.*'

# Routes
rg -n "Route::get|name\('(home|contact|hours|terms|refund|menu|privacy)" backend/routes/web.php
rg -n "<Route |path=" apps/online-order-web/src/main.tsx

# Structural surfaces
rg -n "slotsFor|id\(" backend/app/Domains/Content/Blocks/SurfaceCatalog.php

# Coverage test
cd backend && php artisan test --filter=ContentSurfaceInventoryTest
```

After registry changes: update `docs/content_surface_inventory.json` page buckets so every non-deprecated key still appears **exactly once** per app, then refresh this markdown from the JSON (or edit both together).

---

## 1. Structural surfaces (app × device × slot)

These come from `SurfaceCatalog` / live `page_blocks` placement. **Three footers/navs must stay separate:**

| Surface id | App | Device | Slot | What lives there today | Distinct? |
|---|---|---|---|---|---|
| `website.desktop.header` | website | desktop | header | prayer_bar, announcement (optional) | n/a |
| `website.desktop.home` | website | desktop | home | Composable home scroll (`page_blocks` placement=home) | n/a |
| `website.desktop.footer` | website | desktop | footer | **Website global footer** — `site_footer` chrome (legal/links/contact) | Website global footer — NOT bottom nav |
| `website.mobile.header` | website | mobile | header | prayer_bar, announcement (optional) | n/a |
| `website.mobile.home` | website | mobile | home | Composable home scroll (`page_blocks` placement=home) | n/a |
| `website.mobile.footer` | website | mobile | footer | **Website global footer** — `site_footer` chrome | Website global footer — NOT `bottom_navigation` |
| `website.mobile.bottom_navigation` | website | mobile | bottom_navigation | **Mobile bottom navigation** tab bar (`bottom_nav`) | Mobile bottom navigation — NOT a footer |
| `order_app.desktop.header` | order_app | desktop | header | prayer_bar, announcement (optional); TopNav / HomePhoneHeader | n/a |
| `order_app.desktop.home` | order_app | desktop | home | Composable home scroll (`page_blocks` placement=home) | n/a |
| `order_app.desktop.footer` | order_app | desktop | footer | **Order App footer** — BrandFooter / `site_footer` / `brand_footer` | Order App footer — NOT bottom nav |
| `order_app.mobile.header` | order_app | mobile | header | prayer_bar, announcement (optional); TopNav / HomePhoneHeader | n/a |
| `order_app.mobile.home` | order_app | mobile | home | Composable home scroll (`page_blocks` placement=home) | n/a |
| `order_app.mobile.footer` | order_app | mobile | footer | **Order App footer** — BrandFooter / `site_footer` / `brand_footer` | Order App footer — NOT `bottom_navigation` |
| `order_app.mobile.bottom_navigation` | order_app | mobile | bottom_navigation | **Mobile bottom navigation** tab bar (`bottom_nav`) | Mobile bottom navigation — NOT a footer |

**There is no desktop `bottom_navigation` surface.**

---

## 2. Website pages
### 2.everywhere — Everywhere (layout chrome)

- **Route:** layout.blade.php (all pages extending layout)
- **Template / component:** backend/resources/views/layout.blade.php

| Order | Key | Label | Config `group` | Renders in |
|---|---|---|---|---|
| 1 | `language_switcher_enabled` | Show language switcher (EN / ދވ) | General | layout.blade.php header |
| 2 | `site_name` | Site Name | General | layout.blade.php / OG / footer |
| 3 | `site_tagline` | Tagline | General | layout.blade.php footer |
| 4 | `meta_title` | Meta Title | SEO | layout.blade.php <title> |
| 5 | `meta_description` | Meta Description | SEO | layout.blade.php meta |
| 6 | `meta_keywords` | SEO — Meta keywords | SEO | layout.blade.php meta |
| 7 | `og_image` | Link preview image | Branding | layout.blade.php OG |
| 8 | `logo` | Logo (Light) | Branding | layout.blade.php header/footer |
| 9 | `logo_dark` | Logo (Dark) | Branding | layout.blade.php |
| 10 | `primary_color` | Primary Color | Branding | BrandPalette via layout |
| 11 | `favicon` | Favicon | Branding | layout.blade.php |
| 12 | `business_phone` | Business Phone | General | layout footer contact |
| 13 | `business_email` | Business Email | General | layout footer contact |
| 14 | `business_address` | Business Address | General | layout footer contact |
| 15 | `business_landmark` | Landmark / Direction Hint | Contact | layout footer contact |
| 16 | `business_maps_url` | Google Maps URL | Contact | layout footer contact |
| 17 | `business_whatsapp` | WhatsApp Link | Contact | layout footer contact |
| 18 | `business_viber` | Viber Link | Contact | layout footer contact |
| 19 | `google_tag_manager_id` | Google Tag Manager ID | SEO | layout head |
| 20 | `google_analytics_id` | Google Analytics ID | SEO | layout head |
| 21 | `announcement_enabled` | Show Announcement Banner | Announcements | layout announcement gate |
| 22 | `announcement_style` | Announcement — Style | Announcements | layout announcement |
| 23 | `announcement_text` | Announcement — Text | Announcements | layout announcement |
| 24 | `announcement_url` | Announcement — Link URL (optional) | Announcements | layout announcement |
| 25 | `footer_contact_heading` | Footer — Contact Heading | Footer | layout site_footer chrome |
| 26 | `footer_delivery_text` | Footer — Delivery line | Footer | layout site_footer chrome |
| 27 | `footer_hours_heading` | Footer — Hours Heading | Footer | layout site_footer chrome |
| 28 | `footer_links` | Footer Links | Footer | layout site_footer chrome |
| 29 | `footer_location_heading` | Footer — Location Heading | Footer | layout site_footer chrome |
| 30 | `footer_payments_text` | Footer — Payments line | Footer | layout site_footer chrome |
| 31 | `footer_quick_links_heading` | Footer — Quick Links Heading | Footer | layout site_footer chrome |
| 32 | `footer_ramadan_note` | Footer — Ramadan note | Footer | layout site_footer chrome |
| 33 | `footer_rights_suffix` | Footer — Rights Suffix | Footer | layout site_footer chrome |
| 34 | `footer_text` | Footer blurb | Footer | layout site_footer chrome |
| 35 | `footer_thanks` | Footer thanks | Footer | layout site_footer chrome |
| 36 | `show_social_links` | Show social links | Footer | layout site_footer chrome |
| 37 | `social_facebook` | Facebook URL | Footer | layout site_footer chrome |
| 38 | `social_instagram` | Instagram URL | Footer | layout site_footer chrome |
| 39 | `social_tiktok` | TikTok URL | Footer | layout site_footer chrome |
| 40 | `nav_order_cta_text` | Nav — Order CTA Button | Footer | layout HEADER Order CTA (group=Footer mismatch) |
| 41 | `home_chat_label` | Home — Chat label | Homepage | layout footer chat (group=Homepage mismatch) |

### 2.home — Home

- **Route:** GET / (name=home)
- **Template / component:** backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter
- **Notes:** Composable via page_blocks. Order = DB position / order_desktop / order_mobile for surface home. Walker maps block_type → partials/home/{type}. mode_cards reads order_mode_* via ModeEntryCardsPresenter (not literal content() in blade). Events & Catering has no standalone website page — events_section_* render in home events_band only. Menu URL redirects to /order/menu.

| Order | Key | Label | Config `group` | Renders in |
|---|---|---|---|---|
| 1 | `hero_slides` | Hero Slides | Hero | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 2 | `trust_items` | Trust Items | Pages | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 3 | `homepage_categories` | Hedhikaa | Pages | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 4 | `proof_details` | Baking starts | Pages | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 5 | `proof_label` | Social Proof — Label | Homepage | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 6 | `proof_stat` | Social Proof — Main Stat | Homepage | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 7 | `cta_band_headline` | CTA Band — Headline | Homepage | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 8 | `cta_band_subtext` | CTA Band — Subtext | Homepage | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 9 | `default_item_image` | Default item photo | Branding | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 10 | `delivery_threshold` | Free Delivery Threshold | Contact | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 11 | `delivery_time` | Delivery Time Promise | Contact | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 12 | `events_section_blurb` | Events Section Blurb | Pages | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 13 | `events_section_browse_cta` | Events Section Browse Cta | Pages | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 14 | `events_section_headline` | Events Section Headline | Pages | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 15 | `events_section_plan_cta` | Events Section Plan Cta | Pages | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 16 | `home_call_cta` | Home — Call CTA | Homepage | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 17 | `home_categories_eyebrow` | Categories Section — Eyebrow | Homepage | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 18 | `home_categories_subtitle` | Categories Section — Subtitle | Homepage | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 19 | `home_categories_title` | Categories Section — Title | Homepage | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 20 | `home_closed_badge_text` | Home — Closed Badge Text | Homepage | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 21 | `home_delivery_card_title` | Home — Delivery card title | Homepage | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 22 | `home_delivery_payment_line` | Delivery Card — Payment Line | Homepage | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 23 | `home_delivery_quality_line` | Delivery Card — Quality Line | Homepage | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 24 | `home_delivery_subtitle` | Delivery Card — Subtitle | Homepage | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 25 | `home_delivery_tagline` | Delivery Card — Tagline | Homepage | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 26 | `home_directions_cta` | Home — Directions CTA | Homepage | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 27 | `home_featured_eyebrow_bestseller` | Featured Items — Eyebrow (has sales data) | Homepage | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 28 | `home_featured_eyebrow_handpicked` | Featured Items — Eyebrow (no sales data) | Homepage | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 29 | `home_featured_subtitle` | Featured Items — Subtitle | Homepage | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 30 | `home_featured_title_bestseller` | Featured Items — Title (has sales data) | Homepage | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 31 | `home_featured_title_handpicked` | Featured Items — Title (no sales data) | Homepage | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 32 | `home_location_eyebrow` | Location Section — Eyebrow | Homepage | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 33 | `home_location_subtitle` | Location Section — Subtitle | Homepage | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 34 | `home_location_title` | Location Section — Title | Homepage | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 35 | `home_open_badge_text` | Home — Open Badge Text | Homepage | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 36 | `home_order_via_app_label` | Home — Order via app label | Homepage | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 37 | `home_proof_eyebrow` | Social Proof — Eyebrow | Homepage | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 38 | `home_specials_eyebrow` | Specials eyebrow | Homepage | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 39 | `home_specials_title` | Specials title | Homepage | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 40 | `home_visit_card_title` | Home — Visit card title | Homepage | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 41 | `offers_headline` | Offers rail headline | Homepage | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 42 | `offers_subtext` | Offers rail subtext | Homepage | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 43 | `order_mode_delivery_hint` | Delivery mode hint | Order App | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 44 | `order_mode_delivery_info` | Delivery — info sheet | Order App | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 45 | `order_mode_dine_in_hint` | Eat here mode hint | Order App | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 46 | `order_mode_dine_in_info` | Eat here — info sheet | Order App | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 47 | `order_mode_learn_more` | Mode card — Learn more | Order App | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 48 | `order_mode_pickup_hint` | Pickup mode hint | Order App | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 49 | `order_mode_pickup_info` | Pickup — info sheet | Order App | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 50 | `order_mode_status_available` | Mode status — available | Order App | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 51 | `order_mode_status_unavailable` | Mode status — unavailable | Order App | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |
| 52 | `order_mode_status_unavailable_opens` | Mode status — closed until | Order App | backend/resources/views/home.blade.php + partials/home/* + ModeEntryCardsPresenter |

### 2.contact — Contact

- **Route:** GET /contact
- **Template / component:** backend/resources/views/contact.blade.php

| Order | Key | Label | Config `group` | Renders in |
|---|---|---|---|---|
| 1 | `business_hours` | Business Hours (display) | General | backend/resources/views/contact.blade.php |
| 2 | `maps_embed_url` | Google Maps embed URL | Pages | backend/resources/views/contact.blade.php |
| 3 | `contact_email_label` | Contact Page — Email Label | Contact | backend/resources/views/contact.blade.php |
| 4 | `contact_events_cta_headline` | Contact Events Cta Headline | Pages | backend/resources/views/contact.blade.php |
| 5 | `contact_events_cta_text` | Contact Events Cta Text | Pages | backend/resources/views/contact.blade.php |
| 6 | `contact_hours_fallback` | Contact Page — Hours Fallback Text | Contact | backend/resources/views/contact.blade.php |
| 7 | `contact_hours_heading` | Contact Page — Hours Card Heading | Contact | backend/resources/views/contact.blade.php |
| 8 | `contact_location_heading` | Contact Page — Location Card Heading | Contact | backend/resources/views/contact.blade.php |
| 9 | `contact_location_maps_label` | Contact Page — Maps Link Label | Contact | backend/resources/views/contact.blade.php |
| 10 | `contact_map_heading` | Contact Page — Map Section Heading | Contact | backend/resources/views/contact.blade.php |
| 11 | `contact_meta_title` | Contact Page — Browser Title | Contact | backend/resources/views/contact.blade.php |
| 12 | `contact_page_eyebrow` | Contact Page — Hero Eyebrow | Pages | backend/resources/views/contact.blade.php |
| 13 | `contact_page_subtitle` | Contact Page — Hero Subtitle | Pages | backend/resources/views/contact.blade.php |
| 14 | `contact_page_title` | Contact Page — Hero Title | Pages | backend/resources/views/contact.blade.php |
| 15 | `contact_phone_label` | Contact Page — Phone Label | Contact | backend/resources/views/contact.blade.php |
| 16 | `contact_schedule_label` | Contact Page — Schedule Link Label | Contact | backend/resources/views/contact.blade.php |
| 17 | `contact_touch_heading` | Contact Page — Contact Card Heading | Contact | backend/resources/views/contact.blade.php |
| 18 | `contact_viber_label` | Contact Page — Viber Button Label | Contact | backend/resources/views/contact.blade.php |
| 19 | `contact_whatsapp_label` | Contact Page — WhatsApp Button Label | Contact | backend/resources/views/contact.blade.php |

### 2.hours — Hours

- **Route:** GET /hours
- **Template / component:** backend/resources/views/hours.blade.php

| Order | Key | Label | Config `group` | Renders in |
|---|---|---|---|---|
| 1 | `hours_call_confirm_label` | Hours Page — Footer "Call to confirm" prefix | Pages | backend/resources/views/hours.blade.php |
| 2 | `hours_closed_status_text` | Hours Page — Closed Status Badge | Pages | backend/resources/views/hours.blade.php |
| 3 | `hours_contact_page_label` | Hours Page — Footer contact-page link label | Pages | backend/resources/views/hours.blade.php |
| 4 | `hours_meta_description` | Hours Page — Meta Description | Pages | backend/resources/views/hours.blade.php |
| 5 | `hours_meta_title` | Hours Page — Browser Title | Pages | backend/resources/views/hours.blade.php |
| 6 | `hours_open_status_text` | Hours Page — Open Status Badge | Pages | backend/resources/views/hours.blade.php |
| 7 | `hours_order_btn_label` | Hours Page — CTA Button Label | Pages | backend/resources/views/hours.blade.php |
| 8 | `hours_page_cta_subtitle` | Hours Page — CTA Subtitle | Pages | backend/resources/views/hours.blade.php |
| 9 | `hours_page_cta_title` | Hours Page — CTA Title | Pages | backend/resources/views/hours.blade.php |
| 10 | `hours_page_eyebrow` | Hours Page — Hero Eyebrow | Pages | backend/resources/views/hours.blade.php |
| 11 | `hours_page_note` | Hours Page — Holiday Note | Pages | backend/resources/views/hours.blade.php |
| 12 | `hours_page_title` | Hours Page — Hero Title | Pages | backend/resources/views/hours.blade.php |
| 13 | `hours_special_closure_label` | Hours Page — Special Closure Prefix | Pages | backend/resources/views/hours.blade.php |

### 2.legal_privacy — Legal — Privacy

- **Route:** GET /privacy → 301 /order/privacy (blade privacy.blade.php exists but public URL is Order App)
- **Template / component:** backend/resources/views/privacy.blade.php (unrouted publicly)

| Order | Key | Label | Config `group` | Renders in |
|---|---|---|---|---|
| 1 | `legal_privacy_body` | Privacy Policy — Body Override (plain text) | Legal | backend/resources/views/privacy.blade.php (unrouted publicly) |
| 2 | `legal_last_updated_date` | Legal — Last updated date | Legal | backend/resources/views/privacy.blade.php (unrouted publicly) |
| 3 | `privacy_address_label` | Privacy Page — Address Label in Contact block | Pages | backend/resources/views/privacy.blade.php (unrouted publicly) |
| 4 | `privacy_email` | Privacy Page — Privacy Contact Email | Pages | backend/resources/views/privacy.blade.php (unrouted publicly) |
| 5 | `privacy_email_label` | Privacy Page — Email Label in Contact block | Pages | backend/resources/views/privacy.blade.php (unrouted publicly) |
| 6 | `privacy_last_updated_label` | Privacy Page — "Last updated" prefix | Pages | backend/resources/views/privacy.blade.php (unrouted publicly) |
| 7 | `privacy_meta_title` | Privacy Page — Browser Title | Pages | backend/resources/views/privacy.blade.php (unrouted publicly) |
| 8 | `privacy_page_title` | Privacy Page — Title | Pages | backend/resources/views/privacy.blade.php (unrouted publicly) |
| 9 | `privacy_phone_label` | Privacy Page — Phone Label in Contact block | Pages | backend/resources/views/privacy.blade.php (unrouted publicly) |

### 2.legal_terms — Legal — Terms

- **Route:** GET /terms
- **Template / component:** backend/resources/views/terms.blade.php

| Order | Key | Label | Config `group` | Renders in |
|---|---|---|---|---|
| 1 | `legal_terms_body` | Terms & Conditions — Body Override (plain text) | Legal | backend/resources/views/terms.blade.php |
| 2 | `terms_email_label` | Terms Page — Email Label in Corporate Box | Pages | backend/resources/views/terms.blade.php |
| 3 | `terms_last_updated_label` | Terms Page — "Last updated" prefix | Pages | backend/resources/views/terms.blade.php |
| 4 | `terms_meta_title` | Terms Page — Browser Title | Pages | backend/resources/views/terms.blade.php |
| 5 | `terms_page_corporate_service_text` | Terms Page — Corporate Box Service Line | Pages | backend/resources/views/terms.blade.php |
| 6 | `terms_page_subtitle` | Terms Page — Subtitle | Pages | backend/resources/views/terms.blade.php |
| 7 | `terms_page_title` | Terms Page — Title | Pages | backend/resources/views/terms.blade.php |
| 8 | `terms_phone_label` | Terms Page — Phone Label in Corporate Box | Pages | backend/resources/views/terms.blade.php |

### 2.legal_refund — Legal — Refund

- **Route:** GET /refund
- **Template / component:** backend/resources/views/refund.blade.php

| Order | Key | Label | Config `group` | Renders in |
|---|---|---|---|---|
| 1 | `legal_refund_body` | Refund Policy — Body Override (plain text) | Legal | backend/resources/views/refund.blade.php |
| 2 | `refund_last_updated_label` | Refund Page — "Last updated" prefix | Pages | backend/resources/views/refund.blade.php |
| 3 | `refund_meta_title` | Refund Page — Browser Title | Pages | backend/resources/views/refund.blade.php |
| 4 | `refund_page_subtitle` | Refund Page — Subtitle | Pages | backend/resources/views/refund.blade.php |
| 5 | `refund_page_title` | Refund Page — Title | Pages | backend/resources/views/refund.blade.php |

### 2.menu — Menu

- **Route:** GET /menu → 301 /order/menu
- **Template / component:** (no website blade — Order App owns Menu)
- **Notes:** No website Menu page renderer. `menu_new_days` stays under website reads_nowhere (no Blade `content()`); Order App reads it on `/order/view` via settings context.

_No registry keys uniquely assigned to this page bucket._

### 2.events_catering — Events & Catering

- **Route:** No website page; /pre-order → /order/events
- **Template / component:** Home band only: partials/home/events-band.blade.php
- **Notes:** events_section_* keys are inventoried under Home (where they render).

_No registry keys uniquely assigned to this page bucket._

### 2.reads_nowhere — Reads nowhere I could find (website)

- **Route:** n/a
- **Template / component:** n/a — searched `content()` in all `backend/resources/views/**/*.blade.php` + ModeEntryCardsPresenter + HeroSlides
- **Notes:** Website is server-rendered Blade with `content('…')` only — there is **no** settings JSON blob on the website. Confirmed: `rg content\('business_website'|content\('menu_new_days'` over Blade returns nothing. Both keys are `public: true` and **are** consumed on the Order App / SignageResolver (`SiteSetting::get`); they remain unread on the **website** app’s templates. **Do not delete.**

| Order | Key | Label | Config `group` | Renders in |
|---|---|---|---|---|
| 1 | `business_website` | Business Website | Contact | n/a on website Blade (Order App Signage uses settings context) |
| 2 | `menu_new_days` | New items window (days) | Menu | n/a on website Blade (Order App `MenuViewPage.tsx:90` `s.menu_new_days` + SignageResolver) |

## 3. Order App pages

Provisional Stage-2 list was Home, Menu, Ordering, Order history, Gift cards. The SPA also has About, Contact, Hours, Privacy pages that hold registry keys — those are included so every `order_app` key appears exactly once.

### 3.everywhere — Everywhere (shell chrome)

- **Route:** AppShell / TopNav / Analytics / language gate
- **Template / component:** apps/online-order-web/src/components/shell/* + SiteSettingsContext

| Order | Key | Label | Config `group` | Renders in |
|---|---|---|---|---|
| 1 | `language_switcher_enabled` | Show language switcher (EN / ދވ) | General | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 2 | `site_name` | Site Name | General | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 3 | `site_tagline` | Tagline | General | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 4 | `logo` | Logo (Light) | Branding | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 5 | `logo_dark` | Logo (Dark) | Branding | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 6 | `favicon` | Favicon | Branding | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 7 | `primary_color` | Primary Color | Branding | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 8 | `google_analytics_id` | Google Analytics ID | SEO | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 9 | `google_tag_manager_id` | Google Tag Manager ID | SEO | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 10 | `announcement_enabled` | Show Announcement Banner | Announcements | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 11 | `announcement_style` | Announcement — Style | Announcements | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 12 | `announcement_text` | Announcement — Text | Announcements | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 13 | `announcement_url` | Announcement — Link URL (optional) | Announcements | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 14 | `business_phone` | Business Phone | General | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 15 | `business_email` | Business Email | General | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 16 | `business_address` | Business Address | General | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 17 | `business_landmark` | Landmark / Direction Hint | Contact | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 18 | `business_maps_url` | Google Maps URL | Contact | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 19 | `business_whatsapp` | WhatsApp Link | Contact | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 20 | `business_viber` | Viber Link | Contact | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 21 | `footer_contact_heading` | Footer — Contact Heading | Footer | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 22 | `footer_delivery_text` | Footer — Delivery line | Footer | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 23 | `footer_hours_heading` | Footer — Hours Heading | Footer | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 24 | `footer_links` | Footer Links | Footer | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 25 | `footer_location_heading` | Footer — Location Heading | Footer | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 26 | `footer_payments_text` | Footer — Payments line | Footer | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 27 | `footer_quick_links_heading` | Footer — Quick Links Heading | Footer | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 28 | `footer_rights_suffix` | Footer — Rights Suffix | Footer | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 29 | `footer_text` | Footer blurb | Footer | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 30 | `footer_thanks` | Footer thanks | Footer | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 31 | `show_social_links` | Show social links | Footer | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 32 | `social_facebook` | Facebook URL | Footer | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 33 | `social_instagram` | Instagram URL | Footer | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 34 | `social_tiktok` | TikTok URL | Footer | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 35 | `nav_order_cta_text` | Nav — Order CTA Button | Footer | apps/online-order-web/src/components/shell/* + SiteSettingsContext |
| 36 | `home_chat_label` | Home — Chat label | Homepage | apps/online-order-web/src/components/shell/* + SiteSettingsContext |

### 3.home — Home

- **Route:** /order/ (index)
- **Template / component:** apps/online-order-web/src/pages/HomePage.tsx + components/home/*
- **Notes:** Composable via page_blocks (PageBlocksContext). Order from surfaceBlocks.ts. Opening Ordering is Home mode_cards → /menu → /checkout (no /ordering route).

| Order | Key | Label | Config `group` | Renders in |
|---|---|---|---|---|
| 1 | `hero_slides` | Hero Slides | Hero | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 2 | `homepage_categories` | Hedhikaa | Pages | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 3 | `trust_items` | Trust Items | Pages | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 4 | `home_categories_eyebrow` | Categories Section — Eyebrow | Homepage | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 5 | `home_categories_title` | Categories Section — Title | Homepage | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 6 | `home_delivery_tagline` | Delivery Card — Tagline | Homepage | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 7 | `home_hero_fallback_subtitle` | Hero Fallback — Subtitle | Homepage | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 8 | `home_hero_fallback_title` | Hero Fallback — Title | Homepage | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 9 | `home_proof_eyebrow` | Social Proof — Eyebrow | Homepage | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 10 | `home_specials_eyebrow` | Specials eyebrow | Homepage | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 11 | `home_specials_title` | Specials title | Homepage | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 12 | `offers_headline` | Offers rail headline | Homepage | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 13 | `offers_subtext` | Offers rail subtext | Homepage | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 14 | `office_orders_enabled` | Office Orders Enabled | Pages | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 15 | `office_orders_headline` | Office Orders Headline | Pages | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 16 | `office_orders_subtext` | Office Orders Subtext | Pages | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 17 | `order_home_reviews_title` | Order home reviews title | Order App | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 18 | `order_home_greeting_hello` | Home greeting — Hello | Order App | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 19 | `order_home_greeting_named` | Home greeting — with name | Order App | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 20 | `order_home_greeting_sub` | Home greeting — subtitle | Order App | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 21 | `order_mode_delivery_hint` | Delivery mode hint | Order App | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 22 | `order_mode_pickup_hint` | Pickup mode hint | Order App | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 23 | `order_mode_dine_in_hint` | Eat here mode hint | Order App | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 24 | `order_mode_delivery_info` | Delivery — info sheet | Order App | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 25 | `order_mode_pickup_info` | Pickup — info sheet | Order App | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 26 | `order_mode_dine_in_info` | Eat here — info sheet | Order App | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 27 | `order_mode_status_available` | Mode status — available | Order App | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 28 | `order_mode_status_unavailable` | Mode status — unavailable | Order App | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 29 | `order_mode_status_unavailable_opens` | Mode status — closed until | Order App | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 30 | `order_mode_learn_more` | Mode card — Learn more | Order App | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 31 | `delivery_threshold` | Free Delivery Threshold | Contact | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 32 | `delivery_time` | Delivery Time Promise | Contact | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 33 | `order_hours_closed` | Hours badge — Closed | Status banners | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 34 | `order_hours_closed_opens` | Hours badge — Closed · Opens {time} | Status banners | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 35 | `order_hours_open` | Hours badge — Open | Status banners | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |
| 36 | `order_hours_open_closes` | Hours badge — Open · Closes {time} | Status banners | apps/online-order-web/src/pages/HomePage.tsx + components/home/* |

### 3.menu — Menu

- **Route:** /order/menu
- **Template / component:** apps/online-order-web/src/pages/MenuPage.tsx
- **Notes:** menu_new_days is read on MenuViewPage (/view) and Signage, not MenuPage itself — still assigned to Menu as the product surface.

| Order | Key | Label | Config `group` | Renders in |
|---|---|---|---|---|
| 1 | `menu_page_title` | Menu Page — Title | Menu | apps/online-order-web/src/pages/MenuPage.tsx |
| 2 | `default_item_image` | Default item photo | Branding | apps/online-order-web/src/pages/MenuPage.tsx |
| 3 | `menu_new_days` | New items window (days) | Menu | apps/online-order-web/src/pages/MenuPage.tsx |

### 3.ordering — Ordering (checkout + auth)

- **Route:** /order/checkout (+ AuthBlock); mode entry on Home
- **Template / component:** CheckoutPage.tsx, AuthBlock.tsx (mode copy lives on Home)

| Order | Key | Label | Config `group` | Renders in |
|---|---|---|---|---|
| 1 | `order_checkout_title` | Checkout — Title | Order App | CheckoutPage.tsx, AuthBlock.tsx (mode copy lives on Home) |
| 2 | `order_checkout_subtitle` | Checkout — Subtitle | Order App | CheckoutPage.tsx, AuthBlock.tsx (mode copy lives on Home) |
| 3 | `order_payment_compliance` | Checkout — Payment Compliance Text | Order App | CheckoutPage.tsx, AuthBlock.tsx (mode copy lives on Home) |
| 4 | `order_auth_privacy_line` | Login — Privacy Line | Order App | CheckoutPage.tsx, AuthBlock.tsx (mode copy lives on Home) |

### 3.order_history — Order history

- **Route:** /order/order-history
- **Template / component:** OrderHistoryPage.tsx
- **Notes:** Uses i18n only — no content.php keys.

_No registry keys uniquely assigned to this page bucket._

### 3.gift_cards — Gift cards

- **Route:** /order/gift-cards*
- **Template / component:** GiftCardsPage.tsx / BuyGiftCardPage / GiftCardPurchaseSuccessPage
- **Notes:** Success page reads business_whatsapp (inventoried under Everywhere contact). No gift-card-specific registry keys.

_No registry keys uniquely assigned to this page bucket._

### 3.about — About (extra SPA page)

- **Route:** /order/about (exists in SPA)
- **Template / component:** About page components

| Order | Key | Label | Config `group` | Renders in |
|---|---|---|---|---|
| 1 | `about_page_story` | About Page — Our Story | About | About page components |
| 2 | `about_page_title` | About Page — Title | About | About page components |
| 3 | `about_values` | About Values | Pages | About page components |

### 3.contact — Contact (extra SPA page)

- **Route:** /order/contact
- **Template / component:** Contact page

| Order | Key | Label | Config `group` | Renders in |
|---|---|---|---|---|
| 1 | `contact_page_title` | Contact Page — Hero Title | Pages | Contact page |
| 2 | `contact_page_subtitle` | Contact Page — Hero Subtitle | Pages | Contact page |

### 3.hours — Hours (extra SPA page)

- **Route:** /order/hours
- **Template / component:** HoursPage.tsx

| Order | Key | Label | Config `group` | Renders in |
|---|---|---|---|---|
| 1 | `hours_page_title` | Hours Page — Hero Title | Pages | HoursPage.tsx |

### 3.privacy — Privacy (extra SPA page)

- **Route:** /order/privacy
- **Template / component:** Privacy page

| Order | Key | Label | Config `group` | Renders in |
|---|---|---|---|---|
| 1 | `privacy_page_title` | Privacy Page — Title | Pages | Privacy page |
| 2 | `legal_privacy_body` | Privacy Policy — Body Override (plain text) | Legal | Privacy page |

### 3.signage — Signage (TV boards)

- **Route:** `/order/tv`, `/order/tv/:screen` (`SignagePage.tsx`; basename `/order`)
- **Template / component:** `apps/online-order-web/src/pages/SignagePage.tsx`
- **Notes:** Reads public order_app settings via `useSiteSettingsContext()` → `settings.*` (API: `ContentResolver::for('order_app')->allPublic()`). Not customer ordering chrome; still part of the Order App surface.

| Order | Key | Label | Config `group` | Renders in |
|---|---|---|---|---|
| 1 | `business_website` | Business Website | Contact | `SignagePage.tsx:606` and `:640` — `settings.business_website` |

### 3.reads_nowhere — Reads nowhere I could find (order app)

- **Route:** n/a
- **Template / component:** n/a — searched path 1 `text()`, path 2 `settings.<key>`, path 3 `useSiteSettingsContext` / `s.<key>` (excluding tests)
- **Notes:** After the settings-context correction, **no** order_app registry keys remain in this bucket. Empty on purpose. **Do not delete keys** if this list grows again later — “reads nowhere” ≠ unused.

_No registry keys in this bucket._

## 4. Honest reporting

### 4.1 Registry keys that read nowhere I could find

**Means the documented searches found nothing — not that the key is unused. No key may be deleted on the strength of this list.**

| App | Key | Config `group` | Search run / confirmation |
|---|---|---|---|
| website | `business_website` | Contact | No `content('business_website')` in any Blade; website has no settings JSON. Used on Order App Signage via settings context (not website). |
| website | `menu_new_days` | Menu | No `content('menu_new_days')` in any Blade. Used on Order App `MenuViewPage.tsx:90` (`s.menu_new_days`) + `SignageResolver`. |

~~order_app `business_website`~~ — **corrected:** renders on Signage (`SignagePage.tsx:606`, `:640`) via settings context. See §3.signage.

**Settings-context blind spot (correction note):** `text()` alone misses **21** public `order_app` registry keys that are read as `settings.<key>` / `s.<key>` (including `business_website`, `menu_new_days`, `logo`, `announcement_*`, `office_orders_*`, …). Most were already page-assigned in the inventory by other means; **1** (`business_website`) had been wrongly listed under reads nowhere and is moved to Signage.

### 4.2 Keys a template reads that are NOT in that app’s registry

| Reader | Key | Notes |
|---|---|---|
| Website `office-orders` partial | `office_orders_*` | Registry apps=`order_app` only; still readable if block enabled on website home |
| Website `reviews` partial | `order_home_reviews_title` | Registry apps=`order_app` |
| Website `ModeEntryCardsPresenter` | `delivery_eta` | **Absent from content.php** — fallback hint string |
| Website HeroSlides | `hero_slide_1/2/3` | Deprecated legacy fallback |
| Order App marketing blocks | `cta_band_*`, `proof_stat/label/details`, `home_featured_*`, `home_location_*`, `events_section_*` | Registry apps=`website` only — Order App can still render them if page_blocks present |
| Order App checkout | `delivery_free_threshold`, `delivery_default_fee`, `delivery_zone_fees`, `pickup_slots_enabled` | Ops / delivery settings — not content registry |

### 4.3 Keys that render on more than one page

Assigned once in the inventory (primary page); still appear elsewhere at runtime:

| Key(s) | Primary inventory page | Also appears |
|---|---|---|
| `site_name`, `logo`, `business_*` | Everywhere | Home, Contact, Legal, Checkout |
| `offers_headline`, `offers_subtext` | Home (both apps) | Order App Menu OffersRail |
| `home_chat_label` | Everywhere | Footer chrome |
| `delivery_time`, `delivery_threshold` | Home | Checkout / location |
| `legal_last_updated_date` | Website legal_privacy | Terms + Refund blades |
| `announcement_*` | Everywhere | Any page with layout/shell |

### 4.4 Config `group` disagrees with where the key renders

| Key / set | Config `group` | Actually renders |
|---|---|---|
| **All 10 `order_mode_*`** | **Order App** | **Website Home** `mode_cards` via ModeEntryCardsPresenter (and Order App Home) |
| `nav_order_cta_text` | Footer | Website **header** Order CTA |
| `home_chat_label` | Homepage | Layout / BrandFooter chrome |
| `delivery_threshold`, `delivery_time` | Contact | Home mode cards / location |
| `trust_items`, `homepage_categories`, `proof_details` | Pages | Home sections |
| `events_section_*` | Pages | Home `events_band` only (no Events page) |
| `contact_page_*`, `hours_*`, `privacy_*`, `terms_*`, `refund_*` | Pages | Their specific page templates |
| `office_orders_*` (order_app) | Pages | Order App Home block |
| `homepage_categories`, `trust_items` (order_app) | Pages | Order App Home |
| `menu_new_days` | Menu | `/view` + Signage, not `/menu` page title surface |

---

## 5. Home page_blocks (both apps) — interleaved with registry keys

Home is the only composable page. Registry keys in §2.home / §3.home are **not** a top-to-bottom paint order by themselves; at runtime they ride inside `page_blocks` components (plus layout chrome).

**Walker (both apps):**

1. Load `page_blocks` for the app (`PageBlockRepository` / `PageBlocksContext`).
2. Filter by device visibility + `placement_*` (`header` / `home` / `footer` / `bottom_navigation`).
3. Sort by `order_desktop` / `order_mobile`, else `position`.
4. Map `block_type` → Blade partial / React component.
5. Shell types (`site_footer`, `bottom_nav`, announcement) render in layout / AppShell — **not** the home walker. Keep **Website global footer**, **Order App footer**, and **Mobile bottom navigation** distinct.

Authoritative live order = database rows. Frozen default seeds (`LegacyHomeLayout` / `HomeLayoutSnapshot`) and later migrators (e.g. website `mode_cards`) establish the usual shape:

### Website Home — default interleaved order

| # | `page_blocks` type (or chrome) | Registry keys that type reads (primary) |
|---|---|---|
| — | layout header / announcement | `announcement_*`, `logo`, `nav_order_cta_text`, … (§2.everywhere) |
| 1 | `hero` | `hero_slides` (+ deprecated `hero_slide_*` fallback) |
| 2 | `mode_cards` (ensured by migrator) | all 10 `order_mode_*`, `delivery_time`, `delivery_threshold`, mode card titles/taglines |
| 3 | `trust` (when present) | `trust_items` |
| 4 | `specials` | `home_specials_*`, `offers_*` |
| 5 | `featured` | `home_featured_*`, `default_item_image` |
| 6 | `categories` | `homepage_categories`, `home_categories_*` |
| 7 | `proof` | `proof_*`, `home_proof_eyebrow` |
| 8 | `cta` | `cta_band_*` |
| 9 | `location` | `home_location_*`, `home_visit_*`, `home_directions_cta`, `home_call_cta`, … |
| 10 | `events_band` (when enabled) | `events_section_*` |
| — | **Website global footer** (`site_footer` / layout) | `footer_*`, `social_*`, contact strip (§2.everywhere) — **not** bottom nav |

### Order App Home — default interleaved order

| # | `page_blocks` type (or chrome) | Registry keys that type reads (primary) |
|---|---|---|
| — | shell header / greeting chrome | branding + announcement keys (§3.everywhere) |
| 1 | `greeting` | (mostly runtime customer name; little registry) |
| 2 | `prayer_bar` | (times API; optional copy keys) |
| 3 | `hero` + `opening_status` | `hero_slides`, open/closed badge copy |
| 4 | `mode_cards` | `order_mode_*`, delivery/pickup hints |
| 5 | `specials` | `home_specials_*`, `offers_*` |
| 6 | `reviews` | review section titles (may include order-only keys) |
| 7 | `categories` | `homepage_categories`, `home_categories_*` |
| 8 | `reorder_strip` | (order history API; little registry) |
| 9 | `office_orders` (when present) | `office_orders_*` |
| — | **Order App footer** (`brand_footer` / BrandFooter) | order-app footer keys — **not** website footer, **not** bottom nav |
| — | **Mobile bottom navigation** (`bottom_nav`, mobile only) | tab labels — **not** a footer |

Install-specific `position` / enable flags can reorder or hide rows; Stage 4 must not assume this table is frozen for every environment.

---

## 6. Coverage rule (Stage 4 guard, arriving early)

Every non-deprecated registry key whose `apps` includes an app must appear **exactly once** in that app’s inventory `key_index`. Enforced by `ContentSurfaceInventoryTest`.