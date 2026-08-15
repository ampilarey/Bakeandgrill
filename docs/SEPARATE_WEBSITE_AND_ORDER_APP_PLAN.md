# Separating Website and Order App Content — Plan

Status: **Stages 1–6 shipped**; **customer-facing page-block / Home / branding
independence completed** on `cursor/complete-content-app-separation-d038` (2026-08-13).
Shared scope remains the operational/document business record only — Website and Order
App never fall back to it for customer-facing presentation.

Owner's ask: *"I have tried many time to make the content settings in admin app. Its really
confusing and complicated since it controls main app and order app combined. I need to totally
separate everything from main website and order app. Setting and everything should be separate
without changing current layout and settings. Is it possible."*

Decision taken: **split absolutely everything** between the two apps, including business facts
like the phone number, accepting that they must then be changed in more than one place.

**Yes, it is possible, and it is a smaller change than it looks.** Most of the content is already
separate. The confusion comes from a minority of settings, and from one scope that is doing two
completely different jobs.

---

## 1. What is actually shared today

155 non-deprecated content blocks (`backend/config/content.php`).

| | Count |
|---|---|
| Appear on the **website only** | 85 |
| Appear on the **order app only** | 29 |
| Appear on **both** | 41 |

**114 of 155 (74%) are already separate** — they target one app and cannot be confused with the
other. They are not the problem and must not be touched.

The 41 dual-app blocks were the entire source of the "Same in both / Different per app" machinery.
They divide into three kinds:

**Page wording — 23 blocks.** `hero_slides`, `announcement_*` (4), `footer_text`,
`footer_thanks`, `footer_rights_suffix`, `home_categories_title`, `home_categories_eyebrow`,
`home_specials_title`, `home_specials_eyebrow`, `home_proof_eyebrow`, `home_delivery_tagline`,
`offers_headline`, `offers_subtext`, `homepage_categories`, `trust_items`, `contact_page_title`,
`contact_page_subtitle`, `hours_page_title`, `privacy_page_title`, `legal_privacy_body`.

**Business facts — 13 blocks.** `business_phone`, `business_whatsapp`, `business_viber`,
`business_email`, `business_address`, `business_landmark`, `business_maps_url`,
`business_website`, `site_name`, `site_tagline`, `delivery_time`, `delivery_threshold`,
`menu_new_days`.

**Brand assets — 6 blocks.** `logo`, `logo_dark`, `favicon`, `og_image`, `primary_color`,
`default_item_image`. Previously listed in `ContentRegistry::BRAND_SYNCED_KEYS` and forced
identical — every write mirrored to all three scopes. That mirroring is removed.

---

## 2. The finding that makes this safe — and that would have broken everything

`shared` is not "the two apps agree". **It is the operational settings store for the entire
business.**

`SiteSetting::get($key)` — the unscoped read used everywhere outside the two apps — is hardcoded
to the shared scope with no fallback:

```php
// SiteSetting.php:25
public static function get(string $key, mixed $default = null): mixed
{
    $value = self::getScoped($key, 'shared', 'en');
    return ($value !== null && $value !== '') ? $value : $default;
}
```

There are **179 call sites** of that method across the backend. They read GST rates, delivery
fees and zones, SMS budgets, credit limits, promotion rules, kitchen handover settings, catering
lead times, packaging and service charges, opening hours and closures. None of those keys are
content, and none of those callers are the website or the order app.

Several of them read the *same keys* the two apps display:

| Consumer | Reads | Breaks if shared is emptied |
|---|---|---|
| `Support/DocumentBrandView.php` | `site_name`, `business_phone`, `business_email`, `business_address`, `logo`, `primary_color` | Invoices and printed documents lose brand facts |
| `Domains/Signage/Services/SignageResolver.php` | `site_name`, `business_phone` | Digital signage screens go blank |
| `Api/PublicComplaintController.php` | `business_whatsapp` | Complaint WhatsApp link silently falls back to a hardcoded number |
| `Console/Commands/CheckReorderPoints.php` | `business_phone` | Reorder SMS loses its fallback recipient |
| `Console/Commands/AlertDeliveryDelays.php` | `business_phone` | Delay alerts lose their fallback recipient |

**So `shared` must not be deleted, emptied, or renamed.** Doing so would blank the phone number on
every invoice in the business while the admin screens all looked correct.

This is good news. It means the change is confined to one thing: **stop the website and order app
from falling back to `shared` for the 41 content keys.** All 179 operational call sites keep
working exactly as they do now, untouched.

---

## 3. Target design

Three scopes stay in the database. Their meanings become distinct and stop overlapping:

| Scope | Who reads it | Job |
|---|---|---|
| `website` | Website only | Everything the website shows |
| `order_app` | Order app only | Everything the order app shows |
| `shared` | Everything that is not one of those two apps — invoices, receipts, signage, SMS, GST, delivery pricing, kitchen | The business record and operational settings |

**`ContentResolver`'s lookup chain is two steps.**

Today (pre–Stage 3): `app+locale → shared+locale → app+en → shared+en → registry default`
After: `app+locale → app+en → registry default`

Consequences, all of them improvements:

- **The `"[]"` masking trap disappears.** With no shared step there is nothing to mask, so the
  trap and its Content Hub warning both go.
- **`linkState()` disappears** along with `same` / `different`.
- **`share()` / `split()` / copy-between-apps disappear** (404).
- **`BRAND_SYNCED_KEYS` mirroring disappears.** The logo is three independent settings.
- Hub mode controls, `brand_synced`, and share/split/copy API client functions are gone.

The Content Hub is two independent destinations — **Website** and **Order App** — each showing
only the blocks that app actually uses. No toggle, no mode, no decision to make.

Business Details (`/business-details`) edits the shared business record for invoices / receipts /
signage / SMS. It never writes website or order_app.

Mismatch notices (`ContentScopeMismatch`) tell the owner when independently scoped
brand/marketing facts disagree across the three scopes. Business Details–owned identity
keys (phone, email, address, site_name, …) are excluded — those always resolve from shared.
Notice only — no sync button.

---

## 4. Migration — value-preserving by construction

The requirement is *"without changing current layout and settings"*. The way to guarantee that
is not to reason about it — it is to measure it.

**Before the change**, for every combination of the 155 keys × 2 apps × 2 locales (620
combinations), run the **existing** resolver and record what it returns.

**Then**, for each key and app and locale, write that recorded value into the app's own scope
row. A value that was reaching the app through `shared` becomes an explicit `website` row and an
explicit `order_app` row holding the same thing.

**After the change**, run the **new** resolver over the same 620 combinations and assert every
answer is identical.

Nothing looks different the morning after, because the migration's success criterion *is* that
nothing looks different.

Rules the migration must honour, taken from the current resolver:

- Present means "not null and not empty string". `"[]"` is present and wins — do not treat it as
  missing.
- The `en` fallback applies before the registry default.
- Registry defaults are not written into the database. If a key resolves to its registry default
  today, leave both app rows absent so it keeps resolving to the default tomorrow.
- Shared rows are **left exactly as they are**. Not deleted, not archived, not emptied. The 179
  operational callers still read them.

Reversibility: because nothing is deleted, rolling back is restoring the resolver's old lookup
chain. Keep that in mind when writing the migration — it should be a data copy plus a code
change, never a data destruction.

---

## 5. What the owner has to live with

This is the cost of the choice, stated once so it is on the record.

**Business facts now exist in three places, not one.** The phone number lives in the website's
settings, the order app's settings, and the business record that invoices and signage read.
Changing it means changing it three times. Missing one means the website shows the old number for
months with nobody noticing.

Mitigation that does **not** reintroduce a toggle: a **mismatch notice**. Where a business-fact
key holds different values across website, order app and the business record, show it plainly —
"Business record says 9120011 · Website says 9120022 · Order app says 9120011". A warning, not a
link. Nothing is synchronised behind the owner's back; he is simply told.

The same applies to the brand assets. After the split, changing the logo on the website does not
change it on the order app. That must be said in the interface, not discovered.

---

## 6. Risks

1. **Blanking business data on documents.** The one that matters. Any change to `SiteSetting::get`
   or to the shared rows puts invoices, signage and SMS at risk. The rule is absolute: shared rows
   are not deleted/emptied during this work.
2. **Cache.** `SiteSetting::getScoped` uses `ResilientCache::rememberForever` keyed per scope and
   locale. Writers must bust the right keys (`SiteSetting::bust()` + `ContentResolver::bust()`).
3. **Doubling the rows the admin shows.** 41 blocks become independent copies. Two separate
   sections stop this making the confusion worse.
4. **Drift, as in §5.** Mitigated by mismatch notices.
5. **Partial deploy.** The resolver change and the data migration must land together.

---

## 7. Test plan

- The 620-combination before/after assertion from §4. This is the whole guarantee; it must run in
  CI, not by hand.
- Every one of the five non-app consumers in §2 still resolves its keys after migration:
  invoice/document brand block, signage resolver, complaint WhatsApp link, reorder SMS fallback,
  delivery delay SMS fallback. (`SharedScopeNonAppConsumersTest` — behavioural for all five.)
- Editing a website block does not change the order app, and the reverse.
  (`BrandingSyncTest::test_website_logo_edit_does_not_change_order_app_or_invoice_logo`)
- The removed API endpoints (`share`, `split`, copy-between-apps) return 404.
- A key with an app-scoped `"[]"` today keeps showing nothing after migration.
- Locale: a key with a `dv` value on shared only ends up with `dv` values on both apps.
- Cache: change a value, confirm the other app is unaffected and that neither serves a stale read.
- Mismatch notices cover independently scoped brand/marketing facts and never page wording
  or Business Details–owned identity keys (`ContentScopeMismatchTest`).

---

## 8. Stages

Each stage ships on its own and leaves the system working.

**Stage 1 — Measure.** ✅ Shipped. Fixture
`backend/tests/Fixtures/content_resolver_separation_snapshot.json` +
`ContentResolverSeparationSnapshotTest` (grown with registry; currently 169 keys × 2 apps × 2
locales = 676).

**Stage 2 — Migrate the data.** ✅ Shipped.
`2026_08_13_060000_materialize_content_app_scopes_from_resolver.php` inlines the **legacy**
four-step chain (must not call `ContentResolver::get()` after Stage 3). Shared untouched.
Idempotent; `down()` no-op. Flushes per-key `forgetScoped` + `SiteSetting::bust()` +
`ContentResolver::bust()`.

**Stage 3 — Shorten the resolver.** ✅ Shipped. Public chain is
`app+locale → app+en → registry default`. Docblock updated (`"[]"` masking trap retired for
apps). Snapshot still 0 diffs. Five non-app consumers covered by
`SharedScopeNonAppConsumersTest`.

**Stage 4 — Remove the machinery.** ✅ Shipped (prompt Stages A–C mapping):
- Admin destinations: `/content/website`, `/content/order-app` (chooser at `/content`); two nav
  entries (prompt Stage A).
- Business Details screen + `GET/PUT /api/admin/business-details` writing **shared only**
  (prompt Stage B) — built **before** brand mirroring removal.
- Removed `share` / `split` / `copy` routes+methods (404), `getIncludingShared()`,
  `linkState()`, `BRAND_SYNCED_KEYS` / `isSyncedAcrossApps()` mirroring, hub mode UI + API
  clients, and the `"[]" masks shared` warning (prompt Stage C).

**Stage 5 — Two sections in the admin.** ✅ Shipped as Stage A above.

**Stage 6 — The mismatch notice + Business Details.** ✅ Shipped as Stages B + D above.
`ContentScopeMismatch` covers independently scoped brand/marketing facts (tagline, delivery
time copy, menu_new_days, brand assets) on Website Content, Order App Content, and Business
Details. Business Details–owned identity/contact keys are excluded after the ownership audit
(leftover app-scoped rows are integrity cleanup, not live values). No sync control.

**Stage 7 — Page blocks + Home editor + remaining leaks.** ✅ Shipped on
`cursor/complete-content-app-separation-d038`:
- Page blocks are own-only; `content_mode=shared` → 422; migration
  `2026_08_13_090000_materialize_shared_page_blocks_to_own.php` materializes shared settings.
- `HomeLayoutEditor` loads/publishes/discards **one app only**.
- Offers API, specials logo, HomeChrome announcement, `SetContentLocale`, unregistered
  `content()` keys, and Content Hub shared drafts/export all stop using shared as a
  customer-facing source. Media Library “Use as” clarified as document/business-record.
- Content Hub publish/draft/import/export restricted to `website` | `order_app`.

Stages 1 to 3 deliver the separation. Stages 4 to 7 deliver the *simplicity*, which is the thing
actually being asked for — the owner's complaint was never that the apps were linked, it was that
the screen made him decide about it on every block.

---

## 9. What shipped — ops notes

### Business Details keys

Derived by grepping `SiteSetting::get('…')` under `backend/app` and intersecting with content
blocks. Permission: `website.manage` (existing; not widened). Screen never writes app scopes.

### Cache

- Migration: `SiteSetting::forgetScoped()` on every upserted app row, then `SiteSetting::bust()`
  and `ContentResolver::bust()`.
- Business Details + content writers call the same bust pair after writes.
- Deploy scripts already run `php artisan config:cache` after migrate (rebuilds cached
  `content.php` registry).

### Deploy order

`scripts/pull-deploy-test.sh` and `scripts/full-deploy.sh` both run `php artisan migrate --force`
**before** `config:cache` / route cache / queue restart in the same script. Migration + new
resolver must ship in one deploy (do not cherry-pick resolver without the migration). The
migration inlines the legacy lookup chain so it remains correct even when the shortened
`ContentResolver` is already on disk at migrate time.

Residual note: `git pull` places new PHP on disk before migrate finishes; concurrent requests in
that window could theoretically hit the new resolver against un-migrated data. Keep deploys to
the scripted path (migrate immediately after pull).

### Invoice branding after mirroring removal

`logo` and `primary_color` on invoices come from shared via `DocumentBrandView`. Content Hub edits
to website/order_app logos do **not** update the invoice. Edit **Business Details** (or Media
Library “use as”) for the business record.
