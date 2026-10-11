# Labels

Pack stickers and box labels, printed from Admin → Labels. Built 2026-10-04 from the
owner's ReportLab label project (`docs/LABEL_HUB_PLAN.md`), reworked 2026-10-05 into
label types, brands, more shapes and saved labels (`docs/LABEL_HUB_V2_PLAN.md`).
Label sizes down to 3 × 2 cm and custom labels for things not on the menu came on
2026-10-11 (owner: "Add label size. For example rectangular 4 cm by 6 cm, circle 6 cm
diameter ect. Add option to add custom labels using different brands logos and other
details. Not only from the menu list").

## Who can use it

Two permissions, both owner-only until granted in Staff → Permissions (to a role or
to one person):

| Permission | Lets them |
|---|---|
| `labels.print` | The Labels page: print stickers (custom labels too) and box labels, saved labels, the stickers button on a production line (Kitchen → Batches), "Box label" on a wholesale delivery, a shop's saved box label |
| `labels.manage` | Everything above, plus custom labels (add, change, copy, remove), label types and brands, the item's Label tab and Labels → Settings |

Either one also lets the person **sign in to the admin panel** (owner, 2026-10-11:
"Label permission is given but can not use"). Admin sign-in is its own check,
`admin.access` ("Access admin panel"), which stock staff and kitchen roles do not have;
`PermissionCatalog::SATISFIED_BY` lets `labels.print` and `labels.manage` stand in for
it, so "Access admin panel" need not be ticked separately. A cashier or cook given
Print labels signs in at the admin site with their phone and PIN, finds Labels in the
menu, and otherwise sees only the pages their role already opens. `php artisan
staff:explain <phone>` says whether an account can get in and why.

## The pieces

| Piece | What it is | Where |
|---|---|---|
| **Label type** | What kind of food a label is for: Frozen Hedhika, Chilled Hedhika, Fresh Hedhika to start. Carries the heading, storage and its line, the date-box wording (MFG DATE / PACKED ON, EXP DATE / BEST BEFORE / USE BY), a use-within line, how-to-use, a note, a shelf life, whether the QR prints, and the brand | Labels → Types & brands |
| **Brand** | Who the label is from. Bake & Grill is the main brand (details from Business Details); a brand under it, like Amma, has its own name, tagline and PNG logo, and its footer says "by Bake & Grill". With no logo uploaded, a brand prints the badge shipped in `public/brand/<name>-logo.png` when there is one (Amma's is there, drawn from `docs/brand/amma-logo.html`), else the main logo | Labels → Types & brands |
| **Item's label** | Picks a type; its own ingredients, shelf life, pieces per pack, pictures; and any wording that should differ from the type's | Menu Items → item → Label |
| **Custom label** | A sticker for something that is not on the menu (a sauce in jars, a gift box, another brand's product): its own name, brand and logo, type, ingredients, shelf life, quantity and unit, wording and pictures. It prints beside the menu items | Labels → Custom labels, or **New custom label** on Pack stickers |
| **Saved label** | Every print prepared, kept with its settings to print again, download, change, copy, rename | Labels → Saved labels |

## Setting up a product

1. Menu Items → open the item → **Label** tab (the item must be saved first).
2. Tick **Print pack stickers for this item**.
3. Pick the **Label type**. Storage follows it; so do the heading, date wording,
   shelf life, how-to-use and brand. Anything typed in the boxes below prints instead
   of the type's wording, for this item only.
4. **Ingredients**: "From the recipe" lists the recipe's inventory items heaviest
   first; "Typed in" uses the lines below; the default uses the recipe when there is
   one. Inventory items that are not food (cling film, boxes) are left off with the
   🏷 button on their row in Inventory. Ingredients can also be typed on Labels →
   Settings, under each product. With none at all, the sticker leaves the heading off.
5. **Shelf life (days)**: expiry = made-on date + this. Empty uses the type's; with
   neither, the date boxes print blank for writing by hand.
6. **Pictures**: the item's **cut-out** (Photos tab, a background-less PNG) prints on
   the sticker, as it does on the menu cards and the POS. **Hand-lettered name** and
   **Food photo (labels only)** override it from the media library. Without any, the
   name is typed in the brand serif and the flame stands in.
7. The preview on the right shows the sticker from the saved settings, English or
   Dhivehi.

The nine original products are brought in once with:

```bash
cd /home/bakeandgrill/public_html/backend && php artisan labels:import-legacy /path/to/bake-grill-labels/assets
```

(copy the label project's `assets/` folder to the server first; `--dry-run` reports
without changing anything, `--force` replaces pictures already set). They get the
Frozen Hedhika type.

## Custom labels

For anything that is not on the menu. Labels → **Custom labels** → **New custom
label** (or **New custom label** above the product list on Pack stickers, which picks
the new label straight away):

1. **Product name**, and in Dhivehi if wanted.
2. **Brand and logo**: any brand, or **+** to add one with its own logo there and then.
   Empty follows the label type's brand. A custom label's own brand also wins over
   **Print as** on Pack stickers.
3. **Label type**: brings the heading, storage, date wording, shelf life and how-to-use,
   as for a menu item. Anything typed in the boxes below prints instead.
4. **Ingredients**, storage, **shelf life (days)**, **quantity per pack** and the
   **unit** after it (PCS, G, ML, KG, PACK).
5. **Wording on the sticker**: heading, storage line, note, how to use, each in
   English and Dhivehi. An empty box prints what is shown in grey.
6. **Picture** and **hand-lettered name**: a PNG upload (kept exactly as uploaded) or
   one from the media library. Uploading a picture to a new label saves it first.

The preview beside the form shows the saved label at 105 × 148, 40 × 60 and 6 cm round,
in English or Dhivehi. **Print** opens Pack stickers with the label picked; it prints
there on any size, alone or on the same sheet as menu items. On the list, **Copy**
makes a copy to change, **Remove** deletes it: prints already made stay in the log,
and a saved label that only had removed products says so instead of printing.

## What every sticker carries

The same header and footer on every size and shape (owner: "all should have common
header and footer including the branding details"):

- **Header**: the brand's logo and name, the type's heading ("FROZEN HEDHIKA").
- **Footer**: brand name, tagline (or "by Bake & Grill"), address, phone, ways to
  reach you, website, and the **complaints QR**, the same code the receipts and the
  poster carry (it scans to the live site's complaint box). Off per type if wanted.
- Between them: the product name, the picture, ingredients, **HOW TO USE**, a note,
  the date boxes with the type's wording, the **use-within** line, batch and
  quantity with the unit, the storage strip.

Dates print as `04 / 10 / 2026` or `4 Oct 2026` (Labels → Settings → Dates).

## Printing

**Pack stickers** (Labels → Pack stickers): tick products and how many of each (− and +
move a whole sheet). Menu items and custom labels share the list (**All**, **Menu
items**, **Custom labels** narrow it) and can go on the same sheet. Then the **label
size**, the language, **Print as** (one type for the whole sheet, optional), and
whether to fill the dates. The **Preview** beside the form
(below it on a phone) redraws half a second after every change: **Sticker** shows one
sticker at its own shape, **Sheet** the first page as it will come out of the printer,
and with several products picked a list chooses which one to look at. A request the
server would refuse (an expiry already past, too many stickers) shows its reason under
the preview before anything is prepared. Press **Prepare**: the page lists what will
print with each product's expiry, and the print is saved. Then **Print** or
**Download PDF**. Print at actual size (100 %). **On a phone or tablet,
Print opens the PDF** (Share → Print): a phone's own web print adds margins the sheet
has no room for.

**Label size** has three parts. **Shape**: rectangle or round. **Size (mm)**: one tap,
or **Custom** to type a width and height (a rectangle can be swapped round with ⇄) or
a round sticker's size across. **Print on**: an A4 sheet, cut on the dashed lines (the
chip says how many fit), a ready-cut A4 sheet or two on landscape A4 (the full size
only), or a label printer, one per label. The line under it says it the owner's way,
for example "40 × 60 mm (4 × 6 cm) · small sticker · 21 on a landscape A4 sheet".

| Size, one tap | On an A4 sheet | Design |
|---|---|---|
| 105 × 148.5 mm | 4 (also ready-cut, or 2 on landscape A4) | Full |
| 100 × 150, 76 × 127 mm | 2, 4 | Full, scaled |
| 99 × 70.5 mm | 8 | Compact |
| 66 × 72 mm | 12 | Compact |
| 40 × 60 mm (the owner's 4 × 6 cm) | 21 | Small, upright |
| 100 × 50, 70 × 50, 60 × 40, 50 × 30, 40 × 30 mm | 10, 16, 21, 36, 45 | Small, wide |
| Round 70, 60, 50, 40, 30 mm | 8, 12, 20, 35, 54 | Round |

Every size also prints on a label printer. A typed size can be any rectangle from
30 × 20 mm (either way round) up to 200 × 287 mm on an A4 sheet (the sheet keeps a
5 mm edge) or A4 itself on a label printer, and any round sticker from 30 to 200 mm.
On A4 as many fit as the sheet holds inside the edge, upright or landscape, whichever
holds more.

The design follows the size. **Full**: the original sticker, scaled to fit while it
stays readable (down to 0.7 of 105 × 148.5). **Compact**: from 50 × 60 mm, the full
header and a two-line footer. **Small** (SmallStickerDesign), below that down to
30 × 20 mm. It always carries the brand and the type's heading, the name, the made-on
and expiry dates and how to keep it; the footer with the phone, the ingredients, the
note, the QR, the batch line, the use-within line and the picture go in, in that order,
while there is room. An upright label stacks everything; a wide one (width at least
1.2 × the height) puts the dates in a column beside the name; under 24 mm tall a tinted
line takes the header band's place. Ingredients that do not fit end in "…", a narrow
storage strip takes two lines, and nothing is set below about 3pt. **Round**:
everything centred, each row no wider than the circle; from
68 mm the brand logo on the left, the QR on the right and a batch line; under 45 mm a
small round of the name, dates and storage.

**Rounded corners** rounds a rectangle's cut line. Cut lines are dashed; round
stickers have dashed circles.

Refused with a message: an expiry before the made-on date, an expiry already past, a
made-on date more than a week ahead, more than 400 stickers at once, a size outside
the limits.

**From a production line** (Kitchen → Batches → the tag icon on a line): the same panel
with the batch number, the batch's own expiry (which wins over shelf life) and made-on
date filled in.

**Box labels** (Labels → Box labels, or "Box label" on a wholesale delivery). The
same live preview sits beside the form, so the label is seen filled in before it is
prepared. Each shop's box label is kept in one place, with the shop:

1. Pick the **Shop**. Its saved box label fills everything in: deliver-to name, Attn,
   role and phone, boat, pick-up point, delivery window, handling (frozen / chilled /
   room temperature, with its badge, heading and strip), and its own item list in its
   order with its **article names** (the names the shop checks boxes against).
2. Optionally pick a **Delivery**: its date and the quantities sent go on top.
3. Change anything, then **Save for (shop)** keeps it for next time, on every device.
   The date, PO and box numbers are not kept.

A quantity of 0 leaves a line to write the count on; three spare rows are always
added; up to 16 lines.

**Saved labels** (Labels → Saved labels): every label prepared, newest printed first.
**Print** prints it again (stickers with dates get today's made-on date and a fresh
expiry; change the label to use other dates), **Download PDF**, **Edit** opens it back
in the form with every setting as it was, **Copy**, the name is a **Rename** button,
**Remove**. The print log (every sheet, by whom, with dates and batch) is folded
beneath.

## Where things live

| What | Where |
|---|---|
| Label types, brands | `label_types`, `label_brands`; `App\Models\LabelType`, `LabelBrand`; `App\Domains\Labels\LabelTypes` resolves what an item prints with (item's own wording → printed-as type → item's type → storage defaults) |
| An item's own wording | `items.label_*` columns, on the item's Label tab |
| Custom labels | `custom_labels` (`App\Models\CustomLabel`), its label columns named as an item's so `LabelTypes::forItem()` and `StickerSheet` print either; its own `brand_id` wins over the type's. API `GET /api/labels/custom` (`labels.print`), writes under `labels.manage`. A sticker request names one as `{"id": 7, "kind": "custom"}`; on a sheet link `items=7:2,c7:3` is menu item 7 twice and custom label 7 three times |
| Saved labels | `label_jobs` (`App\Models\LabelJob`): the request as sent, a name, print count |
| Print log | `label_prints`; written on every print, never edited; `item_id` or `custom_label_id` (emptied when the custom label is removed), the layout and label size, shown in words ("40 × 60 mm, 21 on A4", `StickerLayouts::describe()`) |
| Footer wording, box-label wording per storage, date style, pre-cut offsets | Labels → Settings, site settings with the originals as defaults (`App\Domains\Labels\LabelSettings`) |
| Phone, website, address, landmark, tagline | Business Details (same as receipts) |
| Sticker designs | `App\Domains\Labels\StickerDesign`: `full`, `mini`, `round`; `SmallStickerDesign`: `small` and rounds under 45 mm (pieces in mm) |
| Label stock and sizes | `App\Domains\Labels\StickerLayouts`: `LAYOUTS` (`shape` rect or circle; `a4-custom` and `a4-round-custom` fill A4 with any size, `single-custom` and `single-round-custom` one per label), `PRESETS` (the one-tap sizes and the layout for each stock), `design()`, `grid()`, `limits()` |
| Size picker | `apps/admin-dashboard/src/components/labels/LabelSizePicker.tsx` and `labelSize.ts`, which mirrors `design()`, `grid()` and the limits so the picker can say "21 on A4" and "too small" before asking. `fixtures/label_size_parity.json` holds both to the same answers (`LabelSizeParityTest`, `labelSize.test.ts`); change the server, the mirror and the table together |
| Box label | `App\Domains\Labels\BoxLabel`; a shop's saved label in `trade_accounts.box_label` |
| Brand logos, lettering, cut-outs | `App\Domains\Labels\LabelMedia::storePng`: kept as the PNG uploaded, never re-encoded |
| QR | `App\Support\QrSvg::dataUri(ComplaintBoxLink::url('label'))`, bare |
| Sheets | `resources/views/labels/*.blade.php`, signed routes `/labels/stickers`, `/labels/box` (+ `.pdf`), links last 30 minutes, same-origin framing allowed for the previews. `preview=1` draws the first page with no print bar, scaled to its frame (up as well as down: the body must not clip, or a small label scaled up shows only its top); `one=1` with it draws the first sticker alone on a page its own size (`one_url` from the API) |
| Live preview | `apps/admin-dashboard/src/components/labels/SheetPreview.tsx`: a frame the page's shape (width ÷ height) around the preview link; the panels ask the API with `preview: true` half a second after the last change, which logs and saves nothing |
| API | `routes/domains/labels.php`, `App\Http\Controllers\Api\LabelsController` |
| Fonts for the PDF | `public/fonts/pdf` (TTF) and the matching WOFF2 in `public/fonts` for the browser |

## Two renderer facts the code depends on

- **Baselines.** Browsers put a line's baseline at the line-box top plus the font's
  ascent; dompdf puts it at 0.88 × line height × (ascent + descent). The sheet view
  positions every piece of text for the renderer it is in (`LabelText::PDF_BASELINE_K`).
  Lines are broken on the server so both renderers print the same lines.
- **Thaana.** dompdf draws characters in stored order, so Dhivehi came out mirrored.
  `App\Support\ThaanaVisual::order()` gives it visual order for the PDF path only.
