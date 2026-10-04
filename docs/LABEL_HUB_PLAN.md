# Label Hub: implementation plan

Owner, 2026-10-04: "I want to print labels like this [the frozen short-eat stickers
and box labels], think of other useful features, and this should be accessible to
all staff who have the authority."

This document is the full brief for implementing the Label Hub in the Bake & Grill
monorepo. It is written so an agent can build it without the conversation that
produced it. Read `CLAUDE.md` first; its rules on merging, deploys, commit prose,
brand colours and admin colour tokens apply to every step here.

---

## 1. What exists today, and what we keep

The owner prints labels from a standalone Python/ReportLab folder
(`bake-grill-labels/`, not in this repo). Four scripts produce:

| Script | Output | Layout |
|---|---|---|
| `stickers_en.py` | Frozen_Short_Eats_Stickers_A4.pdf | A4, 4 stickers per page (105 × 148.5 mm), one page per product, 9 products |
| `stickers_dv.py` | Frozen_Short_Eats_Stickers_A4_Dhivehi.pdf | Same, mirrored right-to-left, Thaana text |
| `box_label_template.py` | Box_Label_Template.pdf | One A4, everything handwritten |
| `box_label_nh_kuda_rah.py` | Box_Label_NH_Kuda_Rah.pdf | One A4 filled in for a wholesale customer |

The designs are final and liked. **The hub reproduces them exactly** (same
millimetres, colours, fonts, wording), and only adds the data behind them. Section 6
has the full measurements, taken from the scripts, so nothing has to be guessed.

What the system already has that the hub reuses:

| Need | Already in the repo |
|---|---|
| PDF engine, one view for browser print and PDF | `barryvdh/laravel-dompdf`; pattern in `ComplaintBoxPageController::sheet()/sheetPdf()` and `resources/views/complain-poster-sheet.blade.php` (tables and fixed mm, no flexbox/grid) |
| Measured, one-page sheets with cut lines, nothing under 10 pt | `App\Support\PosterCardSpec` and its tests (`tests/Feature/Complaints/ComplaintBoxTest.php`) |
| Logo as a PDF-safe PNG | `App\Support\BrandMark::dataUri(px)` |
| Dhivehi font on disk for dompdf | `MenuPageController::dhivehiFontFile()`, shipped `public/fonts/a_faruma.ttf`, owner upload via `App\Domains\Content\DhivehiFont` |
| Product data | `Item`: `name`, `name_dv`, `allergens` (array), `dietary_tags`, `barcode`, `sku`, `cutout_url`, photos (`ItemPhoto`) |
| Batch numbers and expiry per batch | `KitchenProductionItem.batch_code`, `expires_at`; `KitchenProductionBatch.batch_no` |
| Wholesale customer and delivery | `TradeAccount` (shop_name, contact_name, contact_phone), `TradeDelivery`, `TradeDeliveryLine` (item, qty_sent) |
| Business contact details | `content('business_phone')`, `business_website`, `business_address_line1`, `business_address_city`, `site_tagline`; see `ComplaintBoxPageController::posterContacts()` |
| Permissions | `App\Domains\Permissions\PermissionCatalog` (slug catalog, role defaults, `SATISFIED_BY`), `RequirePermission` middleware alias `permission:`, admin hook `useCurrentUserPermissions().can()` |
| Staff-only server-rendered pages | Signed URLs: `URL::temporarySignedRoute(...)` issued by an API endpoint, consumed by a `web.php` route with `->middleware('signed')` (see `ContentWebsitePreviewController`, `Api\ContentPreviewController`) |
| Admin hub page with tabs | `apps/admin-dashboard/src/components/HubPage.tsx` (`HubTab`, `hubPermissions`), used by `KitchenHub.tsx`, `WholesaleHub.tsx` |
| Admin nav | `apps/admin-dashboard/src/components/navConfig.ts` |
| Media library for pictures | `media.*` permissions, `MediaPicker` component |

---

## 2. Scope by phase

### Phase 1 (build first, ship as one merge or three)

1. **Label data on menu items** (migration, API, item editor tab).
2. **Pack stickers, English and Dhivehi**, from item data, with optional
   filled-in dates, batch and quantity, on every label stock listed in 5.1 (plain
   A4 with cut lines, pre-cut sheets, single-label pages for label printers,
   custom size).
3. **Box label**, blank template or filled from a wholesale delivery.
4. **Labels hub page** in Admin, with permissions, print and PDF.
5. **Print buttons** on a kitchen production batch and on a wholesale delivery.
6. **Print log**.
7. **Legacy asset import command** for the 9 products' hand lettering and photos.

### Phase 2

- Barcode on the sticker (Code 128 from `Item.barcode`).
- Allergen icons drawn from `Item.allergens`.
- Price labels and shelf tags for the counter fridge.
- Catering order labels.

### Phase 3

- Print from the POS (`apps/pos-web`) for staff without Admin.
- Direct-to-label-printer jobs through the existing print proxy (`App\Domains\Printing`).

Everything below is Phase 1 unless marked.

---

## 3. Permissions

Add to `PermissionCatalog`:

```php
['group' => 'Labels', 'slug' => 'labels.print',  'name' => 'Print labels',
 'description' => 'Print pack stickers and box labels from the Labels page, a production batch or a wholesale delivery'],
['group' => 'Labels', 'slug' => 'labels.manage', 'name' => 'Manage label settings',
 'description' => 'Edit ingredients, shelf life, storage line and label pictures on items, and the label wording'],
```

- `SATISFIED_BY`: `'labels.print' => ['labels.manage']`.
- Role defaults (owner, 2026-10-04: "by default admin only, but option to give
  permission to any staff"): both slugs go in the owner-only list, so no stock role
  gets them. The owner grants them per role or per staff member in Staff →
  Permissions, which already supports that; nothing new is needed there except the
  cheat-sheet entries. `PermissionCatalogSync::sync()` runs on deploy and picks the
  new slugs up. Respect `RolePermissionCustomisations` (do not overwrite owner
  changes).
- Add both to `apps/admin-dashboard/src/components/permissionsCheatSheet.ts`.

---

## 4. Data model

### 4.1 Migration: label fields on `items`

`database/migrations/2026_10_04_100000_item_label_fields.php`

| Column | Type | Meaning |
|---|---|---|
| `label_ingredients_source` | string(8), default `auto` | `auto`: from the item's recipe when it has one, else the manual line; `recipe`: always from the recipe; `manual`: always the manual line (owner, 2026-10-04: "add option to include manual ingredients if recipe is not there in the item") |
| `label_ingredients` | text, nullable | Manual English ingredient line as printed, e.g. "Flour, salt, oil, …" |
| `label_ingredients_dv` | text, nullable | Manual Dhivehi ingredient line |
| `label_shelf_life_days` | unsigned small int, nullable | Shelf life in days for the storage mode (owner: "add option to add life"); EXP = MFG + this. Null means dates are left blank for handwriting |
| `label_storage` | string(16), default `frozen` | `frozen`, `chilled`, `ambient`. Picks the storage strip text |
| `label_pack_qty` | unsigned small int, nullable | Default pieces per pack printed in "QTY: __ PCS"; null leaves it blank |
| `label_title_media_id` | FK media, nullable | Hand-lettered product name PNG (transparent). Null falls back to typed name |
| `label_photo_media_id` | FK media, nullable | Cut-out food photo. Null falls back to `cutout_url`, then the brand mark |
| `label_enabled` | boolean, default false | Shows in the Labels hub product list. Set true by the import command for the 9 products |

Keep `Item::$fillable` and `StoreItemRequest`/`UpdateItemRequest` validation in step
(`label_storage` in `['frozen','chilled','ambient']`, `label_ingredients_source` in
`['auto','recipe','manual']`, shelf life 1 to 730, ingredients max 500 chars). Add the
fields to the item API resource used by the admin editor.

**Ingredients from the recipe.** `Item::recipe()` (HasOne `Recipe`) has
`recipeItems` → `inventoryItem`. `LabelCatalog` builds the recipe line as follows:

1. Take the recipe rows with `variant_id` null (shared by every size); if the item
   has no such rows, take the rows of the default variant.
2. Convert each quantity to grams or millilitres with the inventory item's unit
   where possible; rows that cannot be converted keep their raw quantity for
   ordering only.
3. Sort by quantity descending (food labels list ingredients heaviest first), then
   by name.
4. Print `InventoryItem.name` (and `name_dv` when the inventory item has one; add
   `name_dv` to `inventory_items` in the same migration if it does not exist, check
   first). Join with ", ". Collapse duplicates. Drop inventory items flagged as
   packaging or non-food: add a boolean `is_label_ingredient` (default true) to
   `inventory_items` so the owner can untick cling film, boxes and labels
   themselves; the Inventory item editor gets the tick box.
5. If the recipe line is empty, fall back to the manual line regardless of the
   source setting, and the hub shows "no recipe, using manual ingredients" next to
   the product.

The item's Label tab shows the resolved line read-only when the source is `recipe`
or `auto`-with-recipe, with a "use manual instead" switch, so the owner can see what
will print before printing.

### 4.2 Migration: `label_prints` (print log)

| Column | Type |
|---|---|
| `id` | |
| `kind` | string(24): `sticker_en`, `sticker_dv`, `box_label` |
| `layout` | string(24): a key from `StickerSheetSpec` (or `single-custom`) |
| `label_w_mm`, `label_h_mm` | decimal(6,2) nullable, for `single-custom` |
| `item_id` | FK nullable |
| `kitchen_production_item_id` | FK nullable |
| `trade_delivery_id` | FK nullable |
| `copies` | unsigned int (stickers = pages × 4) |
| `mfg_date`, `exp_date` | date nullable |
| `batch_code` | string(40) nullable |
| `pack_qty` | unsigned small int nullable |
| `printed_by` | FK users |
| `output` | string(8): `print` or `pdf` |
| `created_at` | |

Written when the signed sheet URL is issued (section 5.3), because the browser's
print dialog cannot report back. "Issued" is good enough for the audit trail.

### 4.3 Content keys (Content Hub, `content()` helper)

Add to the business-details content keys so the owner can edit wording without a
deploy (register in `App\Domains\Content\BusinessDetailsKeys` and the validation
service like the existing keys):

| Key | Default |
|---|---|
| `label_storage_frozen` | `KEEP FROZEN AT -18°C OR BELOW  •  DO NOT REFREEZE ONCE THAWED` |
| `label_storage_frozen_dv` | the Dhivehi line from `stickers_dv.py` |
| `label_storage_chilled` | `KEEP REFRIGERATED AT 0–4°C  •  CONSUME WITHIN 2 DAYS OF OPENING` |
| `label_storage_ambient` | `STORE IN A COOL, DRY PLACE` |
| `label_header_line` | `FROZEN HEDHIKA` (two words, drawn on two lines) |
| `label_header_line_dv` | `ފްރޯޒަން ހެދިކާ` |
| `label_box_strip` | `KEEP FROZEN AT -18°C  •  FOOD ITEMS  •  HANDLE WITH CARE  •  THIS SIDE UP` |
| `label_footer_landmark` | `Near H. Sahara` (appended to the address on the dark footer) |

Phone, website, address and tagline come from the existing business keys, exactly as
`posterContacts()` builds them. Do not hardcode `+960 912 0011` anywhere.

---

## 5. Backend

Namespace `App\Domains\Labels`. Controllers in `App\Http\Controllers\Labels` (page)
and `App\Http\Controllers\Api\LabelsController` (API).

### 5.1 Services

**`LabelCatalog`**
`products(): Collection` of items with `label_enabled`, with the resolved label data:
name, name_dv, ingredients (both), shelf life, storage, pack qty, title image (data
URI or null), photo (data URI or null), allergens. Resolves media to PNG data URIs
the way `BrandMark::dataUri()` does (dompdf cannot fetch; everything is inline).

**`StickerSheetSpec`**
Pure layout numbers for the sticker, in mm, from section 6.1. One method
`for(string $layout, ?array $custom = null): array` returning sheet size, label
size, the grid, and every box's position so the Blade view has no arithmetic. The
design is drawn at 105 × 148.5 mm; for any other label size every measurement is
multiplied by `s = min(labelW / 105, labelH / 148.5)` and the design is centred in
the label, the same idea as `PosterCardSpec`. Owner, 2026-10-04, on which label
stock to support: "add all options", so Phase 1 ships all of these:

| Layout key | Sheet | Labels | Notes |
|---|---|---|---|
| `a4-4` | A4 portrait | 2 × 2, 105 × 148.5 | Plain paper, dashed cut lines at the centre lines (today's design) |
| `a4-4-precut` | A4 portrait | 2 × 2 | Pre-cut 4-up sheets: no cut lines; label origin and gutter come from settings (`label_precut_margin_top`, `_left`, `_gutter`, default 0/0/0, in mm) so the owner can nudge to the sheet they buy |
| `a4-2` | A4 landscape (297 × 210) | 2 × 1, 105 × 148.5 side by side | Cut lines; wastes the strip either side, for when only two are needed |
| `a4-8` | A4 portrait | 2 × 4, 105 × 74.25 | Half-height labels, design scaled by 0.5 |
| `a4-12` | A4 portrait | 3 × 4, about 65 × 71 | Same grid as the complaint QR sheet, scaled |
| `single-105x148` | one label per page, 105 × 148.5 | 1 | Label printers that take A6 sheets |
| `single-100x150` | 100 × 150 | 1 | Thermal 4 × 6 inch label printers |
| `single-76x127` | 76 × 127 | 1 | 3 × 5 inch |
| `single-custom` | `w` × `h` from the request, 40–210 × 40–297 | 1 | Anything else; the hub has width and height fields and remembers the last values |

For single-label layouts the `@page` size is the label itself with zero margin, so
the printer driver's "actual size" prints it 1:1. The sheet page states the label
size and the scale ("design at 95 %") above the paper. Every layout must pass the
one-page test and the smallest type must stay readable: refuse (422) a label whose
scale would take the footer address under 4.5 pt, and say which size would work.

**`StickerSheetData`**
Builds the view model for a request: which products, how many pages each, the
language, and the date/batch/qty fill. Rules:

- `mfg_date` defaults to today; `exp_date = mfg_date + label_shelf_life_days` when
  shelf life is set, else blank boxes with the `__ /__ /____` guide.
- Refuse (422 from the API, never a silent fix) an `exp_date` earlier than
  `mfg_date`, or an `mfg_date` more than 7 days in the future.
- When printed from a `KitchenProductionItem`, `batch_code` and `expires_at` come
  from it and the quantity defaults to `produced_qty`. Operator can still override.
- Dates print as `DD / MM / YYYY` in the same guide boxes, dark text on cream.

**`BoxLabelData`**
Blank template, or filled from a `TradeDelivery`: `shop_name`, `contact_name`,
`contact_phone`, the lines (item name, article name, `qty_sent`), delivery date from
`dispatched_at` or the requested date. Boat, pick-up point and time window are
free-text fields on the request (they are not stored on the delivery today; store
them on the print log, not on the delivery). Always add 3 spare blank rows after the
lines. Keep the "ARTICLE NAME" column: `FROZEN - SHORT EAT - {NAME}-PIECE`, generated
from the item name uppercased; add `label_article_name` to items only if the owner
asks for custom article names.

**`ThaanaVisual`** (required, see 5.4)
`order(string $text): string` returns Thaana text in visual order for dompdf.

**`LabelPrintLog`**
`record(array $attrs): LabelPrint`.

### 5.2 Routes (web, server-rendered, signed)

In `routes/web.php`, inside a `Route::middleware(['signed', 'throttle:60,1'])` group:

| Route | Name | Controller |
|---|---|---|
| `GET /labels/stickers` | `labels.stickers` | `LabelSheetController@stickers` (Blade, print bar, `?print=1` opens dialog after fonts load, same as the complaint sheet) |
| `GET /labels/stickers.pdf` | `labels.stickers.pdf` | `@stickersPdf` (dompdf download `labels-{product-or-batch}-{date}.pdf`) |
| `GET /labels/box` | `labels.box` | `@box` |
| `GET /labels/box.pdf` | `labels.box.pdf` | `@boxPdf` |

Parameters travel in the signed query string: `items[]`, `pages`, `lang` (`en`/`dv`),
`mfg`, `exp`, `batch`, `qty`, `production_item`, `delivery`, `boat`, `pickup`,
`window`, `po`. Signed URLs expire after 30 minutes; the Admin button fetches a fresh
one on every click.

Why signed and not `auth:sanctum`: the admin SPA holds a bearer token; a new tab
opened for printing carries no header. Signed URLs are the pattern the repo already
uses for staff-only Blade pages.

### 5.3 Routes (API, `auth:sanctum` + `staff.token` group)

| Route | Permission | Does |
|---|---|---|
| `GET /api/labels/products` | `labels.print` | `LabelCatalog::products()` for the hub list (name, name_dv, shelf life, storage, has title art, has photo, allergens) |
| `POST /api/labels/stickers/url` | `labels.print` | Validates the request, writes the print log, returns `{ url, pdf_url, expires_at, summary }` with signed URLs |
| `POST /api/labels/box/url` | `labels.print` | Same for the box label |
| `GET /api/labels/prints` | `labels.print` | Paginated log, filters: kind, item, date range, user |
| `GET /api/labels/settings` and `PUT` | `labels.manage` | The content keys in 4.3 |
| `PUT /api/items/{item}/label` | `labels.manage` | The item label fields (or fold into the existing item update; either is fine, but the editor tab must save with `labels.manage`, not require `menu.manage`) |
| `POST /api/kitchen-production/items/{id}/labels/url` | `labels.print` | Shortcut: stickers for that production item with batch, expiry and qty filled |
| `POST /api/trade-deliveries/{id}/box-label/url` | `labels.print` | Shortcut: box label for that delivery |

Add to `apps/admin-dashboard/src/api/labels.ts`, re-exported from `api/index.ts`.

### 5.4 Dhivehi in the PDF: the one real technical problem

dompdf does not run the bidi algorithm. Tested on 2026-10-04 with the shipped
`a_faruma.ttf`: Thaana glyphs and fili (vowel marks) draw correctly, but the
characters come out in logical order left to right, so each word is mirrored and the
word order is reversed. `direction: rtl` on the block does not change the glyph
order. (Browsers get it right, which is why `/menu/print?dv=1` looks fine on screen;
**its PDF has the same mirroring bug**. Fix it with the same helper once this
exists.)

Fix in `ThaanaVisual::order()`:

1. Split the string into runs: Thaana runs (U+0780–U+07BF plus spaces and Thaana
   punctuation U+060C, U+061B, U+061F, U+002C between Thaana) and other runs (Latin,
   digits, `°C`, `-18`).
2. Within a Thaana run, split into grapheme clusters (`preg_split('/(?<!^)(?!$)/u')`
   is not enough; use `\X` with `preg_match_all('/\X/u', …)`) so each consonant keeps
   its fili after it, then reverse the cluster list.
3. Reverse the order of the runs, keep non-Thaana runs internally unreversed.
4. The view prints the result inside a block with `direction: ltr` and
   `text-align: right`.

Only the PDF path calls it. The browser path prints the original string with
`direction: rtl` because browsers shape and order it themselves. Both paths share the
Blade view; the controller passes `$dv = fn($s) => $forPdf ? ThaanaVisual::order($s) : $s`.

Line wrapping: the Dhivehi ingredient line can wrap. Wrap on the server before
reversing (measure with a per-character width table for Faruma, or cap at a safe
characters-per-line count derived from the sticker width and test it against the
real strings), emit one `<div>` per line, and reverse each line separately. Do not let
dompdf wrap a reversed string, since it would break at the wrong end.

Test (`tests/Unit/Labels/ThaanaVisualTest.php`): a known word and its expected
cluster-reversed form; mixed `-18°C` stays intact; punctuation stays attached to its
word; an empty string and a Latin-only string pass through unchanged.

### 5.5 Fonts for dompdf

dompdf needs TTF. The admin and website ship Plus Jakarta Sans as WOFF2 only
(`public/fonts/plus-jakarta-sans-*.woff2`). Add:

- `public/fonts/pdf/PlusJakartaSans-{400,500,700,800}.ttf`
- `public/fonts/pdf/DMSerifDisplay-{Regular,Italic}.ttf`
- `public/fonts/pdf/LICENSES.txt` (both are SIL OFL; copy the licence texts)

Embed with `@font-face { src: url('{{ public_path(...) }}') }` only when `$forPdf`,
exactly as `menu-print.blade.php` does for the Dhivehi font. In the browser use the
existing WOFF2 and a Google Fonts link for DM Serif Display is **not** allowed by the
CSP (`font-src 'self'`): subset DM Serif Display to WOFF2 with
`scripts/install-fonttools.sh` tooling (`pyftsubset … --flavor=woff2`) and serve it
from `public/fonts/` as the complaint sheet does with DejaVu.

Thaana: use `MenuPageController::dhivehiFontFile()` logic; move that method into
`App\Domains\Content\DhivehiFont::pdfFile(): ?string` and call it from both
controllers.

### 5.6 Legacy asset import

`php artisan labels:import-legacy {dir}` where `{dir}` is the Python project's
`assets/` folder copied to the server. For each key in the table below, find the
item by name (case-insensitive, trimmed), store `{key}_title.png` and `{key}_food.png`
in the media library (`App\Domains\Media`, same path as an admin upload), set
`label_title_media_id`, `label_photo_media_id`, `label_ingredients`,
`label_storage = frozen`, `label_enabled = true`. Idempotent: skip a product that
already has a title image unless `--force`. Report the ones not matched.

| Key | Item name | Ingredients |
|---|---|---|
| masroshi | Masroshi | Onion, chilli, ginger, coconut, curry leaves, turmeric, salt, smoked tuna **(owner to confirm; flour is missing)** |
| havaadhulee | Havaadhulee Bis | Flour, salt, oil, coconut, onion, ginger, chilli, lemon, curry leaves, pandan leaves, smoked tuna, spices |
| bajiya | Bajiya | Flour, salt, oil, spices, onion, garlic, chilli, lemon, curry leaves, smoked tuna |
| handoo | Handoo Gulha | Rice flour, salt, oil, coconut, onion, ginger, chilli, lemon, curry leaves, smoked tuna |
| fuhgulha | Fuh Gulha | Flour, salt, oil, coconut, onion, ginger, chilli, lemon, curry leaves, smoked tuna |
| keemiya | Keemiya | Flour, salt, oil, coconut, onion, potato, ginger, chilli, lemon, curry leaves, smoked tuna, spices |
| patties | Patties | Flour, salt, oil, onion, ginger, chilli, potato, black pepper, curry leaves, smoked tuna |
| biskeemiya | Bis Keemiya | Flour, salt, oil, eggs, cabbage, pepper |
| boakiba | Dhandi Aluvi Boakiba | Cassava, coconut, sugar, eggs, vanilla essence |

Dhivehi ingredient lines: take them from `stickers_dv.py` (the `P` list) verbatim.
The owner's notes say a native speaker should proofread them; keep them editable in
the item's Label tab.

---

## 6. Exact layouts

All numbers are from the ReportLab scripts. Reproduce them in Blade with tables and
absolute mm (dompdf supports `position: absolute` inside a relatively positioned
cell, which is the simplest way to place these boxes; the complaint sheet shows the
table-only alternative). Colours:

| Name | Hex |
|---|---|
| PRIMARY | #B74B0C |
| DARK | #1C1408 |
| CREAM | #FFFDF9 |
| TINT | #FEF3E8 |
| MUTED | #8B7355 |
| BORDER | #EDE4D4 |
| TEXT | #2A1E0C |
| ON-DARK accent | #C56F3D |
| SOFT (guides, footer address) | #CDBFA8 |

Never introduce `#D4813A`.

### 6.1 Pack sticker, 105 × 148.5 mm (A4 cut in four, dashed cut lines at the page's centre lines, BORDER colour, 0.4 pt, dash 3/3)

All positions measured from the sticker's own top-left; pad = 5 mm; inner width
= 95 mm; centre x = 52.5 mm.

| Element | Position and size | Style |
|---|---|---|
| Header panel | x 5, y 5, w 95, h 28, radius 3 | fill TINT |
| Logo (`logo_light.png`, full logo with flame and "B&G Cafe") | inside header, left 8 mm, fitted in 24 × 24 mm, vertically centred | from `BrandMark` (full logo, not the mark) |
| "B A K E   &   G R I L L" | x 34, baseline 12.5 from top | PJS 700, 7.5 pt, PRIMARY, letter-spaced as shown |
| "FROZEN" / "HEDHIKA" | x 34, baselines 20.5 and 28 | PJS 800, 19 pt, DARK (from `label_header_line`) |
| Rule under header words | x 34, y 30.5, w 14, h 1 | PRIMARY |
| Product title | centred, top at 36.5 (3.5 below panel), fitted in 72 × 15 mm | hand-lettering PNG when the item has one; otherwise the typed name in DM Serif Display Italic, PRIMARY, sized to fit the 72 × 15 mm box (start at 24 pt, shrink until it fits on one line, never under 14 pt; two lines if still too long). Decision 2026-10-04: typed names are allowed for new products, lettering is optional |
| Food photo | centred, 2.5 below title, fitted in 62 × 28 mm | cut-out PNG; fallback `cutout_url`; fallback brand mark fitted in 40 × 24 mm, centred in the 28 mm band |
| "I N G R E D I E N T S" | centred, 5 mm below photo | PJS 700, 7.3 pt, PRIMARY |
| Ingredients paragraph | centred, width 85 mm, starts 2 mm below the label | PJS 400, 7.6 pt, leading 10 pt, TEXT; if empty, two guide lines 5 mm apart in SOFT |
| MFG DATE box | x 5, bottom at 35 from sticker bottom (i.e. y = 148.5 − 5 − 30 − 14), w 45.5, h 14, radius 2 | 1.2 pt border DARK, fill CREAM; header strip 5.2 mm DARK with "MFG DATE" PJS 700 8 pt CREAM; guide `__ /__ /____` PJS 400 13 pt SOFT, or the date PJS 700 13 pt TEXT |
| EXP DATE box | x 54.5, same y and size | same, PRIMARY |
| "BATCH NO: ____________" | left at 6, baseline 4 below the boxes | PJS 500, 7.2 pt, TEXT; or `BATCH NO: {code}` |
| "QTY: ______ PCS" | right-aligned at 99 | same; or `QTY: {n} PCS` |
| Storage strip | x 5, bottom at 17.5 from sticker bottom, w 95, h 5.5, radius 1.5 | fill PRIMARY; text PJS 700 6.8 pt CREAM, centred, from `label_storage_*` |
| Footer panel | x 5, bottom 5, w 95, h 15.5, radius 2.5 | fill DARK |
| Footer mark | left 8, fitted 10 × 10.5, vertically centred | brand mark (flame only) |
| "Bake & Grill" | after the mark + 2.5, baseline 10 from footer bottom | DM Serif Display 12.5 pt CREAM |
| "Fresh Baked, Fire Grilled" | baseline 6.3 | DM Serif Display Italic 7.8 pt ON-DARK (from `site_tagline`) |
| Address | baseline 2.7 | PJS 400 5.4 pt SOFT: `{address_line1}, {city}  ·  {label_footer_landmark}` |
| Phone | right-aligned at 96.5, baseline 10 | PJS 800 10.5 pt CREAM |
| "CALL  ·  WHATSAPP  ·  VIBER" | baseline 6.5 | PJS 700 5.6 pt ON-DARK |
| Website | baseline 2.7 | DM Serif Display Italic 10 pt CREAM |

Dhivehi sticker: the same boxes mirrored (logo on the right of the header, Thaana
header lines right-aligned at x 76 in Faruma 9/19/19 pt with a 0.4–0.7 pt stroke to
fake bold; title in Faruma 30 pt PRIMARY centred, max width 87 mm; ingredients in
Faruma; MFG/EXP labels in Thaana; "BATCH NO" and "QTY" swapped sides; footer
mirrored). "-18°C" and the website stay in Plus Jakarta Sans because Faruma lacks
`°`, `C` and `_`; underscores are drawn as lines, not characters. Copy the exact
strings from `stickers_dv.py`.

### 6.2 Box label, one A4 portrait

Margins 12 mm. Top to bottom:

1. Header panel (TINT, radius 3, full width, 42 mm): full logo left (fitted 28 mm),
   "Bake & Grill" DM Serif 26 pt DARK, tagline DM Serif Italic 11 pt PRIMARY,
   "FROZEN SHORT EATS · HEDHIKA" PJS 500 8 pt MUTED letter-spaced; right-hand
   PRIMARY rounded badge 52 × 26 mm: "KEEP FROZEN" PJS 700 9 pt and "-18°C" PJS 800
   20 pt, CREAM.
2. "D E L I V E R T O" PJS 700 8 pt PRIMARY, then the customer name DM Serif 40 pt
   DARK with a 36 × 1.2 mm PRIMARY underline; blank template shows a long SOFT line
   instead.
3. "Attn:" PJS 700 11 pt + name; contact role and phone PJS 400 9 pt MUTED.
4. Three bordered cells (1 pt DARK, radius 3, equal widths, 24 mm tall): BOAT /
   VESSEL, PICK-UP POINT, DELIVERY DATE & TIME. Label PJS 700 7 pt PRIMARY, value
   PJS 700 13 pt DARK, second line PJS 400 9 pt.
5. "PO NO:" with a 40 mm line; "BOX ___ OF ___" right-aligned.
6. "C O N T E N T S" PJS 700 8 pt PRIMARY; table with DARK header row (ITEM,
   ARTICLE NAME, QTY (PCS), CHECK), alternating TINT rows 10 mm tall, item PJS 700
   10 pt, article PJS 400 7 pt MUTED, qty as a 20 mm SOFT line (or the number when
   filled), 5 mm checkbox; 3 spare rows; TOTAL row PJS 800 11.5 pt.
7. PRIMARY strip 10 mm: the `label_box_strip` text PJS 700 9 pt CREAM.
8. DARK footer 26 mm: mark, name, tagline, address on the left; phone PJS 800 16 pt,
   "CALL · WHATSAPP · VIBER", website on the right.

When filled from a delivery, the sheet title is `Box label – {shop} – {date}` and the
PDF file name `box-label-{delivery_number}.pdf`.

### 6.3 Sheet rules (both)

- `@page` size A4 portrait, margin 0 for the sticker sheet (the cut lines are the
  margins), 12 mm for the box label.
- Browser print and PDF must be exactly one page per sticker page. Reuse the
  Playwright page-count check from the complaint sheet work in a test script and the
  `%PDF` page-object count in the feature test.
- Smallest type on the English sticker is 5.4 pt (footer address) by design; the
  owner accepted this on the Python version. Do not apply the 10 pt rule from the
  complaint posters here.

---

## 7. Admin UI (`apps/admin-dashboard`)

### 7.1 Nav and hub

- `navConfig.ts`: `{ to: '/labels', icon: Tag, label: 'Labels', permissions: ['labels.print', 'labels.manage'], description: 'Pack stickers and box labels' }` in the same group as Kitchen.
- `App.tsx`: lazy route `labels/*` → `LabelsHub`, guarded by `LABELS_HUB_PERMISSIONS`.
- `pages/LabelsHub.tsx` using `HubPage` with tabs:

| Tab | Permission | Content |
|---|---|---|
| Pack stickers | labels.print | Product list (name, Dhivehi name, shelf life, storage, ingredients source and the resolved line, art present). Pick products, copies per product, language EN/DV, label stock (the layouts in 5.1, with width and height fields for custom, and the pre-cut offsets link to Settings), "Fill in dates" switch with MFG date (today), EXP (computed from shelf life, editable), batch code, qty. Buttons: Print, Download PDF. Shows the summary returned by the API ("3 products · 12 stickers on 3 sheets · EXP 18 Dec 2026") before opening the sheet. |
| Box labels | labels.print | Pick a wholesale delivery (search by shop, recent first) or "Blank template". Boat, pick-up point, date window, PO fields. Print / PDF. |
| History | labels.print | The print log with filters, who/when/what. |
| Settings | labels.manage | Storage lines (EN/DV), header line, box strip, landmark, pre-cut sheet offsets; a table of label-enabled items with inline edit of shelf life, storage and ingredients source, and a link to each item's Label tab. |

- All print buttons call the `/url` endpoint, then `window.open(url, '_blank', 'noopener')`
  for Print (the sheet auto-opens the dialog with `?print=1`) and set
  `location.href` to the PDF URL for download. Same pattern as `ComplaintBoxPage.tsx`.
- Style with the CSS variables in `CLAUDE.md`, no new hex literals in `style={{}}`.
- Mobile: the hub must work at 360 px like the others (`MobileTabBar`, `useIsMobile`).

### 7.2 Item editor

`MenuItemEditorModal.tsx` gains a third top-level tab **Label** next to Details and
Photos & video (visible with `labels.manage`): enabled switch, ingredients source
(auto / recipe / manual) with the resolved recipe line shown read-only when it
applies, manual ingredients EN and DV (textarea, Thaana input right-to-left), shelf
life days, storage select, default pack qty, title art picker and photo picker (both `MediaPicker`, PNG with transparency
recommended), and a live preview of the sticker: an `<iframe>` of the signed browser
sheet called with `?preview=1&items[]=id&pages=1`, which hides the print bar and
shows one sticker scaled to fit. Keep this simple; the preview is a nicety, the print
path is the product.

### 7.3 Buttons elsewhere

- `KitchenProductionPage.tsx`, batches tab, each production item row: "Print
  stickers" (icon Tag) when the user `can('labels.print')` and the item is
  `label_enabled`. Calls the production-item shortcut endpoint; the dialog shows
  batch code, expiry and qty prefilled.
- `WholesaleDeliveriesPage.tsx`, each delivery: "Box label" button, calls the delivery
  shortcut endpoint; dialog asks for boat, pick-up point and window, remembers the
  last values per trade account in `localStorage` (convenience only).

---

## 8. Tests

Backend (`tests/Feature/Labels/`):

- `LabelPermissionsTest`: `labels.print` and `labels.manage` exist in the catalog,
  manage satisfies print, API routes 403 without them, signed routes 403 when the
  signature is missing or expired.
- `StickerSheetTest`: 1 product × 2 pages → 8 `class="sticker"`, one page per 4;
  every layout key renders the right count per page and the right `@page` size, a
  custom 80 × 120 label scales by 0.762 and keeps the design centred, a 40 × 40 label
  is refused with the message naming a workable size; ingredients come from the
  recipe heaviest-first and skip unticked inventory items, fall back to the manual
  line without a recipe, and the `manual` source ignores the recipe; dates blank by
  default; `fill=1` prints `DD / MM / YYYY` and EXP = MFG + shelf life;
  EXP before MFG → 422; a production item fills batch and expiry; PDF download
  headers and `%PDF`; the Dhivehi sheet contains the reversed strings from
  `ThaanaVisual` in the PDF path and the original in the browser path; fallback title
  and photo when media is missing; print log row written with the right counts.
- `BoxLabelTest`: blank template renders 11 empty rows; a delivery renders its shop,
  contact, lines and quantities plus 3 spare rows; file name uses the delivery number.
- `LegacyImportCommandTest`: creates the 9 items, runs the command against a temp
  directory with placeholder PNGs, asserts fields and media, idempotency, unmatched
  report.
- `tests/Unit/Labels/ThaanaVisualTest.php` as in 5.4.

Admin (`vitest`): `LabelsHub.test.tsx` renders tabs by permission; the stickers tab
computes the summary and calls the URL endpoint with the right payload; the item
editor Label tab saves the fields.

Visual: run the Playwright page-count and overflow checks (same scripts as the
complaint sheets) on every layout in both languages and attach screenshots of page 1
EN, page 1 DV and the filled box label to the merge reply. Compare side by side with
the Python PDFs; they must match to within a millimetre.

---

## 9. Order of work and merges

Each step is verified (tests, one-page check) and fast-forwarded to `main` per
`CLAUDE.md`. End each reply with the production deploy command and the call-outs.

| Step | Contents | Deploy call-outs |
|---|---|---|
| 1 | Permissions, migrations, item fields + validation + API, `ThaanaVisual` + test, fonts in `public/fonts/pdf`, `DhivehiFont::pdfFile()` refactor (also fixes the menu PDF mirroring) | migration; new permission (sync runs in deploy); new font files |
| 2 | Sticker sheet (EN, DV), signed routes, API URL endpoints, print log, feature tests, Playwright check | none beyond step 1 |
| 3 | Box label, delivery shortcut, tests | none |
| 4 | Admin: hub, nav, item Label tab, batch and delivery buttons, cheat sheet; rebuild admin bundle | rebuilt admin bundle (owner reloads Admin) |
| 5 | `labels:import-legacy`, docs (`docs/LABELS.md`: how to add a product, how to print, where wording lives), update `CLAUDE.md` with one paragraph pointing at the doc | owner runs `cd /home/bakeandgrill/public_html/backend && php artisan labels:import-legacy /path/to/assets` once after copying the folder to the server |

Estimate: steps 1–3 two days, step 4 one day, step 5 half a day.

---

## 10. Guard rails

- Never print an EXP date in the past, or MFG more than 7 days ahead (422 with a plain
  message the hub shows).
- A product without shelf life prints blank date boxes; the hub says so next to it.
- The print log cannot be edited or deleted from the UI.
- Signed URLs expire in 30 minutes and are throttled 60 a minute per IP.
- Everything on the sheet is inline (data URIs, fonts from disk); the PDF never
  fetches over the network.
- No model identifiers, no amber `#D4813A`, prose commit messages with the owner's
  words, as in `CLAUDE.md`.

---

## 11. Owner's decisions (2026-10-04) and what is still open

Decided:

| Question | Answer | Where it landed |
|---|---|---|
| Ingredients | From the item's recipe; a manual line when the item has no recipe (or when the owner prefers it) | 4.1, `label_ingredients_source` |
| Shelf life | An option per product, set in Admin; dates blank until set | 4.1, Label tab, Settings tab |
| Label stock | All of them: plain A4 with cut lines, pre-cut sheets, single-label pages for label printers, custom sizes | 5.1 layouts |
| Typed names for new products | Yes, lettering is optional | 6.1 title row |
| Who can print | Nobody by default except the owner; grantable to any role or staff member | 3 |

Still open (do not block on these):

1. Masroshi ingredients: confirm whether flour belongs in the list. Once the recipe
   is entered in Inventory the label follows the recipe anyway.
2. Shelf life in days per product (the owner enters these in Admin after step 4).
3. Dhivehi wording proofread by a native speaker before the DV sheet is used with
   customers.
4. Which label printer, if any, so the single-label presets can be checked on it.
