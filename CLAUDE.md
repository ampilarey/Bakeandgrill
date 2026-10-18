# CLAUDE.md

Project notes for agents and developers working in this repo.

Cursor Cloud VM setup, ports, and local service commands live in `AGENTS.md` (environment
only). Project rules and conventions live here and under `.cursor/rules/`.

## After every merge to `main`: give the owner the live deploy command

TEST deploys itself — GitHub Actions calls `POST /api/deploy/test-pull` once CI is
green, with a cron fallback. **Production never does.** `TestDeployWebhookController`
refuses any host that is not TEST, so nothing reaches the live site until somebody
runs the deploy by hand on the server.

So a merge is not a release. Whenever you fast-forward `main`, end the reply with the
command to run on the production box:

```bash
cd /home/bakeandgrill/public_html && ./scripts/full-deploy.sh production
```

That one script is the whole deploy: `git pull`, `composer install --no-dev`,
`app:verify-production-config`, a database-only `backup:run` when migrations are
pending (production; the deploy stops if it fails, `SKIP_PREDEPLOY_BACKUP=1` to
override), `migrate --force`, `storage:link`, `config:cache`,
`route:cache`, `view:clear`, `queue:restart`, queue-worker keepalive, deploy stamp,
`post-deploy-smoke.sh production` and `app:smoke` (places and cancels one order inside
a rolled-back transaction, nothing sent or printed). If the smoke test fails the script
alerts the owner (row `owner_deploy_rollback`) and stops with exit 1; TEST, or production
with `SMOKE_ROLLBACK=1`, also rolls the code back to the commit it started from when no
migration ran (`SKIP_SMOKE_ORDER=1` skips the order part). There is nothing to run before
or after it.

Call out anything in the merge that changes what the deploy has to do — a migration,
a new `.env` key, a rebuilt SPA bundle, a new system dependency — since those are the
cases where a half-done deploy leaves the site broken rather than merely stale.

## Admin colour tokens

When writing or editing admin dashboard page styles (`apps/admin-dashboard/src/pages/**`),
prefer CSS variables over hardcoded hex in `style={{…}}` objects. ESLint warns on new
hex literals in those objects (existing ones are baselined — see
`apps/admin-dashboard/eslint-baselines/no-hex-in-inline-style.json`).

Canonical mappings from `docs/ADMIN_THEMING_MOBILE_PLAN.md` §1.4 (case-insensitive):

| Hex | CSS variable |
|---|---|
| `#6b5d4f` | `var(--color-text-secondary)` |
| `#9c8e7e` | `var(--color-text-muted)` |
| `#e8e0d8` | `var(--color-border)` |
| `#b74b0c` | `var(--color-primary)` (the logo's rust; was `#d4813a` until 2026-09-30) |
| `#1c1408` | `var(--color-text)` |
| `#ef4444` | `var(--color-danger)` |
| `#f8f6f3` | `var(--color-bg)` |
| `#22c55e` | `var(--color-success)` |
| `#f59e0b` | `var(--color-warning)` |
| `#f0ebe5` | `var(--color-border-light)` |

These variables are defined on `:root` in `apps/admin-dashboard/src/index.css` and
already flip correctly under `[data-theme="dark"]`. Do not invent parallel hex
literals for the same roles.

Chips, pills and tinted boxes use the brand tones (owner, 2026-10-08), never blue,
indigo, violet, teal or cool grey: `--color-tone-rust-{bg,text,border}` for in
progress and info, `--color-tone-brown-*` for roles, types and plain labels,
`--color-tone-gold-*` for ready; green, amber and red stay for success, warning and
danger. Icons are lucide (`InlineIcon` in running text), not emoji; on/off controls
are SharedUI `Switch`. Details: `docs/ADMIN_THEMING_MOBILE_PLAN.md` § Stage 3c.

A row's Delete / Remove / Reject is `Btn variant="danger-outline"`; solid `danger` is
for the final confirm and bulk actions. Buttons are small (owner, 2026-10-10): `Btn` is
38px, `Btn small` 32px, chips and tabs 32px, and `Switch` is 40×22 unless a page asks
for `size="md"`; never draw a switch by hand or give a button its own `minHeight` (the
phone floor for a bare button is 32px). Inputs and selects stay 44px with 16px type on
a phone. Details: § Stage 3i. Pop-ups (`Modal`) render outside the page, so
never scope a pop-up's CSS under a page class (`.x-page .chip` does not reach it).
Native tick boxes, radios and sliders take the rust through `accent-color` in
`index.css`. Every colour must hold in dark mode too: a pale panel is `--color-bg`, a
track or hairline `--color-border-light`, a picked chip `--color-tone-rust-bg`, a red /
amber / green edge `color-mix(in srgb, var(--color-danger) 35%, transparent)` and kin;
behind a photo or video, and on the sign-in page, `--color-backdrop` (near-black in
both themes; `--color-text` turns cream in dark mode). White stays only where paper or
a QR code needs it (print previews, QR cards). Details: § Stage 3e.

The admin has a phone layout (≤767px) and a computer layout, which folds its rail
from 768 to 1023px (`AppShell`'s tablet band) and is short of room up to 1199px
(the CSS's compact band: the top bar shrinks search and the name chip to icons). Check
390, 768, 1024 and 1366px; 768–1199 is where wide tables and long button rows break.
What a computer shows, a phone shows (owner, 2026-10-12: "couldn't find Tables from
mobile view"): a folded rail and the tablet's section tabs keep every page's name
under its icon (a finger gets no tooltip), the phone's section sheet lists every
permitted page, and a page's phone layout keeps the computer's controls: a card list
that replaces a sortable table carries `SortFilterPanel`, a per-row action (rename,
delete) sits beside the picked chip, and a device or layout switch (the content hubs'
Desktop | Mobile) is offered on both. Never gate a control on `isMobile` alone; change
its shape instead.
Two pages that sound alike say which is which (nav audit, 2026-10-16): Customers →
Accounts on credit and Settings → Credit rules, Analytics (recent demand) and Forecasts
(revenue and restock plan, pointing to Purchasing → Reports), Daily Specials and
Promotions → Offers each carry a one-line `SeeAlso` to the other; Signage's TV health
tab is "TV status", never "Devices" (System → Devices is tills and kitchen screens).
Inside Settings, `OrderingControlTabs` drops its own Delivery tab and hides on the
Delivery tab, since the hub already offers it.
Nav check (2026-10-17): Posters (Customers & Marketing, promotion) and Labels (Manage,
packaging) each carry a `SeeAlso` to the other; Labels' permissions sit in the role editor's
"Menu, stock and buying" section, as Labels sits in Manage; Webhooks and Xero are tabs of
System → Integrations (`IntegrationsHub`, old paths forward); Shifts & Cash points to
Settings → Currency photos.
Nothing scrolls sideways (owner, 2026-10-09). A row of tabs or filter chips is
`TabScrollRow`, which wraps. A table goes in `.table-scroll` (or `TableCard` /
`ResponsiveTable`); one that does not fit its box becomes cards, one per row with each
value under its column's name (`utils/tableCards.ts` watches every table, so a new one
needs nothing; `data-table-scroll="keep"` is the way out). A cell holding a date, a
time or an amount is `TD_NOWRAP`; a `display: grid` column that holds a table needs
`minmax(0, 1fr)`. Details: § Stage 3f and § Stage 3h. `e2e/tests/phone-width.spec.ts`
(the e2e job's phone step) loads every website page, every order app route in `main.tsx` and
every admin page in `navConfig.ts` at 390 px and names each one that scrolls sideways.

## Brand colours

The accent everywhere is the rust from the logo, `#B74B0C`; on a dark surface it is
the lightened `#C56F3D`. The full palette, the derivation rule and where each token
lives are in `docs/brand/PALETTE.md`. The old amber `#D4813A` is not a brand colour
any more; do not reintroduce it. Nor is the black-square logo: app and tab icons,
the dark-surface logo and link previews are generated by `scripts/brand-icons.py`
(table in `docs/brand/PALETTE.md`). The website and order-app headers draw the logo
with burning, glowing flames while the standard logo is set; those shapes are generated
by `scripts/brand-animated-logo.py`, not edited by hand. Video and GIF versions for social
media and both downloadable packs come from `scripts/brand-animated-logo-video.mjs` and
`scripts/brand-packs.py`. The flame alone (`brand/flame-mark.svg`, the menu's quiet no-photo tile)
and the banner pattern (`brand/flame-pattern.svg`) come from `scripts/brand-flame-mark.py`. Menu
colours follow `docs/brand/PALETTE.md` § Menu colours: no hue-from-id tints, prices as
"MVR 12.50".

An uploaded logo, dark logo, browser tab icon or link preview keeps its own shape (owner,
2026-10-10): `App\Domains\Content\BrandImages` saves the logos whole and see-through (PNG,
up to 1200 px), the tab icon on a clear square (512) and the preview at 1200 × 630, never
the 4:3 menu crop on white. Every write of those keys passes through
`ContentValidationService::normalizeForWrite`, which redraws a library picture from its
full-size master; never route them through `MenuImageProcessor` crops. Details:
`docs/brand/PALETTE.md` § An uploaded logo, tab icon or link preview. A dish cut out of a
photo on a plain backdrop, with a version for each upload slot, comes from
`scripts/food-photo-pack.py` into `backend/public/brand/photos/<dish>/` (§ Dish photo packs).

To regenerate the hex-in-style baseline after migrating a page:

```bash
cd apps/admin-dashboard && node scripts/generate-hex-style-baseline.mjs
```

## Local database: MySQL/MariaDB preferred

Although `README.md` / `docker-compose.yml` may mention `pgsql`, local/dev on this
project uses **MySQL/MariaDB** (see `AGENTS.md`). CI also runs a PostgreSQL
compatibility suite; site_settings migrations collapse duplicates with
`havingRaw('COUNT(*) > 1')` so PostgreSQL accepts them (aliases in `HAVING` are
rejected). Automated default tests use SQLite in-memory via `phpunit.xml`.

## Dhivehi webfont inspector

The Dhivehi font is picked in Content Hub → Everywhere → Dhivehi font (2026-10-18:
"faruma font is not showing"): Faruma, Noto Sans Thaana, FreeSerif, the phone's own, or an
upload (`DhivehiFontPicker.tsx`; the value is '', `preset:<key>` or the file's URL; one font
for both apps, `ContentWriter::ONE_SWITCH`, so the order app reads the website's pick;
`App\Domains\Content\DhivehiFont::PRESETS`, which `FONT_CHOICES` mirrors). Every stack in
`fonts.css` (both copies) carries `var(--font-thaana)` behind its Latin face, limited to
Thaana by unicode-range, and `/css/dhivehi-font.css` repoints it with `:root:root` (the order
app's bundle loads after it). Before, only `[lang="dv"]` used the Dhivehi face and the body's
stack won, so Faruma never loaded. Labels on "site" and the menu PDF follow the pick
(`LabelText::DV_FACES['freeserif']`, `DhivehiFont::pdfFile()`). FreeSerif's Thaana is a
pyftsubset of GNU FreeFont (`public/fonts/FREEFONT-LICENSE.txt`). A new face goes into
`PRESETS`, `FONT_CHOICES` and, to print on labels, `DV_FACES`. `DhivehiFontPresetsTest`.
Content Hub `dhivehi_font` accepts TTF/OTF natively. WOFF/WOFF2 inspection and
TTF→WOFF2 conversion need Python `fontTools` + `brotli` (`scripts/install-fonttools.sh`).
That pair is a deploy dependency (CI, TEST, production). Under `[lang="dv"]` / `[dir="rtl"]`
the stacks put the Thaana face first and its range includes the space (U+0020, U+00A0), so
Dhivehi words take the Dhivehi font's wide space, and letter-spacing is reset there
(owner, 2026-10-18: words ran together under Plus Jakarta's narrow space and the headings'
negative tracking). Faruma's lean is its real design; Noto Sans Thaana is the upright choice. A changed font
shows on the next ordinary visit (owner, 2026-10-18: it showed only in a private window): every
link to the sheet carries its version (`DhivehiFont::href()`, `versionLinks()` on the SPA
routes, kept a year; the bare address 60 s), each app's `main.tsx` runs `refreshDhivehiFont()`
(`packages/shared/src/utils/dhivehiFont.ts`) for the app roots Apache serves untouched, and the
order app's service worker asks the network first for it. Link to the sheet through `href()`. The CSS override route
`GET /css/dhivehi-font.css` is registered outside the `web` group so it stays
cookie-less.

## Labels (pack stickers, box labels)

Admin → Labels prints pack stickers (English and Dhivehi; A4 sheets, label-printer
sizes, round stickers) and A4 box labels, server-drawn with dompdf. Label types
(Frozen Hedhika…) carry the wording, brands (Bake & Grill, Amma…) the logo; every
sticker shares one header and footer with the complaints QR; every prepared print is
a saved label that can be reprinted or edited; a live preview (one sticker or the
first page, the box label) redraws beside the form as it changes. Any size prints
(owner, 2026-10-11): one-tap sizes such as 40 × 60 mm and 6 cm round, or one typed in
down to 30 × 20 mm, on a label printer or as many as fit on A4
(`StickerLayouts::PRESETS`, `grid()`; small labels get `SmallStickerDesign`). The admin
size picker mirrors the server's sizing in `labelSize.ts`, and
`fixtures/label_size_parity.json` holds both to the same answers: change them
together. Custom labels (`custom_labels`) are stickers for things not on the menu, with
their own brand, logo and wording, printed beside menu items (`kind: custom` in a
request, `c7` on a sheet link). Owner-only until `labels.print` /
`labels.manage` are granted; either grant carries the admin sign-in (`admin.access` is
satisfied by both in `PermissionCatalog::SATISFIED_BY`, owner 2026-10-11), so a cashier
or cook given Print labels signs in to Admin with phone + PIN and finds Labels in the
menu. Two renderer facts the views depend on: dompdf's baseline
rule differs from browsers (`LabelText::PDF_BASELINE_K`), and dompdf needs Thaana in
visual order (`App\Support\ThaanaVisual`, PDF path only; the menu PDF uses it too).
Below 1024px the live preview
is a bar pinned under the header (`PhonePreviewBar`), never a column under the form
(audit, 2026-10-11); the form folds Use the wording of (one type for the sheet; "Print as"
until round 4), batch and quantity behind More options,
shows each picked product's expiry before Prepare, and offers the last printed sheets as
Print again. A saved label is renamed in place (`InlineRename`), never with a browser
prompt. Built 2026-10-12 (owner: "build all"): a price (the menu's unless typed, on when
`label_show_price`), an EAN-13/EAN-8 barcode (`Barcode`, full-size stickers only), a net
weight, allergens bold in the ingredients (`bold_words` on a text piece; an item's from
Details, a custom label's typed) with a "Contains …" note, `lang: both` (English with the
Dhivehi name, ingredients and storage line beneath, full and compact designs), a draft
custom label previewed before it is saved (`POST /labels/custom/preview`, cache token
`d<token>` in the sheet link, never printed), pinned saved labels (`label_jobs.pinned`,
first in Saved labels and Print again), and Stickers on the kitchen screen for a batch
just sent (needs `labels.print`). Phones print the PDF, not the web sheet (iOS adds margins).
Dhivehi on stickers is Noto Sans Thaana with a true bold for headings (owner, 2026-10-12:
"dhivehi font is not nice"), or Faruma or the website's uploaded font by Labels → Settings
(`label_dhivehi_font`, `LabelText::dvFace()`); the web sheet and the PDF share the face,
and a second family in a Blade `{{ }}` must not be quoted there (Blade escapes the quotes
and the browser drops the rule). Dhivehi at hand-thickening 0.5 and up sets in the true
bold (`LabelText::DV_BOLD_FROM`). A custom label's row has Save, which prepares a full
sheet straight into Saved labels at the size Print labels last printed
(`rememberedSize()` in `labelSize.ts`), and the editor previews the first sticker of that
same sheet, so preview and print never differ. **The footer is always Bake & Grill's
branding** (owner, 2026-10-12: "Amma is a food brand label but the actual brand is
under Bake and Grill, so its branding should be used in the footer"): a food brand's
logo and name go on the header only; `LabelTypes::footer()` always takes the
business's lines, a footer has no brand and no by-line, and a brand's tagline prints
nowhere (the Brands editor no longer offers one). Footers are named presets (owner,
2026-10-12: "No easy option to select and edit branding footer"): `label_footers`
(`LabelFooter`), every line optional and an empty line printing Business Details' live
value, seeded as Standard (`is_default`, cannot be removed). A custom label
(`custom_labels.footer_id`), a label type (`label_types.footer_id`, the default for
what prints with it) and a whole sheet (`footer` in the sticker request, kept by the
saved label) each pick one, in that order of precedence (`StickerSheet::footerPreset`;
nothing picked prints Standard, `standardFooter()`, with the type's QR choice), and
`LabelTypes::footer()` turns the pick into the `footer` array the designs read
(`$d['footer']`; `ownFooter` prints a typed tagline where the tagline or website would
be, the phone kept). The QR goes `label_show_qr` → the picked footer's `show_qr` → the
type's; the full design draws the branded code `qr_branded`, small ones the bare `qr`.
The admin picks a footer with `FooterPicker` (select, pencil to edit in place the
footer that prints, picked or `fallback`, + for new; `FooterModal` shows each blank's
live value as the placeholder) on the custom label editor, a type's editor and Pack
stickers → More options, and lists them under Wording and logos → Footers;
`GET /labels/footers` needs `labels.print`, the writes `labels.manage`. Never add a
second footer choice (a settings key, a radio) beside the preset, and never give a
footer a brand again. A footer also picks its look (owner, 2026-10-12: "different
styles"): `label_footers.style`, one of `LabelFooter::STYLES` (dark, light, rust,
plain, logo), drawn by every design through `StickerDesign::footerPalette()` (band
fill, rule, inks, QR border, whether the whole logo `wordmark` stands for the name);
a new look goes into those two and `LOOKS` in `FooterPicker.tsx`, nowhere else. A custom label also
keeps the language it prints in (`label_lang`; `langOf()` in `CustomLabels.tsx`).
`lang: both` is bilingual on every part and every design (owner, 2026-10-12: "Not
showing both languages correctly"): heading, name, ingredients, how to use, note, date
labels, use-within and storage line, EN with DV beneath or beside, on full, compact,
small and round (`$d['both']`; `SmallStickerDesign::pairLine`), and the full design's
picture band shrinks to what the text leaves (`$band`, down to none) so the middle never
overlaps. The PDF sets Noto Sans Thaana from the derived composed files
(`fonts/pdf/NotoSansThaana-*-composed.ttf`, each letter+fili pair one glyph from
U+E000, `scripts/thaana-composed-font.py`, `fixtures/thaana_pairs.json`) because
dompdf ignores Noto's mark positioning: `ThaanaVisual::order($text, composed: true)`
and `ThaanaVisual::pair()`, switched by `LabelText::dvFace()['composed']`, PDF path
only; the browser keeps the plain webfont. The
editor uses `LabelSizePicker` and, below 1024px, `PhonePreviewBar` inside the Modal,
with `ModalActions` for Close / Print… / Save and a ConfirmDialog before discarding
changes; the long parts are `<details>` folds (`.cl-section`). Round A of the advanced
features (owner, 2026-10-12: "All"): every sticker print has a code (`label_prints.code`,
`LabelPrint::newCode()`, no 0/O/1/I) that the full header and the 99 mm compact band
carry as a QR (`BatchLink`, `b=i12:CODE` on the sheet link, setting `label_batch_qr`;
a preview carries `PREVIEW`) opening the public pack page `GET /b/{code}`
(`LabelBatchPageController`, `labels/batch.blade.php`, no permission, `noindex`, the
complaint link carries the code); printed stock near its expiry comes from the print log
(`ExpiringPrints`, `GET /api/labels/expiring`, the `ExpiringStock` card over Pack
stickers with Reprint → `?item=` / `?custom=`, and `labels:check-expiring --days=2` at
08:10 under the row `owner_labels_expiry`, marking `expiry_alerted_at` so a batch is told
once); allergen pictograms (`AllergenIcons`, SVG data URIs with the word beneath, the
chilli from `spice_level`) sit above the note on the full sticker only, setting
`label_allergen_icons`. Round B: the ingredient glossary (`label_glossary`,
`LabelGlossaryEntry::lookup()` with plural and prefix variants, `LabelIngredients::translate()`
and `missingWords()`; a Dhivehi line prints only when every word is known, `dv_from`
says where it came from; `IngredientGlossary.tsx` on Labels → Settings); packed-for
stickers (`for` / `for2` in the request, `packed_for` in the sticker data, drawn by
every design but the round ones; `GET /api/labels/deliveries/{id}/stickers` and
`/catering/{id}/stickers` fill the form through `?delivery=` / `?catering=`); and a
promotion flash (`promo` was_now or text, `StickerSheet::promoOf()`,
`StickerDesign::flash()` on the full name row and the compact band, where it replaces
the batch QR; `PROMO_PRESETS`). Round C: a nutrition panel per 100 g from the recipe
(`inventory_items.nutrition`, `App\Domains\Labels\Nutrition`, `items.label_show_nutrition`;
prints only when complete; a custom label types `label_nutrition`; `NutritionCard.tsx`),
pack numbering (`number`, each copy drawn with `pack_no` / `pack_of`), print-ready sheets
(`marks`, `bleed` 0–5 mm on a single label, `StickerSheet::printReady()`, ticks in
`stickers.blade.php`), and straight-to-printer output (`LabelRaster` draws a page with GD
at 203 or 300 dpi from `build()['vectors']` for the QR and barcode; `ZplEncoder`,
`TsplEncoder`; signed `/labels/stickers.zpl`, `.tspl`, `.png`; `scripts/label-print-agent.mjs`
on the staff computer; `LabelPrinterCard.tsx` keeps the printer in the browser).
Wrap-around labels (owner, 2026-10-12: a juice bottle's label "with 2, 3, 4, 5 different
parts"): a label at least 90 × 25 mm and 2.5 × as wide as tall gets `WrapDesign`
(`StickerLayouts::design()` → `wrap`, mirrored in `labelSize.ts` and pinned by the parity
fixture; presets 200 × 50, 180 × 40, 150 × 35, 120 × 40), its parts side by side in the
order the product keeps (`label_wrap` JSON, `WrapConfig`; brand, legal, nutrition, dates,
barcode, QR, marks, free text, packed), a flavour band along the bottom, recycling marks
as glyphs of the symbol font (`LabelMarks`, `LabelText::FONTS['sym']`,
`scripts/label-symbol-font.py`) plus the tidy man and mark pictures, and
`label_nutrition_per` (g or ml); `WrapParts.tsx` edits it on the item's Label tab and the
custom label editor, as strips you can see and touch (round 2, owner 2026-10-13:
`StripEditor.tsx`, a count picker, a board to the label's proportions, a sheet per strip,
drag to reorder; `WrapDesign::strips()` reports each strip's box and the parts left out,
carried as `wrap` in the sticker summary and the draft preview, and `StripOverlay` lays
touch zones over the preview through `SheetPreview`'s `overlay`). Parts share the width
by weight (`WrapDesign::share()`): too narrow,
every part shrinks to its floor before any is dropped (`DROP_ORDER`), so nine parts print
on 180 × 40 mm. The barcode SVG is sized in its own units (`Barcode::svgDataUri`, no mm):
dompdf's SVG library ignores the viewBox, and a size in mm drew the bars twice as tall as
the box on every design. Labels opens on **Make a label** (owner, 2026-10-13: "Still
its v confusing and not user friendly"): `MakeLabelWizard.tsx`, the hub's first tab, four
steps (what it is for, with a menu item switched on for labels as it is picked; which
label, as picture cards with everyday names from `LABEL_CARDS` drawn by `LabelSchematic`;
looks right, one live preview with language, dates and quantity and the full editor behind
All details; how many and print, through the same sticker request as Print labels). The other
tabs stay for those who know them; a new way to print a label goes into the wizard too,
not beside it. **Tap to edit** (round 3, owner 2026-10-13): a tap on a part of the preview
(the wizard's step 3, the custom label editor, the item's Label tab) opens that part's boxes
alone. Every design marks its parts (`LabelSpots::open()` / `close()` / `at()`),
`StickerSheet::pieces()` strips the markers before any renderer sees them (the raster reads
every piece's x and w), `summary()` carries the first product's boxes as `spots` beside
`wrap`, and the Admin lays `SpotOverlay` over the preview and opens `QuickEditSheet` with
what `quickSpec()` (`QuickEdit.tsx`) says the part needs; the three hosts share
`labelDrafts.ts` and save only the sheet's keys (`pickKeys`). A new part on a sticker gets a
marker in every design, a name in `SPOT_NAMES`, a case in `quickSpec()` and a key in
`LabelSpots::KEYS`. **Plain words** (round 4, owner 2026-10-13): on screen the tabs are
Print labels (`/labels/stickers`) and Wording and logos (`/labels/types`), the footer is
the bottom strip, Print as is Use the wording of, the wrap strips' default set is Reset,
and every fold of a label form opens with a one-line `FoldHelp`; routes, code and data
keep their names (`label_footers`, `FooterPicker`, `footer_id`), so a new screen uses the
screen's words and the code the code's. Zero state and tour (round 5): an empty Print
labels list offers Choose which items get labels (`ChooseItemsModal`, ticks saved at once)
and Make a label, and `LabelsTour` (four cards, `localStorage['labels.tour']`, How it works
on the wizard) opens on the hub's first visit; a renamed or new tab goes into its fourth
card. My label rolls (round 6): the rolls and sheets the business owns, the setting
`label_rolls` (`LabelRolls::normalise()`, sent with `GET /labels/layouts` as `rolls`),
edited under Settings (`LabelRollsCard`); every size picker shows them first and folds
the rest under More sizes (`LabelSizePicker` `rolls`, the wizard's roll cards,
`rollMatches()` in `labelSize.ts`), and with none registered nothing changes. Templates
(round 7): a label's settings without the product, never its name, pictures, barcode or
price (`label_templates`, `LabelTemplates::KEYS`, the built-in ones in
`LabelTemplates::BUILTIN`; `GET` / `POST` / `PUT` / `DELETE /labels/templates`); Start
from on a new custom label and on a menu item's Label tab (`StartFromRow`,
`applyToCustom` / `applyToItem` in `labelTemplates.ts`; another label is offered as a
template too, `templateOfCustom` / `templateOfItem`), Save as template on every label
(`SaveAsTemplate`), the list under Wording and logos (`LabelTemplatesCard`). The drag
designer (round 8): a product keeps per design the parts moved or resized by hand
(`items.label_layout` / `custom_labels.label_layout`, `LabelLayout::clean()` /
`apply()` on the marked runs in `StickerSheet::pieces()`, before the markers are
stripped); `SpotOverlay mode="move"` with `ArrangeBar` (Move and resize, Back to
automatic) on the custom label editor, the item's Label tab and the wizard; a part with a
box of its own (`LabelSpots::at`) is `fixed`; a wrap label is arranged by its strips. A
new design that places parts goes into `LabelLayout::DESIGNS` and `MOVABLE_DESIGNS`.
Badges (round 9): up to four keys from `LabelBadges::CATALOGUE` per product
(`label_badges`), drawn by every design as rust pills under the name through
`LabelBadges::pills()` (rectangles and text, so the raster draws them too), picked with
`BadgePicker` or the tap sheet's `chips` input; a new badge goes into the catalogue (and
`BADGE_FALLBACK`), nowhere else. Variable runs (round 10): a row of a sticker request may
carry its own batch, quantity, dates and packed-for (`StickerSheet::RUN_KEYS`,
`cleanRun()`, `rowRequest()` over the sheet's request in `build()` and `summary()`; the
link's `runs`; the print log per product), typed in the Details fold of each picked row
on Print labels; a new per-print value that a row may own goes into `RUN_KEYS`, the
rules, `runPayload()` and the fold together. Scan to reprint (round 11): every sticker
print keeps the request that made it, one product (`label_prints.request`,
`App\Domains\Labels\Reprint::of()`; `rebuilt()` from the columns for older rows), and
`GET /api/labels/prints/{code}` gives it back with the pack's dates; the pack page's
"Staff: print this sticker again", the scan row on Print labels (`ReprintScan`,
`codeFromScan()`) and Print again on the print log all open `?code=`, whose print is
logged with `details.reprint_of` and a code of its own. A new sticker request key that
a print must replay goes into `Reprint::KEYS` (the saved label's keys too). Print when
packing (round 12): a plan task carries the batches made for it (`batches`,
`ProductionTasks::madeFor()`), and the kitchen screen lists each with a count box and
Print stickers, on the roll and in the language from `LabelRolls::kitchen()`
(`label_kitchen_roll`, `label_kitchen_lang`, picked under Labels → Settings → My label
rolls; `kitchen` on `GET /api/labels/layouts`); the PDF's window is opened in the tap
itself so a tablet does not block it. Label stock (round 13): a roll in `label_rolls`
may carry `left` and `low`; every real print is counted off the roll it names (`roll`
in the request, else the roll of that size; `LabelRolls::consume()`, labels on a
printer roll, sheets otherwise), the pickers show what is left, and the owners hear
once at the level through the registry row `owner_labels_roll_low`
(`RollStockAlert`), forgotten when the roll is counted up again. Mock-up preview (round
14): a preview's reply carries `mock_urls`, the first sticker drawn by the server on a
jar, bottle, box or lid (`StickerMockup::scene()`, curved labels as squeezed strips;
`mock` on the signed sheet link, `labels/partials/mockup.blade.php`), shown by the
Mock-up mode on Print labels and Flat / On a … at the wizard's step 3. Round 15: an
item's serving size (`items.label_serving_g`) prints per-serving values beside per 100
on the full and wrap designs (`Nutrition::scaled()`), and every shelf-life box offers
the usual days for its storage (`LabelSettings::SHELF_LIFE_SUGGESTED`, `shelf_life` on
the layouts, `ShelfLifeHint`), filled only on Use. Round 16: a phone or tablet in
Chrome prints to a Bluetooth Low Energy label printer straight from the browser
(`bluetoothPrinter.ts`: pair from a tap, the first writable characteristic of a known
printer service, the same TSPL/ZPL links in 180-byte chunks), chosen as `via:
'bluetooth'` on the printer setup; iPhones cannot, and the card says so. Wording lock
(round 17): a label's legal lines (`LabelSignoffs::LINES`: name, ingredients, allergens,
storage, after opening, net weight, nutrition) are signed off into `label_signoffs`;
with `label_wording_lock` on, `stickerLinks()` refuses a real print whose lines differ
from the last sign-off (previews draw), and every print logs `details.signoff`. A new
line that has legal weight goes into `LabelSignoffs::lines()` and `LINES` (and
`LINE_NAMES` in `WordingSignoff.tsx`). Label audit, Batch A (2026-10-16): a sized item's
sticker is for one size, `size` on its request row (a `RUN_KEYS` key, so Print again and
scan-to-reprint keep it; `StickerSheet::forSize()` hands the designs a copy carrying the
size as the `labelSize` relation): its price (a typed label price still wins; with no
size, the cheapest prints as "From MVR …") and its recipe rows (`LabelIngredients::sizeOf`,
`sizeRecipe()` 'shared' when the size has none and the unsized rows stand in, said in the
summary, never on the sticker); never the Daily Specials price. Print again dates by the
saved label's choice (`LabelJob::dateMode`, `reprint_dates` in its request, set with
`PUT /labels/jobs/{id}` `dates`): "shelf" clears the sheet's and every row's dates so they
are worked out from today, "keep" keeps the typed use-by and refuses one already past; a
label with no typed use-by is "shelf". The wizard types a use-by for one print, and the
signed nutrition line carries the serving size and the per-serving values. Batch B: a preview's summary carries `wording` (the products the lock would refuse and
`LabelSignoffs::refusalMessage()`, the refusal's own words) while the refusal itself stays in `stickerLinks()` for real prints, and `dropped` (`StickerSheet::dropped()`: the Dhivehi name, ingredients, photo, QR and badges the size could not draw; a wrap label's parts left out as narrow); `PrintChecks.tsx` shows both on Print labels and the wizard (Prepare / Print off while refused, Sign off in a pop-up), the wizard's last step shows the use-by with the short-life mark, both say the links last 30 minutes, a kitchen task carries `stickers_locked`, and a Bluetooth send that stops part way says how many stickers went (`stickerEnds()`, `PartialSendError`). A new part a design may leave out goes into `dropped()`. Batch C: a print is counted off a roll only by `LabelRolls::pick()`: the roll it names when that roll is this very size, else the one roll of that size; two or more of one size with none named is never guessed (nothing counted, their names in `roll_unsure` on the summary, preview too), and the screens ask (`pickRoll()` in `labelSize.ts`, the Which roll box on Print labels, the tapped roll in `LabelSizePicker` and the wizard). `consume()` reads and writes the count in a transaction under a row lock, from the database, not the cache. Every print path sends its roll: Print labels, the wizard, a custom label's Save (the roll remembered with the size, `rememberedRoll()`) and the kitchen screen (`label_kitchen_roll`). Batch D: the kitchen screen's Print stickers for today's packs (`TodaysPacks.tsx`) lists every batch of today's plan tasks for items that print labels, with what has printed for each (`printed` and `mfg` on a task's batches, from the print log by batch; `label_enabled` on the task), ticks the bare ones, and prints them in one PDF, each row with its own batch, dates, size and `pi` (a row's `pi` is kept on its print, `kitchen_production_item_id`, and replayed by `Reprint`), and a pack the wording lock refuses is never ticked. Follow-ups (owner, 2026-10-16: "All"): a size whose legal lines differ from the item's is signed off apart (`label_signoffs.size_id`, `LabelSignoffs::sizeOf()`, a `size` line, `?size=` / `size` on the sign-off routes, `own_recipe` on a product's sizes; a size printing the item's lines stands under the item's sign-off, and `forPrint()` takes `StickerSheet::printProducts()` keyed `i12|size`); the kitchen sends a sized task's `size`; a custom label's Save sends `save: true` (kept under Saved labels, drawn as a preview: no print log, no roll counted, no print counted on the job); and every request row has its own key (`row`: "i12", then "i12r2"), so two batches or sizes of one product are two rows with codes of their own (`codes` and `Reprint::of()` follow the row; array rows merge only when their details match, a sheet link's rows never). A Label type box carries a + beside it, as Brand does (owner, 2026-10-17: "why no option to add new label type here"): `NewTypeButton` in `TypesAndBrands.tsx` opens the Wording and logos type editor and picks the new type, on the custom label editor and, with `labels.manage`, the item's Label tab. How to
use it and where everything lives: `docs/LABELS.md`; design and decisions:
`docs/LABEL_HUB_PLAN.md` and `docs/LABEL_HUB_V2_PLAN.md`.

## Telegram staff bots

Admin → Telegram (owner-only, `telegram.manage`): bots, links and groups; which
alerts go to Telegram, Telegram on or off and the Telegram-only alerts are in
System → Notifications. One bot can serve every role
(owner, manager, staff, kitchen staff, driver) or each role its own. Staff link
their own Telegram with a one-time link; staff and owner alerts that go through
`SmsService` are copied to their chat (`TelegramAlertCopier`), and the bot's
buttons re-check permissions on every press. **TEST
and production need separate bots**: Telegram sends a bot's updates to one
webhook only, and adding a bot that points at another site stops with a warning.
Built: owner, manager, cashier and kitchen (menus follow permissions; the kitchen
gets the prep list with Made, the board read only and check-in), drivers (a message
per delivery, Picked up / On the way / Delivered), the buying list (add by
typing, Approve / Reject, the buyer ticks items off with the price paid) and
shop-group feeds (`/feed@<bot>` online orders, `/feed@<bot> buying` the buying
list; buttons checked against whoever presses; cards follow the order or
request). No shift figures for cashiers: the close count is blind. Owner extras
behind 🧰 More (who's working, low stock, find an order, message staff) and two
Telegram-only alerts (order cancelled at the till, cash out). See
`docs/TELEGRAM_BOTS.md`.

## Alert channels per role and person

Staff and owner alerts go to **people**, by channel (SMS, Email, Telegram): the
alert type's switch, the person's channels (their own, else their role's, set in
Admin → System → Notifications → People) and whether they can be
reached that way. Staff without a phone are addressed as `user:{id}` and get
email / Telegram (order alerts and shift reminders too); when nothing reaches
someone who has a phone, the SMS goes. Customers are untouched. See
`docs/NOTIFICATION_CHANNELS.md` (`NotificationChannels`,
`SmsService::sendByOtherChannels`).

**Who gets an alert is its audience** (owner, 2026-10-10: "each user group
settings must be able to control group wise and each staff separately"):
`App\Domains\Notifications\Support\AlertAudience`, `{groups, users, except,
phones, emails}` per alert, groups `role:{slug}`, `perm:{slug}`, `on_shift`,
`catering_team`, `business_phone`. A sender calls
`AlertAudience::addresses($type, $context)` (or `OwnerPhones::for`, which
delegates); a new staff or owner alert goes into `DEFAULT_GROUPS` or it has
no audience and Admin cannot aim it. Edited on the row (Messages → Edit → Who
gets it) and from the person's card (People → Alerts: Mute / Add); `?to=role:x`
or `?to=user:id` filters Messages to what reaches them. Never read a
recipient list from a settings key of your own: no second place to say who
gets an alert. Details: `docs/NOTIFICATION_CHANNELS.md` § Who gets each alert.

One alert reaches each person once per channel (owner, 2026-10-10: an alert
came twice on Telegram). Phones are stored as typed, so compare addresses
with `AlertAudience::addressKey()` (seven digits) and build lists with
`AlertAudience::unique()`, never a plain `unique()`; the Telegram and email
copiers claim each person in `AlertOnce` (scoped to the request or job), and a
Telegram send that timed out is not resent. Details: same file, § One alert,
one message per person.

One event sends one message to each person (owner, 2026-10-10: "Fix" the
seven doubles). A new message for an event that already sends one is folded
into it, not sent beside it: the delivered text carries the receipt, the
refund code text is the request notice, the catering confirmation covers its
payment, "order confirmed" skips staff told "new order", a late delivery is
reported once (`delay_alerted_at`), and the payment confirmation email is
claimed once per order (`receipts.confirmation_email_sent_at`). Details: same
file, § One event, one message; `OneMessagePerEventTest` replays each.

## Notifications: one page, one switch per alert

Owner, 2026-10-10 ("to make setting less complicated"). Every text, email and
Telegram alert is on **Admin → System → Notifications** (Messages, People,
Rules, Log); SMS & Messaging is "SMS campaigns" (campaigns, contacts,
scheduled, templates). An alert's row (its SMS, Email and Telegram switches)
is its only on/off: never add a second switch on a domain page; link to the
row instead (`/notifications/messages?open=<type>`). A sender asks
`AlertSwitch::isOn($type)` before working an alert out. A number that says
when an alert goes lives under the row's Edit ("When it sends") and refuses 0;
off is the row. A shared switch is split, one per message. Every row has one
switch per channel it can go by (`SmsTypeRegistry::channels($entry)`); a
message with an email of its own puts that email behind the row's Email
switch (`SmsTypeRegistry::isEmailEnabled`, `HAS_OWN_EMAIL`), and there is no
master email switch (the "email copies" category switches went on
2026-10-10). A Telegram-only alert is a registry row with `channels:
['telegram']`. Details: `docs/NOTIFICATION_CHANNELS.md` § One page, one
switch per alert and § Who gets each alert.

## Who may change something may see it

Owner, 2026-10-08: "If the manager has given the permission he must see the
permission." A write must not be open to someone its screen's read refuses:
`GET /api/site-settings` takes `settings.update` as well as `website.manage`, and
without the latter returns `SiteSettingsController::operationsReadableKeys()` (a new
display-only key goes in `OPERATIONS_DISPLAY_KEYS`). A settings screen never saves
values that did not load (Save off, switches locked). Anyone who cannot edit roles
sees their own access on Settings → Roles & permissions (`GET /api/auth/me/permissions`).
Route permissions change only with the owner's yes, and the change updates
`backend/tests/Fixtures/admin_route_permissions.txt`. Details:
`docs/ADMIN_THEMING_MOBILE_PLAN.md` § Stage 3f.

The role editor shows the permission groups as tiles in six sections that follow
the admin menu (owner, 2026-10-09: "group and make it easier"). A new permission
group goes into a section in `pages/SettingsPage/permissionSections.ts`; one left
out still shows, under "Other". One person is edited like a role (owner, 2026-10-12):
the same switches and All on / All off, starting from what the role gives; a switch set
away from the role is theirs alone and wears a "For them" mark that puts it back (All
as role for a group). Never bring back a three-way As role / Allow / Deny control.
Team → Staff → More → Permissions opens this editor on that person (`?user=<id>&from=staff`,
with Back to Staff), not a pop-up. Settings tabs keep scrolling short: long forms are
tabs (Business), wordings fold to one line until Edit (Notifications → Messages). A
`position: fixed` bar inside a page now sits on the screen, not the page
(`.animate-fade-in` no longer leaves a transform behind); words on a rust fill are
`--color-on-primary`. Details: same file, § Stage 3g.

## TEST and production share one Redis

The Redis socket is per cPanel *account* (`REDIS_PATH=/home/bakeandgrill/.redis/redis.sock`),
so both sites talk to the same server. Nothing separates them by default —
`REDIS_PREFIX` and `CACHE_PREFIX` both fall back to a slug of `APP_NAME`, which is
the same `"Bake & Grill"` on both, and `REDIS_DB`/`REDIS_CACHE_DB` default to 0 and 1.

Left at the defaults the two environments share a **queue**, and whichever worker
pops a job runs it against its *own* database and credentials — so a TEST
campaign-SMS job can be executed by the production worker and delivered to real
customers. They also share a **cache**, and `cache:clear` on either site wipes both:
`RedisStore::flush()` is a `FLUSHDB`, which ignores prefixes.

Production keeps the defaults. TEST sets all four explicitly (fixed 2026-08-23):

```
REDIS_DB=2
REDIS_CACHE_DB=3
REDIS_PREFIX=bg-test-database-
CACHE_PREFIX=bg-test-cache-
```

Any third environment on this account needs its own set. Separate prefixes isolate
the keys; separate databases are what make a `cache:clear` on one site harmless to
the other. `app:verify-production-config` cannot catch this — it only sees one
environment — so it is a convention, not an enforced check.

## Menu layout (website and order app)

Owner, 2026-10-07. The rail lists main categories only. One banner, pinned
under the header, shows the section in view (photo, name, count, Share,
search icon) with its sub-categories as a row of buttons; the list underneath
is continuous, each sub-category starting at a thin label with its own Share.
Banner, buttons and rail highlight animate on scroll and tap (transform and
opacity only, off under reduced motion); an "All" panel appears when the
buttons do not fit. Website: `.mh` markup and script in `menu.blade.php`.
Order app: `components/menu/MenuHead.tsx`. Keep the two in step. Shared links
`/menu/c/{slug}` open the full menu at that category or sub-category
(`data-menu-start`), with a preview built from its photo or a dish photo
(`MenuPageController::sharedLink`).

The button row and search panel float under the banner (`.mh-under`), so a
section without sub-categories shows no strip and nothing jumps. The search
panel is a card of its own (surface, rust-tinted edge, lifted shadow, hanging
straight from the banner or row): in the page's cream it vanished over dishes
without photos, whose tiles are that same cream. On phones the
order app's day and order-type bars are not pinned: they fold into a button at
the head of the rail (`RailOrderButton`) that drops them back down. On phones
the menu opens with a brand row (`HomePhoneHeader pinned={false}`) that scrolls away;
the website's phone header slides away while scrolling down the menu and returns on
the way up (`menu-header-away`, which also sets `--menu-sticky` to 0). The first
Add with no order type chosen asks once (`OrderModeSheet` with `onChosen`) and
adds the dish in the same tap; the cards' quick "+" goes through the same question
and opens the sheet instead for a dish with sizes, extras, a platter, packaging or a
minimum quantity.

## Dhivehi addresses on the website

iruali import plan, feature 3b, part 1 (2026-10-18). With **"Dhivehi on the website and in the
order app"** on (the content key `language_switcher_enabled`, Admin → Website), a public page
answers in English at its usual address and in Dhivehi under `/dv/...`: `App\Http\Middleware\LocalePrefix`
runs before routing, strips the prefix and marks the request Dhivehi (read by `SetContentLocale`).
A page that is not public (`App\Support\LocaleUrl::isPublic`: home, menu and dishes, hours,
contact, terms, refund, privacy, offers, prayer times; never `/menu/print`) is a 404 under
`/dv`; switched off, every `/dv` address is a 302 to its English page; an old `?lang=dv` link on a
public page is a 301 to its `/dv` address. Each public page carries `hreflang` en, dv and
x-default and a canonical in its own language; the sitemap lists `/dv/...`; the header's EN / ދވ
links go to the two addresses. The order app keeps the language in the account. A new public page
goes into `LocaleUrl::PUBLIC` and the sitemap. `DhivehiUrlsTest`. It is **one switch** for both
apps (`ContentWriter::ONE_SWITCH`): a save in either hub writes both, and the order app reads the
website's value. The order app's `LanguageSwitcherGate` puts English back only once the settings
have loaded (`loaded` on the settings context), never on the defaults. The phone-width spec runs
every website page under `/dv` and the order app in Dhivehi, checking right to left as well as
width; it skips while the switch is off on the server. Never hide something at `left: -9999px`:
in right to left it widens the page by that much (hide above the page, or clip it).

## Customer pages: icons, hours, request limits

UI audit, 2026-10-10. Icons on the website and in the order app are drawn
(lucide), never emoji: the website uses `App\Support\UiIcon` (`svg()`, and
`label()` for wording the owner types with a leading emoji), the order app
`utils/emojiIcon.tsx` (`EmojiIcon`, `ORDER_MODE_ICONS`, `HeartIcon`,
`SpiceFlames`). Keep the two emoji maps in step. A dish without a photo shows
the brand flame (`/brand/flame-mark.svg`), faded. Text on these pages is 11px
at the smallest.

Opening hours come from one place, the Admin schedule: the website through
`App\Support\OpeningHoursText` (`range()`, `groups()`), the order app through
`GET /api/opening-hours` (`schedule` keyed `sunday`…`saturday`), both written
"7:00 AM – 11:00 PM". Do not type hours into page wording.

The order app's "~N min wait" pill (menu, cart, checkout) is `WaitTimeEstimator` (open
tickets of the last 2 hours, each dish's prep time, two tickets at once, 5 to 60
minutes) behind one switch, Admin → Settings → Ordering → Features → Order app
(`order_app_wait_time_enabled`, off by default; owner, 2026-10-12). Off, `GET
/api/wait-time` answers an empty queue, which is what hides the pill.

A numbered `throttle:N,M` counts per route, not one count shared by every
route on the address: `App\Http\Middleware\ThrottleRequestsPerRoute`, bound in
place of the framework class in `AppServiceProvider` (so
`withoutMiddleware(ThrottleRequests::class)` still works in tests). Named
limiters are unchanged (`RateLimitPerRouteTest` fails if the binding goes). The order app retries a refused read once after
`Retry-After` and says the menu is busy rather than blaming the connection.

## Website wording in Dhivehi

iruali import plan, feature 3b, part 3 (2026-10-18). On a Dhivehi page (`/dv/...`, switch on)
`SetContentLocale` sets the app locale, so the fixed wording in the public views, wrapped in
`__('English')`, reads from `backend/lang/dv.json` (keyed by the English as written). Content
fallbacks follow the same file: when a dv lookup in `ContentResolver` ends on English (the en
row, the registry default or the `content()` default) it goes through `DhivehiText::of()`, so
built-in wording reads in Dhivehi and English the owner typed stays as typed until they type
a Dhivehi version. A new string on a public page is `__()` with its Dhivehi in `lang/dv.json`
(`WebsiteDhivehiWordingTest` fails otherwise); in a script use `@json(__('…'))`. The legal
pages (privacy, terms, refund) have Dhivehi drafts in `resources/views/legal/dv/`, shown only
once **Dhivehi legal pages approved** (`legal_dv_approved`, Website → Legal) is on
(`App\Support\LegalDhivehi`); until then a `/dv` legal page shows the English with a note
(`legal/dv/notice`), and a body the owner typed in Content wins over both. A change to an English
legal page needs the same change in its Dhivehi draft. `LegalDhivehiTest`. What only the owner can
do (deploys, switches, cPanel steps, keys) is listed in `docs/OWNER_CHECKLIST.md`: add to it when
a change needs the owner.

## Customer texts and emails in Dhivehi

iruali import plan, feature 3b, part 4 (2026-10-18). With the switch on, a customer whose
account keeps Dhivehi (`customers.preferred_language`) gets texts and emails in Dhivehi.
Texts: `App\Domains\Notifications\Support\CustomerSmsText` (`language($phone)`, matched on the
last seven digits; `body($slug, $english, $phone)`): the template's `sms_templates.body_dv`,
typed under the row's wording in Admin → Notifications → Messages (`DhivehiWording`,
`dv_templates` on `PATCH /admin/sms/types/{key}`), else the built-in draft in
`CustomerSmsText::DEFAULTS`, else the English. `CustomerSmsMessageBuilder::build()` takes the
number it sends to as its fourth argument, and the refund, complaint and credit senders pass it
to their own `renderTemplate`; a new customer message passes its number the same way and adds
its draft to `DEFAULTS` (a slug there is what offers the Dhivehi box). The drafts leave out
English-only fragments (`{{greeting}}`, `{{ready_hint}}`). Emails: each customer mail is sent
with `->locale(CustomerSmsText::languageFor($phone, $email))`; its views and subject use `__()`
from `lang/dv.json`, and the layout turns right to left. Staff alerts, campaigns and the
newsletter issue (the owner's own words) are not translated.

## Order app strings: English and Dhivehi

iruali import plan, feature 3a (2026-10-17). The order app's copy is
`apps/online-order-web/src/i18n/en.json` and `dv.json`; `t()` (`LanguageContext`) shows
the Dhivehi where it exists and the English otherwise, and only while Admin's language
switch (`language_switcher_enabled`) is on (`LanguageSwitcherGate` puts English back when
it is off). Every key has Dhivehi (3b, 2026-10-18), so a new key goes into both files:
`i18n.test.ts` fails on a key without Dhivehi, a stale key or a lost `{placeholder}`. The account keeps the language
(`customers.preferred_language`, saved by Account → Settings, taken on sign-in). Dhivehi
copy is drafted and must be read by a Dhivehi speaker before the switch goes on.

## Points about to expire

iruali import plan, feature 13 (2026-10-18). With a points life set
(`loyalty_points_expiry_days`), `loyalty:warn-expiring` at 09:10 tells each customer once
per batch (`loyalty_ledger.expiry_warned_at`) how many points (never more than the balance)
expire within 30 days and when (row `customer_points_expiring`, marketing, so Offers and
news applies). `App\Domains\Loyalty\Support\ExpiringPoints`; `GET /api/loyalty/me`
carries `expiring`, shown on the order app's Rewards card.

## Customers can sign in with Google, Facebook and Apple

iruali import plan, feature 1 (2026-10-17; `docs/SOCIAL_SIGN_IN.md`). A button shows only
when its keys are in `.env` (`services.google|facebook|apple`). `/auth/social/{provider}`
→ provider → `/callback` (Apple's form post hands over through the cache, without the
session). `SocialLoginService::resolve()`: a linked sign-in, else a customer whose
checked email matches when the provider vouches for it; anything else waits in the
session (`customer_social.pending`) and the order app asks for the phone, then
`CustomerAuthController::establishCustomerSession` links it after the phone code or
password (never after a guest session). A phone is needed for every order, so a social
sign-in never makes a customer without one; an email or phone that belongs to active staff
is refused. `customer_social_accounts`, Account → Sign-in methods with Unlink.

## A customer's email is checked with a code

iruali import plan, feature 2 (2026-10-17). `customers.email_verified_at` is set when the
customer types the 6-digit code sent to the account's email (`POST /api/customer/email/
send-code` and `/verify`, `CustomerEmailController`; codes from `CustomerOtpService` with
purpose `verify_email`, 10 minutes, 5 tries, one a minute; the email reads "Check your
email"). Changing the email clears it (`Customer::booted`), and a code sent to the old
email does not prove the new one. `Customer::hasVerifiedEmail()` is what offers and
newsletters by email and social sign-in ask; receipts still go to any email given.
Account → Profile shows Checked or Send code under the email (`EmailCheck.tsx`).

## A customer chooses which messages, by SMS and email

iruali import plan, feature 5 (2026-10-17). Account → Messages (`AccountMessagesBlock`):
order updates (both by default), delivery updates (SMS), offers and news (SMS unless
`sms_opt_out`; email only when asked for and the email is checked) and sign-in and security
(always on). `App\Domains\Customers\Support\MessageChoices` decides: `kindOf($type)` from
the registry (fixed order and delivery types; category marketing → offers, auth → security;
anything else, such as refunds, complaints, credit, catering, reservations and wholesale,
has no customer say), `allows($customer, $kind, $channel)`, `customers.message_prefs`, saved
through `message_choices` on `PATCH /customer/profile`. `SmsService` (step 5b), the email
copier and the order and payment confirmation emails ask it; the shop's switches stay the
first word. Offers by SMS is still `sms_opt_out` (STOP replies and the SMS page keep
working), and the one-click link in an offers email stops offers both ways. The admin
Customer 360 shows the choices. A new customer-facing registry row that the customer
should be able to turn off goes into `kindOf()`.

## Ordering from the table (QR)

Admin → Tables prints a card per table whose QR encodes `APP_URL/order/?table=<token>`
(`RestaurantTable::qrUrl`); the website root forwards an old card's `/?table=` there.
The token, never the table id, decides the table (`OrderCreationController`, public
lookup `GET /api/tables/qr/{token}` answers with a name only). The order app reads the
scan once, on any page, in `TableSessionProvider` (owner, 2026-10-12: the checkout page
alone read it, so the table was gone by the time the guest got there), keeps it for the
tab, settles the mode on eat-here, shows one seated chip on the menu in place of the
order-type switch, and at checkout a "Eating here · Table T4" banner first, no order
type, arrival time or party size; the table branch runs before delivery in
`useCheckout`. The eat-here pre-order switch does not apply to a seated guest. Checked
end to end in `TableQrOrderingTest` and `TableSessionContext.test.tsx`.

## Variants are separate products in reports

Owner, 2026-10-07: "variant should treat as a separate product". Every sales
ranking groups by item **and** variant and names the row "Water (Small)"
(`App\Domains\Reporting\Support\ProductName`): Admin daily summary and
breakdown, stock velocity, menu engineering, item forecast, customer
favourites, wholesale top items and shop analytics, Telegram best sellers.
Rows carry `variant_id` and a `key` unique per product. Removed (soft-deleted)
order lines do not count. Waste logs have no variant, so waste stays per item.
New sales reports follow the same rule.

## Best sellers: an item can opt out

Owner, 2026-10-13: "Some items like water bottles are always in the best sellers
section but I don't want some items be there." `items.hide_from_bestsellers` (the item
editor's Best sellers section, "Keep out of best sellers"; a column and a bulk action
on the menu grid) leaves the item out of every best-sellers and popular list: the
website home's Best Sellers (`HomeController`, the content preview), the order app's
Top sellers filter and sort (the public items list reports `sales_30d` 0 for it, which
the signage board reads too), the till's Popular now row (`PosPopularNowService::rank`,
read fresh so the switch takes effect on the next menu refresh) and the signage
Bestsellers slide (`SignageResolver`). Sales reports and the Telegram best sellers still
count it: a report is not a promotion. The flag is in the model's `$hidden` and listed
by `ItemController` for staff only, so the public contract snapshots do not carry it.
A new best-sellers or popular surface honours the flag too. `BestSellerOptOutTest`.

## Back in stock and coming soon

iruali import plan, feature 8 (2026-10-17). A dish that is sold out, snoozed or switched off
offers a signed-in customer "Tell me when it's back" in the order app's dish sheet
(`ItemAlertButton`, not for closed hours or a channel); a dish with `items.launch_at` in the
future is kept off sale (`Item::booted` forces `is_available` off), shows "Coming soon" with
its date (`coming_soon_until` on the public item, only while it is still coming) and offers
"Tell me when it's on sale". Set in the item editor's Coming soon section, which also shows
how many are waiting (`alerts_waiting`). `items:alerts` (every five minutes,
`App\Domains\Menu\Services\ItemAlerts`) puts launched dishes on sale and texts each waiting
customer once (`item_alerts.sent_at`), only while the shop is open; rows
`customer_back_in_stock` and `customer_item_launched`. `ItemAlertsTest`.

## Reviews: photos, verified, helpful, reply

iruali import plan, feature 6 (2026-10-17). A review carries up to three photos
(`App\Domains\Reviews\ReviewPhotos`: GD re-encode so EXIF is gone, 1600 px and a 480 px
thumbnail on the private disk), served by `GET /api/reviews/{id}/photos/{n}` (`?thumb=1`) only
once approved, and to staff by `/api/admin/reviews/{id}/photos/{n}`. Every review waits for
staff. "Verified order" is `Review::isVerified()` (it came from an order). A signed-in customer
marks another's review Helpful once (`review_votes`, `helpful_count`); lists sort by helpful,
then newest. Admin → Reviews → Reply (`POST /api/admin/reviews/{id}/reply`) shows under the
review as "Reply from Bake & Grill" and texts the customer on the first reply (row
`customer_review_reply`, kind orders). Shown in the order app's dish sheet (`ItemReviewList`),
on the website dish page with `aggregateRating` in its JSON-LD, and picked on both review
forms with `ReviewPhotoPicker`. `BetterReviewsTest`.

## Questions about a dish

iruali import plan, feature 7 (2026-10-17). A signed-in customer asks from the order app's
dish sheet (`ItemQuestions`, 300 characters, `throttle:5,10`, five waiting at most);
`item_questions` waits for staff and only answered ones show (order app, and the website dish
page with an Ask a question link). Customers → Dish questions (`DishQuestionsPage`,
`customers.manage`, `/api/admin/item-questions`) answers, hides, or answers and adds the answer
to the dish's description. An answer touching allergens (`ItemQuestion::mentionsAllergens()`)
carries "Please tell staff about any allergy when you order." Rows `staff_new_question`
(audience `perm:customers.manage`, so whoever is told can answer) and
`customer_question_answered` (first answer only). `ItemQuestionsTest`.

## Order messages

iruali import plan, feature 9 (2026-10-17). "Message us" on the order app's order page
(`OrderMessages`): up to 1000 characters and one photo, keyed by the order's tracking token
(`/api/orders/track/{token}/messages`, so guests can write; the owner's order detail carries
`tracking_token`), open while the order is and for two days after `completed_at`, never once
cancelled (`OrderMessageController::canWrite`). Photos sit on the private disk
(`order-message-photos/`, through `ReviewPhotos`) and open only through a signed link that
lasts 30 minutes (`order-messages.photo`). Admin's order drawer has `OrderMessagesPanel`
(Reply, texted to the customer with a link back; Turn into a complaint, `complaints.manage`,
`source` order_message); `GET /api/admin/order-messages` lists orders waiting for a reply. The
till's Active orders card shows "Customer: …" from `customer_message` on the orders list
(`unreadFor`). Rows `staff_order_message` (audience on shift) and
`customer_order_message_reply` (kind orders). Complaints stay separate. `OrderMessagesTest`.

## Gift orders

iruali import plan, feature 10 (2026-10-17). "This is a gift" at checkout for delivery and pickup
(`GiftOptions`, never for eat-in or a table QR): receiver's name and phone and a 200-character
message, `orders.is_gift`, `gift_to_name`, `gift_to_phone`, `gift_message`, kept by
`App\Domains\Orders\Support\GiftOrder::apply()` after the order is made (`rules()` on both
checkout endpoints). A gift delivery's drop-off contact is the receiver; the driver app shows
"Gift: hand it to …" with the receiver and the buyer as second contact (`is_gift`,
`gift_to_*`, `buyer_phone` on the driver's delivery). The kitchen slip prints GIFT, who for and
the message (`gift` in the print payload, `print-proxy/src/tickets.ts`); it never carried
prices. The buyer's receipt is unchanged and goes to the buyer. The till marks the ticket
"Gift for …". The receiver gets one text when it is on the way (`TellGiftReceiverListener`,
row `customer_gift_on_the_way`, SMS only, off by default, `gift_sms_sent_at`). Order app
strings are `giftOrder.*` (`gift.*` is gift cards). `GiftOrdersTest`.

## Store credit and the wallet

iruali import plan, feature 12 (2026-10-17). A refund's card or online share can be paid out as
**Store credit (customer wallet)** (`store_credit` on `POST /refunds/{id}/paid-out`): one
`customer_deposit_ledger` entry with the refund's id (`DepositLedgerService::creditFromRefund`,
once per refund), needs a customer on the order, and the customer gets
`customer_refund_to_wallet` instead of "refund completed" (one event, one message). No cash
leaves the drawer. The order app's Account → Wallet has Add a gift card
(`POST /api/customer/wallet/gift-card`, `AddGiftCardToWallet`): the whole balance moves in and the
card is used up; a card held on an unpaid order is refused. Checkout offers Pay from my wallet
(`POST /api/customer/orders/{id}/pay-wallet`, payment method `customer_deposit`, then
`completeZeroBalanceOnlineOrder`) **only when the wallet covers everything due**, so a card
payment that fails can never strand wallet money on a cancelled order. The ledger names the
owner as actor, as gateway settlements do. `CustomerWalletTest`,
`RefundExternalPayoutTest::test_store_credit_puts_the_refund_in_the_wallet_and_says_so`.

## Search-engine data and catalogue feeds

iruali import plan, feature 11 (2026-10-17). Every website page carries the Restaurant JSON-LD
from `App\Support\StructuredData::restaurant()` (business phone and address from Business
Details, `openingHoursSpecification` from the Admin schedule, the same rows as
`OpeningHoursText`, an OrderAction to the order app); the menu page keeps its Menu block (coming
soon dishes left out), the dish page its MenuItem (with `aggregateRating` from feature 6), and
both a dish page and a shared category link add `BreadcrumbList`
(`StructuredData::breadcrumbs()`). Compute a JSON-LD array in `@php` first: Blade's `@json`
splits its argument on commas. Feeds sit behind a secret link, `/feeds/{token}/google.xml` and
`facebook.csv` (`App\Domains\Menu\Feeds\CatalogFeed`, token in the site setting
`catalog_feed_token`), one row per dish and size, inactive and coming soon left out, sold out or
snoozed as out of stock, cached 30 minutes under the menu's last change. System → Integrations
→ Catalogue feeds (`website.manage`, `GET /api/admin/feeds`, `POST /api/admin/feeds/rotate`)
shows, copies and renews the links. `StructuredDataAndFeedsTest`.

## Email newsletter

iruali import plan, feature 4 (2026-10-17). Sign-up is the website footer's box
(`POST /newsletter/subscribe`, honeypot, `throttle:5,10`), double opt-in: a confirm email
(`NewsletterConfirmMail`, `/newsletter/confirm/{token}`) and nothing goes until it is clicked.
An issue reaches confirmed `newsletter_subscribers` plus customers with a checked email who allow
offers by email (feature 5's switch is the order app's newsletter switch), once per address and
never an address that stopped (`App\Domains\Newsletter\Newsletter::audience()`, which gives each
customer a subscriber row so every email has its own unsubscribe link). Customers & Marketing →
Newsletter (`NewsletterPage`, `newsletter.manage`, owner-only by default; `/api/admin/newsletter/*`)
writes an issue in English and Dhivehi with a header picture and ticked sections (new dishes in N
days, specials, an offer, coming soon; dishes removable one by one), previews both languages at
phone and computer width, sends tests, sends, retries failed rows and lists or downloads
subscribers. Send freezes the picks, writes one `newsletter_deliveries` row per address (unique per
issue and address) and queues `SendNewsletterBatch` jobs of 100, five seconds apart; each claims a
row (pending → sending) before mailing, so a retried batch never sends twice. Every issue carries
`List-Unsubscribe` one-click; `/newsletter/unsubscribe/{token}` asks first and also turns off the
customer's offers email. Needs the queue worker; on TEST that relies on TEST's own `REDIS_DB` and
prefix (above, checked by `app:ready`). Bounces (2026-10-18): the sending mailbox is piped into
`newsletter:bounce` (cPanel forwarder, `docs/MAIL_SETUP.md` § Newsletter bounces), which reads the
DSN or spam complaint (`App\Domains\Newsletter\Bounces::parse()`); a hard bounce or three soft
ones set `newsletter_subscribers.bounced_at` and the address leaves `audience()`, a complaint
unsubscribes, and an SMTP refusal while sending (`fromSendError`, 450/452/55x only) counts the
same with the delivery marked `bounced`. Only list addresses are touched; confirming again clears
it. `NewsletterTest`, `NewsletterBouncesTest`.

## POS order type colours

Owner, 2026-10-11: "add more visual colors to differentiate between order type in
pos". On the till each order type has one colour: dine-in teal, takeaway mustard,
pickup purple, delivery blue, anything else slate (`orderTypePalette` in
`apps/pos-web/src/theme.ts`, read through `orderTypeTone()` in `orderTypeLabels.ts`,
which takes slugs or the till's labels). It fills the chosen type in the cart, runs
across the top of the ticket and through the phone's folded cart bar, leads each Active
orders card as a solid chip (`OrderTypeChip`) with the card's left edge in the same colour,
marks the type filters, receipt rows and the new-order pop-up. Always with the type's
icon and word; never the brand rust, which means selected. A new screen that shows an
order's type uses these, not colours of its own.

## POS Active orders: a takeaway paid online waits for Collected

Owner, 2026-10-15. A dine-in or takeaway leaves the till's Active orders once paid, but a
takeaway with a gateway payment (the cashier sent the invoice or pay link and the customer
paid online; `OrderCreationController::ONLINE_PAYMENT_METHODS`) stays, like an online
pickup, until the till takes it through Start cooking, Mark ready and **Collected**. A
takeaway paid at the till still leaves as soon as it is paid. `PaidOnlineTakeawayTest`.
Such a ticket says **Paid online** (`paid_online` on the orders list), not plain Paid.

Mark ready and Collected / Picked up / Delivered ask in a pop-up (`StatusConfirmModal`), and
Send pay link and Send Bill SMS always open the number to check first, even with a linked
customer (owner, 2026-10-15: "all need 2nd time approval"); Fire to kitchen and Start
cooking stay tap-twice. More → Copy bill link / Share bill link open `BillLinkModal`: the
invoice link from `send-bill` with no phone (silent), a QR, Copy link, Share… (the iPad's
share sheet) and WhatsApp / Viber links. Nothing is sent from the till.

## Receipts and bills show every fee

Owner, 2026-10-15: a 10.00 packaging fee was in the total but on no line. Packaging,
small-order and delivery fees print between Subtotal and GST, and an item with a packaging
fee carries "+ Packaging fee · 5.00 × 2 = 10.00", from one place, `App\Support\OrderFeeLines`:
the receipt page and PDF, the bill page and PDF (`partials/order-fee-lines`), the till's
Receipts pane (`fee_lines` and `items[].packaging_note` on the orders list) and the printed
slip (`fee_lines`, `packaging_note` in the print payload; `print-proxy/src/tickets.ts`).
Built from the stored order on every open, so old orders show it too. The GST on a fee
follows its switch on Settings → Ordering → **Fees & slots** (`packaging_fee_taxable` and kin,
`OrderFeeTaxCalculator`; linked from Finance → GST settings), not the items' tax codes.

## A discount on every sale in a period

Owner, 2026-10-16. An automatic promotion (Promotions → "Automatic (all customers, no
code)", scope order, with Starts at and Expires at) takes its discount off every order
saved in the period, on the till and online; `PromotionEvaluator::applyAutomatic` at
`OrderCreationService::createFromPayload`. **The discount is decided when the order is
saved**, not when it is paid: a ticket saved before the end and charged after keeps it
(resume and `addPayments` never re-price; `ConsumePromoRedemptionsListener` redeems the
draft as it is), an online order placed before the end and paid at BML after keeps it
(the gateway amount was fixed at place time), and a ticket saved after the end gets
nothing. A ticket **changed** after the end loses it: every recalculation re-measures
the drafts (`DiscountRevalidator` → `revalidateOrderPromotions`), the dropped offer is
named in `discount_notes` on `PATCH /orders/{id}/items` (`DiscountNotes`, filled by
`OrderTotalsCalculator::recalculateAndPersist`), and the till flashes it. Before the order
exists the carts ask `POST /promotions/auto-preview`
(`PromotionEvaluator::previewAutomatic`, item-level offers skipped because the line
prices already carry them): the till's `useAutoPromoPreview` → `useCart.autoPromo` →
"Offer · name · until 10:00 PM" on the cart, and the order app's `autoPromo` in
`useCheckout` → the Offer row at checkout; both re-ask at `ends_at` and every five
minutes. If the saved order did not get the offer the cart showed, Charge stops with
"The offer has ended. The total is now MVR x" and the order waits as pending payment,
and Place order stops with `checkout.offer_ended` and the next tap reuses the order at
the price shown. `AutoPromoTimingTest`, `useAutoPromoPreview.test.ts`.

When two offers fit one order or dish, Promotions → Controls → When offers overlap decides
(owner, 2026-10-17): Best one wins (default; free delivery still comes on top) or Add them
up, the setting `discount_stacking_policy`, read only through
`DiscountSettings::stackingPolicy()` (an unknown value reads as best wins). Promo codes,
discount cards, automatic offers and daily specials follow it; a manual till discount always
comes on top. Daily Specials, Loyalty and Referrals stay beside their own jobs, and the top of
Promotions links them (`ELSEWHERE_LINKS` in `PromotionsHub.tsx`, only the ones the reader can
open): a new money-off page kept outside Promotions goes into that list.

## POS suggestions: a row, never a pop-up

Owner, 2026-10-11: the "Goes with" card that rose over the ticket's footer caught taps
meant for Charge ("accidentally items are added without intention"). Suggestions now live
in one row above the menu tiles that is always there (`components/SuggestionStrip.tsx`,
passed to `MenuGrid` as `suggestionStrip`): Popular now, then Goes with {item} once the
newest ticket line has pairings. A changed set ignores taps for 600 ms. Admin → Settings →
Ordering → Features → Till turns it off (`pos_suggestion_strip_enabled`, default on, sent
as `suggestion_strip` in the till tabs). Do not bring back anything that appears over the
ticket or moves under the cashier's finger.

## Poster print PDFs (PDF/X-4)

Posters render through TCPDF via `App\Domains\Posters\Pdf\PdfX4Document`, not dompdf
(`docs/POSTERS.md`, `docs/POSTER_PLAN.md`). The admin page is `/posters`
(`posters.make` / `posters.manage`). Keep core fonts out (the subclass drops
Helvetica), pass Dhivehi in visual order with TCPDF bidi off, and run
`scripts/install-poster-icc.sh` once per host so the FOGRA39 output intent is embedded.
TCPDF fonts are made into `storage/app/posters/fonts/` on first use; nothing to commit.
Exports run on the queue (`ExportPosterJob`): the page waits on `GET /posters/exports/{id}`
before downloading, and a shop order is emailed by the job once its file is ready
(`PosterOrders::exportFinished()`), never in the web request. A poster prints an upload kept
for posters (`PosterPhoto::storeUpload()`, 4800 px, the `photo_path` slot), else the dish's
`image_original_url`, never only its 1200 × 900 web crop (preflight red). Stand-offs and
eyelets grow the safe zone past the corner circles (`PaperSize::mounted()`). "Tell us how we
did" is `external` (the complaint poster's own page): never made here. Print shops are
suppliers with `kind = print_shop`. Send, proof links, quotes-as-expenses and the morning
`posters:alert` command are Phase 2. Phase 3 adds `/p/{code}` scan counts,
a 1920×1080 image slide on the dining playlist (`date_end` is the take-down
date), a social draft (approval, best time, channel rules) plus WhatsApp and
Viber share links, and an optional home hero slide for the offer's period.

## Needs attention

iruali import plan, feature 14 (2026-10-18). One list of what wants a person today:
`App\Domains\System\AdminInbox` rows (refunds to approve or pay out, complaints not answered,
red after a day, bank lines to match, reviews, dish questions, customer order messages, online
orders paid and not started for 10 minutes, failed jobs, label rolls low, packed stock near its
use-by), each with a label, count, link, level and **the permission of the page it links to**,
so nobody sees a row they cannot open. A row that throws is logged and skipped; a domain adds one
with `AdminInbox::register()`. `GET /api/admin/inbox` (any staff sign-in, allowlisted in
`StaffRouteAuthCoverageTest`; the rows do the checking). Admin: System → Needs attention
(`NeedsAttentionPage`), the inbox button with its count beside the bell (`InboxButton` in
`AppShell`), and the top rows on the dashboard (`DashboardInbox`), all through `useInbox`
(every minute); empty, it says "Nothing waiting. Good job." Telegram: 🧰 More → 📋 Needs
attention and `/attention` on the owner bot (`TelegramOwnerTools::needsAttention`). A new kind of
work waiting for staff becomes a row here, not a page of its own.

## Errors are counted here, Sentry or not

iruali import plan, feature 17 (2026-10-17). Every reported exception except the everyday
ones (validation, 404, sign-in, throttled) is counted by kind and day in `error_events`
(`App\Domains\System\ErrorTracker::record`, called from the report hook in
`bootstrap/app.php`; it never throws). An error in the money code (BML, gift cards, the
wallet, refunds) tells the owner at once, once an hour per kind (row `owner_payment_error`),
`errors:digest` at 07:50 sends yesterday's list (row `owner_error_digest`) and forgets rows
older than 30 days, and System → Health shows the last 24 hours. Sentry still gets every
exception when its DSN is set.

## Is the site ready (app:ready) and the restore drill

iruali import plan, feature 15 (2026-10-17). `App\Domains\System\ReadyChecks` is one list,
each check pass / warn / fail / skip with a one-line fix: the live checks from
`SystemHealthService` plus debug mode, mail, BML keys and callbacks, SMS keys and recent
sends, the last `backup:run` (26 h), the last restore drill and, off production, the TEST
Redis separation above. `php artisan app:ready` prints it (exit 1 on a fail) and System →
Health shows it as System status (`ready` on the detailed health; shown, not added to the page's overall status).
`backup:restore-drill` (monthly, 1st, 04:10; `RestoreDrill`) restores the newest backup into
`BACKUP_DRILL_DATABASE`, compares key tables with live, empties it again, keeps the result in
the site setting `system_restore_drill_last` and tells the owner (`owner_restore_drill`).
A new thing the site needs to run unattended becomes a check here, not a page of its own.
Setup: `docs/DEPLOY_COMMAND.md`.

## Queue worker vs synchronous SMS

The queue worker (`php artisan queue:work redis`) is only needed for async listeners
(loyalty, inventory, outgoing webhooks, campaign SMS). Payment/order SMS send
synchronously.

## Scheduled tasks: a lock outlives a killed run by minutes, not a day

A `schedule:run` that dies mid-task (the deploy's composer and database backup
steps are when the host kills processes) never releases the task's
`withoutOverlapping()` lock, and Laravel's default lock lasts 24 hours: the task is
then skipped silently on every tick for a day. On 2026-10-12 the admin said
"Scheduler stopped" minutes after a production deploy for a scheduler that was
running; its heartbeat task sat behind such a lock. `App\Support\ScheduleLock::apply()`
at the end of `routes/console.php` gives every lock still at the default an expiry by
cadence (5 min for every-minute tasks, up to 3 h for daily ones), `ScheduleLockTest`
holds every task to it, and the two heartbeats (`scheduler:heartbeat`,
`QueueWorkerHeartbeatJob`) take no lock at all. A task that honestly runs longer than
its window passes its own expiry to `withoutOverlapping(N)`, which `apply()` keeps.
`php artisan schedule:clear-cache` releases a stuck lock by hand
(`docs/DEPLOY_COMMAND.md` § Scheduled tasks and the queue worker).
