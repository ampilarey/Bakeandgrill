# Posters: audit of 2026-10-22

Owner: "re audit poster setups and recommend enhancements and check how template works and
saves". The whole domain was read (`backend/app/Domains/Posters/`, `PosterController`, the
admin's `components/posters/` and `PostersPage.tsx`, the theme assets and the generator). This
file lists what was wrong and is now fixed, what works as designed, and what is worth building
next. How the pieces fit is in `docs/POSTERS.md`; the designs' format in
`docs/POSTER_THEMES_HANDOFF.md`.

## Fixed in this round

| # | Finding | Fix |
|---|---|---|
| 1 | Deleting a poster left its uploaded photos on the private disk (`PosterPhoto::storeUpload`, up to 4800 px each, classic `photo_path` and every `pN.photo_path`). | `destroy()` removes each upload the poster named unless another poster or template still uses it (`PosterPhoto::uploadsIn`). |
| 2 | A size the server did not know (a typo, a TV size on a print design) threw `InvalidArgumentException` out of `PaperSize::named()`: a 500 on save, preview and export. | A 422 with words: "Unknown size", "A TV template shows on a screen: pick TV, 4K or portrait TV", "A print template prints on paper: pick A2 to A5" (`PosterController::sizesFit`). |
| 3 | A saved template kept the design, words and photo choices only. Its sizes and the dish or offer it was bound to were lost, so Use opened every template on A4 with no dish, and the price slot printed the design's placeholder. | `poster_templates.sizes` and `.bindings` (migration `2026_10_22_150000`), saved by Save as template and restored by Use. Older rows open on A4, or on Full HD for a TV design. |
| 4 | A template's `locked` flag was shown but not enforced: the API accepted a PUT changing its name or slots and a DELETE. | Both refused while locked; `locked: false` in the same PUT unlocks and changes. |
| 5 | Saving a template with no `slots` hit the NOT NULL column (a 500). | An empty set. |
| 6 | The TV slide of a template poster carried the word "Poster" as a caption over the picture, and the playlist's ken-burns zoom cut the design's edges. | `PosterTv`: no caption, `objectFit: contain`, no animation. |
| 7 | The proof picture was always 1200 px tall, so a landscape design came out small. | 1200 px on the long edge, whichever that is. |
| 8 | A poster's design could be switched to one of the other kind without new sizes, leaving a poster its own sizes cannot draw. | Refused with a 422 unless the same change brings sizes of the new kind. |
| 9 | Save as template was offered only after Check and download. | Offered at step 2 as well, for anyone with `posters.manage`. |

## Works as designed (checked, no change)

- **One engine.** The PDF (`PosterPdf::drawThemedCopy` on `PdfX4Document`) and the screen
  raster (`PosterThemeRaster`) read the same piece list from `PosterThemePieces`, so the TV
  picture, the social cards and the proof are the design itself, not a second drawing.
- **The queue.** `Download for print` waits on the export (polls every 2 s, says so after 3 min,
  gives up after 15); the print shop is emailed by the job once the file exists, never from the
  request.
- **Checks.** Themed preflight skips the mood contrast and keeps the type floor, fit, per-slot
  photo resolution, the price against the menu, the design's own safe area, ink and the corner
  keep-out on A2 and A3 only. The export refuses to queue on a red check.
- **Stale posters.** A changed price, dish or hours marks the poster out of date with the diff;
  `posters:alert` texts the owner each morning.
- **Routes and permissions.** No route changed; `posters.make` and `posters.manage` as before.

## How a template works and saves

1. **A design** is a folder under `backend/resources/poster-themes/` (`theme.json`, draw lists,
   SVG backdrops, previews, placeholders), listed in `index.json`. `PosterThemes` reads and
   validates it; it never falls back on a missing file.
2. **A poster drawn on it** is purpose `themed` with the design's key in `posters.theme`. Its
   `slots` hold `t1…` (a text slot's words; null means the design's own line, `false` a blanked
   one) and `p1…` (`{item_id, use}` or `{photo_path}`); `bindings` hold the dish and the offer.
   `PosterContent::resolve` fills the live price and the QR, `PosterThemePieces::build` turns
   design units into page units for the size (handoff § 1 and § 6) and measures every line with
   the real TrueType widths, shrinking to the slot but never below the variant's floor.
3. **Saved as a template** (`POST /api/posters/templates`): the poster is saved first, then the
   design, language, slots, sizes and bindings are copied into `poster_templates`. The poster's
   own name, place, take-down date, state, code and version are not part of a template.
4. **Used** (`Templates → Use`): the admin builds a fresh draft from the row (`savedId` null), so
   printing it creates a new poster; the template is untouched. A locked template cannot be
   renamed, re-worded or deleted until unlocked.

## Recommended next (not built)

1. **Real text measure for the classic layouts.** `PosterPieces::fits()` judges a line by
   character count (half an em per character), so a headline of wide letters can pass and then
   overflow in the PDF, and a narrow line is shrunk for nothing. The themed path already measures
   with the font (`PosterThemePieces::measure`); the eight classic layouts should use it.
2. **Rasterise the classic posters for screens.** For a classic poster, TV, the social cards and
   the proof are a GD redraw of the pieces (`PosterScreen`, `imagettftext`), close to the PDF but
   not it. Drawing the classic page through the same raster as the themed one would make the
   proof the file.
3. **Prune export files.** `poster_exports.zip_path` is never cleaned: every Download for print
   leaves a ZIP on disk. A weekly `posters:prune-exports` (30 days, keeping the one a print-shop
   order still references) would keep the disk flat.
4. **A picture preview.** The admin's themed preview is positioned HTML in the print faces, so
   line widths can differ a little from the file. A "Show as picture" button that fetches the
   server's raster at 1200 px would show the exact output before download.
5. **4K photos.** The 4K picture is the Full HD design at 2×, so a dish photo under about 1300 px
   wide is soft on 4K. Preflight says so (amber); the item editor could carry the hint "2000 px
   or more for TV" beside the photo.
6. **Both pictures for the TV.** Send to TV makes one picture, by the poster's first screen; a
   portrait screen then shows a landscape design letterboxed. A poster that chose both screens
   could keep both pictures, and the player pick by the screen's orientation.
7. **Bilingual TV designs.** Dhivehi typed into a slot sets in Noto Sans Thaana on the TV as in
   print, but no TV design lays out English and Dhivehi side by side. Two or three bilingual
   archetypes (hours, deals, a menu) would serve the dining room better than a translation typed
   into an English layout.
8. **Templates whose design is gone.** A template points at a design by key; if the assets drop
   it, Use fails with "Unknown template" and nothing in the list says why. Mark such rows in the
   Templates tab.
9. **Saving templates needs `posters.manage`.** A manager with `posters.make` can draw and print
   but cannot keep a template. If managers are to reuse their own designs, give `posters.make`
   the save and keep lock and delete under `posters.manage`.
