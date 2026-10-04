# Bake & Grill brand palette

Set 2026-09-30, when the owner chose the light logo and asked for its rust as the
accent "throughout the website". This is the one place the colours are decided;
the token files below copy from here.

## The five colours in the mark

Measured from `logo-light.png`.

| Role | Hex | Share of the mark | Used for |
|---|---|---|---|
| Rust | `#B74B0C` | 34% | The accent: buttons, links, prices, badges, active tabs, receipt rules |
| Dark brown | `#1C1408` | 22% | Text, dark strips (footer, sidebar), signage backgrounds |
| Golden amber | `#CA7D1C` | 18% | A supporting warm tone; offered as a hero-slide colour, not a token |
| Flame | `#F7670B` | gradient tips | Inside the mark only; never a page colour |
| Cream | `#F7F5F2` | background | The page (`#FFFDF9` on the website, `#F8F6F3` in admin, both within a hair of it) |

The amber `#D4813A` the site used before is not one of them and is retired.

## The accent, derived

One setting, **Business Details > Branding > Primary colour**, drives the website,
the order app and the documents. `App\Domains\Content\BrandPalette` (PHP) and
`apps/online-order-web/src/lib/brandPalette.ts` (its mirror, tested to agree) derive
the rest:

| Token | Light theme | Dark theme | Rule |
|---|---|---|---|
| accent | `#B74B0C` | `#C56F3D` | the setting; dark: lightened in tenths until 4.5:1 on `#1A1208` |
| hover | `#A1420B` | `#AD6236` | darkened 12% |
| tint | `#F9F1EC` | `rgba(197,111,61,0.15)` | 92% white mix; dark: 15% alpha |
| glow | `rgba(183,75,12,0.22)` | `rgba(197,111,61,0.22)` | 22% alpha |
| text on accent | `#FFFDF9` cream | `#1C1408` dark | whichever reads better (WCAG) |
| accent on dark | `#C56F3D` | `#C56F3D` | the dark-theme accent, for a dark strip on the light page |

Why the dark shade: the rust is 3.6:1 on the dark page, which fails for prices
and links. Two tenths of lightening clears 4.5:1. The old amber was already
readable after one tenth, so a site set back to it looks as it did.

## Measured contrast

| Pair | Ratio |
|---|---|
| Rust as text on white | 5.2:1 |
| Cream text on a rust button | 5.2:1 |
| Rust as text on the cream page | 4.8:1 |
| `#C56F3D` as text on the dark page `#1A1208` | 5.0:1 |
| `#C56F3D` as text on signage black `#0D0A06` | 5.4:1 |
| Rust as text on the dark page (not used) | 3.6:1 |

## Where the tokens live

| Surface | File | Tokens |
|---|---|---|
| Website | `backend/resources/views/layout.blade.php` | `--amber`, `--amber-hover`, `--amber-light`, `--amber-glow`, `--amber-contrast`, `--amber-on-dark`; overridden by `BrandPalette` when the setting is set |
| Documents, prayer times | `layouts/document.blade.php`, `prayer-times.blade.php` | same names |
| Order app | `apps/online-order-web/src/index.css` | `--color-primary`, `-hover`, `-light`, `-glow`, `-contrast`, `-on-dark`; overridden at runtime from the setting |
| Admin | `apps/admin-dashboard/src/index.css` | `--color-primary`, `-light`, `-dark`, `-glow`; the sidebar and the dark theme use `#C56F3D` |
| POS | `apps/pos-web/src/theme.ts`, `index.css` | `primary`, `primaryDark`, `primaryLight`, `primaryBg` |
| Signage | per playlist and group `theme.primary` in the database; defaults in `SignageTemplateFactory`, `packages/shared/src/signage` | `#C56F3D` (always on black) |
| Receipts, PDFs, emails | `DocumentBrandView`, `partials/pdf-styles.blade.php`, `resources/views/emails/*` | the setting, or `#B74B0C` inline where mail clients need a literal |

The migration `2026_09_30_230000_rust_accent.php` moved a setting still at the old
amber to the rust and the seeded signage themes to `#C56F3D`; a colour the owner had
chosen themself was left alone.

## Files

Logo and stamp files are in this folder and, for the ones the site serves, in
`backend/public/brand/`. Downloadable packs: `/brand/bake-and-grill-logo-pack.zip`
and `/brand/bake-and-grill-stamp-pack.zip`.

## Amma

The Amma sub-brand (home-made lines, Rihaakuru first) prints a rust tile: a rounded
square in the brand rust with a dotted cream inner line, a cream heart, "Amma" in the
brand serif, "އަންމާ" in Faruma and HOME-MADE spaced beneath (owner's pick, 2026-10-05,
from three options). The source is `docs/brand/amma-logo.html` (render it 1080 × 1080
with a transparent background in Chromium to regenerate
`backend/public/brand/amma-logo.png`). Labels use it for the Amma brand until a logo is
uploaded under Labels → Types & brands.
