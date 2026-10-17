# Posters: plan

Owner, 2026-10-17: "Sometimes I print different types of posters. Now I use other apps to
make posters. How about adding a poster feature to labels so all the posters will be in the
server, and it will be easier to use branding and logo. I use A5, A4, A3 and A2 mainly.
Many templates, easy to edit. We use UV printing." Then: "I outsource everything, so make
a detailed plan using best practices. Don't implement yet." And: "I told u I don't know
details. Just make the plan based on best practices."

Status: **Phase 0 and Phase 1 built** (Phase 0: `php artisan posters:spike`, findings in
§ 17. Phase 1: Admin → Posters, `docs/POSTERS.md`). Phases 2–3 wait for the owner's go.
Every choice below is made from print and design best practice, so nothing has to be known
up front: the defaults in § 14 work with a typical outsourced UV print shop, and each one
can be changed later in the app (per print shop) without new code.

Revised 2026-10-17 after a review checked every claim against the code on `main`. Where a
point rests on the code, the file is named. The review's corrections that were kept, and
the three it got slightly wrong, are listed in § 16.

---

## 1. The goal in one paragraph

A new **Posters** page (Customers & Marketing → Posters, beside TV Signage and Social Hub,
with a card on Labels → Make a label pointing to it; § 5.1 says why it is not a Labels tab).
Anyone with permission picks what the poster is for, picks a look, and fills it in. The
poster pulls the dish, photo, price, offer and hours from the system, so it is right when it
is made. It reflows to A5, A4, A3 or A2 and comes out as a **print-ready file the print shop
accepts first time**: correct bleed, colour and resolution, a sharp vector logo, and white
and gloss instructions for UV. A spec sheet goes with each file. Every poster stays on the
server and can be reprinted or changed. The system says when a poster is out of date (price
changed, offer ended) and when it should come down.

## 2. Principles

1. **The data lives in one place.** Prices from the menu (`Item::displayPriceInfo()`),
   offers from Promotions (`App\Models\Promotion`) and Daily Specials, hours from the Admin
   schedule (`App\Support\OpeningHoursText`), Ramadan times from `App\Domains\PrayerTimes`,
   table QR codes from `RestaurantTable::qrUrl`. A poster stores *which* dish or offer it
   shows, never a copy of the price.
2. **Brand locked, words free.** Only the palette in `docs/brand/PALETTE.md`, the vector
   logo (§ 6.4) and the label fonts in `backend/public/fonts/pdf/` (Plus Jakarta Sans,
   DM Serif Display, Noto Sans Thaana). The layout rules are fixed. Staff change words,
   photos and numbers.
3. **No blank canvas.** Choices, not tools: purpose, layout, mood, photo style, language,
   size. The labels drag designer is offered only for fine-tuning.
4. **The print shop gets what it asks for.** Every export passes a preflight check (§ 8).
   A file that would come back from the shop never leaves.
5. **Same habits as Labels.** Picture cards, a live preview, tap to edit, Save as
   template, a saved list with Print again (`App\Models\LabelJob`, `App\Domains\Labels\Reprint`).
6. **Reuse before building.** § 12 lists what already exists and is reused.
7. **Plain words on screen.** "Bleed", "White layer" and "Gloss layer" each carry a
   one-line explanation.

## 3. Sizes

| Size | Portrait (mm) | With 3 mm bleed (mm) | Typical use |
|---|---|---|---|
| A5 | 148 × 210 | 154 × 216 | Fliers, table tents, counter cards |
| A4 | 210 × 297 | 216 × 303 | Counter, door, notices |
| A3 | 297 × 420 | 303 × 426 | Wall, window, menu board |
| A2 | 420 × 594 | 426 × 600 | Window, entrance, big promotions |

Each also comes landscape. A custom size from 90 × 50 mm to A0 (841 × 1189 mm) covers
banners and odd boards. **One design gives every size**, downloaded as one ZIP with a
preflight result per size. Screen sizes come from the same design in Phase 3: 1080 × 1080,
1080 × 1350, 1080 × 1920 (social) and 1920 × 1080 (TV).

**Margins:** 3 mm bleed beyond the cut; a safe zone 5 mm inside the cut on A5 and A4 and
8 mm on A3 and A2. **Mounting keep-outs:** when the poster is mounted with stand-offs or
eyelets (a step 4 choice), each corner gets a 15 mm circle (20 mm on A2) treated like the
safe zone and drawn faintly in the preview.

## 4. Layouts and purposes

### 4.1 Eight layouts, many purposes

Forty-five separate layouts would be 45 × 4 sizes × 2 orientations × up to 5 moods × 3
languages, about 5,400 combinations to test. Instead there are **eight layouts**, and each
purpose is a **preset** on top of one (like `LabelTemplates::BUILTIN` rows): the layout,
the default words in both languages, what it binds to, and the moods that suit it. People
still pick purpose cards; the tests cover eight layouts.

| Layout | Shape | Used by |
|---|---|---|
| `hero_photo` | One big photo or cut-out, headline, price or line | New dish, dish of the day, chef's pick, event |
| `price_card` | Big number (price or percent), what it is, the period | Happy hour, discount, price drop, % off all, 2 for x, BOGO |
| `list` | Rows of dishes with prices, optional small photos | Category, mini menu, drinks, menu board, best sellers |
| `hours_grid` | Days and times, a note | Opening hours, holiday hours, Ramadan, Eid |
| `qr_card` | A large QR, what it does, short words | Scan to order, table tent, review, Wi-Fi, social, pay |
| `notice` | Headline and text, no photo | Hiring, hygiene, staff only, plain notice |
| `compare` | Old against new, or two to three dishes side by side | Item discount, combo, meal deal |
| `collage` | Two to four photos with one headline | Iftar menu, catering, grand opening |

### 4.2 How a layout fits

Modelled on the complaint poster, which already does this for one design
(`App\Support\PosterCardSpec`, `resources/views/complain-poster.blade.php`,
`complain-poster-sheet.blade.php`):

- **Slots**, each typed: headline, subhead, price, old price, badge, photo, cut-out, logo,
  QR, body, list, dates, footer, strip.
- **Header and footer never give way.** The middle drops lines in a fixed order when space
  runs out, like `PosterCardSpec`'s drop order.
- **Type-size floors** per size (§ 8 distance rule), and a minimum QR size.
- **Frames in relative units** of the safe area, so one layout fits every size.
- **Text measured before drawing**, with ascent and descent (`App\Domains\Labels\LabelText`),
  so fit is decided without rendering.
- **Moods**: `rust`, `cream`, `dark`, `gold`, `photo` (a full photo with a shaded panel).
- **Languages**: English, Dhivehi, or both. Dhivehi alone mirrors the layout right to left.
  With "both", any typed slot missing its Dhivehi twin is flagged.

### 4.3 The purposes (presets)

**Offers and prices:** happy hour, dish on discount, new lower price, buy one get one,
2 for MVR x, meal deal, x% off everything (from an automatic promotion with its period),
weekend special, student or staff offer, loyalty points, gift cards, bring a friend,
flier with a coupon code.

**Dishes:** new on the menu, dish of the day or week (a dish or a Daily Special), best
sellers (real sales, honouring "Keep out of best sellers"), chef's pick, spicy challenge,
a whole category, mini menu, menu board, drinks and juices, allergen guide, halal and
dietary marks.

**Times and seasons:** opening hours, holiday hours or closed, Ramadan hours (iftar and
suhoor from Prayer Times), iftar menu, Eid, national day, event night, opening or
anniversary, we cater, order ahead.

**Ordering and service:** scan to order, table card (one per table, its own QR), we
deliver, ways to pay, Wi-Fi card (a QR that joins the network), tell us how we did (the
complaints box QR), follow us.

**The complaint poster already exists** on the labels engine (dompdf): `/complain/poster`,
`/complain/poster/sheet` and `/complain/poster/sheet.pdf` (`backend/routes/web.php` lines
88 to 92, `ComplaintBoxPageController`, `App\Support\PosterCardSpec`,
`complain-poster*.blade.php`). So two engines never draw the same poster: in Phase 1 the
"tell us how we did" card opens the existing complaint poster as it is; in **Phase 2 Posters
takes it over**. Its fit rules (`PosterCardSpec`) become the `qr_card` layout's, and the old
routes forward to the new poster so printed links and bookmarks keep working.

**Inside the shop:** we're hiring, wash your hands, staff only, storage temperatures, plain
notice.

The Templates tab shows how often each purpose is used (from `posters.template_key`), so the
library grows from real use.

### 4.4 Words and data on every poster

- **Prices:** a dish with sizes prints "From MVR x" (`Item::displayPriceInfo()['from']`),
  or the chosen size's own price. The labels fixed exactly this mistake on 2026-10-16.
- **GST line:** every poster with a price carries a footer line in both languages. When
  menu prices include GST (`GstSettingsService::taxInclusive()`), it says "Prices include
  GST"; otherwise "GST x% is added" with the live rate (`GstSettingsService::defaultTaxRateBp()`).
  It can be moved, not removed.
- **Offer times** come from the promotion (`starts_at`, `expires_at`, `days_of_week`,
  `starts_time`, `ends_time`), and Hijri dates from Signage's `hijri` date format.
- **Take-down date** on every poster: the bound offer's end, or a typed event date.

### 4.5 Templates of your own

Save as template on any poster keeps its purpose, layout, mood and fixed words, without the
dish, photo or offer (Labels round 7 rules). Start from offers built-in purposes, saved
templates and earlier posters. A saved template can be locked (`posters.manage`) so staff can
only fill it.

## 5. Screens

### 5.1 Where it lives

Its own page, **Posters** (`/posters`), in Customers & Marketing next to TV Signage and Social
Hub (`components/navConfig.ts`), with tabs **Make a poster**, **My posters**, **Templates** and
**Print shops**. Labels already has seven tabs (`LABELS_TABS` in `pages/LabelsHub.tsx`), and a
Posters tab with its own tabs inside would nest three deep, which the 2026-10-16 nav audit
flagged. The owner asked for it "in labels", so Labels → Make a label carries a card "Making
a poster? Posters" that opens it.

### 5.2 Make a poster

1. **What is it for?** Purpose cards in groups (Offers, Dishes, Times, Ordering, Inside).
2. **Pick a look.** Thumbnails of the suitable layouts and moods, drawn with the chosen data.
3. **Fill it in.** A live preview beside the form (a bar under the header below 1024 px, as
   with labels). Pick a dish, offer or category and it fills. Tap a part of the preview to
   edit only that part. Choices: mood, photo style (full, cut-out, none), language, sizes.
4. **Check and send.** Preflight (§ 8), material and finish (§ 6), mounting, layout on the
   sheet (§ 6.5), the spec sheet, then **Download for print** (one ZIP), and from Phase 2
   **Send to print shop** (§ 9). In Phase 1 the ZIP holds everything the shop needs, ready to
   send by WhatsApp, Viber or email by hand.

**My posters:** every poster with its state, take-down date and place (Window, Door,
Counter, Tables, Kitchen, Outside: a list the owner edits, not free text), a **Should be
down** list, Print again, Duplicate, Rename in place, Pin, and the version history (§ 10).

The admin rules apply: phone, tablet and computer layouts, nothing scrolls sideways, brand
tones on chips, lucide icons, `Btn` sizes, dark mode.

## 6. Printing for UV, outsourced

### 6.1 What the print shop gets

| What | Best practice | Why |
|---|---|---|
| File type | PDF/X-4, one page per file, one file per size | The print standard: fonts embedded, colour defined |
| Page boxes | MediaBox and BleedBox at trim + 3 mm, TrimBox at trim | The shop's software reads them |
| Crop marks | Off by default, on per shop | Most shops add their own |
| Colour | CMYK for text and shapes; the logo as Phase 0 decides (§ 6.4); photos RGB with their profile (allowed in PDF/X-4) | Exact brand colours; photos keep their range |
| Profile | Output intent FOGRA39 (ISO Coated v2) by default, per shop | Tells the shop what the colours mean |
| Black | Small text 100 % K; large black areas rich black (C60 M40 Y40 K100) | Sharp text, deep blacks |
| Total ink | At most 300 % | Safe UV curing |
| Fonts | Embedded, subset | Nothing changes at the shop |
| Logo | Vector (§ 6.4) | Sharp at any size |
| QR | Error correction M; H when the logo sits in it; never glossed | Scans from a distance and through glare |
| Mirroring | A material flag for window vinyl printed from inside; the preview stays readable | Read correctly from the street |
| File name | `BG-POSTER-<code>-<size>-<material>-v<n>.pdf`, masks `…-WHITE.pdf` / `…-GLOSS.pdf` | Clear versions for both sides |

Vendor guides differ on names and bleed, so these are defaults each shop can override in § 9:
[Publication Station flatbed guide](https://ps.wdka.nl/wiki/Flatbedprinter),
[Tayda UV printing guide](https://www.taydaelectronics.com/uv-printing-service-guide-v1),
[4OVER4 white ink set-up](https://v2.4over4.com/guide/how-to-setup-white-ink-printing-with-spot-colors-in-adobe-illustrator),
[RW Marketing artwork guide](https://cbs.rwmarketing.com.au/resources/artwork).

### 6.2 Materials and finishes

| Material | White | Gloss | Notes |
|---|---|---|---|
| Paper / poster paper | No | Optional | Fliers, short offers |
| Foam board (5 mm) | No | Optional | Counter and wall |
| PVC board | No | Optional | Long-lived, wipe-clean |
| White acrylic | No | Yes | Menu boards |
| Clear acrylic | Yes, under printed areas only | Optional | Window and door signs |
| Aluminium composite (ACP) | Yes on brushed silver | Optional | Outdoor |
| Window vinyl, read from outside | Yes, plus mirrored | No | Printed reversed |
| Self-adhesive vinyl | No | Optional | Tables, doors |

### 6.3 White and gloss: mostly the shop's job

Small-shop UV flatbeds (Roland, Mimaki, Mutoh) build the white underlay in their RIP
software from the artwork; "white under all printed areas" is an operator setting. Named
spot layers in the file matter only for **selective** white on clear material and for
**spot gloss**, and each RIP names them differently (`RDG_WHITE` in VersaWorks,
`SpotColor_White` in RasterLink, `White` elsewhere). So:

- **Phase 1:** white and gloss are **words on the spec sheet** ("White under all printed
  areas", "Gloss on logo and price"), plus an optional **mask PDF per layer**: the same page
  boxes, black where the ink goes (`…-WHITE.pdf`, `…-GLOSS.pdf`). Every RIP can use a mask.
  The white mask is choked 0.2 mm so white never shows at the edges.
- **Phase 2:** spot layers inside the file, named per shop and set to overprint, built only
  once a shop says it wants them. The "Spot names" preflight check comes with them.
- Gloss is never put on a QR or on text under 14 pt, and both layers are previewed on screen
  as a striped overlay.

### 6.4 The logo as vector

The logos served today are 1080 × 1080 PNGs (`backend/public/brand/logo-light.png`,
`logo-dark.png`; `App\Domains\Content\BrandImages`): a 250 mm logo on A2 would be 110 ppi.
`backend/public/brand/logo-animated.svg` and `logo-animated-dark.svg` hold the mark as
vector paths: seven paths, the wordmark included as paths (ids `text-bg`, `text-amp`,
`text-cafe`), and no `<text>` or `<image>` elements, so the wordmark check is done.

Two things stop the file going straight into the PDF as CMYK:

- It fills two shapes with **gradients** (`<linearGradient>` ids `bgl-drop` and `bgl-amp`), and
  TCPDF's SVG reader (`ImageSVG()`) writes RGB colours and handles gradients only partly.
- Its rust is **`#B84B0C`**, one step off the palette's **`#B74B0C`** (`docs/brand/PALETTE.md`).

Phase 0 makes a static `logo.svg` in both colourways (animation and `<style>` removed, the rust
set to the palette's `#B74B0C`) and decides one of two ways to put it in the print PDF:

- **(a) Redraw the seven paths** with TCPDF's own path drawing in the swatch-card CMYK
  (`BrandPalette::cmyk()`), the two gradients flattened to solid fills. The logo prints in exact
  brand colour; the cost is losing its slight shading, so Phase 0 shows the flat version beside
  the original for the owner to judge. **Recommended.**
- **(b) Keep the logo RGB** under the FOGRA39 output intent, gradients and all, and say so in
  § 14. Simpler, but the shop's conversion decides the rust.

**Phase 0 took way (a)** (`App\Domains\Posters\LogoVector`, `SvgPath`): the seven paths are
parsed from the SVG and filled in CMYK with TCPDF's own path operators; the drop gradient
becomes flame, the ampersand gradient amber. The still logos are committed as
`backend/public/brand/logo.svg` and `logo-dark.svg` (regenerate with
`posters:spike --logo-svg`). The owner judges the flat mark against the original on the
printed A3; if the shading is missed, (b) is one line in `HeroPoster` (`ImageSVG` of the still
file) and § 14 changes.

An uploaded logo that is only a PNG prints with an amber warning above A4.

### 6.5 Layout on the sheet (imposition)

Shops charge per sheet, so a step 4 choice lays posters out on the printed sheet
(`PosterImposition`, reusing the complaint sheet's n-up arithmetic in
`complain-poster-sheet.blade.php`): **tent** (two A5 panels on A4, the second turned 180°,
a fold mark), **2-up**, **4-up**, with crop marks on the sheet.

### 6.6 Brand colours in CMYK

The brand colours are defined in RGB (`App\Domains\Content\BrandPalette`). Phase 0 prints a
**swatch card**: an A5 with five CMYK candidates for each brand colour, the hex beside each.
The owner picks the best under shop lights, and the chosen letters go into the
`poster_brand_cmyk` setting (`App\Domains\Posters\BrandCmyk::SETTING`, JSON `{"rust":"B",…}`;
until then candidate A, the plain conversion, is used) and `docs/brand/PALETTE.md`. It is the
cheapest way to keep the rust looking like the rust.

## 7. Photos

Media masters are capped at **3200 px on the long edge** (`MenuImageProcessor::MASTER_MAX_EDGE`).
Across a full-bleed poster that is 376 ppi on A5, 268 on A4, 191 on A3 and 135 on A2.

- **A poster-grade upload** in the poster photo picker keeps up to **4800 px**. Menu uploads
  are untouched.
- A photo with no master (only a web crop) cannot be used on a poster.
- The cut-out style uses the dish photo packs (`scripts/food-photo-pack.py`) or a cut-out made
  on upload.
- Colour: photos stay RGB with their sRGB profile under PDF/X-4. The server has GD and no
  Imagick (`docs/IPHONE_MEDIA_UPLOAD_FIX_PLAN.md`), so CMYK photo conversion is not planned;
  a shop asking for PDF/X-1a is handled in Phase 2 if the host can run Ghostscript.
- GD is used once per export to scale a photo to its target ppi, cached by hash. The PDF
  embeds the JPEG as it is.

## 8. Preflight: checked before anything is sent

A poster cannot be sent until every red check passes. Amber warns.

| Check | Red | Amber |
|---|---|---|
| Bleed | A full-bleed photo or band stops at the trim | |
| Safe zone and keep-outs | Text, logo, price or QR outside the safe zone or in a mounting circle | |
| Photo resolution | Under 100 ppi, or no master | Under 200 ppi on A5 and A4, under 120 ppi on A3 and A2 |
| Logo | | A bitmap logo above A4 |
| Text size for distance | Body below A5 9 pt, A4 11 pt, A3 16 pt, A2 22 pt; Dhivehi 1.2× those | Headline under 3× body |
| Contrast | Text below 4.5 : 1 on its background | Below 7 : 1 on A2 window posters |
| Text fit | A slot overflowed | A slot shrank to its floor |
| Languages | | "Both" with a typed slot missing its Dhivehi twin |
| QR | Under 20 mm, quiet zone cut, or glossed | Under 30 mm on A3 and A2 |
| Data | A bound dish hidden or deleted, an offer already ended | An offer ends within 2 days |
| Prices | A printed price not matching live data | |
| White | Clear material with no white instruction | |
| Spot names (Phase 2) | A layer name not matching the shop's settings | |
| Total ink | Above 300 % | Above 280 % |

Distance rule: about 25 mm of letter height for every 3 m away. Window posters get larger
"seen from the street" minimums.

## 9. Print shops: sending and tracking

- **A print shop is a supplier.** `App\Models\Supplier` already holds phones, email, bank
  details and `lead_days`; it gains a `kind` (`supplier` or `print_shop`) and `print_prefs`
  JSON: PDF/X flavour, colour profile, bleed (3 or 5 mm), crop marks, white and gloss names,
  masks or spot layers, materials offered. Purchasing lists only `supplier`; Posters only
  `print_shop`.
- **Send to print shop** makes one order: the print PDF per size, the masks if chosen, a proof
  JPG (1200 px on the long edge, never print size), and a one-page **spec sheet** (poster
  code, sizes, quantity per size, material, thickness, finish, white and gloss in words,
  mounting, layout on the sheet, deadline, delivery or collection, contact). Sent by email,
  or downloaded as one ZIP to send by WhatsApp or Viber.
- **Order states:** Draft → Proof approved (only when proof approval is on) → Sent → Quote
  approved → Received → Up → Taken down, each timed and signed. A quote is typed on the Sent
  step; **Quote approved** is the owner's yes to the shop's price.
- **Costs** become an `App\Models\Expense` with the shop's `supplier_id`, so monthly poster
  spend is already in Finance.
- **Proof approval** (a switch, off by default; the step is **Proof approved**): the owner approves the poster before it is sent, from the phone through a
  signed link valid 24 hours, the way social posts are approved
  (`App\Domains\Social\Services\SocialPostApproval`, `SocialApprovalPageController`),
  including from the Telegram alert.

## 10. Staying true after printing

- **Versions:** every export keeps a hash of the bound data and a readable diff ("v3: price
  MVR 45 → 50"). The diff is also the out-of-date alert text.
- **Out of date:** a changed price, dish, offer or opening hour marks the poster, with
  **Make the new one**.
- **Should be down:** posters past their take-down date are listed on My posters and the owner
  is reminded the day before and on the day.
- **Alerts:** two registry rows, `owner_poster_stale` and `owner_poster_ending`, each with a
  default audience in `AlertAudience::DEFAULT_GROUPS`, asked through `AlertSwitch::isOn()`
  (`SmsTypeRegistry`). Nothing else: no settings key, no second switch.
- **Scans:** every printed poster carries a small code; scanning `/p/{code}` opens the dish or
  offer and counts the scan per poster. Modelled on `App\Domains\Labels\BatchLink` (`/b/{code}`)
  and `App\Models\ItemShareEvent` (item, channel, surface, time; no personal data).

## 11. More than paper (Phase 3)

- **TV:** "Send to TV" makes one 1920 × 1080 PNG and one image slide. Signage already has an
  image element bound to a URL (`SignageTemplateFactory`) and a `date_end` in its schedule
  (`SignageScheduleMatcher`); the take-down date becomes `date_end`. No new element type.
- **Social:** a draft post through `SocialPublisher`, so approval, best time and channel rules
  apply. The images are `App\Domains\Social\Services\WeeklyMenuCard` (a GD brand card at
  1200 × 630) with other sizes. Share to WhatsApp and Viber from a phone too.
- **Website:** optionally an offer poster as the home banner for the offer's period.

## 12. Technical design

### 12.1 Reused, not rebuilt

| Need | Already there |
|---|---|
| Fit with drop order, type floors, QR minimum, n-up | `App\Support\PosterCardSpec`, `complain-poster*.blade.php` |
| Pieces in mm drawn as HTML/SVG and as a bitmap | `App\Domains\Labels\StickerDesign`, `LabelRaster` |
| Text measuring with ascent and descent | `App\Domains\Labels\LabelText` |
| Dhivehi in visual order, composed font | `App\Support\ThaanaVisual`, `NotoSansThaana-*-composed.ttf` |
| QR | `QrSvg`, `BatchLink` |
| Saved list, Print again | `App\Models\LabelJob`, `App\Domains\Labels\Reprint` |
| Badges | `App\Domains\Labels\LabelBadges` |
| Social card | `App\Domains\Social\Services\WeeklyMenuCard` |
| Approval by signed link | `SocialPostApproval`, `SocialApprovalPageController` |
| Alerts | `SmsTypeRegistry`, `AlertSwitch`, `AlertAudience` |
| TV slide | Signage image element, `SignageScheduleMatcher` `date_end` |
| Print shop, costs | `App\Models\Supplier`, `App\Models\Expense` |
| Hours, Ramadan, Hijri | `OpeningHoursText`, `App\Domains\PrayerTimes`, Signage `hijri` |
| Offers, specials, prices | `Promotion`, `DailySpecial`, `App\Services\SpecialPricingService`, `Item::displayPriceInfo()` |
| GST wording | `App\Domains\Gst\Services\GstSettingsService` |

### 12.2 New code

- `App\Domains\Posters`: `PosterLayouts` (the eight), `PosterPurposes` (the presets),
  `PosterLayout` (slots and fit to pieces), `PosterData` (bindings), `PosterPreflight`,
  `PosterMasks` (white and gloss masks), `PosterImposition`, `PosterExport` (print PDF),
  `PosterProof` (JPG), `PosterStaleness`, and `ExportPosterJob`.
- Admin `components/posters/`: `MakePosterWizard`, `PosterEditor`, `PosterPreflightCard`,
  `PrintShopsCard`, `PosterOrders`; the page `pages/PostersHub.tsx`.

### 12.3 Data

| Table | Holds |
|---|---|
| `posters` | name, `template_key` (purpose), layout, mood, language, sizes, orientation, slot values (JSON), bindings (dish, size, promotion, category ids), overrides, state, take-down date, place, version, created_by |
| `poster_templates` | your own templates: base purpose, fixed values, locked flag |
| `poster_exports` | poster, version, size, material, masks, file paths, preflight result, bound-data hash, readable diff |
| `poster_orders` | supplier (a print shop), exports, quantities, material, finish, mounting, layout on sheet, deadline, state history, quote, expense id, place |
| `poster_scans` | poster code, time |
| `suppliers` (existing) | gains `kind` and `print_prefs` |

### 12.4 The print PDF: the one hard part

The labels engine (dompdf) draws only RGB, with no spot colours, overprint, page boxes or
output intent. **TCPDF** is the choice: pure PHP, runs on the current host, with CMYK colours,
`AddSpotColor` / `SetFillSpotColor`, `setOverprint`, page boxes (`setPageBoxes`, or the
`AddPage` format array) and SVG placement (`ImageSVG()`). It is **not installed**:
`backend/composer.lock` lists `tecnickcom/tcpdf` only as another package's dev requirement
and suggestion, so it is one new Composer dependency.

TCPDF has **no PDF/X mode**. It writes the ICC output intent and XMP only in PDF/A mode. PDF/X-4
needs an `OutputIntents` entry with `GTS_PDFX`, a `pdfxid` XMP block, `Trapped` in the info
dictionary and no encryption, so Phase 0 built a small subclass
(`App\Domains\Posters\Pdf\PdfX4Document`) that overrides `_putcatalog` and `_putinfo` and adds
the `pdfxid` block through `setExtraXMPRDF()` (no `_putXMP` override needed). It also drops
TCPDF's default **Helvetica**, which is a non-embedded core font and would fail PDF/X on its
own: the constructor and every `AddPage()` select it, so the subclass removes it after both.
`tests/Feature/Posters/PdfX4DocumentTest` parses every export for the version, output intent,
page boxes, `pdfxid` block, Info keys and embedded fonts, so a TCPDF upgrade cannot quietly
break it. Acrobat Preflight is the owner's step (`docs/POSTERS.md`).

**Fonts:** converted on first use with `TCPDF_FONTS::addTTFfont()` from `backend/public/fonts/pdf/`
(Plus Jakarta Sans 400, 500, 700, 800; DM Serif Display regular and italic;
`NotoSansThaana-Regular-composed` and `-Bold-composed`; `LabelSymbols`) into
`storage/app/posters/fonts/` (`PosterFonts`), not committed: the made files are derived and
the host writes to storage anyway.

**Dhivehi:** passed in visual order from `ThaanaVisual` with TCPDF's own bidi off. `setRTL(false)`
is not enough: TCPDF reorders any string matching its RTL *or* "Arabic" pattern, and the Arabic
pattern covers the Thaana block, so both `TCPDF_FONT_DATA` patterns are set to never match.
Composed glyphs sit in the Private Use Area, but bare letters (a final RAA, say) remain Thaana
code points and would otherwise be reordered a second time.

The **on-screen preview** stays HTML/SVG from the same pieces, and proofs come from GD, so the
browser never needs the print engine.

### 12.5 Exports on the queue

An A2 with two 4800 px photos is a 60 to 120 MB GD job plus TCPDF on shared hosting, so exports
run as a queued job (`ExportPosterJob`) with a "Preparing your file…" row and a toast when ready.
The job needs the **queue worker** running. On this host it is restarted every minute by the
crontab keepalive (`pgrep -f "queue:work.*public_html" || … queue:work redis`, in
`.cursor/rules/deploy-commands.mdc` § Crontab keepalive) and by `scripts/full-deploy.sh` on a
full deploy; a quick pull does not restart a stopped worker. So the "Preparing your file…" row
says "Taking longer than usual: the file is queued" after 3 minutes, and the existing queue worker
heartbeat (`QueueWorkerHeartbeat`, read by `SystemHealthService`) covers the rest. Proofs are 1200 px; photos are scaled once and cached by hash.

### 12.6 Permissions

Two new permissions: `posters.make` (make, export, send; through proof approval when that switch
is on) and `posters.manage` (templates, print shops, approve proofs and quotes, settings). The role
editor places permissions by **group name**, not by section: the "Customers and marketing" section
is built from the groups Customers, Complaints, Loyalty, Promotions, Events, Marketing, SMS and
Media (`apps/admin-dashboard/src/pages/SettingsPage/permissionSections.ts`). So both are seeded with
**group `Marketing`**, which lands them there with no change to that file; a group of their own
would need adding to that section's `groups` list, or they fall into "Other". Owner only until a role is given them. The new routes
add lines to `backend/tests/Fixtures/admin_route_permissions.txt`, asked once at the start of
Phase 1 (`CLAUDE.md`: route permissions change only with the owner's yes).

### 12.7 Tests

- Layout: each of the 8 layouts × 4 sizes × 3 languages with long sample text, no overflow
  (snapshot of pieces); every purpose preset lays out.
- Preflight: one test per check, red and amber.
- Export: page boxes, output intent, `pdfxid` XMP, `Trapped`, embedded fonts, CMYK text, RGB
  photo with profile, vector logo; masks with the same boxes.
- Staleness: a price change or an ended offer marks bound posters and sends one alert per person.
- Admin: wizard, tap to edit, preflight card, send flow at 390, 768, 1024 and 1366 px.
- Visual proofs: CI renders a PNG of each layout × size × language as an artifact.

## 13. Phases

| Phase | What | Done when |
|---|---|---|
| **0. Prove the file** — *built, awaiting the shop's print (§ 17)* | TCPDF with the PDF/X-4 subclass; one A3 `hero_photo` with Dhivehi, the logo by way (a) or (b) of § 6.4 (decided here, with the flat logo beside the original), CMYK brand colours and an RGB photo; page boxes; a `-WHITE.pdf` mask; the swatch card; spot layers and overprint tried but not required; host check for Imagick and Ghostscript; a worst-case A2 export timed on TEST | Acrobat Preflight passes PDF/X-4 and the shop prints the A3 and the swatch card without changes |
| **1. Make and send** — *built* | The `/posters` page; 8 layouts; 20 purposes (happy hour, dish on discount, new lower price, meal deal, % off everything, flier with a coupon, new dish, dish of the day, best sellers, category, mini menu, opening hours, holiday hours, Ramadan, scan to order, table card, we deliver, we're hiring, plain notice, tell us how we did, opening the existing complaint poster); live data with "From" prices and the GST line; A5 to A2 and layout on the sheet; preflight with the revised lines and keep-outs; queued export; spec sheet with white and gloss in words and optional masks; ZIP of all sizes; My posters with take-down dates and places | The owner sends a real happy hour poster and a table card set in under 5 minutes, and the shop prints both first time |
| **2. The shop and staying true** | Print shops as suppliers with preferences, **Send to print shop** by email, order states with Proof approved and Quote approved, costs as expenses, proof approval by signed link, spot layers inside the file on a shop's request, out-of-date and should-be-down alerts, versions and diffs, your own templates, the rest of the purposes, the complaint poster taken over (old routes forward) | A clear acrylic poster with white and gloss comes back right first time |
| **3. Everywhere** | TV slide, social drafts through `SocialPublisher`, scan counts per poster, website banner, A2 menu board | One offer goes on the window, the TV and Instagram from one design |

Each phase ends with tests, the admin build, `docs/POSTERS.md` (how to use it), the `CLAUDE.md`
note, merge, and the deploy command, as usual.

## 14. Defaults chosen (best practice)

Nothing here needs to be known now. A new print shop starts with these; if it says otherwise,
its card in § 9 changes and every file after follows it.

| Setting | Default | Why |
|---|---|---|
| File | PDF/X-4, one page per file | The current print standard; accepts photos with their profile |
| Bleed | 3 mm each side | The most common ask; 5 mm per shop |
| Crop marks | Off | Most shops add their own |
| Colour profile | FOGRA39 (ISO Coated v2) | The usual default for coated stock outside North America |
| Text and shape colour | CMYK from the swatch card (`BrandPalette::cmyk()`) | Exact brand colour every time |
| Logo colour | Way (a): redrawn in swatch-card CMYK, gradients flattened, rust `#B74B0C`; if Phase 0 picks (b), RGB under FOGRA39 and this row says so | Exact brand colour unless the owner prefers the shading |
| Photos | RGB with sRGB profile | Allowed in PDF/X-4; the shop converts for its inks |
| Black | 100 % K text, rich black (60/40/40/100) for large areas | Sharp text, deep black |
| Total ink | 300 % at most | Safe UV curing |
| Photo lines | Amber under 200 ppi (A5, A4) and 120 ppi (A3, A2); red under 100 | What the 3200 px masters and the 4800 px poster uploads allow |
| White and gloss | Words on the spec sheet, optional masks; spot layers only on request | Most shop RIPs make the white themselves |
| Layer names (Phase 2) | `White`, `Spot UV` | The most common; per shop |
| White choke | 0.2 mm | Hides white at edges without thinning text |
| QR | Error correction M, H with a logo inside, never glossed | Scans through glare |
| Material | Foam board 5 mm for A3 and A2, paper for A5 and A4 | Common and cheap |
| Finish | Matte | No glare under shop lights |
| Mounting | None; keep-outs when stand-offs or eyelets are picked | |
| Spec sheet | Always sent | Everything on one page |
| Proof approval | Off; the owner can switch it on (quotes are always approved by the owner) | Starts simple |
| Permissions | New `posters.make` and `posters.manage`, owner only at first | Posters separate from labels |
| PDF library | TCPDF with a PDF/X-4 subclass | Pure PHP, runs on this host |
| Place list | Window, Door, Counter, Tables, Kitchen, Outside | Editable |

## 15. Risks

- **Hosting limits:** memory and time on shared cPanel. Mitigated by the queue, the 4800 px cap,
  scaled and cached photos, and the A2 timing in Phase 0.
- **The PDF/X subclass** depends on TCPDF internals. Re-checked on every TCPDF upgrade by the test
  that parses the catalog and XMP.
- **TCPDF is in maintenance.** 6.11 raises an `E_USER_DEPRECATED` notice on construct ("migrate
  to tc-lib-pdf"); Laravel logs it and the exports run. The subclass touches only `_putcatalog`,
  `_putinfo`, the font tables and two static bidi patterns, so a move to tc-lib-pdf later is
  contained in `App\Domains\Posters\Pdf`.
- **Layout drift** at A5 and in Dhivehi. The CI proof PNG per layout × size × language catches it.
- **Shops differ.** The per-shop card in § 9 is the safety valve, and masks work with every RIP.

## 16. What changed in this revision

Kept from the review, each checked in the code:

- Photo lines lowered and a 4800 px poster upload added (`MenuImageProcessor::MASTER_MAX_EDGE` = 3200).
- A vector logo from `logo-animated.svg`; the served logos are 1080 × 1080 PNGs.
- TCPDF is not installed and has no PDF/X mode; a subclass is part of Phase 0.
- White and gloss start as spec-sheet words and masks; spot layers move to Phase 2.
- Reuse of `PosterCardSpec`, `WeeklyMenuCard`, `BatchLink`, `ItemShareEvent`, `SocialPostApproval`,
  Signage, `Supplier`, `Expense`, `OpeningHoursText`, Prayer Times, `Promotion`, `DailySpecial`.
- Eight layouts with purpose presets instead of 45 layouts.
- Print shops as suppliers, costs as expenses, shorter order states.
- Its own page under Customers & Marketing, with a card on Labels.
- Queued exports, small proofs, imposition, mounting keep-outs, the swatch card, one ZIP of all
  sizes, QR rules, mirroring, "From" prices, the Dhivehi size factor, take-down dates, places,
  versions, social through `SocialPublisher`, TV through one image slide, use counts.

Corrected from the review:

- **GST line.** There is no `gst_rate_bp` setting for this. The rate is
  `GstSettingsService::defaultTaxRateBp()`, and there is a `tax_inclusive` switch, so the line
  says "Prices include GST" only when it is on, and "GST x% is added" otherwise.
- **`BrandPalette::cmyk()`** does not exist yet (`App\Domains\Content\BrandPalette`); it is new.
- **The vector logo** has no text or bitmap elements, so the whole mark should be paths; Phase 0
  confirms the wordmark is there.

Second review (2026-10-17), six changes, each checked in the code: the logo's two gradients and
off-palette rust (`logo-animated.svg`: `bgl-drop`, `bgl-amp`, `#B84B0C`) mean Phase 0 picks
redrawn CMYK (recommended) or RGB, and the wordmark check is done; the existing complaint poster
(`backend/routes/web.php` 88 to 92) stays in Phase 1 and is taken over in Phase 2; permissions are
seeded in group `Marketing` (`permissionSections.ts`); "Proof approved" and "Quote approved" are
named apart; Send to print shop is marked Phase 2; the queue worker is kept up by the crontab
keepalive and full deploys, not quick pulls, and a stuck export says so.

## 17. Phase 0: what was built and found

Built on branch `cursor/posters-phase0-spike-d038` (how to run it: `docs/POSTERS.md`).

- `composer require tecnickcom/tcpdf` (6.11). `App\Domains\Posters\Pdf\PdfX4Document` writes
  PDF 1.6 with `/OutputIntents [/S /GTS_PDFX …]`, the FOGRA39 profile embedded when
  `scripts/install-poster-icc.sh` has run, `pdfxid:GTS_PDFXVersion` in the XMP, `/GTS_PDFXVersion`
  and `/Trapped /False` in Info, MediaBox = BleedBox at trim + 3 mm, TrimBox at the cut, every font
  an embedded TrueType subset, and no Helvetica.
- `php artisan posters:spike` writes `BG-POSTER-SPIKE-A3-foam-v1.pdf`, its `-WHITE.pdf` mask
  (black where ink goes, choked 0.2 mm), `BG-SWATCH-A5-v1.pdf`, an A2 timing run and
  `spike-report.json`. Verified with poppler and qpdf: `pdfinfo` reports "PDF subtype: PDF/X-4";
  `pdffonts` lists only embedded subsets; `pdfimages` shows the photo ICC-tagged at the size's
  ppi; `qpdf --check` is clean.
- **Timings (Cloud VM, PHP 8.4, GD):** A3 0.3 s, 1.7 MB, peak 65 MB; A2 0.5 s, 1.9 MB, peak
  71 MB. Of each file 1.4 MB is the embedded press profile, so a ZIP of all sizes carries it
  once per file; acceptable. Without the profile the A3 is 350 KB.
- **Host:** Imagick and Ghostscript absent, as expected; GD does the photo work; photos stay
  RGB with an sRGB profile tagged into the JPEG so PDF/X-4 accepts them.
- **Logo:** way (a) (§ 6.4). All seven paths use only M/L/C/Z; arcs would be refused.
- **Dhivehi:** TCPDF's "Arabic" bidi pattern covers Thaana; both patterns are disabled (§ 12.4).
- **Spot layers / overprint:** not attempted beyond the mask, per § 6.3 (masks work with every
  RIP; named layers wait for a shop's request in Phase 2).
- **Open, owner-side:** Acrobat Preflight (PDF/X-4 profile) on the A3; the shop prints the A3 on
  foam and the swatch card; the swatch letters go into `poster_brand_cmyk`; the flat logo is
  judged beside the original.
