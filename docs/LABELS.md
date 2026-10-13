# Labels

Print labels and box labels, printed from Admin → Labels. Built 2026-10-04 from the
owner's ReportLab label project (`docs/LABEL_HUB_PLAN.md`), reworked 2026-10-05 into
label types, brands, more shapes and saved labels (`docs/LABEL_HUB_V2_PLAN.md`).
Label sizes down to 3 × 2 cm and custom labels for things not on the menu came on
2026-10-11 (owner: "Add label size. For example rectangular 4 cm by 6 cm, circle 6 cm
diameter ect. Add option to add custom labels using different brands logos and other
details. Not only from the menu list"). On 2026-10-12 (owner: "build all" of the audit's
recommendations): price and barcode, net weight, allergens in bold, both languages on
one sticker, a draft previewed as it is typed, pinned saved labels, and stickers from
the kitchen screen (§ For the shop till and after).

## Make a label: the way in

Owner, 2026-10-13 ("Still its v confusing and not user friendly"): Labels now opens on
**Make a label**, four steps that reach a printed sheet without knowing the rest of the
hub (`MakeLabelWizard.tsx`, the hub's first tab, `labels/make`):

1. **What is it for.** A menu item (any item; one not yet on labels is switched on the
   moment it is picked, so "Menu items (0)" is never the first thing anyone sees), something
   else (a custom label from the list, or New custom label, which opens the editor), or a
   delivery box (Box labels).
2. **Which label.** Picture cards with everyday names, each drawn as it prints
   (`LabelSchematic`, `LABEL_CARDS`): Big pack sticker (105 × 148.5), Half-size sticker
   (99 × 70.5), Jar or tub (60 × 40), Price tag (40 × 30), Round lid (Ø 60), Bottle wrap
   (180 × 40), and My own size, which opens the usual shape and size picker. The last size
   printed wears "last used".
3. **Looks right.** One large live preview (the same `stickerLinks` preview request Pack
   stickers makes), the language, whether to fill in the dates and the made-on date, the
   quantity per pack, and "All details", which opens the custom label editor or the
   item's Label tab in a pop-up; the preview redraws when it closes. A tap on any part
   of the preview opens that part's boxes alone (below).
4. **How many and print.** Print on (the size's stocks), the number of labels (a sheet's
   worth to start with, one on a label printer), then Print or PDF: the same request as
   Print labels, so the print is logged, the size remembered and the sheet lands under
   Saved labels, where the step says so. "Make another label" starts over.

Print labels, Custom labels and the rest stay as they were for those who know them.

### Tap to edit

Round 3 of the usability work (owner, 2026-10-13): **tap the name, the dates, the logo on
the preview** and a small sheet opens with the boxes for that part alone; the long form
stays behind All details. It works on the wizard's step 3, the custom label editor's
preview (the phone's big preview too) and the item's Label tab, on every design but the
wrap-around label, whose strips are the touch zones (round 2).

How it works: every design marks the part each run of pieces draws
(`LabelSpots::open('name')` … `close()`; `at()` for a part that shares a line with
another, as the batch and the quantity do on the compact sticker), `StickerSheet::pieces()`
strips the markers before anything renders (the web sheet, the PDF and the thermal
rasteriser read every piece they are given), and `StickerSheet::summary()` turns the first
product's markers into boxes in mm, `spots`, carried by the sticker summary and the draft
preview's reply beside `wrap`. The Admin lays `SpotOverlay` over the preview through
`SheetPreview`'s `overlay` (a hairline is widened to a tappable height; a part drawn in two
places, the brand's logo and its name line, gets two zones) and a tap opens
`QuickEditSheet` with what `quickSpec()` says the part needs for a custom label or a menu
item (`QuickEdit.tsx`): the brand picker, the heading with the type, the name (a menu
item's is the menu's, so the sheet says where to change it), the ingredients, how to use,
the nutrition line or switch, the note, the shelf life, the pack quantity with its unit
and net weight, the price, the barcode, the storage line, the footer and its QR, the
picture (choose or remove). A part that is a print option or a setting (the pack QR, pack
numbering, the promotion flash, packed for, the batch) says so and links to the page. The
three hosts share one draft shape (`labelDrafts.ts`: `customDraft` / `customPayload`,
`itemDraft` / `itemPayload`) and decide what Done does: the custom label editor keeps
editing (its preview is live and Save is on the sheet), the item's Label tab and the wizard
save only that sheet's boxes straight away (`pickKeys`) and redraw. In the wizard the
print's own values sit at the top of their sheets and save nothing: Fill in the dates and
Made on under Dates, the quantity on this print under Quantity, the batch number and
Packed for (new to the wizard; they travel in the sticker request as `batch`, `for` and
`for2`). A new part on a sticker gets a marker in every design that draws it, a name in
`SPOT_NAMES`, a case in `quickSpec()`, and a key in `LabelSpots::KEYS`; `LabelSpotsTest`
holds every design to the markers and every spot to the label.

### Plain words

Round 4 of the usability work (owner, 2026-10-13): the hub's own words went. On screen
the tabs are **Print labels** (was Pack stickers) and **Wording and logos** (was Types &
brands), the band at the foot of a sticker is the **bottom strip** (was the footer:
Bottom strips under Wording and logos, "Bottom strip" wherever one is picked, "Edit the
bottom strip …"), the sheet-wide type on Print labels is **Use the wording of** (was Print
as), the wrap strips' default set comes back with **Reset** (was Usual set, round 2), and
every fold of the label forms opens with a one-line "?" saying what it is for
(`FoldHelp.tsx`: the custom label editor's sections and fieldsets, the item's Label tab,
a type's editor, a bottom strip's editor, More options on Print labels). Paths, code and
data keep their names (`/labels/stickers`, `/labels/types`, `label_footers`,
`LabelFooter`, `FooterPicker`, `footer_id`, `type` in a sticker request): this file says
"footer" for the thing and "bottom strip" when it quotes the screen, and a new screen uses
the screen's words.

### Zero-state help and the tour

Round 5 of the usability work (owner, 2026-10-13; the audit's "Menu items (0)" with no
hint that items must be switched on first). When nothing is on labels, Print labels says
so in place of the list and offers the way on right there: **Choose which items get
labels** (`ChooseItemsModal.tsx`: every menu item with a tick that is saved at once, the
same switch as Settings → Products on labels; Done reloads the list) and **Make a label**;
when only custom labels are on labels, a line under the filters says no menu items are and
offers the same chooser. Someone without Manage label settings is told who can choose.
Saved labels' empty list offers Make a label too. The **first-visit tour**
(`LabelsTour.tsx`, mounted by `LabelsHub`) is four cards the first time the hub opens in a
browser (Make a label in four steps; tap the label to change it; any size, any shape;
where things live), kept away by Done or the X (`localStorage['labels.tour']`), and back
from **How it works** beside the wizard's steps (`openLabelsTour()`). A new tab or a
renamed one goes into the fourth card.

### My label rolls: only the sizes you own

Round 6 of the usability work (owner, 2026-10-13; the audit's "size is a wall of 19
numbers"). Labels → Settings → **My label rolls** lists the rolls and sheets the business
actually has, each with a name of the owner's ("Big sheets", "Small roll"), added with
the usual size picker (shape, a one-tap size or a typed one, the stock it prints on),
renamed in place and removed after asking (`LabelRollsCard.tsx`). They are kept as one
JSON setting, `label_rolls` (`LabelRolls::normalise()` on the way in: a roll on an unknown
preset, a shape that does not match it or a typed size the sheet cannot print is dropped,
a stock the size does not offer falls back to its first, at most twenty), and sent with
`GET /labels/layouts` as `rolls` so every picker has them with Print labels alone. With
rolls registered, the size picker (`LabelSizePicker`, on Print labels and the custom
label editor) shows them first, one chip each by name, and folds the shape, every size and
the stock under **More sizes**, open only while the choice is none of the rolls
(`rollMatches()`: the same shape, printed size and stock); the wizard's "Which label"
shows their cards first (the schematic, the name, the size and the stock), starts on the
first roll, and keeps the picture cards and My own size behind **More sizes**. With no
rolls, nothing changes. A roll is a size choice as the picker holds it
(`rollChoice()`), so anything that takes a `SizeChoice` takes a roll.

### Templates: start from, save as

Round 7 of the usability work (owner, 2026-10-13; the audit's "so a new sauce takes
thirty seconds"). A **template** is a label's settings without the product: brand, type,
storage, the wording (heading, storage line, note, how to use, in both languages), shelf
life, quantity per pack and unit, net weight, allergens, the typed nutrition line, bottom
strip, QR choice, language, wrap parts, and the size it printed at. Never the name, the
pictures, the barcode or the price (`LabelTemplates::KEYS`).

- **Start from.** A new custom label (New custom label on Custom labels, Print labels or
  the wizard's Something else) opens with a **Start from** box at the top: the built-in
  templates (Frozen pack, Sauce or dip in a jar, Drink in a bottle, Baked goods, Dry mix or
  spice, Gift pack or hamper, Jar lid), your own templates, and every other label to copy
  from (a custom label, a menu item on labels). Picking one fills the boxes and sets the
  size; the name stays yours and anything can be changed after. A menu item's Label tab
  has the same box: it fills the type, storage, wording, shelf life, pack settings and the
  price and nutrition switches, and leaves the item's ingredients (its recipe's), pictures,
  price, barcode and on/off alone; Save keeps it.
- **Save as template.** On the custom label editor (top right), the item's Label tab
  (beside Save) and the wizard's Looks right step (with Manage label settings): asks for a
  name (the label's name plus "template" to start), says what it keeps, saves. The custom
  label editor and the wizard keep the size picked with it; the item tab has no size.
- **Wording and logos → Templates** lists your templates (renamed in place, removed after
  asking; labels made from one keep their settings) and the built-in ones beneath (a
  "Built in" chip), each with a line saying what it carries; **New label from this** opens
  a new custom label already filled.

A key a template holds fills the box; a key it leaves out leaves the box alone; one that
is null blanks it (a built-in sets a few keys, a saved template every key). Where:
`label_templates` (`App\Models\LabelTemplate`: `name`, `source`, `fields` JSON, `size`
JSON), `App\Domains\Labels\LabelTemplates` (`KEYS`, `BUILTIN`, `rules()`,
`normaliseFields()`: only KEYS, strings trimmed, blanks null; `normaliseSize()` through
`LabelRolls::normalise()`; `present()` / `presentBuiltin()` with the names behind the ids,
a removed type, brand or strip leaving the box blank), `WrapConfig::rules()` (shared with
the labels' own validation). API `GET /api/labels/templates` (`labels.print`; `data` the
saved ones, `builtin` the built-in), `POST` / `PUT` / `DELETE /api/labels/templates/{template}`
(`labels.manage`). Admin: `labelTemplates.ts` (`templateFromCustom` / `templateFromItem`
from a draft, `templateOfCustom` / `templateOfItem` to copy a label, `applyToCustom` /
`applyToItem`, `templateSize`, `templateLine`), `StartFrom.tsx` (`StartFromRow`,
`loadStartFromChoices`, `SaveAsTemplate`), `LabelTemplatesCard.tsx`; `CustomLabelModal`
takes `startFrom`. Tests: `LabelTemplatesTest`, `labelTemplates.test.ts`,
`StartFrom.test.tsx`, `LabelTemplatesCard.test.tsx`, `ItemLabelTab.test.tsx`, and the
cases in `CustomLabels.test.tsx` and `MakeLabelWizard.test.tsx`.

### The drag designer: move and resize parts

Round 8 (owner, 2026-10-13; the audit's "a drag-and-drop designer on the sticker: move and
resize text and pictures, with Back to automatic"). Every design still places its parts
itself; on top of that a product keeps, **per design**, the parts moved or resized by hand
on the preview. The switch **Move and resize** (`ArrangeBar`) under the preview of the
custom label editor, the item's Label tab and the wizard's Looks right step (with Manage
label settings) turns the tap zones into handles: drag a part to move it, drag its corner
to resize it, or nudge it with the arrow keys (shift: 5 mm) and + / −. **Back to
automatic** forgets that design's moves. A part the design draws with a box of its own
(the compact sticker's batch and quantity) is fixed and shown dashed. A wrap-around label
is arranged by its strips instead. The custom label editor keeps the moves in the draft
(Save keeps them with the label; the preview redraws as they happen); the item tab and
the wizard save each move at once, like a tap's sheet. A size's design decides which
moves apply: a move on the full sticker leaves the small one as it was.

Where: `items.label_layout` / `custom_labels.label_layout` (JSON: `{"full": {"name":
{"dx": 3, "dy": -2, "s": 1.2}}}`), `App\Domains\Labels\LabelLayout` (`DESIGNS`,
`clean()`: known designs and spots, shifts to 0.1 mm within ±300, the scale 0.5 to 2, a
part neither moved nor scaled left out; `rules()`; `apply()`: each marked run (LabelSpots)
scaled about its top-left corner and shifted, before `StickerSheet::pieces()` strips the
markers, so the web sheet, the PDF, the raster and the spots all see the part where it
was put; `stickerData()` carries it as `layout`); `LabelSpots::spots()` marks a box of its
own `fixed`; the update endpoints and the draft preview take `label_layout` (null or
nothing kept forgets it), templates carry it as a field. Admin: `labelLayout.ts`
(`nudgeSpot`, `clearDesign`, `hasOverrides`, `layoutPayload`, `isMovable`),
`SpotOverlay` `mode="move"` with `onMove` / `onScale`, `ArrangeBar.tsx`. Tests:
`LabelLayoutTest`, `labelLayout.test.ts`, the move-mode cases in `SpotOverlay.test.tsx`,
`CustomLabels.test.tsx`, `ItemLabelTab.test.tsx` and `MakeLabelWizard.test.tsx`.

### Badges

Round 9 (owner, 2026-10-13; the audit's "badges you drop on: Halal, Spicy, New,
Gluten-free, drawn in the brand style"). A product carries up to four badges from a fixed
set (Halal, Spicy, New, Gluten-free, Vegan, Vegetarian, Sugar-free, Dairy-free, Nut-free,
Homemade, Best seller), each with an English and a Dhivehi word, picked as pills in the
**Badges** fold of the custom label editor and the item's Label tab, or from a tap on the
badges row of the preview (the wizard too). Every design draws them as a row of rust
pills with the word in cream under the name, in the sticker's language, wherever the size
has the room: the full sticker, the compact one (when its middle is tall enough), the
small sticker upright and wide (after the packed-for line, ahead of the extras), a round
sticker from 60 mm, and the wrap-around label's brand part (when the part is tall enough
for the name and a row). A badge that does not fit its row is left out rather than
squeezed. Pills are rectangles and text, so the web sheet, the PDF and the thermal
rasteriser all draw them. Templates carry the badges.

Where: `items.label_badges` / `custom_labels.label_badges` (JSON list of keys),
`App\Domains\Labels\LabelBadges` (`CATALOGUE`, `MAX`, `clean()`, `rules()`, `for()` for the
sticker data, `pills()`: the row of pills as pieces), `GET /api/labels/layouts` carries the
catalogue as `badges`; `LabelSpots` key `badges`. Admin: `BadgePicker.tsx` (`BADGE_FALLBACK`
until the catalogue arrives), the `chips` input kind on the tap sheet (`quickSpec('badges')`),
`label_badges` on the drafts and payloads and in `TEMPLATE_KEYS`. Tests: `LabelBadgesTest`,
`BadgePicker.test.tsx`, the badges case in `CustomLabels.test.tsx`.

### Variable runs: each product's own details on one print

Round 10 (owner, 2026-10-13; the audit's "one label per line of a catering order or
wholesale delivery, each with its own name, date and batch, printed in one go"). On Print
labels every picked product has a **Details** button beside its count; it opens that
row's own boxes: batch, quantity per pack, packed for and its second line, and (when the
dates are filled in) its own made-on and expiry dates. What is typed there prints on that
product's stickers instead of the sheet's batch, quantity, dates and packed-for; an
empty box falls back to the sheet's, and a made-on date of its own gives the row its own
expiry from its shelf life. The button reads **Own details** once a row has some; **Use
the sheet's details** clears them. The summary after preparing says what each row
printed with, the print log keeps each product's own batch, quantity and packed-for,
the sheet link carries the rows (`runs`, a JSON list aligned with `items`), and the saved
label replays them. A row's details are checked as the sheet's are (a made-on date more
than a week away, an expiry before its made-on date or already passed, a quantity
outside 1 to 9999, a batch over 30 characters).

Where: `StickerSheet::RUN_KEYS`, `parseItems()` keeps a row's `run`, `cleanRun()`,
`runsParam()` / the `runs` query, `rowRequest()` (the sheet's request with the row's
details over it, used by `build()` and `summary()`, whose products carry `batch`, `qty`,
`for`, `for2`, `varied`); `stickerRules()` takes `items.*.batch` and kin; the print log
takes each product's own values. Admin: `RowRun`, `runPayload()`, the Details fold on
each picked row (`sticker-row-details-{key}`, `sticker-row-run-{key}`) and the saved
label's reopen in `StickerPrintPanel.tsx`; `StickerRun` in `api/labels.ts`. Tests:
`VariableRunsTest`, the variable-run case in `StickerPrintPanel.test.tsx`.

### Scan to reprint: a pack's code opens the label that printed it

Round 11 (owner, 2026-10-13; the audit's "scan a pack's QR with the phone and reprint
that exact label"). Every sticker print keeps the request that made it, narrowed to its
own product (`label_prints.request`): the product and its count, the size, the
language, the dates, the sheet's batch, quantity, packed-for, bottom strip, flash,
numbering and crop marks, and the row's own details (round 10). The code on the pack
gives it all back. Three ways in, all landing on **Print labels** with `?code=CODE`:

- **The phone's camera.** The QR in the sticker's header opens the pack page
  (`/b/{code}`), which now ends with **Staff: print this sticker again** (shown while
  the product exists). Signing in to the Admin lands on the label.
- **Print labels → Print a pack's sticker again.** A row above the products, with
  **Scan its QR** (the camera, through the same `ScanSheet` the stock shelf uses) and a
  box to type the code from the print log or the pack page; either opens the label.
- **Saved labels → Print log → Print again** on any sticker row whose product still
  exists.

The form opens with the pack's details filled in and a line above it: "Printing again
the sticker of pack K7PQ2M4D: Bajiya · 2 stickers · 40 × 60 mm, 21 on A4 · batch A1 ·
6 per pack · made 2026-10-10 · use by 2027-01-08 · for NH Kuda Rah. Printed 13 Oct 2026
by Aminath." plus **Pack page**; a pack past its date says so in red (the server
refuses an expired date, so the dates must change first), one expiring today or within
two days in amber. Change anything, then Prepare: the new print is a print of its own
(a new code; the pack page of the old code still stands) and the print log says
**Reprint of K7PQ2M4D**. A product no longer on the list cannot be printed again; the
lookup says so. A code nobody has gets "No pack has the code ZZZZ9999. A code is eight
letters and digits, none of 0, O, 1 or I." A print logged before this round is rebuilt
from the log's columns (product, count, size, language, dates, batch, quantity,
packed-for), so older packs reprint too.

Where: `App\Domains\Labels\Reprint` (`KEYS`, `of()` narrows a normalised request to one
product, `rebuilt()` from the columns, `status()`, `present()`); the log row's
`request` (migration `label_print_requests`) and `details.reprint_of`; `reprint` on a
sticker request (`StickerSheet::normalise()`, log only, not kept by the saved label);
`GET /api/labels/prints/{code}` (`labels.print`; 404 for an unknown code) and
`reprint_of` / `reprintable` on `GET /api/labels/prints`; the staff link in
`labels/batch.blade.php`. Admin: `ReprintScan.tsx` (`codeFromScan()` reads the code
out of the pack page's address, a reprint link or the bare code), `?code=` and the
`sticker-reprint` line in `StickerPrintPanel.tsx` (`applyRequest()` fills the form for
a saved label and a scanned pack alike; `reprintLine()`), Print again in the hub's
print log; `fetchLabelPrint()` and `LabelPrintLookup` in `api/labels.ts`. Tests:
`ScanToReprintTest`, `ReprintScan.test.tsx`, the scanned-code cases in
`StickerPrintPanel.test.tsx`.

### Print when packing: stickers from the kitchen screen

Round 12 (owner, 2026-10-13; the audit's "a Labels button on the kitchen board for the
batch just made, already partly there"). On the kitchen screen's **Production → Today's
plan**, every batch a cook has sent to the counter is listed on its task's card as a
row, **Batch KP-20261013-0003 · 5:05 PM · use by 2027-01-11**, with a count box
(one sticker a piece, change it) and **Print stickers**; the PDF opens to print (a
tablet prints the PDF). The batches come from the server with the task
(`batches` on each task, newest first), so the row is there after a reload, on another
tablet and for the next cook, not only in the session that sent the batch. A line
above the cards says what the stickers print on and in, **Stickers print on 60 × 40 mm,
label printer, in English · ދިވެހި · Both**; the cook can pick another language, which
that screen remembers. Which roll and which language is the owner's choice under
**Labels → Settings → My label rolls → The kitchen screen** (`label_kitchen_roll`, a
roll from the list or the 4 × 6 cm default; `label_kitchen_lang`). The window for the
PDF is opened in the tap itself, before the server answers, so a tablet's browser does
not block it as a pop-up; a blocked one falls back, and the row keeps a link, **24
ready · open the PDF again**. The batch's number, made-on date, expiry and count come
from the batch line as before (`GET /api/labels/production-items/{pi}`, which now also
answers with `size` and `lang`); the print is logged against the batch line
(`kitchen_production_item_id`). Only with Print labels; a cook without it sees the
cards as before.

Where: `ProductionTasks::madeFor()` and `batches` in `format()`;
`LabelRolls::kitchen()` (`find()`, `request()` turn a roll into a sticker request;
`KITCHEN_DEFAULT`), `kitchen` on `GET /api/labels/layouts`, the settings keys in
`LabelSettings::DEFAULTS`; kitchen screen `apps/kds-web/src/components/kitchen-production/KitchenProductionPanel.tsx`
(`batchesOf()`, `printStickers()`, the language row), `fetchKitchenLabelSetup()`,
`KdsTaskBatch` in `api.ts`; Admin `LabelRollsCard.tsx` (The kitchen screen). Tests:
`KitchenStickersTest`, the sticker cases in `KitchenProductionPanel.test.tsx`, the
kitchen case in `LabelRollsCard.test.tsx`.

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
| **Label type** | What kind of food a label is for: Frozen Hedhika, Chilled Hedhika, Fresh Hedhika to start. Carries the heading, storage and its line, the date-box wording (MFG DATE / PACKED ON, EXP DATE / BEST BEFORE / USE BY), a use-within line, how-to-use, a note, a shelf life, whether the QR prints, and the brand | Labels → Wording and logos |
| **Brand** | Who the label is from. Bake & Grill is the main brand (details from Business Details); a food brand under it, like Amma, has its own name and PNG logo on the header, and the footer stays Bake & Grill's (owner, 2026-10-12: "Amma is a food brand label but the actual brand is under Bake & Grill"). With no logo uploaded, a brand prints the badge shipped in `public/brand/<name>-logo.png` when there is one (Amma's is there, drawn from `docs/brand/amma-logo.html`), else the main logo | Labels → Wording and logos |
| **Item's label** | Picks a type; its own ingredients, shelf life, pieces per pack, pictures; and any wording that should differ from the type's | Menu Items → item → Label |
| **Custom label** | A sticker for something that is not on the menu (a sauce in jars, a gift box, another brand's product): its own name, brand and logo, type, ingredients, shelf life, quantity and unit, wording and pictures. It prints beside the menu items | Labels → Custom labels, or **New custom label** on Print labels |
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
   The **Dhivehi line** needs no typing when every word is known: an inventory item's
   own Dhivehi name, else the **ingredient glossary** (§ Ingredient glossary), for a
   recipe and for a typed English list alike. A typed Dhivehi line always wins.
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
label** (or **New custom label** above the product list on Print labels, which picks
the new label straight away):

1. **Product name**, and in Dhivehi if wanted.
2. **Brand and logo**: any brand, or **+** to add one with its own logo there and then.
   Empty follows the label type's brand. A custom label's own brand also wins over
   **Use the wording of** on Print labels.
3. **Label type**: brings the heading, storage, date wording, shelf life and how-to-use,
   as for a menu item. Anything typed in the boxes below prints instead.
4. **Ingredients**, storage, **shelf life (days)**, **quantity per pack** and the
   **unit** after it (PCS, G, ML, KG, PACK), the **allergens** (a comma list, printed
   bold and as "Contains …") and the **net weight**; under **For the shop till**, a
   **price** and a **barcode**.
5. **Wording on the sticker**: heading, storage line, note, how to use, each in
   English and Dhivehi. An empty box prints what is shown in grey. This part, **For
   the shop till** and **Bottom strip and complaints QR** fold away, open when they hold
   something (audit, 2026-10-12), each with a one-line "?" saying what it is for.
6. **Bottom strip and complaints QR** (on screen the footer is the bottom strip, round
   4; owner, 2026-10-12: "Standard footer options with
   standard branding footer. Option to add complaint qr with its branding", then "No
   easy option to select and edit branding footer"). The footer is always Bake &
   Grill's branding, whatever food brand is on the header (owner, 2026-10-12). The
   **Bottom strip** box picks a footer by name (§ Footers): empty follows the label type's
   footer, else **Standard** (the business's own lines from Business Details); any
   footer made under Wording and logos can be picked instead. The pencil beside the box
   changes the footer that prints, picked or not, in place, and **+** makes a new one,
   without leaving the label; the line under the box says what it prints. The **complaints QR** follows the
   footer (whose own switch follows the label type), or is printed or left off for
   this label alone; on the full sticker the code carries the brand mark inside
   (`StickerSheet::QR_LOGO_RATIO`, smaller than the poster's so an 11.5 mm code still
   scans), the small designs keep the bare code.
7. **Size and language.** The preview is the first sticker of the sheet Print labels
   would print, at the size last used there (full size until one is picked); **Sticker
   size** folds open to the same picker as Print labels (every one-tap size, a typed
   size, round, where it prints). EN / ދިވެހި / Both above the preview is the language
   the label usually prints in and is saved with it. **Print…** saves the label and
   opens Print labels on that size and language; on a phone or tablet the preview is
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
logged from it), at 105 × 148, 40 × 60 and 6 cm round, in English, Dhivehi or both. **Print** opens Print labels with the label picked; it prints
there on any size, alone or on the same sheet as menu items. On the list, **Copy**
makes a copy to change, **Remove** deletes it: prints already made stay in the log,
and a saved label that only had removed products says so instead of printing.

## What every sticker carries

The same header and footer on every size and shape (owner: "all should have common
header and footer including the branding details"):

- **Header**: the brand's logo and name, the type's heading ("FROZEN HEDHIKA").
- **Footer** (on screen: the bottom strip): always Bake & Grill's branding, whatever food brand is on the header
  (owner, 2026-10-12: "Amma is a food brand label but the actual brand is under
  Bake & Grill, so its branding should be used in the footer"): the business name,
  tagline, address, phone, ways to reach you, website, the brand mark and the
  **complaints QR**, the same code the receipts and the poster carry (it scans to
  the live site's complaint box). Which lines print is a **footer** picked by name
  (below); a label type and a custom label each pick theirs, and Print labels can
  put one footer on a whole sheet.
- Between them: the product name, the picture, ingredients, **HOW TO USE**, the
  **allergen pictograms** (below), a note, the date boxes with the type's wording, the
  **use-within** line, batch and quantity with the unit, the storage strip.
- In the header's corner, the **batch QR** (below): the code of that print, which
  opens the pack's own page.

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
- **Wording and logos → a type → Footer**: the default for every item and custom label
  printed with that type (`label_types.footer_id`).
- **Print labels → More options → Footer**: one footer for every sticker on the sheet
  (`footer` in the request; a saved label keeps it and Print again prints it).
- **Wording and logos → Footers**: the list, with what each prints and how many labels
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

### Batch QR and the pack page

Built 2026-10-12 (owner: "All" of the advanced features). Every print gets a **code**
of eight letters and digits (none that read alike: no 0, O, 1 or I), kept on its print
log row (`label_prints.code`). The full sticker carries it as a **13 mm QR at the
header's end** (the heading keeps to the room before it), the 99 × 70 mm compact
sticker at the end of its band; the 66 mm compact, small and round stickers have no room
for it. Scanned, it opens **`/b/{code}`**, the pack's public page on the live site (the
same rule as the complaints QR: the Business Website address, never the host the sheet
was printed from): the product in both languages, made-on and use-by with whether the
pack is still good ("Good for 12 more days", "Use today", "Past its date by 3 days"),
batch, pack size, net weight, after-opening line, storage strip, ingredients with the
allergens in bold, the allergen symbols and "Contains …", how to use, and a **Something
wrong with this pack? Tell us** button that opens the complaint box with the pack code
filled in as the reference. Nothing about who printed it or how many; the page is not
indexed by search engines. A code that is not in the log (a preview sheet, a typo) gets a
page that says so. A preview sheet draws the QR with the code `PREVIEW`, so the preview
looks as the print will; nothing is logged for it. A saved label printed again is a new
code: it is a new batch. The prepared list on Print labels shows each product's code,
the print log shows it as a link to the page, and `GET /api/labels/prints?code=` finds a
print by it. Labels → Settings → **On the sticker** → **Batch QR in the header** turns
the QR off (prints are still logged with a code).

### Expiring printed stock

The print log knows what was stickered with which expiry, so it can say what in the
freezer is near its date before a customer does. **Print labels** opens with an
**Expiring printed stock** card (hidden when there is nothing to say): one row per
product, batch and expiry within 7 days, and anything that passed its date in the last 2
days, with the copies printed, how many prints, "Expires tomorrow" / "Expires in 5 days
(17 Oct)" / "Expires expired yesterday" in amber or red, a **Pack page** link and
**Reprint**, which opens the form on that product (`?item=` or `?custom=`) for a fresh
batch. Once a day at 08:10 `labels:check-expiring --days=2` texts the owners the same
list for stock expiring within two days or just past it, **once per batch** (each print
row is marked `expiry_alerted_at`; a new print of the same batch is news again). The row
is **Owner: printed stock expiring** on Admin → System → Notifications (`owner_labels_expiry`,
owners and managers by default), with its SMS, Email and Telegram switches like any
other alert.

### Allergen pictograms

The full sticker draws a **row of symbols with the word beneath** between HOW TO USE and
the note: egg, milk, gluten, nuts, peanuts, soy, fish, shellfish, sesame, mustard and
celery, from the item's allergens on its Details tab ("tree-nuts" and "almonds" are both
the nut; "dairy" is milk; "tuna" is fish) or a custom label's typed list, each once, up
to seven, and a **chilli marked SPICY** for a menu item whose spice level is medium or
hotter. An allergen with no symbol (lupin, sulphites) is still in the "Contains …" note
and bold in the ingredients. The compact, small and round stickers have no room for the
row. The pack page shows the same symbols. Labels → Settings → **On the sticker** →
**Allergen pictograms** turns them off.

### Ingredient glossary

Built 2026-10-12. Labels → Settings → **Ingredient glossary** is a list of English
ingredient words with their Dhivehi (`label_glossary`), seeded with the kitchen's
everyday ingredients (flour ފުށް, salt ލޮނު, smoked tuna ވަޅޯމަސް …). A recipe's inventory
item with no Dhivehi name of its own, and every word of a typed English list (a menu
item's or a custom label's), is looked up here; plurals find the singular ("carrots" →
carrot) and "fresh", "dried", "ground", "chopped", "grated" and "sliced" are dropped
before looking. The Dhivehi line prints only when **every** word is known, since a half
list misleads; **Needs Dhivehi** at the top of the card lists the words on labels the
glossary does not know, with the products using them, and a Dhivehi typed there is a
new word. Behind **Show all words** every word is edited in place or removed; the add
row takes a new one, and the same English typed again changes its Dhivehi rather than
adding a second row. Reading takes Print labels; writing, Manage label settings. The
item's Label tab and the custom label's row say where the Dhivehi came from
(`ingredients.dv_from`: typed, inventory, glossary).

### Packed-for stickers

Built 2026-10-12. **Packed for** (Print labels → More options) prints who the packs
are for under the name: a tinted box with "PACKED FOR" and the name on the full
sticker, with a **second line** (the delivery, the date) beneath; one line under the
band on the compact sticker; a line under the name on the small sizes (the second part
when the label is at least 40 mm wide); nothing on the round ones. **Wholesale → a
delivery → Print labels** (on the list and the delivery's page) opens the form with
the shop as "packed for", "Delivery TD-0042 · Wed, 14 Oct 2026" as the second line and
a sticker per pack sent of each product; an **event's page → Print labels** does the
same with the company or contact, the reference, the occasion and the date, and a
sticker per pack on the quote. A product not switched on for labels is named above the
form instead of picked. The saved label and the print log keep it.

### Promotion stickers

Built 2026-10-12. **Promotion flash** (Print labels → More options): **Was → Now
prices** draws a rust badge with the old price struck through over the new one (the
new price then prints on the quantity line too; the old price must be the higher), or a
short line of words from one pick (**2 for 1**, **Buy 2 get 1 free**, **Special
offer**, **Half price**, **New**, **Fresh today**) or typed (**Other words…**, up to
24 letters). The badge takes the end of the name row on the full sticker and the end of
the band on the compact sticker, where it stands in for the batch QR (the print log
still has the pack code). Small and round stickers have no room for it. The saved label
and the print log keep the flash.

### Nutrition panel

Built 2026-10-12. A **nutrition panel per 100 g** (energy, fat, carbohydrate, protein,
salt in five columns) prints on the full-size sticker above the allergen row, worked
out from the recipe: each food ingredient carries its **values per 100 g** (energy in
kcal, fat, of which saturates, carbohydrate, of which sugars, protein, salt), typed under
**Labels → Settings → Nutrition per 100 g** from the packet or a food table; the
recipe's grams of each give the totals, and the totals over the recipe's weight give the
panel. It prints only when the item's Label tab has **Print nutrition per 100 g** on
*and* every food ingredient in the recipe has values and a weight in grams (an
ingredient in pieces or a unit that is not a weight stops it): a half panel misleads.
The Label tab says what the recipe gives today, or which ingredient is holding it up;
the settings card lists the ingredients still without values first (each with who uses
it), every ingredient behind **Show all**, and each product's standing. Only the energy
must be typed; a blank value is nought. A **custom label** types its own line
(**Nutrition per 100 g** on its editor, one line as it should print, up to 200 letters),
set smaller to fit the width. The compact, small and round stickers have no room.

### Pack numbering

Built 2026-10-12. **Number the packs** (Print labels → More options) prints "PACK 3 OF
40" on each sticker of a product's run: under the header on the full sticker, at the end
of the batch line on the compact and small ones ("· PACK 3/40", "· 3/40"), nothing on the
round ones. Each copy is drawn on its own, so a numbered run of 40 is 40 different
stickers. The saved label keeps it and prints the run numbered again.

### Print-ready sheets

Built 2026-10-12. **Crop marks for a print shop** (Print labels → More options) draws
hairline ticks 3 mm long, 1 mm off every corner of every label, in place of the dashed
cut lines, on the web sheet and the PDF alike; a tick is cut short where the page has
less room (the labels on a plain A4 sheet start at the paper's edge). With the marks on,
a **bleed** (1, 2, 3 or 5 mm) around a **single label** grows the page by it on every
side, so a 40 × 60 mm label with a 5 mm bleed is a 50 × 70 mm page with the sticker in
the middle; the sticker's ground is white, so the bleed is white. A sheet of several
labels takes no bleed (the page is the paper). The saved label keeps both.

### Label printer

Built 2026-10-12. A **label-printer size** (one sticker a label: 105 × 148, 100 × 150,
76 × 127 mm, any custom size or round size on a label printer) can go **straight to a
thermal label printer** instead of through a print dialog. The server draws each sticker
as a black-and-white bitmap at the printer's dots per inch and wraps it in the printer's
language: **ZPL** (Zebra and printers that emulate it) or **TSPL** (TSC, Xprinter,
iDPRT and most unbranded thermal label printers). Print labels → Prepare on such a size
gives, beside Print and the PDF, **Send to label printer**, a **ZPL file** / **TSPL
file** to download and send yourself, and **Check the bitmap** (the first sticker as the
printer will put it down, as a PNG).

Sending needs the **print agent**, `scripts/label-print-agent.mjs`, running on the
computer the admin is used from (Node 18 or newer, no dependencies):

```bash
node scripts/label-print-agent.mjs            # listens on http://127.0.0.1:9110
PORT=9111 node scripts/label-print-agent.mjs  # another port
SITE=https://bakeandgrill.mv node scripts/label-print-agent.mjs   # fetch from this site only
```

It listens on the computer's own address only. The admin posts it the signed link to the
stickers; the agent fetches the bytes from the site and sends them to the printer over
the shop network on port 9100 (what nearly every network label printer listens on). Under
**Labels → Settings → Label printer on this computer** go the language, the dots per inch
(203, or 300 when the printer has them), the printer's IP address (from its self-test
page), the port and the agent's address, with **Check the agent**; it is kept in that
browser, so each till or office computer has its own printer. A USB-only printer, or a
phone, downloads the file and sends it with the printer's own tool instead.

On the thermal bitmap the sticker's colours become ink or paper: the rust fills and the
dark band print black with their words in white, the tints print white, photos and logos
are dithered, a QR or barcode is redrawn from its data, the allergen pictograms are left
out (their captions and the "Contains …" note still print), and Dhivehi sets from the
same composed font as the PDF. Crop marks and a bleed do not apply (the label is the
page), and an A4 sheet has no printer language: the links are refused with the reason.

### Wrap-around labels (parts side by side)

Built 2026-10-12 (owner: a juice bottle's label "with 2, 3, 4, 5 different parts";
"all the possible things"). A **wide, short label is a wrap-around label**: any size at
least 90 × 25 mm and two and a half times as wide as tall, and the one-tap sizes
**200 × 50, 180 × 40, 150 × 35 and 120 × 40 mm** (on a label printer or as many as fit
on A4: seven 180 × 40 labels to a sheet). Its **parts** sit side by side as columns, in
the order the product keeps, with a hairline between them and a **flavour band** along
the bottom (a rust band with the flavour or name, in English and Dhivehi, and the net
content at the end). The parts:

| Part | What it prints |
|---|---|
| Brand and name | The logo, the brand line and heading, the product name (hand-lettered or typed, Dhivehi beneath when both) and the picture when the part is wide enough |
| Ingredients and legal text | "INGREDIENTS" and the list with allergens bold (the Dhivehi list beneath when both), the note or "Contains …", the storage line, how to use, use-within, and under a hairline "Made by Bake & Grill, address · phone · website" from Business details |
| Nutrition per 100 g or ml | Every value as a row (energy, fat, of which saturates, carbohydrate, of which sugars, protein, salt) from the recipe, or a custom label's typed line |
| Dates and batch | The made-on and expiry boxes (side by side when the part is wide), the batch and pack number, price · quantity · net weight; the EAN barcode too, when there is no Barcode part and the height for it |
| Barcode | The EAN-13 or EAN-8 bars, as wide as the part allows, with the digits beneath; left out when the product has no barcode |
| QR code | The pack's page (batch QR) when it is on, else the complaints QR, captioned |
| Recycling marks and pictures | The marks picked, each a symbol with its word beneath, and up to four pictures from the media library (a halal or other certification mark the business holds) |
| Free text | A heading and lines of the owner's own, English and Dhivehi |
| Packed for and promotion | The packed-for box and the promotion flash, when the sheet carries them |

A part with nothing to print is left out. Each part asks for a width (the barcode, QR
and marks from the label's height) and the parts share what is left by weight; on a
label too narrow for what they ask, every part gives up the same share down to its
floor (a QR must still scan, a barcode too, 11 and 20 mm), and only when even the
floors do not fit do the last parts give way, in the order free text, packed for,
marks, QR, barcode, nutrition, legal (the brand and the dates stay): nine parts print
on 180 × 40 mm, seven on 150 × 35, five on 120 × 40, four on 100 × 30. A squeezed
part sets its heading plain where the letter-spaced one would not fit. In Dhivehi the
parts run right to left, and a Dhivehi label with no Dhivehi ingredients prints the
English list under the Dhivehi heading. Type and spacing scale with the height (30 to
60 mm). Everything else on the hub applies: the print log and codes, the saved label,
the batch QR, the PDF, the web sheet and the label printer's ZPL and TSPL.

**Which parts, in what order** is kept per product (`label_wrap`): the item's Label tab
(Wrap-around label) and the custom label editor (Wrap-around label) show the parts as
**strips you can see and touch** (round 2 of the usability work, owner, 2026-10-13:
"How to decide its 2 strips, 3, or, 4"; `StripEditor.tsx`): thumbnails pick how many
strips (2 to 6, or all nine; `partsForCount` trims the list or fills it from the usual
order), a board drawn to the label's proportions shows one strip per part with the
band beneath, a tap on a strip opens its sheet (what it holds, with a part already on
another strip swapping over; Move left / right; Remove), a strip can be dragged to
reorder on a computer, and **Reset** puts the default parts and marks back (brand,
legal, nutrition, dates, barcode, QR, marks; the loop and the tidy man). When the live
preview is a wrap label, the server says where each strip landed
(`WrapDesign::strips()`, carried as `wrap` in the sticker summary and the draft
preview's reply: each strip's box in mm, the band's box, and the parts left out as
`empty` or `narrow`): the board takes the printed widths, the strips that will not
print are dimmed and named under the board, and the preview itself carries touch
zones (`StripOverlay`, through `SheetPreview`'s `overlay`, the phone's big preview
too) that open the same sheet. Below the board: the band and its words, the recycling
marks (the universal loop, the tidy man, plastics 1 to 7, glass, paper, metal), mark
pictures, and the free text. Nothing kept prints the default set. The same editors say whether the product's
nutrition values are **per 100 g or per 100 ml** (`label_nutrition_per`), which the
nutrition heading reads on every sticker.

The recycling marks are glyphs of a small symbol font (a subset of DejaVu Sans with
the Unicode recycling symbols, `scripts/label-symbol-font.py`, licence in
`public/fonts/DEJAVU-LICENSE.txt`), so the browser sheet, the PDF and the thermal
bitmap all draw them; the tidy man is drawn from boxes. A mark picture is any image in
the media library; the business is responsible for the right to print a certification
mark.

## Printing

**Print labels** (Labels → Print labels): **Print again** at the top lists the pinned
labels, then the last sheets printed; one tap prints one with today's dates, or tap
its name to change it first. A product that keeps 3 days or fewer carries a **Short
life** mark in the list (and on Settings), so a chilled item is not printed with a
frozen item's dates by mistake. Then tick products and how many of each (− and +
move a whole sheet). Menu items and custom labels share the list (**All**, **Menu
items**, **Custom labels** narrow it) and can go on the same sheet. Then the **label
size**, the language (**English**, **ދިވެހި**, or **Both**), **Use the wording of** (one
type for the whole sheet, optional; it was "Print as" until round 4), a **Bottom strip**
for the whole sheet (optional, § Footers), and
whether to fill the dates (with the dates on, each picked product shows the expiry it
will get). **Use the wording of**, **Bottom strip**, the batch number (a **Today** button
writes the date as a code, 261011) and the quantity per pack sit behind **More options**,
which opens with a one-line "?" saying what it holds.

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
to saved labels"): one tap prepares a full sheet of it at the size Print labels last
printed (full stickers, four to an A4 page, until a size is picked there; English with
the Dhivehi beneath when it has a Dhivehi name) and opens Saved labels on it. Print on
the row opens Print labels instead, to choose a size first.

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
| Print log | `label_prints`; written on every print, never edited; `item_id` or `custom_label_id` (emptied when the custom label is removed), the layout and label size, shown in words ("40 × 60 mm, 21 on A4", `StickerLayouts::describe()`); since 2026-10-12 a `code` per sticker print (`LabelPrint::newCode()`) and `expiry_alerted_at` |
| Batch QR and the pack page | `App\Domains\Labels\BatchLink` (`url()` on the live site, `qr()`, `valid()`, `PREVIEW`); the sheet link carries `b=i12:CODE,c7:CODE` (`StickerSheet::parseCodes()` / `codesParam()`), `stickerData()` sets `batch_qr`; `StickerDesign::full()` (header's end, heading width 62 → 48 mm) and `mini()` (tall bands at least 75 mm wide); `GET /b/{code}` → `App\Http\Controllers\LabelBatchPageController`, `resources/views/labels/batch.blade.php` (public, `noindex`, 404 page for an unknown code); setting `label_batch_qr` |
| Expiring printed stock | `App\Domains\Labels\ExpiringPrints` (`groups()`, `due()`, `phrase()`); `GET /api/labels/expiring?days=` (`labels.print`); `apps/admin-dashboard/src/components/labels/ExpiringStock.tsx` over Print labels, Reprint → `?item=` / `?custom=`; `labels:check-expiring --days=2` (`App\Console\Commands\CheckExpiringLabels`, 08:10) under the registry row `owner_labels_expiry` |
| Ingredient glossary | `label_glossary` (`App\Models\LabelGlossaryEntry`: `key()`, `lookup()` with the plural and prefix variants, a cached `map()`); `LabelIngredients::translate()`, `parts()`, `missingWords()`, `dv_from` on the lines; API `GET /api/labels/glossary` (`labels.print`; `missing` beside `data`), `POST` / `PUT` / `DELETE /api/labels/glossary/{entry}` (`labels.manage`); `apps/admin-dashboard/src/components/labels/IngredientGlossary.tsx` on Labels → Settings |
| Packed for | `for` and `for2` in a sticker request (`StickerSheet::normalise()`), `packed_for` / `packed_for2` in the sticker data, drawn by `StickerDesign::full()` (box under the name), `mini()` (line under the band) and `SmallStickerDesign::packedForLine()`; `GET /api/labels/deliveries/{delivery}/stickers` and `GET /api/labels/catering/{cateringRequest}/stickers` (`labels.print`) fill the form through `?delivery=` / `?catering=` on `StickerPrintPanel` |
| Promotion flash | `promo` (`was_now` or `text`), `promo_was`, `promo_now`, `promo_text` in a sticker request (`StickerSheet::promoOf()` checks, `promoFor()` words it); `StickerDesign::flash()` draws the badge for the full sticker's name row and the compact band; `PROMO_PRESETS` in `StickerPrintPanel.tsx` |
| Nutrition panel | `inventory_items.nutrition` (JSON per 100 g, `Nutrition::FIELDS`), `items.label_show_nutrition`, `custom_labels.label_nutrition`; `App\Domains\Labels\Nutrition` (`forItem()` from `LabelIngredients::recipeIngredients()`, which now carries grams; `forSticker()`, `clean()`, `rows()`, `line()`); `stickerData()` sets `nutrition`, `StickerDesign::full()` draws the five columns (or a custom label's fitted line) above the allergen row; API `GET /api/labels/nutrition` (`labels.print`), `PUT /api/labels/nutrition/{inventoryItem}` (`labels.manage`); `NutritionCard.tsx` on Labels → Settings, the switch on `ItemLabelTab.tsx` (`nutritionWords()`), the line on the custom label editor |
| Pack numbering | `number` in a sticker request; `StickerSheet::build()` draws each copy with `pack_no` / `pack_of`; `StickerDesign::full()` prints "PACK n OF N" under the header, `mini()` and `SmallStickerDesign::batchLine()` add "· PACK n/N" / "· n/N" to the batch line |
| Crop marks and bleed | `marks` and `bleed` (0–5 mm) in a sticker request; `StickerSheet::printReady()` grows a single-label page by the bleed and turns the cut lines off; `labels/stickers.blade.php` draws the ticks (`data-testid="crop-mark"`, cut to the page) |
| Label printer | `App\Domains\Labels\LabelRaster` (`page()` draws one page of a built sheet with GD at `dpi`, `DPIS` 203 / 300; text from the PDF font files, Thaana in visual order, PNGs dithered, SVGs redrawn from `build()['vectors']`: a QR from its text, a barcode from its digits; `png()` for checking), `ZplEncoder` (`^GFA` with ZPL's run-length form), `TsplEncoder` (`SIZE`, `GAP`, `BITMAP` with the bits inverted, `PRINT 1,1`); signed routes `/labels/stickers.zpl`, `.tspl`, `.png` (`page` outside the signature), single-label sheets only; `dpi` on the sticker request, `zpl_url` / `tspl_url` / `raster_url` in the reply; `scripts/label-print-agent.mjs`; `LabelPrinterCard.tsx` (`labels.printer` in localStorage, `readPrinterSetup()` / `sendToLabelPrinter()` in `api/labels.ts`) and the buttons on `StickerPrintPanel` |
| Wrap-around labels | `StickerLayouts::design()` answers `wrap` (`WRAP_MIN_RATIO` 2.5, `WRAP_MIN_W` 90, `WRAP_MIN_H` 25; mirrored in `labelSize.ts`, pinned by `fixtures/label_size_parity.json`), presets `r200x50`, `r180x40`, `r150x35`, `r120x40`; `App\Domains\Labels\WrapDesign` (`wrap()`: widths from each part's least width and share, `DROP_ORDER`, the band, one method a part); `WrapConfig` (`of()`, `clean()`, `PARTS`, `DEFAULT_PARTS`, `catalogue()`), kept as `items.label_wrap` / `custom_labels.label_wrap` (JSON) with `label_nutrition_per`; `LabelMarks` (`MARKS` glyph + caption, `for()`); `stickerData()` sets `wrap`, `marks`, `pictures` (PNG data URIs) and `producer`; `LabelText::FONTS['sym']` (`fonts/pdf/LabelSymbols.ttf`, `fonts/label-symbols.woff2`); `GET /api/labels/layouts` carries `wrap` (parts, marks, defaults); `WrapParts.tsx` on `ItemLabelTab` and the custom label editor, `wrap_pictures` on the payloads for the thumbnails |
| Allergen pictograms | `App\Domains\Labels\AllergenIcons` (`for()`, `keys()`, `svg()`, `dataUri()`; words → symbols, captions, `SPICY_LEVELS`); `stickerData()` sets `icons`, `StickerDesign::full()` draws the row (12 mm pitch, 8.8 mm tall) above the note; setting `label_allergen_icons` |
| Variable runs | A row's own `batch`, `qty`, `mfg`, `exp`, `for`, `for2` in a sticker request (`StickerSheet::RUN_KEYS`, `cleanRun()`, `rowRequest()`; the link's `runs`); the Details fold on each picked row of `StickerPrintPanel.tsx` (§ Variable runs) |
| Scan to reprint | `label_prints.request` (the request that made the print, one product; § Scan to reprint) and `details.reprint_of`; `App\Domains\Labels\Reprint` (`of()`, `rebuilt()`, `status()`, `present()`); `reprint` on a sticker request; `GET /api/labels/prints/{code}` (`labels.print`); the staff link on the pack page; `ReprintScan.tsx` (`codeFromScan()`), `?code=` on `StickerPrintPanel.tsx`, Print again in the print log |
| Badges | `items.label_badges`, `custom_labels.label_badges` (JSON list, up to four keys; § Badges); `App\Domains\Labels\LabelBadges` (`CATALOGUE`, `clean()`, `rules()`, `for()`, `pills()`), drawn by every design under the name; the catalogue with `GET /api/labels/layouts` as `badges`; `BadgePicker.tsx` and the tap sheet's `chips` input |
| Drag designer | `items.label_layout`, `custom_labels.label_layout` (JSON per design and part; § The drag designer); `App\Domains\Labels\LabelLayout` (`clean()`, `rules()`, `apply()` on the marked runs in `StickerSheet::pieces()`); `labelLayout.ts`, `SpotOverlay` move mode, `ArrangeBar.tsx` |
| Templates | `label_templates` (`App\Models\LabelTemplate`; § Templates); `App\Domains\Labels\LabelTemplates` (`KEYS`, `BUILTIN`, `rules()`, `normaliseFields()`, `normaliseSize()`, `present()`); API `GET /api/labels/templates` (`labels.print`), `POST` / `PUT` / `DELETE /api/labels/templates/{template}` (`labels.manage`); `labelTemplates.ts`, `StartFrom.tsx`, `LabelTemplatesCard.tsx` under Wording and logos |
| Footers | `label_footers` (`App\Models\LabelFooter`, § Footers); `custom_labels.footer_id`, `label_types.footer_id`, `footer` in a sticker request; `LabelTypes::footer()` fills the blanks, `StickerSheet::footerPreset()` picks which one. API `GET /api/labels/footers` (`labels.print`), `POST` / `PUT` / `DELETE /api/labels/footers/{footer}` (`labels.manage`; the standard one cannot be removed, 422) |
| Box-label wording per storage, date style, pre-cut offsets | Labels → Settings, site settings with the originals as defaults (`App\Domains\Labels\LabelSettings`) |
| Phone, website, address, landmark, tagline | Business Details (same as receipts) |
| Sticker designs | `App\Domains\Labels\StickerDesign`: `full`, `mini`, `round`; `SmallStickerDesign`: `small` and rounds under 45 mm (pieces in mm). A text piece with `bold_words` sets those words in the bold face (allergens). `lang: both` reaches the designs as `$d['both']` |
| Price, barcode, net weight, allergens | `items.label_price` / `label_show_price` / `label_barcode` / `label_net_weight`; `custom_labels` the same plus `label_allergens`; `StickerSheet::price()`, `allergens()`; `App\Domains\Labels\Barcode` (EAN-13/EAN-8 check digit, modules, bars as an SVG data URI sized in its own units, never mm: dompdf's SVG library ignores the viewBox and a size in mm drew the bars twice as tall as their box; the digits are a text piece beneath). The bars print on the full design and the wrap-around label's Barcode part (or under its dates); the compact sizes in use have no room |
| Draft preview | `POST /api/labels/custom/preview` (`labels.manage`) keeps the draft in the cache for 30 minutes (`StickerSheet::keepDraft`) and links the sheet with `items=d<token>:1`; `StickerSheet::draft()` builds an unsaved `CustomLabel` from it. The print API refuses a draft |
| Pinned labels | `label_jobs.pinned`; `PUT /api/labels/jobs/{job}` takes `pinned`; the list orders pinned first, `?pinned=1` filters |
| Kitchen screen stickers | `apps/kds-web`: `fetchProductionStickers`, `fetchKitchenLabelSetup`, `productionStickerLinks`, `labelSheetUrl`; a row per batch made for a task on `KitchenProductionPanel` (`batches` on the task from `ProductionTasks`, § Print when packing), shown with `labels.print`; the roll and language from `LabelRolls::kitchen()` (`label_kitchen_roll`, `label_kitchen_lang`, picked on `LabelRollsCard`) |
| Label stock and sizes | `App\Domains\Labels\StickerLayouts`: `LAYOUTS` (`shape` rect or circle; `a4-custom` and `a4-round-custom` fill A4 with any size, `single-custom` and `single-round-custom` one per label), `PRESETS` (the one-tap sizes and the layout for each stock), `design()`, `grid()`, `limits()` |
| Size picker | `apps/admin-dashboard/src/components/labels/LabelSizePicker.tsx` and `labelSize.ts`, which mirrors `design()`, `grid()` and the limits so the picker can say "21 on A4" and "too small" before asking. `fixtures/label_size_parity.json` holds both to the same answers (`LabelSizeParityTest`, `labelSize.test.ts`); change the server, the mirror and the table together |
| Box label | `App\Domains\Labels\BoxLabel`; a shop's saved label in `trade_accounts.box_label` |
| Brand logos, lettering, cut-outs | `App\Domains\Labels\LabelMedia::storePng`: kept as the PNG uploaded, never re-encoded |
| QR | `App\Support\QrSvg::dataUri(ComplaintBoxLink::url('label'))`, bare; the batch QR is `BatchLink::qr()` |
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
