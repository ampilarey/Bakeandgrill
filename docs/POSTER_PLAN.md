# Posters: plan

Owner, 2026-10-17: "Sometimes I print different types of posters. Now I use other apps to
make posters. How about adding a poster feature to labels so all the posters will be in the
server, and it will be easier to use branding and logo. I use A5, A4, A3 and A2 mainly.
Many templates, easy to edit. We use UV printing." Then: "I outsource everything, so make
a detailed plan using best practices. Don't implement yet."

Status: **plan only, nothing built.** Decisions the owner needs to make are in
§ 13, and each phase starts only on the owner's go.

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
| **TCPDF** (PHP library via Composer) | Yes (spot colours, overprint, CMYK, ICC output intent) | Through the composed font already built for labels | One Composer package | Pure PHP, runs on cPanel; PDF/X validity must be proven in a spike |
| Ghostscript after dompdf | Can convert to CMYK and PDF/X | As now | A system binary on the server | May not be on the host; no spot layers |
| Headless Chrome | No spot colours | Good shaping | Chrome on the server | Not on cPanel; no spot layers |
| A paid PDF API | Varies | Varies | External service and fees | Sends artwork outside |

**Recommendation: TCPDF**, proven first by a spike (Phase 0): one A3 poster with a photo,
Dhivehi text, a white layer and a gloss layer, checked in Acrobat Preflight (PDF/X-4) and
**sent to the owner's actual print shop for a test print**. If the shop rejects it, fall
back to Ghostscript conversion where the host allows, or deliver RGB PDF plus layer files
if the shop prefers that.

The **on-screen preview** stays HTML/SVG from the same pieces (like labels), and proofs are
PNG/JPG rendered with GD (as `LabelRaster` does), so the browser never needs the print engine.

### 11.4 Images

- Photos come from the media library's **full-size masters**, never the web crops.
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
the owner's yes (`CLAUDE.md` § Who may change something may see it). An alternative is to
reuse `labels.print` / `labels.manage`, which needs no new permission but mixes two jobs.

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
| **0. Spike** | TCPDF test poster with white and gloss layers; Acrobat preflight; a real test print at the owner's shop; host check for Imagick and Ghostscript | The shop prints it without changes |
| **1. Make and send** | Posters tab, wizard and editor, 20 templates (happy hour, item discount, price drop, combo, % off all, coupon flier, new dish, dish of the day, best sellers, category, mini menu, opening hours, holiday hours, Ramadan, scan to order, table tent, delivery, hiring, notice, review), live data, A5 to A2, preflight, print PDF with bleed, spec sheet, ZIP download, My posters | The owner makes and sends a real happy hour poster in under 5 minutes |
| **2. UV and the shop** | Materials, white and gloss layers, print shops with preferences, send by email, order states and costs, proof approval, out-of-date and ending-soon alerts, your own templates | A clear acrylic poster with white and gloss comes back right first time |
| **3. Everywhere** | The rest of the library (45+), TV slide, social sizes, scan counts per poster, website banner, menu board A2 | One offer goes on the window, the TV and Instagram from one design |

Each phase ends with tests, the admin build, `docs/POSTERS.md` (how to use it), the
`CLAUDE.md` note, merge, and the deploy command, as usual.

## 13. Decisions for the owner

1. **Print shop details**: which shop(s), and their file preferences (PDF/X-4 or X-1a,
   colour profile, bleed, spot names for white and gloss). Ideally their artwork guide or
   template file.
2. **Materials** you order most, and whether the shop does white ink and spot gloss.
3. **Permissions**: new `posters.make` / `posters.manage` (recommended), or reuse the labels
   permissions. Either way, the new routes need your yes.
4. **New dependency**: TCPDF through Composer (recommended), and whether Ghostscript or
   Imagick may be asked for on the server.
5. **Approval**: should every poster need your approval before it goes to the shop?
6. **Examples**: 3 or 4 posters you made before, to match the look you like.
7. **Order of templates**: which 20 you want first, if different from Phase 1's list.
