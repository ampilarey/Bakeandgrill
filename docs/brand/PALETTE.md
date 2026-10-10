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
`backend/public/brand/`. The downloadable packs (`bake-and-grill-logo-pack.zip`,
`bake-and-grill-animated-logo-pack.zip`, `bake-and-grill-stamp-pack.zip`) sit in
`backend/public/brand/` (the two logo packs written by `scripts/brand-packs.py`) and are
handed to the owner; they are not in git (`.gitignore` keeps out `*.zip`), so the live site does not serve them.

`logo-light.png` is the master. Owner, 2026-10-07: the "&" had a dark strip across its
top, where the gold fill stopped short of the letter (in the dark logo it was cream).
It was a flaw in the original artwork; the gold now runs to the top in the master and
in everything made from it (`AnimatedLogoTest` checks the pixels). The stamps are one
colour and never showed it.

### App icons and tab icons (2026-10-07)

Owner, 2026-10-07: "in some places it use old logo … Pwa logo." The black-square logo
is retired everywhere. Every file below is made from `logo-light.png` / `logo-mark.png`
by `scripts/brand-icons.py` (run it, then copy the output where the table says).

| File | What | Where |
|---|---|---|
| `icon-192.png`, `icon-512.png` | the logo on a cream (#F7F5F2) tile, opaque | each app's `public/` (admin names them `favicon-192/512.png`); manifests |
| `icon-maskable-512.png` | the same with room for Android's circle crop | each app's `public/`; manifests (`purpose: maskable`) |
| `apple-touch-icon.png` | 180 px tile; iOS paints see-through black, so it is opaque | each app's `public/`, `backend/public/` |
| `favicon-32.png`, `favicon.ico` | the flame alone (legible at 16 px) | each app's `public/`, `backend/public/` |
| `brand/logo-dark.png` | the logo with cream lettering, see-through: dark surfaces | `logo_dark` setting: website footer, dark mode, signage |
| `logo.png` (site root) | the light logo, see-through | fallback when no logo is saved |
| `brand/logo-light-cream.png` | the light logo on a cream (#F8F6F3) square | `backend/public/brand/`, `docs/brand/` |
| `brand/default-item-image.png` | cream 4:3 tile, the logo in a soft circle: menu items with no photo | `backend/public/brand/`, `docs/brand/` |
| `brand/flame-mark.svg` | the flame alone, rust: the menu cards' quiet tile for a dish with no photo (faded on cream) | `backend/public/brand/`, made by `scripts/brand-flame-mark.py` |
| `brand/flame-pattern.svg` | a 120px tile of small cream flames: the faint pattern on a menu banner without a photo | `backend/public/brand/`, made by `scripts/brand-flame-mark.py` |
| `logo.svg` (site root) | the trimmed light logo as a picture inside an SVG | `backend/public/` |
| `brand/profile-picture-1080.png` | the logo on cream inside a round crop: social profile pictures | `backend/public/brand/` |
| `brand/og-default.png` | 1200 × 630 cream card: link previews | `SocialPreviewImage` fallback, order app `og:image` |

### The logo with moving flames (2026-10-07)

The website header (desktop and phone) and the order app's top bar draw the logo as
shapes, and the flames burn like real fire: each sways and stretches on its own uneven
rhythm, a soft ripple rises through them, and a warm glow breathes around them (owner,
2026-10-07: "make the flames appear like a real flame and make it glow"). The ripple and
glow are one SVG filter (`feTurbulence` tiled and sliding upward, `feDisplacementMap`,
a blurred copy for the glow) animated with SMIL, so they also run in the standalone
files. The lettering stays still and follows the theme (`#1C1408`, cream `#FFFDF9` in
dark mode). For visitors who ask their device for less motion the flames hold still and
the filter is dropped. It stands in for the standard logo only: once
Admin has an uploaded logo of its own, the header shows that picture as before
(`$animatedLogo` in `layout.blade.php`, `isStandardLogo()` in the order app).

| File | What |
|---|---|
| `brand/logo-animated.svg`, `brand/logo-animated-dark.svg` | standalone, animated, layers `flame-outer-left`, `flame-outer-right`, `flame-main`, `flame-inner`, `text-bg`, `text-amp`, `text-cafe` |
| `resources/views/partials/animated-logo.blade.php` | the website header's inline copy |
| `apps/online-order-web/src/components/AnimatedLogo.tsx` (+ `animatedLogoShapes.ts`, `AnimatedLogo.css`) | the order app's |
| `resources/views/partials/animated-item-tile.blade.php`, `apps/online-order-web/src/components/AnimatedItemTile.tsx` | an opened item with no photo: the no-photo tile drawn with the moving logo |

An opened item with no photo (website item page, its pop-up sheet and offer page; the
order app's item sheet) shows the no-photo tile with the moving logo, lettering always
dark on the cream (owner, 2026-10-07, "option 1"). Menu cards and rails keep the still
`default-item-image.png`: only one moving copy is ever on screen. A no-photo picture
uploaded in Admin shows as before (`ItemDisplayPhoto::animated_tile`, `isStandardItemTile()`).

All of them are traced from `logo-light.png` by `scripts/brand-animated-logo.py` (needs
`potrace`, OpenCV, numpy); run it again if the logo PNG changes, then rebuild the order app.

Social media cannot play SVG, so `scripts/brand-animated-logo-video.mjs <dir>` (Chromium
via Playwright, ffmpeg with libx264 and libvpx-vp9) renders 10-second clips that loop
without a jump: square and 9:16 story MP4s on cream and on dark brown, a 480 px GIF and
a see-through VP9 WebM. `scripts/brand-packs.py <dir>` then writes
`bake-and-grill-animated-logo-pack.zip` (those clips, the SVGs and the still
`profile-picture-1080.png`, since profile pictures must be still) and refreshes
`bake-and-grill-logo-pack.zip`. The clips live only in the zip.

POS and KDS show their own `icon-192.png` (`/pos/…`, `/kds/…`) on the sign-in screens;
the KDS accent is the dark-surface rust `#C56F3D`. The migration
`2026_10_08_120000_brand_icons_no_old_logo.php` moved a saved favicon, logo or preview
image still naming an old file; `tests/Feature/Content/BrandIconsTest.php` checks every
manifest icon is a real image of its stated size and every touch icon is opaque.

### An uploaded logo, tab icon or link preview (2026-10-10)

Owner, 2026-10-10: "Fix". The four brand pictures went through the menu-photo path,
which cuts every upload to a 4:3 crop on white: a wide see-through logo came out as a
white box holding its middle third, a square icon lost its top and bottom, a 1200 × 630
preview lost its sides. Each is now kept in the shape its slot shows
(`App\Domains\Content\BrandImages`):

| Setting | Saved as |
|---|---|
| `logo`, `logo_dark` | the whole picture, see-through parts kept, PNG, up to 1200 px on its longest side (a photographed JPEG logo stays a JPEG) |
| `favicon` | centred on a clear square, PNG, up to 512 × 512 |
| `og_image` | 1200 × 630 JPEG, trimmed from the middle when the picture is another shape |

Files go to `storage/app/public/site/brand/{logo,icon,preview}/`, each with a Media
Library row (source `brand`), so the library lists them and the prune keeps them while
a setting uses them. The same picture chosen twice reuses its file.

Every way of setting them ends in the same place:

- **Business Details → Brand → Upload** sends the file as it is to
  `POST /api/admin/content/upload` (`scope=shared`), which draws it at once.
- **Choose picture** (Media Library) and the library's **Use as** go through
  `ContentValidationService::normalizeForWrite`, which redraws any of our stored
  pictures from the library's full-size master. A see-through upload keeps a PNG
  master since this change (`MenuImageProcessor::storeMaster(..., keepTransparency)`),
  and the same PNG uploaded again gives an older row a see-through master. Admin
  shrinks a picture over 3200 px before sending it, and now keeps it a PNG when it has
  see-through parts.
- **Replace file** on the logo's own row in the Media Library writes the library's 4:3
  crop and points every use at it; `MediaUsageResolver::rewriteUrlMap` sends a brand
  setting through the same redraw, from the new master (a PNG when see-through).
  A rendition is a `brand` row with no master, which is how a replaced one is told apart.
- Blank (the shipped files), a file under `/brand/`, and an address on another site
  are stored as they are. So is a stored file that will not decode.

The migration `2026_10_10_210000_brand_pictures_in_their_own_shape.php` redraws a saved
value that still names a 4:3 crop. A master made before 2026-10-10 was flattened onto
white, so such a logo gets its whole shape back but not its see-through background:
upload the PNG again for that. Tests: `tests/Feature/Content/BrandImagesTest.php`.

Pack logos for labels are separate and already kept as uploaded (`LabelMedia`).

### Dish photo packs (2026-10-10)

Owner, 2026-10-10: "Can u make the bajiya in this photo without background and
suitable for other uploads and upload to the test server for testing."
`scripts/food-photo-pack.py` cuts a dish out of a picture on a plain backdrop (a
poster, a studio shot) and writes a pack: the see-through cut-out as PNG and WebP,
1200 px wide, for the item's Thumbnail cut-out and for labels; the 4:3 main photo on
the menu cream and on white; a 1080 square; a 7:3 category banner with the food on
the right, since the website writes the category name on the left; a README naming
the slot for each file, and a zip of the lot. A busy backdrop needs a photo editor.

Packs are served from `backend/public/brand/photos/<dish>/`, so the owner can
download them from the test site or the live one. The zip the script writes is not
committed (archives are git-ignored); it goes to the owner directly.

| Pack | Made from |
|---|---|
| `photos/bajiya/` | the Frozen Hedhika poster, `--box 280,870,1090,1460` |

## Amma

The Amma sub-brand (home-made lines, Rihaakuru first) prints a rust tile: a rounded
square in the brand rust with a dotted cream inner line, a cream heart, "Amma" in the
brand serif, "އަންމާ" in Faruma and HOME-MADE spaced beneath (owner's pick, 2026-10-05,
from three options). The source is `docs/brand/amma-logo.html` (render it 1080 × 1080
with a transparent background in Chromium to regenerate
`backend/public/brand/amma-logo.png`). Labels use it for the Amma brand until a logo is
uploaded under Labels → Types & brands.

## Menu colours (2026-10-07)

Menu banners without a photo use one of six rust-to-brown gradients (`menuTint()` in
`apps/online-order-web/src/components/menu/MenuHead.tsx`, `$tint` in `menu.blade.php`), never a
hue picked from the category id. Rail tiles and dish circles without a photo are rust thinned
into the surface (`color-mix(rust 14%, surface)`), so they are cream by day and deep brown at
night; the cream `--color-primary-light` stays cream in the order app's dark theme and must not
be used for these. Badges (New, offers) are solid rust. Prices read "MVR 12.50" everywhere.
