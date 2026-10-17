# Posters: Phase 0, the print file

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
