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

- **TV** makes a 1920×1080 picture and adds one image slide to the dining playlist. The take-down date is that slide's `date_end`, so the rest of the board stays and the slide leaves on its own.
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
