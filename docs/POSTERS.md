# Posters

Phase 0 proved the print file (`php artisan posters:spike`, below). Phase 1 is the
page: Admin → Posters, or the card on Labels → Make a label. Phase 2 sends that
file to a print shop and watches it after it is up.

## Make a poster

1. **What is it for.** Twenty purposes in five groups. "Tell us how we did" opens the
   existing complaint poster (`/complain/poster/sheet`, with its sizes and many-up sheets),
   so only one engine draws it; a poster can never be made with that purpose here.
2. **Fill it in.** Mood, language, sizes A5–A2, and the dish, offer, category or table it
   binds to. A dish with sizes prints "From MVR x". **The photo** is, in order: a poster
   photo uploaded on this page (kept up to 4800 px; menu photos are untouched), else the
   dish's full-size original (`image_original_url`, up to 3200 px), else its 1200 × 900 web
   photo, which preflight refuses for print and says what to do. The GST line follows
   `GstSettingsService` and can be moved, not removed. Leave the table blank on a table
   card and the file has one page per active table.
3. **Check and download.** Red preflight checks block the ZIP. Amber warns. The ZIP holds
   one PDF/X-4 per size, the spec sheet, and (if ticked) the white mask and, when gloss is
   set, the gloss mask. Layout on the sheet: one per page, tent (two A5 on A4, the second
   turned 180°), 2-up or 4-up. **Mounting:** none, tape, or stand-offs or eyelets at the
   corners; with the last two the layout moves in past a corner circle (15 mm, 20 mm on A2,
   one circle in from the cut), the preview draws the circles, and a preflight check keeps
   them clear. Send the ZIP by WhatsApp, Viber or email. Sending to a print
   shop from the app is Phase 2.

My posters keeps each one with its take-down date and place (Window, Door, Counter,
Tables, Kitchen, Outside). Past the date, it is listed under "should be down". Print again
is another download. Templates can be saved and, with `posters.manage`, locked.

Permissions: `posters.make` (managers and anyone granted it) and `posters.manage`
(owner; lock and delete templates).

Exports run on the queue (`ExportPosterJob`). **Download for print** waits for the file:
the page asks `GET /api/posters/exports/{id}` every 2 seconds, downloads once it is ready,
says "Taking longer than usual: the file is queued" after 3 minutes and gives up after 15.
On the server the worker must be running (crontab keepalive, full deploys). **Send to print
shop** makes the order at once with the file queued; once the file is ready the job emails
the shop (or asks for the proof), and a shop with no email gets a note on the order.

## Templates (110 print designs, 39 TV designs)

Make a poster opens on the ready-made designs (`docs/POSTER_THEMES_HANDOFF.md`): 110 promo
posters in 13 categories, 50 with photo frames, each in a `large` variant for A2 and A3 and
a `small` one for A4 and A5 (bigger small print, no stand-off corners), and 39 TV designs (three
per category) drawn for screens (§ TV designs below). Pick one by category,
style (With item photo, Extra colourful, Colourful, Classic brand colours) or search; the
picker's **Print | TV screens** switch keeps the two kinds apart, since a design is drawn for
paper or for a screen, never both; "No template (classic layout)" opens the purposes above.

A template poster is purpose `themed` with the design's key in `posters.theme`. Its words and
pictures live in `slots`: `t1…` a text slot's words (missing or null prints the design's own
wording, `false` blanks the line), `p1…` a photo slot's choice (`{item_id, use: main|cutout}`
or `{photo_path}` for an upload; nothing prints the design's placeholder). A dish and an offer
may be bound as on any poster: the dish fills the first photo slot and the first price slot
(its live price in the design's own format), the offer its percent, and either the QR's target.

- **Size picks the variant.** The preview and the file follow the first size chosen; A2 and A3
  print the wall design, A4 and A5 the counter design. Templates are portrait only.
- **Photos.** Each slot takes a dish's photo or cut-out (a slot under 120 design units takes
  the cut-out by default when the dish has one), an upload from this page, or the design's
  placeholder. A picture with transparency is laid on the slot's colour. Preflight checks each
  slot's resolution and refuses a dish that has only its small website photo.
- **Words.** One box per slot, labelled by role, the footer lines folded. Edited words shrink
  to the slot's width by the real TrueType width and never below the variant's floor (8 units
  on the wall design, 9.1 on the counter design); what still does not fit is a red check.
  Dhivehi typed into a slot sets in Noto Sans Thaana.
- **Checks.** No mood contrast (the colours are the design's). Type floor, fit, per-slot photo
  resolution, the price against the menu, the design's own safe area, ink, and the corner
  keep-out on A2 and A3 only (A4 and A5 offer no stand-offs or eyelets).
- **Screens.** TV, the social cards and the shop's proof are the design itself, drawn with GD
  (`PosterThemeRaster`): the host has no Ghostscript or Imagick.

### TV designs and screen sizes

Owner, 2026-10-22 ("make and add more templates and sizes for tv displays"). Beside the paper
sizes there are three **screen sizes** (`PaperSize::SCREENS`): `TV`, Full HD 1920 × 1080; `TV4K`,
3840 × 2160; and `TVP`, a portrait screen 1080 × 1920. A screen has no bleed, a 60 px safe inset
("where a TV may cut the edge off"), and its page units are pixels, so one piece list serves the
PDF engine's maths and the GD raster alike (`PaperSize::isScreen()`, `pixels()`, `screenScale()`:
1 at Full HD and portrait, 2 at 4K). A screen size never prints: `PosterPack` writes one PNG per
screen (`BG-<code>-TV-1920x1080-v1.png`) beside the spec sheet, the imposition is always single,
mounting and the corner keep-out do not apply, and the spec sheet says where to put the file (the
TV, a USB stick or the signage player).

**TV designs** are themes of `kind: screen` (`TV-001 … TV-039`) with two variants, `tv`
(1920 × 1080) for Full HD and 4K and `tvp` (1080 × 1920) for the portrait screen, in pixel units
at Full HD (`PosterThemes::KIND_VARIANTS`, `VARIANT_TRIM`; `SIZE_VARIANTS` maps every size to its
variant). Every slot keeps the same id, role and line across both variants (the archetypes run one
code path, `tv_archetypes.py`), so a poster made for the wide screen shows the same words on the
portrait one. A design of one kind takes only sizes of its kind: the editor offers screens for a
TV design and paper for a print design, and the server refuses the rest with a 422
(`PosterController::sizesFit`), a theme switch across kinds without new sizes included.
Preflight on a screen (`PosterPreflight::screen()`) checks what matters there: each photo's
pixels against its frame ("fills its frame sharp"; amber when stretched past 1×, red past 2×),
the 24 px type floor (times `screenScale`), the safe inset, the QR at 100 / 160 px, and the data
checks; no ink, no material, no mounting. The 4K picture is the Full HD design drawn at twice the
size (`PosterThemeRaster`, supersampled under 2.1 Mpx), so a photo that is sharp on Full HD can
be a little soft on 4K, which the amber check says.

In the admin, Make a poster → TV screens lists the TV designs on wide cards; the editor's Size
row becomes Screen (Full HD · 1920 × 1080, 4K · 3840 × 2160, Portrait · 1080 × 1920); step 3
has nothing to print and offers **Send to TV** (the shop's signage playlist through `PosterTv`,
the picture whole, no caption and no zoom) and **Download pictures** (the ZIP of PNGs). My
posters → TV does the same for a saved one, choosing the portrait picture when the poster's first
screen is portrait. The designs come from `docs/poster-themes/generator-source/`
(`POSTER_VARIANT=tv python3 build_tv.py`, the same with `tvp`, then `python3 merge_tv.py`;
handoff § 6).

### Saved templates: what is kept, and how a template comes back

A template (`poster_templates`; the Templates tab; `posters.manage` to save, lock and delete) is
a poster's reusable part, never the poster itself: the design (`theme`, or the classic
`template_key` + `layout` + `mood`), the language, the `slots` (words and photo choices as the
poster had them) and, since 2026-10-22, the `sizes` and the `bindings` (the dish and the offer).
It leaves out the poster's own name, place, take-down date, state, code and version. **Save as
template** (offered at step 2 and step 3) saves the poster first, then copies those fields; **Use**
opens a new, unsaved draft from them (`savedId` null in `PostersPage`), so printing it makes a new
poster and the template stays as it was. A locked template refuses a change of its name or slots
and a delete until it is unlocked (`locked: false` in the same call unlocks and changes). A template
saved before 2026-10-22 has no sizes: a print design opens on A4, a TV design on Full HD. A
template whose design has gone from the assets cannot be used (422 "Unknown template").

Where things live: the assets under `backend/resources/poster-themes/` (`index.json`, one
folder per theme with `theme.json`, the gzip draw lists, the backdrop SVGs, previews and
placeholders; the Anton and Fraunces TTFs are copied into `public/fonts/pdf/`), `PosterThemes`
(the registry; it validates and never falls back), `PosterThemePieces` (the piece list: the
handoff § 1 mapping, backdrop, photos, logo, QR, text), the draw-list helpers on
`PdfX4Document` (`paintPath`, `fillPathGradient`, `clipToPath`, `withAlpha`, `drawBackdrop`),
`PosterPdf::drawThemedCopy`, `BrandCmyk::forHex` (the brand five through the swatch picks, the
handoff's press mixes, the plain conversion for the rest), and in the admin
`components/posters/` (picker, editor, preview). The preview stacks the backdrop SVG in layers
split at the photo markers (`GET /api/posters/themes/{key}/backdrop-{variant}-{n}.svg`) so each
photo sits between the art drawn before and after it. A saved template or a poster from My
posters opens in the editor as it was (Use, Edit).

To swap in a full font from Google Fonts, replace the TTF in `public/fonts/pdf/` (the Latin
subsets ship). A new design goes into `index.json` and its own folder; `PosterThemesTest`
holds every theme to the handoff's rules.

## Print shops

Admin → Posters → Print shops. A shop is a supplier with kind `print_shop`, so it
does not show in Purchasing. Its card holds the bleed, and whether it wants mask
PDFs or spot layers named `White` and `Spot UV` (change the names to match the RIP).

**Send to print shop** emails the ZIP and a 1200 px proof. With "Approve a proof on
your phone" on, the email waits until the signed link (good for a day) is used.
On a sent order, type the shop's price and approve it: that writes an expense
under Printing. Then mark it received, up, and taken down.

A changed price, dish or hours marks the poster out of date, with the diff
("price MVR 45.00 → MVR 50.00"). `posters:alert` each morning texts
`owner_poster_stale` and `owner_poster_ending` (due down today or tomorrow).

**Tell us how we did** opens the complaint poster's own page; the complaint poster is not
made on this page, so there is one design and one engine.

## Everywhere

On My posters, one design can go further than the print shop:

- **TV** makes a 1920×1080 picture and adds one image slide to the dining playlist. The take-down date is that slide's `date_end`, so the rest of the board stays and the slide leaves on its own. A TV design goes whole at the screen's pixels (1080×1920 when the poster's first screen is the portrait one), shown without a caption or zoom; a print design is fitted into the picture.
- **Instagram** saves a draft through the social drafter: approval, the next free time when a spacing rule would be broken, and channels that need a photo. The pictures are 1200×630, 1080×1080, 1080×1350 and 1080×1920. WhatsApp and Viber are share links for a phone.
- **Home banner** adds the offer as one hero slide for the same period. The other slides stay.
- **Scans** are `/p/{code}`. The printed QR uses that code once the poster is saved. Wi-Fi posters keep a Wi-Fi QR. My posters shows the count. A scan stores the poster and the time only.
- **Menu board** is the list layout, landscape, and starts at A2. Send it to the TV the same way.

## Phase 0, the print file

The plan is `docs/POSTER_PLAN.md`; this is how to run what Phase 0 built and what to send
to the print shop. Code lives in `backend/app/Domains/Posters/` (PDF engine, geometry,
colours, logo) with the spike pieces under `Spike/`.

## One-time on each host

```bash
bash scripts/install-poster-icc.sh
```

Fetches the ECI "ISO Coated v2" (FOGRA39) profile into
`backend/storage/app/posters/icc/` so every poster PDF embeds its output intent. Without it
the files still open and print, but a strict PDF/X-4 preflight flags the missing profile.
Idempotent; `POSTER_ICC_URL` overrides the source (a `.zip` or a bare `.icc`),
`POSTER_ICC_PROFILE` in `.env` points at a profile somewhere else.

Fonts need nothing: TCPDF's font files are made from `backend/public/fonts/pdf/` into
`backend/storage/app/posters/fonts/` on first use.

## Make the proof files

```bash
cd backend
php artisan posters:spike --out=/tmp/poster-spike            # A3 + mask + swatch + A2 timing
php artisan posters:spike --out=/tmp/poster-spike --photo=/path/to/dish.jpg
php artisan posters:spike --out=/tmp/poster-spike --size=A4 --skip-a2
php artisan posters:spike --out=/tmp/poster-spike --logo-svg  # also rewrite public/brand/logo.svg + logo-dark.svg
```

Writes:

| File | What |
|---|---|
| `BG-POSTER-SPIKE-A3-foam-v1.pdf` | The A3 `hero_photo` poster, PDF/X-4, 3 mm bleed |
| `BG-POSTER-SPIKE-A3-foam-v1-WHITE.pdf` | White-ink mask: black where ink goes, choked 0.2 mm |
| `BG-SWATCH-A5-v1.pdf` | Swatch card: five CMYK mixes of each brand colour |
| `BG-POSTER-SPIKE-A2-foam-v1.pdf` | The worst case, for timing |
| `spike-report.json` | Host check, timings, photo ppi |

## Check a file without Acrobat

```bash
pdfinfo -box file.pdf        # "PDF version: 1.6", "PDF subtype: PDF/X-4", TrimBox inset 8.5 pt
pdffonts file.pdf            # every row "emb yes sub yes"; no Helvetica
pdfimages -list file.pdf     # photo "icc", 3 comp, ppi at the size's target (A3/A2 150, A4/A5 300)
qpdf --check file.pdf
```

`tests/Feature/Posters/PdfX4DocumentTest` asserts the same things on every run.

## Owner's steps (Phase 0 "done when")

1. Open the A3 in Acrobat → Print Production → Preflight → "Verify compliance with PDF/X-4".
2. Send the A3, its `-WHITE.pdf` and the swatch card to the shop: A3 on 5 mm foam, the swatch
   card on the same board. Say "white under all printed areas; the mask is there if your RIP
   wants it".
3. Under the shop's lights, circle one letter per colour on the swatch card. Put the letters
   into the `poster_brand_cmyk` site setting as JSON, e.g.
   `{"rust":"B","brown":"A","amber":"C","flame":"A","cream":"E"}`. Until set, A (the plain
   conversion) is used.
4. Judge the flat vector logo on the print against the animated one on screen. If the shading
   is missed, § 6.4 of the plan has the one-line fallback.

## Brand colours

`App\Domains\Posters\BrandCmyk`: hex from `docs/brand/PALETTE.md`, five candidates per
colour (A plain, B lighter, C warmer, D deeper, E round press mix), `chosen($role)` reads the
owner's pick. The logo's rust is normalised from the SVG's `#B84B0C` to the palette's
`#B74B0C`.

## Known notes

- TCPDF 6.11 raises a deprecation notice on construct ("migrate to tc-lib-pdf"). Laravel logs
  it; nothing fails. The PDF/X pieces are contained in `Posters\Pdf` for a later move.
- Dhivehi is passed in visual order (`ThaanaVisual::order($text, true)`) with TCPDF's bidi off
  for both its RTL and "Arabic" patterns: the Arabic pattern covers the Thaana block.
- Each PDF carries the 1.8 MB press profile (1.4 MB compressed). That is normal for PDF/X-4.
