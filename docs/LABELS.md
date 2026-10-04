# Labels

Pack stickers and box labels for frozen short eats, printed from Admin → Labels.
Built 2026-10-04 from the owner's ReportLab label project; the design and the
reasons behind it are in `docs/LABEL_HUB_PLAN.md`.

## Who can use it

Two permissions, both owner-only until granted in Staff → Permissions (to a role or
to one person):

| Permission | Lets them |
|---|---|
| `labels.print` | Print pack stickers and box labels: the Labels page, the stickers button on a production line (Kitchen → Batches), "Box label" on a wholesale delivery |
| `labels.manage` | Everything above, plus the item's Label tab and Labels → Settings |

## Setting up a product

1. Menu Items → open the item → **Label** tab (the item must be saved first).
2. Tick **Print pack stickers for this item**.
3. **Ingredients**: "From the recipe" lists the recipe's inventory items heaviest
   first; "Typed in" uses the lines below; the default uses the recipe when there is
   one. Inventory items that are not food (cling film, boxes) are left off with the
   🏷 button on their row in Inventory (dimmed means left off).
4. **Shelf life (days)**: expiry = made-on date + this. Empty means the date boxes
   print blank for writing by hand.
5. Storage (frozen, chilled, room temperature), pieces per pack.
6. **Hand-lettered name** and **food photo**: optional, from the media library. A
   transparent PNG works best. Without lettering the name is typed in the brand serif;
   without a photo the item's cut-out is used, then the flame.
7. The preview on the right shows the sticker from the saved settings, in English or
   Dhivehi.

The nine original products are brought in once with:

```bash
cd /home/bakeandgrill/public_html/backend && php artisan labels:import-legacy /path/to/bake-grill-labels/assets
```

(copy the label project's `assets/` folder to the server first; `--dry-run` reports
without changing anything, `--force` replaces pictures already set). Shelf life is not
in the old project, so set it afterwards in Labels → Settings.

## Printing

**Pack stickers** (Labels → Pack stickers): tick products and how many of each, the
language, the label stock, and whether to fill the dates. Press **Prepare**: the page
lists what will print with each product's expiry. Then **Print** (opens the sheet and
the print dialog) or **Download PDF**. Print at actual size (100 %).

| Label stock | Size | Notes |
|---|---|---|
| 4 on A4 | 105 × 148.5 mm | The original; cut on the dashed lines |
| 4 on A4, pre-cut sheet | 105 × 148.5 mm | No cut lines; nudge position in Settings if it prints off the cut |
| 2 on A4 | 105 × 148.5 mm | Landscape A4 |
| 8 on A4 | 99 × 70.5 mm | Compact sticker |
| 12 on A4 | 66 × 72 mm | Compact sticker |
| Label printer | 105 × 148, 100 × 150, 76 × 127 mm | One sticker per page |
| Custom | 50 × 45 mm to A4 | One sticker per page |

Down to 0.7 of its size the full design is scaled to fit; smaller labels get the
compact sticker (same information, fixed type no smaller than 5.5 pt, photo when there
is room).

Refused with a message: an expiry before the made-on date, an expiry already past, a
made-on date more than a week ahead, more than 400 stickers at once, a custom size
smaller than 50 × 45 mm.

**From a production line** (Kitchen → Batches → the tag icon on a line): the same panel
with the batch number, the batch's own expiry (which wins over shelf life) and made-on
date filled in.

**Box labels** (Labels → Box labels, or "Box label" on a wholesale delivery): blank, or
filled from a delivery with the shop, contact, date and a line per item sent. Every
field can be changed; a quantity of 0 leaves a line to write on; three spare rows are
always added; up to 16 lines. Boat, pick-up point and delivery window are remembered
per shop on that device.

## Where things live

| What | Where |
|---|---|
| Wording (heading, storage lines, box strip, Dhivehi footer lines) | Labels → Settings, stored as site settings with the original wording as defaults (`App\Domains\Labels\LabelSettings`) |
| Phone, website, address, landmark, tagline | Business Details (same as receipts) |
| Print log | Labels → History (`label_prints`); written when a link is issued, never edited |
| Sticker design | `App\Domains\Labels\StickerDesign` (pieces in mm from the original scripts) |
| Label stock | `App\Domains\Labels\StickerLayouts` |
| Box label | `App\Domains\Labels\BoxLabel` |
| Sheets | `resources/views/labels/*.blade.php`, signed routes `/labels/stickers`, `/labels/box` (+ `.pdf`), links last 30 minutes |
| API | `routes/domains/labels.php`, `App\Http\Controllers\Api\LabelsController` |
| Fonts for the PDF | `public/fonts/pdf` (TTF; dompdf reads nothing else) and the matching WOFF2 in `public/fonts` for the browser |

## Two renderer facts the code depends on

- **Baselines.** Browsers put a line's baseline at the line-box top plus the font's
  ascent; dompdf puts it at 0.88 × line height × (ascent + descent). The sheet view
  positions every piece of text for the renderer it is in (`LabelText::PDF_BASELINE_K`).
  Lines are broken on the server so both renderers print the same lines. Measured
  against the original PDFs, baselines match to 0.01 mm in the PDF and within 0.4 mm
  in a browser print.
- **Thaana.** dompdf draws characters in stored order, so Dhivehi came out mirrored.
  `App\Support\ThaanaVisual::order()` gives it visual order (each fili just before its
  consonant, which is where an unshaped renderer must meet it to set it over the
  letter), for the PDF path only. The menu PDF uses it too.
