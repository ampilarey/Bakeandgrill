# Posters: plan

Owner, 2026-10-17: "Sometimes I print different types of posters. Now I use other apps to
make posters. How about adding a poster feature to labels so all the posters will be in the
server, and it will be easier to use branding and logo. I use A5, A4, A3 and A2 mainly.
Many templates, easy to edit. We use UV printing." Then: "I outsource everything, so make
a detailed plan using best practices. Don't implement yet."

Status: **plan only, nothing built.** Every choice below is made from print and design
best practice, so nothing has to be known up front: the defaults in § 13 work with a
typical outsourced UV print shop, and each one can be changed later in the app (per print
shop) without new code. Each phase starts only on the owner's go.

Reviewed against the code on 2026-10-17: § 14 lists what the code already has, four facts
the plan had wrong, where it can be made smaller, what to add, and a revised Phase 0 and 1.
Read § 14 before starting Phase 0.

---

## 1. The goal in one paragraph

Admin → Labels gets a **Posters** tab. Anyone with permission picks what the poster is for,
picks one of many templates, and fills it in. The poster pulls the dish, photo, price,
offer and hours from the system, so it is right when it is made. It reflows to A5, A4, A3
or A2, and comes out as a **print-ready file the print shop accepts first time**: correct
bleed, colour, resolution, and white-ink and gloss layers for UV. A spec sheet goes with
each file. Every poster stays on the server and can be reprinted or changed. The system
says when a poster is out of date (price changed, offer ended) and when it should come down.

## 2. Principles

1. **The data lives in one place.** Prices from the menu, offers from Promotions, hours from
   the Admin schedule, Ramadan times from Prayer Times, table QR codes from Tables. A poster
   stores *which* dish or offer it shows, never a copy of the price.
2. **Brand locked, words free.** Templates use only the palette in `docs/brand/PALETTE.md`,
   the logos from Business Details and the label fonts (Dhivehi included). The layout rules
   are fixed in the template. Staff change words, photos and numbers.
3. **No blank canvas.** Choices, not tools: template, mood, photo style, language, size.
   The drag designer from labels (round 8) is offered only for fine-tuning.
4. **The print shop gets what it asks for.** Every export passes a preflight check before
   it can be sent (§ 7). A file that would come back from the shop never leaves.
5. **Same habits as Labels.** Make a poster works like Make a label: picture cards, a live
   preview, tap to edit, Save as template, a saved list with Print again.
6. **Plain words on screen** (Labels round 4): "Bleed", "White layer" and "Gloss layer" each
   carry a one-line explanation.

## 3. Sizes

| Size | Portrait (mm) | With 3 mm bleed (mm) | Typical use |
|---|---|---|---|
| A5 | 148 × 210 | 154 × 216 | Fliers, table tents, counter cards |
| A4 | 210 × 297 | 216 × 303 | Counter, door, notices |
| A3 | 297 × 420 | 303 × 426 | Wall, window, menu board |
| A2 | 420 × 594 | 426 × 600 | Window, entrance, big promotions |

Each also comes in landscape. A custom size is allowed from 90 × 50 mm to 841 × 1189 mm
(A0), for banners and odd boards. Screen sizes come from the same design in Phase 3:
1080 × 1080 (square post), 1080 × 1350 (portrait post), 1080 × 1920 (story) and
1920 × 1080 (TV slide).

**Margins:** 3 mm bleed beyond the cut, a safe zone 5 mm inside the cut on A5 and A4 and
8 mm on A3 and A2. Nothing that must be read sits outside the safe zone.

## 4. Templates

### 4.1 How a template is built

A template is a definition in code (like `LabelTemplates::BUILTIN`), not a drawing:

- **Slots**, each with a type: `headline`, `subhead`, `price`, `old_price`, `badge`,
  `photo`, `cutout` (a dish on a clear background), `logo`, `qr`, `body`, `list` (dishes
  with prices), `dates` (a range or times), `footer` (address, phone, website), `strip`
  (a coloured band).
- **Frames in relative units** (a share of the safe area), so one template fits every size.
- **Per-size rules**: on A5 the body text may drop and the list may shorten. On A2 the
  photo may run full bleed. The template says which slots are optional at which size.
- **Fit rules for text**: each text slot has a largest and smallest size and shrinks to
  fit. Below the smallest it does not overflow: the editor says "Too long for A5" and the
  preflight refuses it.
- **Moods**: each template supports some of `rust` (rust background, cream text), `cream`
  (cream background, rust and brown), `dark` (near-black, for night and photos), `gold`
  (gold accents, for festive) and `photo` (full photo with a shaded panel for text).
- **Languages**: English, Dhivehi, or both. A Dhivehi-only poster mirrors the layout right
  to left.

### 4.2 The first library (about 45 templates)

**Offers and prices**

| Key | Name on screen | Fills from |
|---|---|---|
| `happy_hour` | Happy hour | A promotion (percent, days, times) |
| `item_discount` | Dish on discount | A dish + promotion: old price struck, new price big |
| `price_drop` | New lower price | A dish (price) |
| `bogo` | Buy one, get one | A promotion or typed |
| `two_for` | 2 for MVR x | Typed price, one or two dishes |
| `combo` | Meal deal | Two or three dishes, one price |
| `percent_off_all` | x% off everything | An automatic promotion with its period |
| `weekend_special` | Weekend special | A dish or promotion, the days |
| `student_offer` | Student / staff offer | A promotion code |
| `loyalty` | Loyalty points | Loyalty settings |
| `gift_card` | Gift cards | Typed amounts |
| `referral` | Bring a friend | Referral settings |
| `coupon_flier` | Flier with a coupon | A promotion code, shown big with its end date |

**Dishes**

| Key | Name on screen | Fills from |
|---|---|---|
| `new_dish` | New on the menu | A dish (photo, name, price, short text) |
| `dish_of_day` | Dish of the day / week | A dish or a Daily Special |
| `best_sellers` | Best sellers | Real sales, top 3 or 5 (honours "Keep out of best sellers") |
| `chefs_pick` | Chef's pick | A dish |
| `spicy` | Spicy challenge | A dish (spice level) |
| `category` | A whole category | A category: every dish with its price |
| `mini_menu` | Mini menu | Chosen categories, A4 or A3 |
| `full_menu_board` | Menu board | The live menu, A2 |
| `drink_menu` | Drinks and juices | A category, with sizes and prices |
| `allergens` | Allergen guide | Each dish's allergens, from Details |
| `halal` | Halal / dietary marks | Badges |

**Times and seasons**

| Key | Name on screen | Fills from |
|---|---|---|
| `opening_hours` | Opening hours | The Admin schedule (`OpeningHoursText`) |
| `holiday_hours` | Holiday hours / closed | Typed dates and hours |
| `ramadan` | Ramadan hours | Prayer Times (iftar, suhoor) + the schedule |
| `iftar_menu` | Iftar menu / platter | Dishes or a platter |
| `eid` | Eid greetings / hours | Typed |
| `independence_day` | National day | Typed |
| `event_night` | Event night | Typed date, time, place |
| `grand_opening` | Opening / anniversary | Typed |
| `catering` | We cater | Catering contact and minimums |
| `preorder` | Order ahead | Pre-order rules (cut-off time) |

**Ordering and service**

| Key | Name on screen | Fills from |
|---|---|---|
| `scan_to_order` | Scan to order | The order app link (QR) |
| `table_tent` | Table card | One per table, its own QR (`RestaurantTable::qrUrl`); A5 folded |
| `delivery` | We deliver | Delivery areas, minimum, fee |
| `pay_options` | Ways to pay | Enabled payment methods |
| `wifi` | Wi-Fi card | Typed network and password (QR that joins the network) |
| `review` | Tell us how we did | The complaints box link (QR) |
| `social` | Follow us | Social links from Business Details |

**Inside the shop**

| Key | Name on screen | Fills from |
|---|---|---|
| `hiring` | We're hiring | Typed roles, a phone or QR |
| `hygiene` | Wash your hands | Fixed wording, both languages |
| `staff_only` | Staff only / notices | Typed |
| `storage_chart` | Storage temperatures | Label settings (storage lines) |
| `notice` | Plain notice | Typed headline and text |

Each template ships with at least two moods and works in all four sizes. More come later
from real use: the editor shows which templates are used most.

### 4.3 Templates of your own

- **Save as template** on any poster keeps its template, mood, slot settings and fixed
  words, without the dish, photo or offer (Labels round 7 rules).
- **Start from** offers built-in templates, saved ones and any earlier poster.
- A saved template can be locked (`posters.manage`) so staff can only fill it.

## 5. Making a poster (screens)

Labels → **Posters** tab, with the same shape as Make a label:

1. **What is it for?** Picture cards in groups (Offers, Dishes, Times, Ordering, Inside).
2. **Which template?** Thumbnails drawn from the real template with the chosen data.
3. **Fill it in.** One live preview beside the form (pinned bar under the header below
   1024 px, as with labels). Pick a dish, an offer or a category, and the poster fills.
   **Tap a part of the preview** to edit just that part (headline, photo, price). Choices:
   mood, photo style (full, cut-out, none), language, size and orientation.
4. **Check and send.** The preflight result (§ 7), the material and finish (§ 6), the
   spec sheet, then **Download for print** or **Send to print shop** (§ 8).

Other tabs inside Posters:
- **My posters**: every poster, with its state (Draft, Ready, Sent, Up, Out of date,
  Taken down), Print again, Duplicate, Rename in place, Pin.
- **Templates**: built-in and your own.
- **Print shops**: the shops you use and their file preferences (§ 8).

The admin layout rules apply: phone, tablet and computer layouts, nothing scrolls
sideways, brand tones on chips, lucide icons, `Btn` sizes, dark mode.

## 6. Printing for UV, outsourced

### 6.1 What the print shop gets

| What | Best practice | Why |
|---|---|---|
| File type | **PDF/X-4**, one page per file, one file per size | The print standard: fonts embedded, colour defined |
| Page size | The trim size plus 3 mm bleed each side, with the TrimBox and BleedBox set | The shop's software reads the boxes |
| Crop marks | Off by default, on per shop | Most shops add their own; some want them |
| Colour | CMYK for text, shapes and the logo; photos RGB with an ICC profile (allowed in PDF/X-4), or CMYK if the shop asks | Brand colours stay exact; photos keep their range |
| Profile | Output intent **FOGRA39** (ISO Coated v2) by default, per shop | Tells the shop what the colours mean |
| Black | Small text 100 % K only; large black areas rich black (C60 M40 Y40 K100) | Sharp text, deep blacks |
| Total ink | At most 300 % | Avoids smudging and slow curing |
| Resolution | Photos at 150 ppi at final size or better on A3 and A2 (seen from a distance), 300 ppi on A5 and A4 | The usual large-format rule |
| Fonts | Embedded, subset | Nothing changes at the shop |
| White ink | A spot colour layer named as the shop says (often `White` or `RDG_WHITE`), set to overprint | UV printers lay white under the colours on clear, dark or metal boards |
| Gloss (spot UV) | A spot colour layer named as the shop says (often `Spot UV` or `Varnish`), same size and position as the artwork, overprint | A raised, shiny logo or price |
| File name | `BG-POSTER-<code>-<size>-<material>-v<n>.pdf` | The shop and you can tell versions apart |

Sources: vendor guides differ on names and bleed, so these are defaults that each print shop
can override in § 8: [Publication Station flatbed guide](https://ps.wdka.nl/wiki/Flatbedprinter),
[Tayda UV printing guide](https://www.taydaelectronics.com/uv-printing-service-guide-v1),
[4OVER4 white ink set-up](https://v2.4over4.com/guide/how-to-setup-white-ink-printing-with-spot-colors-in-adobe-illustrator),
[RW Marketing artwork guide](https://cbs.rwmarketing.com.au/resources/artwork).

### 6.2 Materials and finishes

Each material sets defaults. Each print shop can turn materials off.

| Material | White layer | Gloss | Notes |
|---|---|---|---|
| Paper / poster paper | No | Optional | Fliers, short-lived offers |
| Foam board (5 mm) | No | Optional | Counter and wall posters |
| PVC board | No | Optional | Long-lived, wipe-clean |
| White acrylic | No | Yes | Menu boards |
| Clear acrylic | **Yes, under everything printed** | Optional | Window and door signs; see-through areas get no white |
| Aluminium composite (ACP) | Yes on brushed silver, no on white | Optional | Outdoor |
| Window vinyl (from outside) | Yes, plus mirrored print | No | Printed reversed, white behind |
| Self-adhesive vinyl | No | Optional | Table tops, doors |

### 6.3 How the layers are made

- **White layer**: made by the server from the artwork. Under every printed area (photos,
  logo, text, colour bands) on clear or dark materials, nothing in see-through areas. A
  choke (slightly smaller, 0.2 mm by default) so white never shows at the edges.
- **Gloss layer**: off by default. One switch, "Gloss the logo and price", puts gloss over
  the logo and the price. A template may also mark slots as glossable. Thin lines and text
  below 14 pt are never glossed (UV gloss does not hold fine detail).
- Both layers are previewed on screen as a striped overlay you can switch on and off.

## 7. Preflight: checked before anything is sent

A poster cannot be sent until every red check passes. Amber checks warn.

| Check | Red | Amber |
|---|---|---|
| Bleed | A full-bleed photo or band stops at the trim | |
| Safe zone | Text, logo, price or QR outside the safe zone | |
| Photo resolution | Under 100 ppi at final size | Under 150 ppi (A3, A2) or 300 ppi (A5, A4) |
| Text size for distance | Body below the minimum for the size: A5 9 pt, A4 11 pt, A3 16 pt, A2 22 pt | Headline under 3× body |
| Contrast | Text against its background below 4.5 : 1 | Below 7 : 1 on A2 window posters |
| Text fit | A slot overflowed | A slot shrank to its smallest size |
| QR | Smaller than 20 mm, or quiet zone cut | Smaller than 30 mm on A3 and A2 |
| Data | A bound dish is hidden or deleted, or an offer has ended | An offer ends within 2 days |
| Wording | Allergen guide or price not matching live data | |
| White layer | Clear material with no white layer | |
| Spot names | A layer name not matching the shop's settings | |
| Total ink | Above 300 % anywhere | Above 280 % |

The rule of thumb for distance: about 25 mm of letter height for every 3 m away.
Window posters get "Seen from the street" checks with larger minimums.

## 8. Print shops: sending and tracking

Because printing is outsourced, the plan includes the hand-off:

- **Print shops** (Labels → Posters → Print shops): name, contact, email, WhatsApp, and the
  shop's file preferences: PDF/X flavour, colour profile, bleed (3 or 5 mm), crop marks,
  spot names for white and gloss, materials they offer, and typical turnaround.
- **Send to print shop** makes one order with:
  - the print-ready PDF for each size,
  - a **low-resolution proof** (JPG) for a quick look,
  - a **spec sheet** (PDF, one page): poster code, sizes, quantity per size, material,
    thickness, finish (matte, gloss, spot UV), white layer yes/no, mounting (stand-offs,
    tape, eyelets), deadline, delivery or collection, contact person and phone,
  - sent by email from the system (the shop's address), or downloaded as one ZIP to send
    by WhatsApp or Viber from the phone.
- **Order states**: Draft → Sent → Quote received (amount, typed) → Approved → Printed →
  Received → Up (where, typed: "Window, front") → Taken down. Each change is timed and
  signed by who made it.
- **Costs**: the quote and the final amount are kept per order, so the owner sees what
  posters cost per month. Optionally linked to an expense in Finance later.
- **Proof approval**: a poster can need the owner's approval before it is sent (a switch,
  as with the wording lock on labels).

## 9. Staying true after printing

- **Out of date**: when a bound price, dish, offer or opening hour changes, the poster turns
  "Out of date" with what changed ("Price is now MVR 50.00, poster says MVR 45.00") and a
  **Make the new one** button that makes a new version and a new print order.
- **Ending soon**: an offer poster that is up gets a reminder the day before and on the day
  the offer ends: "Happy hour poster ends today: take it down".
- **Alerts** follow the notification rules in `CLAUDE.md`: new rows in the alert registry
  (`owner_poster_stale`, `owner_poster_ending`) with a default audience in
  `AlertAudience::DEFAULT_GROUPS`, one switch per channel on System → Notifications, the
  sender asking `AlertSwitch::isOn()`. No settings key of its own and no second switch.
- **QR on the poster**: every printed poster carries a small code. Scanning it opens the
  dish or offer, and the system counts scans per poster, so the owner sees which posters work.

## 10. More than paper (Phase 3)

- **TV slide**: send a poster to Signage as a slide (1920 × 1080), with its end date as the
  slide's end.
- **Social media**: square, portrait and story images, using the animated logo for stories;
  Share to WhatsApp and Viber from a phone.
- **Website**: optionally show an offer poster as the home page banner for the offer's period.

## 11. Technical design

### 11.1 Where the code goes

- `App\Domains\Posters`: `PosterTemplates` (the built-in library), `PosterLayout` (slots and
  fit into pieces, reusing the piece model of Labels: text, img, rect, line), `PosterData`
  (binds dishes, offers, hours), `PosterPreflight`, `PosterLayers` (white and gloss),
  `PosterExport` (the print PDF), `PosterProof` (JPG/PNG), `PosterStaleness`.
- Reused from Labels: `LabelText` measuring and fonts, `ThaanaVisual` and the composed
  Noto Sans Thaana files, `QrSvg` and `BatchLink`-style codes, `LabelBadges`,
  `BrandImages`, the media library's full-size masters, the drag designer's overrides.
  The logos `BrandImages` serves are 1080 × 1080 PNGs; a poster needs the logo as a
  vector (§ 14.2).
- Admin: `components/posters/` (`MakePosterWizard`, `PosterEditor`, `PosterPreflightCard`,
  `PrintShopsCard`, `PosterOrders`), the Posters tab in `LabelsHub`.

### 11.2 Data

| Table | Holds |
|---|---|
| `posters` | name, template key, mood, language, sizes, orientation, slot values (JSON), bindings (dish ids, promotion id, category ids), layout overrides, state, version, created_by |
| `poster_templates` | your own templates: base template key, fixed values, locked flag |
| `poster_exports` | each file made: poster, version, size, material, layers, file path, preflight result, a hash of the bound data at export time |
| `print_shops` | the shop and its file preferences (JSON) |
| `poster_orders` | shop, exports, quantities, material, finish, deadline, state history, quote and cost, where it went up |
| `poster_scans` | poster code, time (no personal data) |

### 11.3 The print PDF: the one hard part

The labels PDF engine (dompdf) draws only RGB, with no spot colours, overprint, trim boxes
or output intents, so it cannot make a PDF/X file with white and gloss layers. Options:

| Option | Spot colours, overprint, boxes | Thaana | New dependency | Notes |
|---|---|---|---|---|
| **TCPDF** (PHP library via Composer) | Yes (spot colours, overprint, CMYK, page boxes); an ICC output intent only in its PDF/A mode, so PDF/X needs a small override (§ 14.2) | Through the composed font already built for labels, fed in visual order with TCPDF's own bidi off | One Composer package (not installed today; `composer.lock` only lists it as a suggestion) | Pure PHP, runs on cPanel; PDF/X validity must be proven in a spike |
| Ghostscript after dompdf | Can convert to CMYK and PDF/X | As now | A system binary on the server | May not be on the host; no spot layers |
| Headless Chrome | No spot colours | Good shaping | Chrome on the server | Not on cPanel; no spot layers |
| A paid PDF API | Varies | Varies | External service and fees | Sends artwork outside |

**Recommendation: TCPDF**, proven first by a spike (Phase 0): one A3 poster with a photo,
Dhivehi text, a white layer and a gloss layer, checked in Acrobat Preflight (PDF/X-4) and
**sent with a first real order** (the spec sheet asks the shop to confirm the file is
fine). If a shop asks for something else, its preferences are changed in § 8 and the next
file follows them; if it needs a format TCPDF cannot make, fall back to Ghostscript conversion where the host allows, or deliver RGB PDF plus layer files
if the shop prefers that.

The **on-screen preview** stays HTML/SVG from the same pieces (like labels), and proofs are
PNG/JPG rendered with GD (as `LabelRaster` does), so the browser never needs the print engine.

### 11.4 Images

- Photos come from the media library's **full-size masters**, never the web crops. Masters
  are capped at 3200 px on the long edge today (`MenuImageProcessor::MASTER_MAX_EDGE`),
  which is under the § 6.1 targets for a full-bleed A2 and for A4 at 300 ppi; § 14.2 says
  what to do about it.
- The cut-out style uses the dish photo packs (`scripts/food-photo-pack.py`) or a new
  cut-out made on upload.
- Large photos are scaled once per export at the target ppi and cached by hash.
- Colour: photos kept RGB with their sRGB profile under PDF/X-4. CMYK conversion only if the
  shop needs PDF/X-1a, which needs Imagick or Ghostscript on the host (checked in Phase 0).

### 11.5 Permissions

Two new permissions, placed under Marketing in the role editor (`permissionSections.ts`):

- `posters.make`: make posters, export, send orders with the owner's approval if that switch is on.
- `posters.manage`: templates, print shops, approve orders, settings.

New routes add lines to `backend/tests/Fixtures/admin_route_permissions.txt`, which needs
the owner's yes (`CLAUDE.md` § Who may change something may see it): asked once, at the
start of Phase 1. Until a role is given them, only the owner has them.

### 11.6 Tests

- Layout: every template × size × mood × language lays out without overflow for a long
  sample (snapshot of pieces).
- Preflight: one test per check (red and amber).
- Export: the PDF has the TrimBox and BleedBox, the output intent, embedded fonts, and spot
  colours with the shop's names, set to overprint (parsed in the test).
- Staleness: changing a price or ending an offer marks bound posters out of date and sends
  one alert per person (`OneMessagePerEventTest` style).
- Admin: wizard, tap to edit, preflight card, send flow; phone, tablet and computer widths.
- Visual proofs: CI renders a PNG of every template at A4 as an artifact to look at.

## 12. Phases

| Phase | What | Done when |
|---|---|---|
| **0. Spike** | TCPDF test poster with white and gloss layers; Acrobat preflight; a first real order printed from it; host check for Imagick and Ghostscript | The shop prints it without changes |
| **1. Make and send** | Posters tab, wizard and editor, 20 templates (happy hour, item discount, price drop, combo, % off all, coupon flier, new dish, dish of the day, best sellers, category, mini menu, opening hours, holiday hours, Ramadan, scan to order, table tent, delivery, hiring, notice, review), live data, A5 to A2, preflight, print PDF with bleed, spec sheet, ZIP download, My posters | The owner makes and sends a real happy hour poster in under 5 minutes |
| **2. UV and the shop** | Materials, white and gloss layers, print shops with preferences, send by email, order states and costs, proof approval, out-of-date and ending-soon alerts, your own templates | A clear acrylic poster with white and gloss comes back right first time |
| **3. Everywhere** | The rest of the library (45+), TV slide, social sizes, scan counts per poster, website banner, menu board A2 | One offer goes on the window, the TV and Instagram from one design |

Each phase ends with tests, the admin build, `docs/POSTERS.md` (how to use it), the
`CLAUDE.md` note, merge, and the deploy command, as usual.

## 13. Defaults chosen (best practice)

Nothing here needs to be known now. These are the settings a new print shop starts with;
if a shop says otherwise, its card in § 8 is changed and every file after follows it.

| Setting | Default | Why this one |
|---|---|---|
| File | PDF/X-4, one page per file | The current print standard; accepts photos with their colour profile |
| Bleed | 3 mm each side | The most common ask; 5 mm switchable per shop |
| Crop marks | Off | Most shops add their own |
| Colour profile | FOGRA39 (ISO Coated v2) | The usual default for coated stock outside North America |
| Text and logo colour | CMYK, brand colours converted once and fixed | Exact brand colour on every poster |
| Photos | RGB with sRGB profile | Allowed in PDF/X-4; the shop's printer converts best for its inks |
| Black | 100 % K for text, rich black (60/40/40/100) for large areas | Sharp text, deep black |
| Total ink | 300 % at most | Safe for UV curing on every material |
| Resolution | 300 ppi on A5 and A4, 150 ppi on A3 and A2 | Viewing distance rule for posters |
| White layer name | `White` | The most common name; changeable per shop |
| Gloss layer name | `Spot UV` | The most common name; changeable per shop |
| White choke | 0.2 mm | Hides white at edges without thinning text |
| Material | Foam board 5 mm for A3 and A2, paper for A5 and A4 | Common, cheap, matches most use |
| Finish | Matte | No glare under shop lights |
| Spec sheet | Always sent with the file | The shop has everything in one page |
| File name | `BG-POSTER-<code>-<size>-<material>-v<n>.pdf` | Clear versions for both sides |
| Approval | Off; a switch for the owner to turn on | Starts simple |
| Permissions | New `posters.make` and `posters.manage`, owner only until given | Keeps posters separate from labels |
| PDF library | TCPDF through Composer | Pure PHP, runs on the current host, does spot colours and PDF/X |
| First 20 templates | The list in Phase 1 | The posters a restaurant prints most |
| Look | Matches the brand palette and the label designs | One brand across stickers, posters and screens |

Optional later: once a print shop shares its artwork guide or template file, its card in
§ 8 can be filled from it in a few minutes.

## 14. Review against the code (2026-10-17)

The plan was read next to the code it means to build on. Nothing below changes the goal in
§ 1 or the principles in § 2; it changes how much has to be built to get there, corrects
four facts, and adds what the first real posters will need.

### 14.1 What the code already has (verified)

Each of these is in the repository today and should be reused rather than rebuilt:

| Already there | Where | What it gives Posters |
|---|---|---|
| A poster laid out from real text, with floors on type size and a QR, at several sizes | `App\Support\PosterCardSpec`, `complain-poster.blade.php`, `complain-poster-sheet.blade.php` | The complaint-box poster is a one-template poster engine already: a header, a footer that never gives way, a middle that drops lines in a fixed order, and n-up sheets. Its fit rules are the model for § 4.1. |
| Pieces in millimetres drawn three ways: HTML/SVG on screen, dompdf for the PDF, GD for a bitmap | `StickerDesign`, `LabelSheetController`, `LabelRaster` | The screen preview and the JPG proof. GD draws the label fonts, Thaana in visual order with the composed face, pictures dithered or full colour. |
| Text measuring and the fonts, with ascent and descent | `LabelText` | Fit-to-slot and "Too long for A5" without rendering. |
| A share-able picture drawn with GD at a fixed size with brand colours | `Social\Services\WeeklyMenuCard` (1200 × 630) | The Phase 3 social sizes are this with different dimensions. |
| A per-print short code that opens a public page | `Labels\BatchLink` (`/b/{code}`) | The poster QR and scan count (§ 9): `/p/{code}` done the same way. |
| A scan/share event table with no personal data | `ItemShareEvent` (`item_id, channel, surface, created_at`) | The shape of `poster_scans`. |
| Signed approve/reject links that open a small page with the thing to approve | `Social\Services\SocialPostApproval` (`temporarySignedRoute`, 24 h), `SocialApprovalPageController` | Proof approval (§ 8) from the owner's phone, including from the Telegram alert. |
| An alert registry with one switch per channel | `SmsTypeRegistry`, `AlertSwitch`, `AlertAudience` | `owner_poster_stale` and `owner_poster_ending` are two rows, nothing else. |
| Screens that take an `image` element with a URL binding, and campaigns with a `date_end` | `Signage\Services\SignageTemplateFactory`, `SignageScheduleMatcher` | "Send to TV" is one 1920 × 1080 PNG and one slide; no new signage element type. |
| Shops the business pays, with phones, email, bank details and lead days; expenses that point at a supplier | `Supplier`, `Expense` (`supplier_id`) | A print shop is a supplier. |
| Opening hours as text, prayer times per island and day, Hijri dates | `OpeningHoursText`, `PrayerTimes` domain, Signage's `hijri` date format | The hours, Ramadan and Eid templates. |
| Offers with periods, days and times; specials with badges and sold counts | `Promotion` (`starts_at, expires_at, days_of_week, starts_time, ends_time, auto_apply, scope`), `DailySpecial`, `SpecialPricingService` | The offer templates and the "ends soon" check. |
| A dish's price with a "from" flag for sized dishes | `Item::displayPriceInfo()` | The price slot must print "From MVR 45.00" for a dish with sizes; the labels work on 2026-10-16 fixed exactly this mistake on stickers. |
| Saved jobs with a request hash, pin, print count and Print again | `LabelJob`, `Labels\Reprint` | My posters is the same list. |

### 14.2 Four facts the plan had wrong

1. **Photos are not big enough for the resolution targets in § 6.1.** Masters are capped at
   3200 px on the long edge. What that gives at the sizes with bleed:

   | Size with bleed | At the § 6.1 target | From a 3200 px master | Result under § 7 |
   |---|---|---|---|
   | A5, 154 × 216 mm, 300 ppi | 1819 × 2551 px | 376 ppi | fine |
   | A4, 216 × 303 mm, 300 ppi | 2551 × 3579 px | 268 ppi | amber |
   | A3, 303 × 426 mm, 150 ppi | 1789 × 2516 px | 191 ppi | fine |
   | A2, 426 × 600 mm, 150 ppi | 2516 × 3543 px | 135 ppi | amber |

   So every full-bleed A2 and every A4 would come out amber from the first day. Two changes,
   both cheap: set the amber line to **200 ppi on A5 and A4 and 120 ppi on A3 and A2** (red
   stays at 100; a poster is read from arm's length or further, and 250 ppi is the usual
   large-format comfort line), and let the poster photo picker **accept a poster-grade upload
   kept at up to 4800 px** (a second cap in `MenuImageProcessor`, used only by that picker,
   so menu uploads stay as they are). A photo that is only a web crop (no master) is red.

2. **The logo is a bitmap.** `BrandImages` serves 1080 × 1080 PNGs. On an A2 a 250 mm
   logo from that file is 110 ppi and prints soft. `public/brand/logo-animated.svg` holds the
   mark as vector paths, so Phase 0 adds a **static `logo.svg`** (the animated file with its
   `<style>` and animation removed, both colourways) and the PDF places the logo with
   TCPDF's `ImageSVG()`. The label stickers can keep the PNG; at label sizes it is fine.

3. **TCPDF does not have a PDF/X mode.** It has spot colours (`AddSpotColor`,
   `SetFillSpotColor`, `SetTextSpotColor`), overprint (`setOverprint`), CMYK fills, and
   page boxes (`setPageBoxes` or a `format` array with `MediaBox`, `BleedBox`, `TrimBox` on
   `AddPage`). An ICC **output intent** and the XMP block are written only in its PDF/A
   mode. PDF/X-4 needs an `OutputIntents` entry with `GTS_PDFX`, a `pdfxid` XMP block, a
   `Trapped` key in the info dictionary and no encryption. That is one subclass overriding
   `_putcatalog`, `_putXMP` and `_putinfo`; a known-size job, but the spike must include it
   and prove the result in Acrobat Preflight. Fonts must be converted once with
   `TCPDF_FONTS::addTTFfont()` for the four Plus Jakarta Sans weights, the two DM Serif
   Display faces, the two composed Thaana faces and `LabelSymbols` (all open licences, all
   embeddable); the converted files are committed under `public/fonts/pdf/tcpdf/`. Thaana is
   passed in visual order from `ThaanaVisual`, as the labels do, with TCPDF's own bidi off
   (`setRTL(false)`, `$rtl = false`), or the fili would be reordered twice.

4. **White and gloss layers are usually the shop's job, not the file's.** The UV flatbeds a
   small shop runs (Roland, Mimaki, Mutoh) make the white underlay in their RIP software
   from the artwork itself: "white under all printed areas", "flood white" or "white under
   image" is a menu setting for the operator. A named spot layer in the file is needed only
   for **selective** white (white as a design colour on clear acrylic) and for **spot gloss**,
   and even then the layer name differs by RIP (`RDG_WHITE` on Roland VersaWorks,
   `SpotColor_White` on Mimaki RasterLink, `White` elsewhere). So § 6.3 is reordered:
   - Phase 1 ships white and gloss as **words on the spec sheet** ("White ink under all
     printed areas; nothing in see-through parts. Gloss over the logo and the price.") and,
     when the shop asks for a file, a **separate mask PDF** per layer (black where ink goes,
     same page size and boxes, file name `…-WHITE.pdf` / `…-GLOSS.pdf`). Every RIP takes a
     mask; none depends on a spot name.
   - Spot layers inside the one file, with the shop's names, move to **Phase 2 and are
     built only after a shop confirms it wants them**. The "Spot names" preflight check
     goes with them.

   This takes the hardest part out of the Phase 0 spike: the spike proves TrimBox/BleedBox,
   embedded fonts, CMYK text, an RGB photo with its profile, the output intent and a mask
   file. Spot colours and overprint are tried in the same spike but do not gate it.

### 14.3 Make it smaller

- **Archetypes, not 45 layouts.** A template in § 4 is a layout × 4 sizes × 2 orientations ×
  up to 5 moods × 3 languages: 120 variants each, 5400 for the library, all of which § 11.6
  snapshots. Split the idea in two: about **eight layout archetypes** (`hero_photo`: full
  photo, shaded panel, headline, price; `price_card`: big price, old price struck, dish
  cut-out; `list`: dishes and prices in one or two columns; `hours_grid`: days and times;
  `qr_card`: a code with a short instruction; `notice`: headline and body; `compare`: two
  dishes or two prices side by side; `collage`: three to five photos with a band), and the
  **purposes** of § 4.2 as presets on top of them: which archetype, default words in both
  languages, which data to bind, which moods suit. "Happy hour" is `price_card` with a
  promotion bound and "Happy hour" as the fixed headline; "Dish of the day" is `hero_photo`
  with a Daily Special bound. The user still picks from the purpose cards in § 5; the test
  matrix shrinks to eight layouts, and a new purpose is a few lines of configuration (like a
  `LabelTemplates::BUILTIN` row), not a new layout.
- **A print shop is a supplier.** Add a `kind` (`supplier` | `print_shop`) and a JSON
  `print_prefs` column to `suppliers` instead of a `print_shops` table. A print order's
  quote and final cost then become an `Expense` with `supplier_id` set, so the monthly
  poster cost in § 8 is already in Finance, and the shop's phones, email and bank details
  are typed once.
- **Posters get their own hub.** Labels already has seven tabs, each with sub-tabs; a
  Posters tab holding My posters, Templates and Print shops nests three deep, which the
  admin nav audit flagged as the pattern that confuses. The plan already gives posters their
  own permissions and a different print path (a shop, not a roll). Put `/posters` under
  **Customers & Marketing** next to TV Signage and the Social Hub, with tabs Make a poster,
  My posters, Templates, Print shops; add one link card on Labels → Make a label ("Making a
  poster? Posters are here"). `LabelsHub` and `navConfig.ts` stay untouched otherwise.
- **Fewer order states.** Draft → Sent → Approved → Received → Up → Taken down. "Quote
  received" is a cost typed on the Sent row; "Printed" is a date the shop rarely reports.
- **Exports run on the queue.** An A2 with two 4800 px photos is a 60–120 MB GD job and a
  few seconds of TCPDF; on shared hosting that can pass `max_execution_time`. Export is a
  queued job with a "Preparing your file…" row and a toast when done (the queue worker and
  `AlertSwitch` already exist); the proof JPG is made at 1200 px on the long edge, never at
  print size. The PDF embeds the JPEG bytes as they are (TCPDF does not re-encode), so GD is
  needed only for the one-time scale to the target ppi, cached by hash as § 11.4 says.

### 14.4 Add

Print and hand-off:

- **Imposition.** A table tent is an A5 folded from an A4 sheet with the second panel upside
  down and a fold line; A5 fliers are printed 4-up on A3 and A4 fliers 2-up on A3, because
  shops charge per sheet. One `PosterImposition` step: `tent` (2 panels, one rotated 180°,
  fold mark), `2up`, `4up`, with crop marks on the sheet. The complaint-box sheet already
  does n-up; reuse its arithmetic.
- **Keep-out for mounting.** A board hung on stand-offs loses its corners: a 15 mm circle
  in each corner, 20 mm on A2. Mounting is a choice in § 5 step 4 (stand-offs, tape, eyelets,
  none); stand-offs and eyelets add a corner keep-out that preflight treats like the safe
  zone and the preview shows as faint circles.
- **A swatch card in Phase 0.** UV inks and the shop's profile both shift the rust. Before
  any poster, send an A5 card with the brand colours as five CMYK candidates each, the hex
  beside them, and pick the one that matches the logo under shop lights. The chosen CMYK
  values go into `docs/brand/PALETTE.md` and into `BrandPalette` as `cmyk()`; every poster
  then uses them. This is the cheapest way to meet principle 2.
- **All sizes in one go.** "Download for print" offers A5 + A4 + A3 as one ZIP from one
  design; each file keeps its own preflight result.
- **Never gloss a QR,** and QR error correction at level M (H when a logo sits in it): a
  gloss layer over a code stops it scanning in sunlight. One line in `PosterLayers` and one
  preflight red.
- **Mirrored output** for window vinyl printed from inside is a flag on the material, applied
  at export; the preview stays readable.

Words and data:

- **GST line.** Maldives GST law requires displayed prices to include GST. Every template
  with a price carries a small fixed footer line, "Prices include GST" with the live rate
  from settings (`gst_rate_bp`), in the chosen language. It cannot be removed, only moved.
- **"From" prices.** A sized dish prints "From MVR 45.00" (`displayPriceInfo()['from']`),
  or the size's own price when a size is chosen; the price slot never shows the base price
  of a dish whose sizes differ.
- **Dhivehi minimum size.** Thaana fili are small marks; a Thaana line needs about 1.2× the
  Latin minimum to read at the same distance, and Latin runs inside Dhivehi text already set
  at 0.82 em on labels. The text-size-for-distance check in § 7 gets a Dhivehi column, and
  a template set to "both" flags any typed slot missing its Dhivehi twin.
- **A take-down date on every poster,** defaulting to the bound offer's `expires_at` or the
  typed event date; "Up" posters past it are listed on My posters under "Should be down" and
  drive the `owner_poster_ending` alert. Where it is up is a short pick-list the owner edits
  (Window, Door, Counter, Tables, Kitchen, Outside), not free text, so the list groups.
- **Version history.** Each export keeps the bound data's hash and a readable summary;
  My posters shows "v3: price MVR 45 → 50" between versions, which is also the text of the
  out-of-date alert.

Where else the design goes:

- **Social via the Social Hub,** not only Share to WhatsApp: the square, portrait and story
  images become a **draft post** through `SocialPublisher` so the existing approval, best
  time and channel rules apply. The animated logo is already a social asset there.
- **TV via one slide:** a 1920 × 1080 PNG into an `image` element with the poster's
  take-down date as the slide end, offered on the same Check and send screen.
- **Proof approval from the phone:** the Telegram alert carries the signed approve link,
  as social posts do.
- **Template use counts** (the plan mentions them) come free from `posters.template_key`;
  show them on the Templates tab so unused purposes can be retired.

### 14.5 Revised Phase 0 and Phase 1

| Phase | What changes | Done when |
|---|---|---|
| **0. Spike** | TCPDF with the PDF/X-4 override from § 14.2; one A3 `hero_photo` with Dhivehi, the vector logo, CMYK brand colours and an RGB photo; TrimBox/BleedBox; a `-WHITE.pdf` mask; the swatch card; spot colours and overprint tried but not gating; a host check for Imagick and Ghostscript | Acrobat Preflight passes PDF/X-4; the shop prints the A3 and the swatch card without asking for changes; the owner picks the rust |
| **1. Make and send** | The `/posters` hub; eight archetypes; the 20 purposes of § 12 as presets; live data with "from" prices and the GST line; A5–A2 and the imposition step (tent, 2-up, 4-up); preflight with the § 14.2 resolution lines and keep-outs; queued export; spec sheet with white and gloss as words; all sizes in one ZIP; My posters with take-down dates | The owner makes and sends a real happy hour poster and a table-tent set in under 5 minutes, and the shop prints both first time |
| **2. UV and the shop** | As § 12, plus: print shop as supplier with costs into Expenses; spot layers in-file **only** for a shop that confirms it wants them; proof approval by signed link | As § 12 |
| **3. Everywhere** | As § 12, with social through `SocialPublisher` and TV through an `image` slide | As § 12 |

### 14.6 Risks that stay

- **Shared hosting limits.** Memory and execution time on cPanel bound the export size; the
  queue and the 4800 px cap are the answer, and Phase 0 measures a worst-case A2 on TEST.
- **The PDF/X override.** TCPDF's internals are stable but undocumented; the subclass is
  small but must be re-checked on each TCPDF upgrade (one test parses the catalog for the
  output intent and the XMP for `pdfxid`).
- **Template drift.** Eight archetypes still need care at A5 and in Dhivehi; the CI PNG
  artifact in § 11.6 is kept, one per archetype × size × language.
- **Shops differ.** The per-shop card in § 8 is the safety valve; nothing in the file format
  is hard-coded beyond the defaults in § 13.
