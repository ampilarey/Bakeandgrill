# Customer Surface Builder

Explicit **page_blocks** placements for Website and Order App chrome. Each block row stores per-device visibility (`show_desktop` / `show_mobile`), slot (`placement_*`), and optional order overrides. Sharing content between apps does **not** share visibility — each app instance is independent.

## Component library (non-deprecated)

| Type | Label | Shared content |
|------|-------|----------------|
| `greeting` | Greeting / welcome | yes |
| `prayer_bar` | Prayer Time Banner | yes |
| `hero` | Hero banner / promotional carousel | yes |
| `announcement` | Announcement banner | yes |
| `service_availability` | Service availability / maintenance | no |
| `opening_status` | Opening status | no |
| `stat_chips` | Stat chips / loyalty summary | no |
| `mode_cards` | Order mode cards | no |
| `specials` | Specials / offers carousel | yes |
| `featured` | Featured items | yes |
| `categories` | Categories | yes |
| `trust_strip` | Trust strip | yes |
| `proof` | Social proof | yes |
| `reviews` | Customer reviews | no |
| `reorder_strip` | Reorder strip | no |
| `cta` | Call-to-action band | yes |
| `location` | Location / map | yes |
| `events_band` | Catering / events band | yes |
| `office_orders` | Office orders card | yes |
| `brand_footer` | Brand footer / Home footer | yes |
| `site_footer` | Full footer | yes |
| `bottom_nav` | Bottom navigation | no |
| `rich_text` | Custom text | yes |
| `image` | Custom image | yes |
| `image_text` | Image with text | yes |
| `video` | Video | yes |
| `button_band` | Button band | yes |
| `faq_list` | FAQ | yes |
| `divider` | Divider / spacing | no |

`promo_carousel` is deprecated (merged into `hero`).

## Surface map

Apps: `website`, `order_app`. Devices: `desktop`, `mobile`.

| App | Device | Slots |
|-----|--------|-------|
| Website | Desktop | `header`, `home`, `footer` |
| Website | Mobile | `header`, `home`, `footer`, `bottom_navigation` |
| Order App | Desktop | `header`, `home`, `footer` |
| Order App | Mobile | `header`, `home`, `footer`, `bottom_navigation` |

**Bottom navigation is mobile-only** — desktop surfaces have no `bottom_navigation` slot.

### Allowed types per slot

| Slot | Types |
|------|-------|
| `header` | `prayer_bar`, `announcement`, `greeting`, `opening_status`, `service_availability`, `stat_chips` |
| `home` | All library types except `site_footer` and `bottom_nav` |
| `footer` | `site_footer`, `brand_footer`, `rich_text`, `button_band`, `divider`, `image`, `image_text` |
| `bottom_navigation` | `bottom_nav` |

Surface IDs follow `{app}.{device}.{slot}` (e.g. `website.mobile.footer`).

## Migration summary

1. **`HomeLayoutMigrator`** — seeds legacy home section order from frozen snapshots (Stage B).
2. **`CustomerSurfaceMigrator`** — idempotently adds chrome rows that were previously hard-coded or auto-injected:
   - **Website:** `prayer_bar`, `announcement`, `trust_strip`, `events_band`, `site_footer`, `bottom_nav`
   - **Order App:** `prayer_bar`, `stat_chips`, `trust_strip`, `office_orders`, `opening_status`, `site_footer`, `bottom_nav`
3. **`2026_08_12_160000_customer_surface_builder_bootstrap.php`** — runs `CustomerSurfaceMigrator` on deploy.
4. **`HomeLayoutMigrator::migrate()`** — also calls `CustomerSurfaceMigrator` at the end so fresh test DBs and re-migrations get chrome rows.

`CustomerSurfaceMigrator` never invents sections that were not historically on that app (e.g. website does not auto-add `brand_footer` on home).

Rendering:
- **Layout** (`layout.blade.php`) — header prayer/announcement, `site_footer`, `bottom_nav` via `HomeChromeResolver`.
- **Home** (`home.blade.php`) — home-slot blocks only; no auto-insert of trust/events after hero.

## System-managed data sources

| Block type | Data source |
|------------|-------------|
| `prayer_bar` | Prayer times API (`/api/prayer-times`, island selection) |
| `hero` | Content key `hero_slides` |
| `announcement` | Content keys `announcement_*` + `announcement_enabled` |
| `service_availability` | Service availability API |
| `opening_status` | Online ordering status / hours gate |
| `stat_chips` | Loyalty account API |
| `specials` | Offers / daily specials API |
| `featured` | Menu items (featured flag) |
| `categories` | `homepage_categories` + menu |
| `trust_strip` | Content key `trust_items` |
| `reviews` | Featured reviews API |
| `reorder_strip` | Customer orders API |
| `events_band` | Content keys `events_section_*` |
| `office_orders` | Content keys `office_orders_*` |
| `site_footer` | Footer content keys + `OpeningHoursService` for hours text |
| `brand_footer` | `footer_text`, `footer_thanks`, `home_chat_label` |
| `bottom_nav` | Per-instance `settings.tabs` (not content keys) |

Generic blocks (`rich_text`, `image`, `image_text`, `video`, `button_band`, `faq_list`, `divider`) store copy/media in block `settings` (or shared content rows).

## Tests

Coverage: `tests/Feature/Content/CustomerSurfaceBuilderTest.php` (surface catalog, migrator idempotency, per-app visibility, `forSurface`, library create, footer vs bottom nav, prayer placement).

Related: `PageBlockRenderTest`, `SurfaceMapKeysTest`, `HomeLayoutMigrationGateTest`.

**Test results:** run in CI (`php artisan test --filter=CustomerSurfaceBuilder`).

## Key files

| File | Role |
|------|------|
| `app/Domains/Content/Blocks/SurfaceCatalog.php` | Surface definitions + slot/type rules |
| `app/Domains/Content/Blocks/CustomerSurfaceMigrator.php` | Bootstrap chrome rows |
| `app/Domains/Content/Blocks/HomeChromeResolver.php` | Header/footer/bottom-nav resolution |
| `app/Domains/Content/Blocks/PageBlockRepository::forSurface()` | Filter blocks by app × device × slot |
| `app/Domains/Content/Blocks/BlockDeviceSettings.php` | Per-device visibility/placement schema |
