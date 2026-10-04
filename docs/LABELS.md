# Labels

Pack stickers and box labels, printed from Admin → Labels. Built 2026-10-04 from the
owner's ReportLab label project (`docs/LABEL_HUB_PLAN.md`), reworked 2026-10-05 into
label types, brands, more shapes and saved labels (`docs/LABEL_HUB_V2_PLAN.md`).

## Who can use it

Two permissions, both owner-only until granted in Staff → Permissions (to a role or
to one person):

| Permission | Lets them |
|---|---|
| `labels.print` | The Labels page: print stickers and box labels, saved labels, the stickers button on a production line (Kitchen → Batches), "Box label" on a wholesale delivery, a shop's saved box label |
| `labels.manage` | Everything above, plus label types and brands, the item's Label tab and Labels → Settings |

## The pieces

| Piece | What it is | Where |
|---|---|---|
| **Label type** | What kind of food a label is for: Frozen Hedhika, Chilled Hedhika, Fresh Hedhika to start. Carries the heading, storage and its line, the date-box wording (MFG DATE / PACKED ON, EXP DATE / BEST BEFORE / USE BY), a use-within line, how-to-use, a note, a shelf life, whether the QR prints, and the brand | Labels → Types & brands |
| **Brand** | Who the label is from. Bake & Grill is the main brand (details from Business Details); a brand under it, like Amma, has its own name, tagline and PNG logo, and its footer says "by Bake & Grill". With no logo uploaded, a brand prints the badge shipped in `public/brand/<name>-logo.png` when there is one (Amma's is there, drawn from `docs/brand/amma-logo.html`), else the main logo | Labels → Types & brands |
| **Item's label** | Picks a type; its own ingredients, shelf life, pieces per pack, pictures; and any wording that should differ from the type's | Menu Items → item → Label |
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
move a whole sheet), the language, the label stock, **Print as** (one type for the
whole sheet, optional), and whether to fill the dates. Press **Prepare**: the page
lists what will print with each product's expiry, and the print is saved. Then
**Print** or **Download PDF**. Print at actual size (100 %). **On a phone or tablet,
Print opens the PDF** (Share → Print): a phone's own web print adds margins the sheet
has no room for.

| Label stock | Size | Design |
|---|---|---|
| 4 on A4, 4 on A4 pre-cut, 2 on A4 | 105 × 148.5 mm | Full |
| 8 on A4 | 99 × 70.5 mm | Compact, with the full header and two-line footer |
| 12 on A4 | 66 × 72 mm | Compact, as above |
| Label printer 105 × 148, 100 × 150, 76 × 127 mm | one per page | Full |
| Custom | 50 × 45 mm to A4 | Full down to 0.7 of its size, else compact |
| Round 50 mm (20 on A4), round 70 mm (8 on A4), label-printer round 50 / 70 mm, custom round 40 to 200 mm | circles | Round: everything centred, each row no wider than the circle; from 68 mm the brand logo on the left, the QR on the right and a batch line |

**Rounded corners** rounds a rectangle's cut line. Cut lines are dashed; round
stickers have dashed circles.

Refused with a message: an expiry before the made-on date, an expiry already past, a
made-on date more than a week ahead, more than 400 stickers at once, a size outside
the limits.

**From a production line** (Kitchen → Batches → the tag icon on a line): the same panel
with the batch number, the batch's own expiry (which wins over shelf life) and made-on
date filled in.

**Box labels** (Labels → Box labels, or "Box label" on a wholesale delivery). Each
shop's box label is kept in one place, with the shop:

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
| Saved labels | `label_jobs` (`App\Models\LabelJob`): the request as sent, a name, print count |
| Print log | `label_prints`; written on every print, never edited |
| Footer wording, box-label wording per storage, date style, pre-cut offsets | Labels → Settings, site settings with the originals as defaults (`App\Domains\Labels\LabelSettings`) |
| Phone, website, address, landmark, tagline | Business Details (same as receipts) |
| Sticker designs | `App\Domains\Labels\StickerDesign`: `full`, `mini`, `round` (pieces in mm) |
| Label stock | `App\Domains\Labels\StickerLayouts` (`shape` rect or circle) |
| Box label | `App\Domains\Labels\BoxLabel`; a shop's saved label in `trade_accounts.box_label` |
| Brand logos, lettering, cut-outs | `App\Domains\Labels\LabelMedia::storePng`: kept as the PNG uploaded, never re-encoded |
| QR | `App\Support\QrSvg::dataUri(ComplaintBoxLink::url('label'))`, bare |
| Sheets | `resources/views/labels/*.blade.php`, signed routes `/labels/stickers`, `/labels/box` (+ `.pdf`), links last 30 minutes, same-origin framing allowed for the item preview |
| API | `routes/domains/labels.php`, `App\Http\Controllers\Api\LabelsController` |
| Fonts for the PDF | `public/fonts/pdf` (TTF) and the matching WOFF2 in `public/fonts` for the browser |

## Two renderer facts the code depends on

- **Baselines.** Browsers put a line's baseline at the line-box top plus the font's
  ascent; dompdf puts it at 0.88 × line height × (ascent + descent). The sheet view
  positions every piece of text for the renderer it is in (`LabelText::PDF_BASELINE_K`).
  Lines are broken on the server so both renderers print the same lines.
- **Thaana.** dompdf draws characters in stored order, so Dhivehi came out mirrored.
  `App\Support\ThaanaVisual::order()` gives it visual order for the PDF path only.
