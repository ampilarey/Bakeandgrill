# Labels

Pack stickers and box labels, printed from Admin → Labels. Built 2026-10-04 from the
owner's ReportLab label project (`docs/LABEL_HUB_PLAN.md`), reworked 2026-10-05 into
label types, brands, more shapes and saved labels (`docs/LABEL_HUB_V2_PLAN.md`).
Label sizes down to 3 × 2 cm and custom labels for things not on the menu came on
2026-10-11 (owner: "Add label size. For example rectangular 4 cm by 6 cm, circle 6 cm
diameter ect. Add option to add custom labels using different brands logos and other
details. Not only from the menu list"). On 2026-10-12 (owner: "build all" of the audit's
recommendations): price and barcode, net weight, allergens in bold, both languages on
one sticker, a draft previewed as it is typed, pinned saved labels, and stickers from
the kitchen screen (§ For the shop till and after).

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
| **Brand** | Who the label is from. Bake & Grill is the main brand (details from Business Details); a food brand under it, like Amma, has its own name and PNG logo on the header, and the footer stays Bake & Grill's (owner, 2026-10-12: "Amma is a food brand label but the actual brand is under Bake & Grill"). With no logo uploaded, a brand prints the badge shipped in `public/brand/<name>-logo.png` when there is one (Amma's is there, drawn from `docs/brand/amma-logo.html`), else the main logo | Labels → Types & brands |
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
7. **For the shop till**: **Print the price** puts the menu price on the sticker (or
   the **Label price** typed beside it); a **Barcode** (EAN-13 or EAN-8: type the first
   12 or 7 digits and the check digit is added, or all of them and it is checked) prints
   on the full-size sticker with its digits beneath; a **Net weight** ("250 g") prints
   beside the quantity. The item's allergens, ticked on its Details tab, print bold in
   the ingredients and, when the note is empty, as "Contains egg, tree nuts".
8. The preview on the right shows the sticker from the saved settings, English or
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
   **unit** after it (PCS, G, ML, KG, PACK), the **allergens** (a comma list, printed
   bold and as "Contains …") and the **net weight**; under **For the shop till**, a
   **price** and a **barcode**.
5. **Wording on the sticker**: heading, storage line, note, how to use, each in
   English and Dhivehi. An empty box prints what is shown in grey. This part, **For
   the shop till** and **Footer and complaints QR** fold away, open when they hold
   something (audit, 2026-10-12).
6. **Footer and complaints QR** (owner, 2026-10-12: "Standard footer options with
   standard branding footer. Option to add complaint qr with its branding", then "No
   easy option to select and edit branding footer"). The footer is always Bake &
   Grill's branding, whatever food brand is on the header (owner, 2026-10-12). The
   **Footer** box picks a footer by name (§ Footers): empty follows the label type's
   footer, else **Standard** (the business's own lines from Business Details); any
   footer made under Types & brands can be picked instead. The pencil beside the box
   changes the footer that prints, picked or not, in place, and **+** makes a new one,
   without leaving the label; the line under the box says what it prints. The **complaints QR** follows the
   footer (whose own switch follows the label type), or is printed or left off for
   this label alone; on the full sticker the code carries the brand mark inside
   (`StickerSheet::QR_LOGO_RATIO`, smaller than the poster's so an 11.5 mm code still
   scans), the small designs keep the bare code.
7. **Size and language.** The preview is the first sticker of the sheet Pack stickers
   would print, at the size last used there (full size until one is picked); **Sticker
   size** folds open to the same picker as Pack stickers (every one-tap size, a typed
   size, round, where it prints). EN / ދިވެހި / Both above the preview is the language
   the label usually prints in and is saved with it. **Print…** saves the label and
   opens Pack stickers on that size and language; on a phone or tablet the preview is
   the bar pinned under the title, and Close, Print… and Save stay in the sheet's
   footer. Closing with unsaved changes asks first.
8. **Picture** and **hand-lettered name**: a PNG upload (kept exactly as uploaded) or
   one from the media library. Uploading a picture to a new label saves it first.

The list says how often each label was printed and when, and which language it
prints in; with four or more labels a search box finds one by name, Dhivehi name,
brand or type. One-tap sizes gained 50 × 80, 60 × 90, 80 × 120, 100 × 100 and 80 and
100 mm rounds (owner, 2026-10-12: "I need more size options").

The preview beside the form redraws as you type, saved or not (the server keeps the
draft for half an hour under a token the preview link names; nothing is printed or
logged from it), at 105 × 148, 40 × 60 and 6 cm round, in English, Dhivehi or both. **Print** opens Pack stickers with the label picked; it prints
there on any size, alone or on the same sheet as menu items. On the list, **Copy**
makes a copy to change, **Remove** deletes it: prints already made stay in the log,
and a saved label that only had removed products says so instead of printing.

## What every sticker carries

The same header and footer on every size and shape (owner: "all should have common
header and footer including the branding details"):

- **Header**: the brand's logo and name, the type's heading ("FROZEN HEDHIKA").
- **Footer**: always Bake & Grill's branding, whatever food brand is on the header
  (owner, 2026-10-12: "Amma is a food brand label but the actual brand is under
  Bake & Grill, so its branding should be used in the footer"): the business name,
  tagline, address, phone, ways to reach you, website, the brand mark and the
  **complaints QR**, the same code the receipts and the poster carry (it scans to
  the live site's complaint box). Which lines print is a **footer** picked by name
  (below); a label type and a custom label each pick theirs, and Pack stickers can
  put one footer on a whole sheet.
- Between them: the product name, the picture, ingredients, **HOW TO USE**, a note,
  the date boxes with the type's wording, the **use-within** line, batch and
  quantity with the unit, the storage strip.

### Footers

Owner, 2026-10-12: "No easy option to select and edit branding footer", and "Footer
should be always branding of Bake and Grill. Amma is a food brand label but the actual
brand is under Bake and Grill, so its branding should be used in the footer." A footer
is a named preset of every footer line (`label_footers`, `App\Models\LabelFooter`): the
name printed big and its Dhivehi, the tagline (or your own words), phone, ways to reach
you, website, address and landmark (each with a Dhivehi line), the complaints QR and
the brand mark. A footer has no brand and no by-line: **every line left empty prints
the live value from Business Details**, whatever food brand is on the header, so
**Standard**, seeded with every box empty, follows Business Details for ever. (The
first migration also seeded one footer per food brand that printed that brand's
lines; the second removed them, and a food brand's tagline, which printed only
there, is no longer offered on the brand.) The migration turned every custom label's
old "own words" footer into a footer named "<label> footer" and its "standard" choice
into Standard.

**Look** (owner, 2026-10-12: footers "in different styles"; `label_footers.style`,
`StickerDesign::footerPalette()`). Each footer picks how it prints, on every size:
**Dark** (the dark band, as before), **Light** (a pale band with a rust rule along the
top and dark lettering), **Rust** (the band in the brand rust), **Plain** (no band: the
lines on the sticker's own ground under a rust rule) or **Logo** (the dark band with the
whole Bake & Grill logo where the mark and the name were; the tagline moves up beside
it). The round sticker has no band, so there only Rust changes the colour of its footer
line. The editor shows a swatch of each look.

Where they are picked, each with the same box, a pencil to change the footer that
prints (picked or, with nothing picked, the type's or the standard one) in place and
**+** to make one (`FooterPicker`; changing needs **Manage label settings**, printing
with one only **Print labels**):

- **Custom label → Footer and complaints QR**: that label's footer (`custom_labels.footer_id`).
- **Types & brands → a type → Footer**: the default for every item and custom label
  printed with that type (`label_types.footer_id`).
- **Pack stickers → More options → Footer**: one footer for every sticker on the sheet
  (`footer` in the request; a saved label keeps it and Print again prints it).
- **Types & brands → Footers**: the list, with what each prints and how many labels
  and types use it; Standard cannot be removed, and a removed footer's labels and types
  go back to the standard one.

Which footer prints: the sheet's, else the custom label's, else the type's, else
Standard (`StickerSheet::footerPreset`, `standardFooter`, `LabelTypes::footer`). The
complaints QR: the label's own switch, else the picked footer's (sheet, label or
type), else the type's own switch (nothing picked prints Standard's lines with the
type's QR choice).

Dates print as `04 / 10 / 2026` or `4 Oct 2026` (Labels → Settings → Dates and fonts).

**Dhivehi font** (Labels → Settings → Dates and fonts; owner, 2026-10-12: "dhivehi font
is not nice"). Stickers set Dhivehi in **Noto Sans Thaana** (clean, with a true bold for
the headings; OFL, `backend/public/fonts/NOTO-SANS-THAANA-LICENSE.txt`), or in
**Faruma** (the classic face the first stickers used, thickened by hand for headings),
or in **the website's uploaded font** (Content Hub `dhivehi_font`; the PDF uses it only
when it was uploaded as TTF or OTF, otherwise the PDF falls back to Faruma). The web
preview and the PDF use the same face (`LabelText::dvFace()`); until 2026-10-12 the
preview's font rule was dropped by Blade escaping, so browsers drew a system font there.
The menu PDF, website and order app keep their own Dhivehi font setting.

**Why the PDF has its own Noto files** (owner, 2026-10-12, again: "Still label dhivehi
font is not nice"). Noto Sans Thaana places each fili over its letter with font
positioning rules (GPOS) that a browser applies and dompdf ignores, so in the PDF the
marks drifted off their letters. The PDF now sets Dhivehi in a derived face,
`backend/public/fonts/pdf/NotoSansThaana-{Regular,Bold}-composed.ttf`, in which every
letter-and-fili pair is one ready-drawn glyph (429 pairs each, in the private-use
block from U+E000: letter index × 16 + mark index, `fixtures/thaana_pairs.json`).
`ThaanaVisual::order($text, composed: true)` swaps each pair for its glyph while it
puts the run in visual order (`ThaanaVisual::pair()`), only on the PDF path and only
for Noto (`LabelText::dvFace()['composed']`); the browser keeps the plain webfont and
shapes it itself. The files come from `scripts/thaana-composed-font.py` (Python
fontTools, the same install as the Dhivehi webfont inspector) and are checked in, so
nothing runs at deploy time; rerun the script only after replacing the Noto files.

## Printing

**Pack stickers** (Labels → Pack stickers): **Print again** at the top lists the pinned
labels, then the last sheets printed; one tap prints one with today's dates, or tap
its name to change it first. A product that keeps 3 days or fewer carries a **Short
life** mark in the list (and on Settings), so a chilled item is not printed with a
frozen item's dates by mistake. Then tick products and how many of each (− and +
move a whole sheet). Menu items and custom labels share the list (**All**, **Menu
items**, **Custom labels** narrow it) and can go on the same sheet. Then the **label
size**, the language (**English**, **ދިވެހި**, or **Both**), **Print as** (one type for
the whole sheet, optional), a **Footer** for the whole sheet (optional, § Footers), and
whether to fill the dates (with the dates on, each picked product shows the expiry it
will get). **Print as**, **Footer**, the batch number (a **Today** button writes the
date as a code, 261011) and the quantity per pack sit behind **More options**.

**Both** prints every line in English with the Dhivehi beneath or beside it (owner,
2026-10-12: "When both is selected. Not showing both languages correctly"). On the full
sticker: the heading on two lines, the name, the ingredients list, **HOW TO USE** and the
note each in both, the date boxes labelled "MFG / ހެދި ތާރީޚު" and "EXP / ހަމަވާ ތާރީޚު",
the use-within line as a pair, the storage strip in both. The compact design sets the
heading side by side and the rest beneath; the small and round designs add the Dhivehi
name, ingredients line, storage line, short date labels (ހެދި / ހަމަވާ) and the use-within
pair where there is room, and drop them first when there is not. In every language the
full sticker's picture band shrinks to make room for the ingredients, how-to-use and note
(before 2026-10-12 the three could overlap), down to no picture at all. The **Preview** beside
the form redraws half a second after every change: **Sticker** shows one
sticker at its own shape, **Sheet** the first page as it will come out of the printer,
and with several products picked a list chooses which one to look at. On a phone or
tablet the preview is a bar pinned under the header, a thumbnail that redraws as the
form changes; **Bigger** opens it at full width (the box label has the same bar). A request the
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
date filled in. **From the kitchen screen** (KDS → Production → Today's plan): once a
job is sent to the counter, a cook with Print labels sees **Stickers for batch …** on
it, which opens the PDF of one 40 × 60 mm sticker a piece, on A4, with the batch's
number and dates.

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

A custom label's row has **Save** beside Print (owner, 2026-10-12: "no option to send
to saved labels"): one tap prepares a full sheet of it at the size Pack stickers last
printed (full stickers, four to an A4 page, until a size is picked there; English with
the Dhivehi beneath when it has a Dhivehi name) and opens Saved labels on it. Print on
the row opens Pack stickers instead, to choose a size first.

**Saved labels** (Labels → Saved labels): every label prepared, newest printed first.
**Print** prints it again (stickers with dates get today's made-on date and a fresh
expiry; change the label to use other dates), **Download PDF**, **Edit** opens it back
in the form with every setting as it was, **Copy**, the star **pins** it (a favourite:
it stays at the top of the list and leads Print again), the name with its pencil
renames it in place, **Remove**. The print log (every sheet, by whom, with dates and batch) is folded
beneath.

## Where things live

| What | Where |
|---|---|
| Label types, brands | `label_types`, `label_brands`; `App\Models\LabelType`, `LabelBrand`; `App\Domains\Labels\LabelTypes` resolves what an item prints with (item's own wording → printed-as type → item's type → storage defaults) |
| An item's own wording | `items.label_*` columns, on the item's Label tab |
| Custom labels | `custom_labels` (`App\Models\CustomLabel`), its label columns named as an item's so `LabelTypes::forItem()` and `StickerSheet` print either; its own `brand_id` wins over the type's. API `GET /api/labels/custom` (`labels.print`), writes under `labels.manage`. A sticker request names one as `{"id": 7, "kind": "custom"}`; on a sheet link `items=7:2,c7:3` is menu item 7 twice and custom label 7 three times |
| Saved labels | `label_jobs` (`App\Models\LabelJob`): the request as sent, a name, print count |
| Print log | `label_prints`; written on every print, never edited; `item_id` or `custom_label_id` (emptied when the custom label is removed), the layout and label size, shown in words ("40 × 60 mm, 21 on A4", `StickerLayouts::describe()`) |
| Footers | `label_footers` (`App\Models\LabelFooter`, § Footers); `custom_labels.footer_id`, `label_types.footer_id`, `footer` in a sticker request; `LabelTypes::footer()` fills the blanks, `StickerSheet::footerPreset()` picks which one. API `GET /api/labels/footers` (`labels.print`), `POST` / `PUT` / `DELETE /api/labels/footers/{footer}` (`labels.manage`; the standard one cannot be removed, 422) |
| Box-label wording per storage, date style, pre-cut offsets | Labels → Settings, site settings with the originals as defaults (`App\Domains\Labels\LabelSettings`) |
| Phone, website, address, landmark, tagline | Business Details (same as receipts) |
| Sticker designs | `App\Domains\Labels\StickerDesign`: `full`, `mini`, `round`; `SmallStickerDesign`: `small` and rounds under 45 mm (pieces in mm). A text piece with `bold_words` sets those words in the bold face (allergens). `lang: both` reaches the designs as `$d['both']` |
| Price, barcode, net weight, allergens | `items.label_price` / `label_show_price` / `label_barcode` / `label_net_weight`; `custom_labels` the same plus `label_allergens`; `StickerSheet::price()`, `allergens()`; `App\Domains\Labels\Barcode` (EAN-13/EAN-8 check digit, modules, bars as an SVG data URI; the digits are a text piece beneath). The bars print on the full design only; the compact sizes in use have no room |
| Draft preview | `POST /api/labels/custom/preview` (`labels.manage`) keeps the draft in the cache for 30 minutes (`StickerSheet::keepDraft`) and links the sheet with `items=d<token>:1`; `StickerSheet::draft()` builds an unsaved `CustomLabel` from it. The print API refuses a draft |
| Pinned labels | `label_jobs.pinned`; `PUT /api/labels/jobs/{job}` takes `pinned`; the list orders pinned first, `?pinned=1` filters |
| Kitchen screen stickers | `apps/kds-web`: `fetchProductionStickers`, `productionStickerLinks`, `labelSheetUrl`; the Stickers button on `KitchenProductionPanel` for a job sent this session, shown with `labels.print` |
| Label stock and sizes | `App\Domains\Labels\StickerLayouts`: `LAYOUTS` (`shape` rect or circle; `a4-custom` and `a4-round-custom` fill A4 with any size, `single-custom` and `single-round-custom` one per label), `PRESETS` (the one-tap sizes and the layout for each stock), `design()`, `grid()`, `limits()` |
| Size picker | `apps/admin-dashboard/src/components/labels/LabelSizePicker.tsx` and `labelSize.ts`, which mirrors `design()`, `grid()` and the limits so the picker can say "21 on A4" and "too small" before asking. `fixtures/label_size_parity.json` holds both to the same answers (`LabelSizeParityTest`, `labelSize.test.ts`); change the server, the mirror and the table together |
| Box label | `App\Domains\Labels\BoxLabel`; a shop's saved label in `trade_accounts.box_label` |
| Brand logos, lettering, cut-outs | `App\Domains\Labels\LabelMedia::storePng`: kept as the PNG uploaded, never re-encoded |
| QR | `App\Support\QrSvg::dataUri(ComplaintBoxLink::url('label'))`, bare |
| Sheets | `resources/views/labels/*.blade.php`, signed routes `/labels/stickers`, `/labels/box` (+ `.pdf`), links last 30 minutes, same-origin framing allowed for the previews. `preview=1` draws the first page with no print bar, scaled to its frame (up as well as down: the body must not clip, or a small label scaled up shows only its top); `one=1` with it draws the first sticker alone on a page its own size (`one_url` from the API) |
| Live preview | `apps/admin-dashboard/src/components/labels/SheetPreview.tsx`: a frame the page's shape (width ÷ height) around the preview link; the panels ask the API with `preview: true` half a second after the last change, which logs and saves nothing. Below 1024px (`useIsBelowDesktop`) the panels put it in `PhonePreviewBar`, pinned under the header (`.labels-phone-preview`) |
| API | `routes/domains/labels.php`, `App\Http\Controllers\Api\LabelsController` |
| Fonts for the PDF | `public/fonts/pdf` (TTF) and the matching WOFF2 in `public/fonts` for the browser |

## Two renderer facts the code depends on

- **Baselines.** Browsers put a line's baseline at the line-box top plus the font's
  ascent; dompdf puts it at 0.88 × line height × (ascent + descent). The sheet view
  positions every piece of text for the renderer it is in (`LabelText::PDF_BASELINE_K`).
  Lines are broken on the server so both renderers print the same lines.
- **Thaana.** dompdf draws characters in stored order, so Dhivehi came out mirrored.
  `App\Support\ThaanaVisual::order()` gives it visual order for the PDF path only.
