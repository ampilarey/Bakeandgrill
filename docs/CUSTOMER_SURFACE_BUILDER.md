# Customer Surface Builder

Explicit **page_blocks** placements for Website and Order App chrome. Each block row stores per-device visibility (`show_desktop` / `show_mobile`), slot (`placement_*`), and optional order overrides. Sharing content between apps does **not** share visibility — each app instance is independent.

## Component library (non-deprecated)

| Type | Label | Per-app content |
|------|-------|----------------|
| `greeting` | Greeting / welcome | independent |
| `prayer_bar` | Prayer Time Banner | independent |
| `hero` | Hero banner / promotional carousel | independent |
| `announcement` | Announcement banner | independent |
| `service_availability` | Service availability / maintenance | independent |
| `opening_status` | Opening status | independent |
| `stat_chips` | Stat chips / loyalty summary | independent |
| `mode_cards` | Order mode cards | independent |
| `specials` | Specials / offers carousel | independent |
| `featured` | Featured items | independent |
| `categories` | Categories | independent |
| `trust_strip` | Trust strip | independent |
| `proof` | Social proof | independent |
| `reviews` | Customer reviews | independent |
| `reorder_strip` | Reorder strip | independent |
| `cta` | Call-to-action band | independent |
| `location` | Location / map | independent |
| `events_band` | Catering / events band | independent |
| `office_orders` | Office orders card | independent |
| `brand_footer` | Brand footer / Home footer | independent |
| `site_footer` | Full footer | independent |
| `bottom_nav` | Bottom navigation | independent |
| `rich_text` | Custom text | independent |
| `image` | Custom image | independent |
| `image_text` | Image with text | independent |
| `video` | Video | independent |
| `button_band` | Button band | independent |
| `faq_list` | FAQ | independent |
| `divider` | Divider / spacing | independent |

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

### Backend (CI)

`CustomerSurfaceBuilderTest` — surface catalog, migrator idempotency, independent website/order on-off, shared content ≠ shared visibility, `forSurface`, all library types on both apps, footer vs bottom_nav, prayer placement.

Related: `PageBlockRenderTest`, `SurfaceMapKeysTest`, `HomeLayoutMigrationGateTest`.

```bash
php artisan test --filter=CustomerSurfaceBuilder
```

### Frontend (ran on agent)

- Order app: **19 passed** — `surfaceBlocks`, TopNav prayer gate, AppShell bottom-nav gate, navTabs, HomePage opening/empty.
- Admin: **27 passed** — `surfaceCatalog`, SurfaceBuilderLanding, overflow budgets (320/375/390/1024/1280/1440), homeComponentLibrary, HomeLayoutEditor surface filter.

## Key files

| File | Role |
|------|------|
| `app/Domains/Content/Blocks/SurfaceCatalog.php` | Surface definitions + slot/type rules |
| `app/Domains/Content/Blocks/CustomerSurfaceMigrator.php` | Bootstrap chrome rows |
| `app/Domains/Content/Blocks/HomeChromeResolver.php` | Header/footer/bottom-nav resolution |
| `app/Domains/Content/Blocks/PageBlockRepository::forSurface()` | Filter blocks by app × device × slot |
| `app/Domains/Content/Blocks/BlockDeviceSettings.php` | Per-device visibility/placement schema |
