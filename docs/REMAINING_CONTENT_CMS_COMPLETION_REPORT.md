# Bake & Grill — Remaining CMS Content Completion Report

**Date:** April 2026  
**Phase:** Remaining CMS Content (follows Homepage CMS Expansion)

---

## Summary

This phase completed the migration of all remaining hardcoded public-site content to admin-editable `SiteSetting` keys, without touching layout, routes, CSS, or application logic.

**38 tests pass. Zero layout changes. Zero route changes.**

---

## What Was Done

### 1. New Migration — `2026_04_10_add_remaining_cms_settings.php`

Added 14 new `site_settings` rows across three groups:

**Group: `Pages`** (appended to existing group)

| Key | Default Value | Label |
|-----|--------------|-------|
| `hours_open_status_text` | `● We're open right now` | Hours Page — Open Status Badge |
| `hours_closed_status_text` | `● Currently closed` | Hours Page — Closed Status Badge |
| `terms_page_title` | `Terms & Conditions` | Terms Page — Title |
| `terms_page_subtitle` | `Please read these terms before completing your purchase.` | Terms Page — Subtitle |
| `terms_page_corporate_service_text` | `Customer service: Available via WhatsApp, Viber, or the contact details above.` | Terms Page — Corporate Box Service Line |
| `refund_page_title` | `Refund & Cancellation Policy` | Refund Page — Title |
| `refund_page_subtitle` | `Please read this policy before completing your purchase.` | Refund Page — Subtitle |
| `privacy_page_title` | `Privacy Policy` | Privacy Page — Title |
| `privacy_email` | `privacy@bakeandgrill.mv` | Privacy Page — Privacy Contact Email |

**Group: `Legal`** (new group)

| Key | Type | Behaviour |
|-----|------|-----------|
| `legal_terms_body` | textarea | If non-empty, replaces the full Terms & Conditions body (plain text, HTML-escaped) |
| `legal_refund_body` | textarea | If non-empty, replaces the full Refund Policy body |
| `legal_privacy_body` | textarea | If non-empty, replaces the full Privacy Policy body |

**Group: `Hours`** (new group)

| Key | Type | Notes |
|-----|------|-------|
| `business_hours_json` | json | Weekly hours. Seeded from `config/opening_hours.php` so site output is unchanged on deploy. Integer keys 0–6 (0=Sunday). Each entry: `{"open":"HH:MM","close":"HH:MM"}` or `{"closed":true}`. `is_public: true` |
| `business_closures_json` | json | Special closure dates. Format: `{"YYYY-MM-DD":"Reason"}`. Defaults to `{}`. `is_public: true` |

All rows use `updateOrInsert` — safe to re-run.

---

### 2. `OpeningHoursService` — CMS-driven with config fallback

**File:** `backend/app/Services/OpeningHoursService.php`

Added two private helpers:
- `getHours()` — reads `business_hours_json` from `SiteSetting`; falls back to `config('opening_hours.hours')`
- `getClosures()` — reads `business_closures_json` from `SiteSetting`; falls back to `config('opening_hours.closures')`

Added one public method:
- `getHoursForDisplay(): array` — returns the full weekly hours array for the `/hours` page view

All internal `config('opening_hours.hours.*')` and `config('opening_hours.closures')` calls now use these helpers. `config('opening_hours.timezone')` is unchanged (infrastructure, not content).

---

### 3. `HomeController::hours()` — uses `getHoursForDisplay()`

**File:** `backend/app/Http/Controllers/HomeController.php`

Replaced:
```php
$hours = config('opening_hours.hours');
```
With:
```php
$hours = $openingHours->getHoursForDisplay();
```

The view's day-loop now renders CMS data, falling back to config when the CMS key is absent.

---

### 4. `hours.blade.php` — status badge text wired

**File:** `backend/resources/views/hours.blade.php`

- `"● We're open right now"` → `SiteSetting::get('hours_open_status_text', ...)`
- `"● Currently closed"` → `SiteSetting::get('hours_closed_status_text', ...)`

The `"Today"` tag, `"Closed"` time label, and day-name array remain hardcoded (locale values, not business copy).

---

### 5. `terms.blade.php` — titles + optional body override

**File:** `backend/resources/views/terms.blade.php`

- `h1` wired to `SiteSetting::get('terms_page_title', 'Terms & Conditions')`
- Subtitle wired to `SiteSetting::get('terms_page_subtitle', ...)`
- Corporate service line wired to `SiteSetting::get('terms_page_corporate_service_text', ...)`
- Body override: if `legal_terms_body` is non-empty, renders `{!! nl2br(e($termsBodyOverride)) !!}` instead of hardcoded sections 1–9

---

### 6. `refund.blade.php` — titles + optional body override

**File:** `backend/resources/views/refund.blade.php`

- `h1` wired to `SiteSetting::get('refund_page_title', ...)`
- Subtitle wired to `SiteSetting::get('refund_page_subtitle', ...)`
- Body override: if `legal_refund_body` is non-empty, renders it; else existing prose is unchanged

---

### 7. `privacy.blade.php` — title, email + optional body override

**File:** `backend/resources/views/privacy.blade.php`

- `h1` wired to `SiteSetting::get('privacy_page_title', 'Privacy Policy')`
- Hardcoded `privacy@bakeandgrill.mv` → `SiteSetting::get('privacy_email', 'privacy@bakeandgrill.mv')`
- Body override: if `legal_privacy_body` is non-empty, renders it; else existing prose is unchanged

---

### 8. Tests — `CmsContentTest.php`

**File:** `backend/tests/Feature/CmsContentTest.php`

Added 15 new tests (38 total, all passing):

| Test | Covers |
|------|--------|
| `hours_page_renders_when_business_hours_json_missing` | Config fallback when CMS key absent |
| `hours_page_renders_cms_overridden_hours` | CMS hours replace config values in view |
| `hours_open_status_text_uses_cms_override` | Status badge text CMS key resolves |
| `terms_page_renders_fallback_title` | Default title when no CMS key |
| `terms_page_renders_cms_title_override` | CMS title + subtitle shown |
| `terms_page_renders_cms_corporate_service_text_override` | Corporate box service line from CMS |
| `terms_page_falls_back_to_hardcoded_prose_when_legal_body_empty` | Empty body key → existing sections visible |
| `terms_page_body_override_replaces_hardcoded_prose` | Non-empty body key → hardcoded prose hidden |
| `refund_page_renders_fallback_title` | Default refund title |
| `refund_page_renders_cms_title_override` | CMS refund title + subtitle shown |
| `refund_page_body_override_replaces_hardcoded_prose` | Refund body override |
| `refund_page_falls_back_to_hardcoded_prose_when_legal_body_empty` | Empty key → existing prose |
| `privacy_email_cms_key_is_readable` | `privacy_email` setting resolves |
| `privacy_page_title_cms_key_is_readable` | `privacy_page_title` setting resolves |
| `privacy_body_override_cms_key_is_readable` | `legal_privacy_body` setting resolves |

---

## Admin UI — No Changes Needed

`WebsiteSettingsSubPage.tsx` auto-generates tabs from `SiteSetting` groups. The three new groups (`Legal`, `Hours`, and the extended `Pages`) appear automatically as new tabs in Admin → Settings → Website Settings.

The `Legal` textarea fields render as multi-line text areas with the built-in auto-renderer. The `Hours` JSON fields render as a raw JSON editor. No custom editor components were needed.

---

## What Remains Hardcoded (Intentionally)

| Content | Location | Reason |
|---------|----------|--------|
| Day names `['Sunday', 'Monday', ...]` | `hours.blade.php` | Locale values, not business copy |
| `"Today"` tag on current day row | `hours.blade.php` | UI label, not business copy |
| `"Closed"` time label | `hours.blade.php` | UI label, not business copy |
| `config('opening_hours.timezone')` | `OpeningHoursService` | Infrastructure config |
| `config('opening_hours.allow_preorders_when_closed')` | `config/opening_hours.php` | Business logic flag |
| All CSS, layout structure, routes | Various | Structure, not content |
| Auth/payment/ordering workflow copy | Various | Application logic |

---

## Deployment Safety

- Migration uses `updateOrInsert` — safe to re-run with no side effects
- `business_hours_json` seeded from current `config('opening_hours.hours')` — site renders identically on first deploy
- All `SiteSetting::get()` calls have hardcoded fallbacks — site works even before migration runs
- `legal_*_body` keys are empty by default — existing prose shows until admin explicitly overrides

---

## Combined CMS Coverage (Both Phases)

After both the Homepage CMS Expansion and this phase, the following content areas are fully admin-editable:

| Area | Keys | Status |
|------|------|--------|
| Homepage hero slides | `hero_slide_1/2/3` | ✅ Done |
| Homepage section copy | 16 keys (`home_*`) | ✅ Done |
| Homepage CTA band | `cta_band_*` | ✅ Done |
| Contact page hero | 3 keys | ✅ Done |
| Hours page hero + CTA | 5 keys | ✅ Done |
| Hours status badges | 2 keys | ✅ Done |
| Business hours schedule | `business_hours_json` | ✅ Done |
| Special closures | `business_closures_json` | ✅ Done |
| Terms page copy | 4 keys + body override | ✅ Done |
| Refund page copy | 3 keys + body override | ✅ Done |
| Privacy page copy | 2 keys + body override | ✅ Done |
| Announcement banner | 4 keys | ✅ Done |
| Business contact info | 6 keys | ✅ Done |
| Branding | 4 keys | ✅ Done |
| SEO / meta | 3 keys | ✅ Done |
