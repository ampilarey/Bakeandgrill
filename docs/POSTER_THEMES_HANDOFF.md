# Poster themes: handoff (110 templates, A2 / A3 / A4 / A5 → poster generator)

Owner request (2026-10-21): add 110 ready-made promo poster designs to the
admin poster generator as **themes**, in four print sizes. The owner should be
able to:

1. pick a design from a category;
2. choose a size;
3. swap in a menu item's photo;
4. edit the words and prices;
5. preview it and print it.

## 0. What's in this drop

| Path | What |
|---|---|
| `backend/resources/poster-themes/index.json` | 13 categories, 4 style labels, size → variant map, all 110 themes |
| `…/<NN-Category>/<key>/theme.json` | One theme with **two variants**, `large` and `small`, each holding its own canvas, logo, QR, photo slots and text slots |
| `…/<key>/backdrop-large.json.gz`, `backdrop-small.json.gz` | The artwork as a gzip-compressed draw list in `PdfX4Document::fillPath()` op format, with photo-slot markers. Read with `json_decode(gzdecode(file_get_contents($p)), true)` |
| `…/<key>/backdrop-large.svg`, `backdrop-small.svg` | The same artwork as SVG, used for the admin preview |
| `…/<key>/preview-large.jpg`, `preview-small.jpg` | 700 px thumbnails (trim only) for the picker |
| `…/<key>/placeholder-<variant>-pN.png` | What fills photo slot N when no item photo is chosen |
| `backend/resources/poster-themes/_fonts/` | Anton and Fraunces italic TTFs (Latin subset), with OFL licences |
| `docs/poster-themes/reference/` | The visual catalogue PDF, one all-in-one PDF per size, and category contact sheets. **This is what "done" looks like** |
| `docs/poster-themes/generator-source/` | The Python that drew them. It is the source of truth for geometry |

IDs run **BG-001 … BG-110**, ordered by category, then style.

## 1. Sizes and variants

Each template has two variants that share the same look: the same art, the same composition and the same text slots (`t1…`, `p1…`, with ids matching across variants).

| Variant | Prints at | Made for | Differences |
|---|---|---|---|
| `large` | **A2** (scale 1) and **A3** (0.7071) | Walls and windows, read from a distance | Corner stand-off circles kept clear. Min text 8 units, which is ≥ 22.7 pt at A2 and ≥ 16 pt at A3 |
| `small` | **A4** (0.5) and **A5** (0.35238) | Counters and table cards, read up close | Min text 9.1 units (≥ 9 pt at A5, ≥ 13 pt at A4). Bigger footer. No stand-off corners. Wider bleed so A5 still gets a full 3 mm |

Why two variants rather than one layout scaled to every size: at A5, the A2 layout's small print (footer, T&C, the little labels on badges and prices) came out at 6–7 pt, under the generator's own `BODY_FLOOR` of 9 pt. The `small` variant fixes that. Headlines and prices are big enough at every size either way.

Both minimums sit at or above `PosterPieces::BODY_FLOOR` (A2 22, A3 16, A4 11, A5 9 pt), so the existing type-floor preflight passes.

**Pick the variant from the paper size:** `index.json.sizes` / `theme.size_to_variant`.

### Units and mapping

All coordinates are **design units = millimetres at A2 trim**, measured from the top-left of the variant's canvas. Each variant's canvas is the A2 trim (420 × 594) plus that variant's bleed:

| Variant | `canvas.bleed_units` | Canvas | Trim box |
|---|---|---|---|
| large | 4.25 | 428.5 × 602.5 | [4.25, 4.25, 420, 594] |
| small | 9.6 | 439.2 × 613.2 | [9.6, 9.6, 420, 594] |

To place something on a real page of trim `T × Th` mm with 3 mm bleed (the `PaperSize` bleed box, origin at the bleed's top-left):

```
s  = T / 420                                   // variant.sizes[SIZE].scale
dy = (Th − 594 · s) / 2                        // 0 except A5 (148×210 isn't exactly A2's ratio): 0.343 mm
page_x_mm = (u_x − bleed_units) · s + 3
page_y_mm = (u_y − bleed_units) · s + 3 + dy
size_pt   = size_units · s / 0.352778          // also precomputed per size in text_slot.pt_at
```

Each variant's canvas covers the full 3 mm bleed for both of its sizes, so backgrounds always reach the bleed edge. `variant.sizes[SIZE].map` spells the formula out with the numbers filled in.

## 2. Categories (the picker's top level)

| # | Key | Name | Count |
|---|---|---|---|
| 01 | disc | Discounts & Sales | 7 |
| 02 | combo | Combos & Price Deals | 11 |
| 03 | free | Buy 1 Get 1 & Freebies | 11 |
| 04 | time | Time Deals | 10 |
| 05 | item | Item Spotlight & New | 6 |
| 06 | drink | Drinks & Coffee | 11 |
| 07 | bake | Bakery & Desserts | 9 |
| 08 | grill | Grill & Meals | 7 |
| 09 | event | Events & Catering | 7 |
| 10 | online | Online, Delivery & Loyalty | 11 |
| 11 | fest | Festivals & Seasons | 6 |
| 12 | family | Kids, Family & Students | 9 |
| 13 | notice | Notices & Info | 5 |

**Styles**, a filter inside each category:

- `photo`: With item photo (50)
- `extra`: Extra colourful (10)
- `colour`: Colourful (40)
- `classic`: Classic brand colours (10)

## 3. theme.json

```json
{
 "id":"BG-012","key":"bg012-value-meals-menu","title":"Value Meals Menu",
 "category":{"key":"combo","number":"02","name":"Combos & Price Deals"},
 "style":"photo","style_label":"With item photo","layout":"menu_trio","palette":"night","has_photo":true,
 "size_to_variant":{"A2":"large","A3":"large","A4":"small","A5":"small"},
 "slot_ids_match_across_variants":true,
 "variants":{
  "large":{
   "variant":"large",
   "sizes":{"A2":{"trim_mm":[420,594],"scale":1,"page_mm":[426,600],"map":"…"},
            "A3":{"trim_mm":[297,420],"scale":0.70714,"page_mm":[303,426],"map":"…"}},
   "canvas":{"width":428.5,"height":602.5,"bleed_units":4.25,"trim_box":[4.25,4.25,420,594],
             "safe_inset_units":12.25,"min_text_units":8.0,
             "corner_keepout":{"diameter_units":20,"centre_from_cut_units":20}},
   "files":{"preview":"preview-large.jpg","backdrop_svg":"backdrop-large.svg","backdrop_draw_list":"backdrop-large.json"},
   "logo":{"centre_x":214.25,"top_y":40.06,"height_mm":98,"cream_badge":true,
           "badge_circle":{"cx":214.25,"cy":92,"r":58.8,"fill":"#F7F5F2"},"source":"backend/public/brand/logo-animated.svg"},
   "qr":null,
   "photo_slots":[{"id":"p1","shape":"circle","box":[x,y,w,h],"clip_ops":[["M",[…]],["C",[…]],…],
                   "clip_path_d":"M… A…","rotation_deg":0,"rotation_centre":[cx,cy],"fit":"cover","cutout_ok":true,
                   "fill_behind":"#F7670B","min_px_for_150ppi":[401,401],
                   "placeholder_image":"placeholder-large-p1.png","preview_placeholder":"illustration:burger"}],
   "text_slots":[{"id":"t2","default":"MEAL DEALS","role_hint":"headline","font":"anton",
                  "size_units":60,"pt_at":{"A2":170.1,"A3":120.3},"colour":"#FFF3DC","align":"center",
                  "anchor_x":214.25,"baseline_y":256,"top_y":204.4,"box":[x,y,w,h],"max_width_mm":404,
                  "tracking_em":0.04,"opacity":1,"shadow":{"colour":"#D92B1C","offset_mm":2.4}}],
   "print_files":{"A2":"BakeGrill_A2_BG-012_….pdf","A3":"BakeGrill_A3_BG-012_….pdf"}
  },
  "small":{ … same shape, sizes A4/A5 … }
 }
}
```

Lengths named `*_mm` inside a variant (`box`, `max_width_mm`, `offset_mm`, `height_mm`) are in **design units** too. The old names are kept for continuity.

### Draw order

1. Walk the variant's backdrop draw list in order. An item `{"photo_slot":"p1"}` means *draw photo slot p1 here*. Frames, shadows and outlines around photos sit before and after it, so the order matters.
2. The logo. When `cream_badge` is set, draw `badge_circle` first, then the mark from `LogoVector`.
3. The QR, if present.
4. Text slots, in order.

### Photo slots

- The shapes are circle, rounded rect, arch, polygon (diagonal split) and a wavy-edged top band.
- `clip_ops` holds M/L/C/Z ops with rotation already applied. Use it for the PDF clip (`q … W n`).
- `clip_path_d` holds the same outline as SVG path data, for CSS `clip-path` in the preview.
- Draw: fill `fill_behind` inside the clip. Then place the image to **cover** `box`: scale by the larger ratio, centre, crop. If `rotation_deg` is set, rotate about `rotation_centre`; only the polaroids do this, at −3.5°.
- Cut-out PNGs (`cutout_ok`) are drawn **contained** with a 4 % inset over `fill_behind`.
- Source: the bound item's main photo, or its cut-out for small slots (box < 120 units). Then an upload, then `placeholder_image`.
- Menu-card themes have 3 slots (p1–p3), one per row.
- `min_px_for_150ppi` is worked out for the variant's larger size. Feed it to the photo-ppi preflight.

### Text slots

- `default` is the designed wording. Prices are placeholders.
- `font` is one of `anton`, `jakarta-500|700|800`, `fraunces-500|700|900-italic`.
- `size_units` is the em size in design units; `pt_at[SIZE]` gives the printed point size.
- Position: `anchor_x` + `align` + `baseline_y`. `top_y` is the baseline minus the cap height.
- Shrink edited text to fit `max_width_mm` and never wrap headlines. **Don't shrink below `canvas.min_text_units`.** If the text still doesn't fit at that size, show an inline warning in the editor instead.
- `tracking_em` is letter spacing, in em.
- `shadow` is a hard offset shadow: draw the text in `shadow.colour` at (+offset, +offset) first, then the text itself.
- `colour` is a hex, or a gradient object with a `fallback` (one slot, BG-072 "BBQ"). Using the fallback is fine.
- `role_hint` is one of `eyebrow | headline | headline_or_offer | price_or_offer | detail | footer`. Use it to:
  - label the editor inputs;
  - auto-fill the live price;
  - collapse the footer fields.
- Text edits are stored once per poster, keyed by slot id. The same words go into whichever variant the chosen size uses, because the ids match.

### Backdrop draw-list item

```json
{"ops":[["M",[x,y]],["L",[x,y]],["C",[x1,y1,x2,y2,x3,y3]],["Z",[]]],
 "fill":"#F7670B" | null | {"gradient":{"type":"linear|radial","units":"objectBoundingBox",
                                        "coords":[x1,y1,x2,y2] | [cx,cy,r],"stops":[[0,"#FFC72C"],[1,"#D92B1C"]]}},
 "bbox":[x,y,w,h],   "opacity":0.35,   "rule":"evenodd",
 "stroke":{"colour":"#…","width_mm":0.9,"dash":"5 4","cap":"round"},   "clip_rect":[x,y,w,h]}
or {"photo_slot":"p1"}
```

- Arcs and quadratics are already cubic, and transforms are already applied.
- Every theme in both variants passed a round-trip check (draw list → SVG → pixel compare).
- No text collides with other text, and all text sits inside its variant's safe area.

## 4. Colours (screen hex → press CMYK)

- Use `BrandCmyk::chosen(role)` for the brand five, so the owner's swatch-card picks still apply.
- The other colours sit inside the CMYK gamut for UV printing. Use the values below.
- Use `BrandCmyk::fromHex()` for anything else.

| Hex | Name | CMYK % |
|---|---|---|
| #B74B0C | rust (brand) | `chosen('rust')` |
| #1C1408 | dark brown (brand) | `chosen('brown')` |
| #CA7D1C | amber (brand) | `chosen('amber')` |
| #F7670B | flame / orange (brand) | `chosen('flame')` |
| #F7F5F2 | cream (brand) | `chosen('cream')` |
| #FFC72C | sunshine yellow | 0 22 88 0 |
| #D92B1C | chili red | 0 92 98 4 |
| #0B7A75 | lagoon teal | 88 22 55 12 |
| #064A47 | deep lagoon | 90 45 60 40 |
| #FFF3DC | warm cream | 0 4 14 0 |
| #5A1A2E | wine | 40 95 55 45 |
| #E5007D | berry (process magenta) | 0 100 0 0 |
| #9E0F57 | deep berry | 30 100 30 15 |
| #00A3E0 | cyan | 100 15 0 0 |
| #0077B6 | deep cyan | 100 45 0 5 |
| #04395E | navy | 100 70 25 30 |
| #8DC63F | lime | 50 0 100 0 |
| #0A8A43 | flag green | 90 10 100 10 |
| #D21034 | flag red | 0 100 80 10 |
| #E9A23B | bun | 5 40 85 0 |

Keep total ink under the preflight's 300 %.

## 5. What has to be built

The generator today has 8 hard-coded layouts in `PosterPieces` and 5 moods in
`PosterMoods`. It draws flat CMYK fills only, and the admin preview is
positioned divs. Themes are an **alternative** to layout + mood. Existing
layouts and moods must keep working unchanged.

### Backend

1. **`App\Domains\Posters\PosterThemes`**, new, mirroring `PosterMoods`.
   - Methods: `categories()`, `all()`, `inCategory()`, `get(string $key): ?array`, `variantFor(array $theme, PaperSize $size): array` and `has()`.
   - Load `backdrop-*.json` lazily and cache per request.
   - Validate keys, with no silent fallback.
2. **Migration**: a nullable `theme` string on `posters` and `poster_templates`, plus `$fillable`.
   - Text overrides go in the existing `slots` JSON, keyed `t1…`.
   - Photo choices go there too, keyed `p1…` → `{"item_id":…,"use":"main|cutout"}`, or an uploaded `PosterPhoto` reference.
3. **`PosterController`**:
   - `catalog()` returns categories, styles and themes (`id,key,title,category,style,has_photo,photo_slots,preview_url`, where `preview_url` points at the large preview).
   - `validated()` adds `theme => nullable|in:<keys>`.
   - Templates save and restore `theme`.
   - Add a route streaming `preview-*.jpg`, `backdrop-*.svg` and `placeholder-*.png`.
4. **`PosterPieces::build()`**, themed branch. Pick the variant from the `PaperSize`, map every coordinate with §1's formula, then return:
   - a `backdrop` piece;
   - `photo` pieces;
   - a `logo` piece (badge first when `cream_badge` is set);
   - a `qr` piece using the resolved `qr_url`;
   - `text` pieces (`slots[id] ?? default`, shrink-to-fit but never below the floor).
   - Themes are portrait only; don't offer landscape.
   - Stand-off and eyelet mounting is for the `large` variant only. For A4/A5 hide those options, or warn.
5. **`PdfX4Document`**: new drawing helpers. This is the only real new engineering.
   - `drawBackdrop(array $items, callable $map, callable $hexToCmyk, callable $drawPhotoSlot)`.
   - Even-odd fill (`f*`).
   - Stroke: `w`, `d` dash, `J` cap, `S`.
   - Opacity through `setAlpha()`. PDF/X-4 permits transparency; assert that the X-4 marks survive.
   - Gradient fill: clip to the path, then TCPDF `Gradient()` with CMYK stops mapped to `bbox`.
   - Clip to arbitrary ops for photo slots (`q`, path, `W n`, image, `Q`), plus `clip_rect`.
   - Use TCPDF's PNG alpha for cut-outs. Flatten onto `fill_behind` if PDF/X-4 complains.
6. **Fonts**:
   - Register Anton and Fraunces Italic 500/700/900 in `Pdf/PosterFonts::FILES`. The Jakarta weights already exist.
   - Use the full TTFs from Google Fonts in production.
   - Add both to `public/fonts/pdf/LICENSES.txt` (SIL OFL 1.1).
   - Dhivehi keeps Noto Sans Thaana.
7. **Text**: TrueType text as today, plus tracking and the offset shadow.
8. **Preflight**:
   - Skip mood-contrast for themed posters.
   - Keep these checks: type floor (the variants already satisfy it), photo ppi (`min_px_for_150ppi`), ink, safe zone, and keep-out (large only).
9. **TV / social / proof** (`PosterScreen`, `PosterProof`): rasterise the themed page.

### Admin (`apps/admin-dashboard`)

- **Template picker** in `PostersPage.tsx`:
  - category tabs with counts;
  - style chips (All · With photo · Extra colourful · Colourful · Classic);
  - search;
  - a thumbnail grid labelled with the BG id and title;
  - "No template (classic layout)", which keeps today's flow.
- **Size**: the existing size choice (A2/A3/A4/A5) picks the variant. The preview switches between `preview-large` and `preview-small` art automatically.
- **Editor**, once a template is picked:
  - hide layout and mood;
  - show one **photo picker per photo slot** (menu item, upload, or placeholder);
  - show one **text input per slot**, labelled by role and default, with the footer collapsed;
  - let the item/promotion binding auto-fill the price slot.
- **`Preview()`**, when themed:
  - draw the variant's `backdrop-*.svg` as the background;
  - lay the photo `<img>`s over it, clipped with CSS `clip-path: path(...)` from `clip_path_d` and scaled;
  - put text divs on top, with Anton and Fraunces loaded through `@font-face`.
- **`api/posters.ts`**: add `theme`, the catalog types and the photo-slot fields.

### Tests

- **`PosterThemesTest`**:
  - 110 themes in 13 categories;
  - every `theme.json` parses;
  - both variants exist and their slot ids match;
  - every font key is registered;
  - in each variant, every text box, photo box and the logo sit inside the safe area;
  - every `text_slot.size_units` ≥ `canvas.min_text_units`;
  - all ops are M/L/C/Z;
  - photo-slot markers match `photo_slots` in both directions.
- **PDF**:
  - a themed poster renders at each of A2/A3/A4/A5 with the right page size (426×600, 303×426, 216×303, 154×216) and passes the PDF/X-4 checks;
  - gradient, alpha, stroke, even-odd and photo clip are each exercised once;
  - the type-floor preflight passes for a themed A5.
- **Feature**:
  - create a themed poster;
  - set `t2` and `p1`;
  - preview at A2 and at A5 shows the edited text and photo;
  - template save/restore keeps the theme.
- The existing mood and layout tests stay green.

## 6. Screen variants (TV designs, 2026-10-22)

A second kind of theme, `kind: "screen"`, drawn for TV screens rather than paper (owner:
"make and add more templates and sizes for tv displays"). Everything in § 1 to § 4 holds
except what this section changes.

| Variant | Shows on | Canvas (units = pixels at Full HD) | Bleed | Safe inset | Min text |
|---|---|---|---|---|---|
| `tv` | **TV** 1920 × 1080 (scale 1) and **TV4K** 3840 × 2160 (scale 2) | 1920 × 1080, trim box [0, 0, 1920, 1080] | 0 | 60 | 24 |
| `tvp` | **TVP** 1080 × 1920 (scale 1) | 1080 × 1920, trim box [0, 0, 1080, 1920] | 0 | 60 | 24 |

- `theme.json` carries `kind: "screen"`, `size_to_variant: {TV: tv, TV4K: tv, TVP: tvp}` and
  `variants.tv` / `variants.tvp`; the `index.json` rows carry `kind`, and its `sizes` map gains
  the three screens. A print theme has no `kind` and reads as `print`.
- The mapping is § 1's with `bleed_units` 0 and no 3 mm: `page = u · s`, `s = screen width /
  variant width`, `size_pt = units · s / 0.352778`. Page units are pixels, so the "pt" the
  pieces carry is whatever makes `pt × 0.352778` give pixels again in every renderer.
- `canvas.cutout_under_units` is 360 (a slot narrower than that takes a dish's cut-out by default).
- Slot ids, roles and order are the same in `tv` and `tvp`: the archetypes (`tv_archetypes.py`)
  run one code path with `pick(landscape, portrait)` for each position, so the portrait design is
  the same poster rearranged, never a different set of boxes.
- Roles follow the words: a sticker or pill holding money is `price_or_offer`, any other is
  `detail` (`money_role()`), so the dish binding fills the first price and nothing else.
- Footer text sits at `H − 72` so its descenders stay inside the 60 px safe inset.
- The previews are 700 px wide (`tv`) and 394 px (`tvp`); the placeholders are drawn at twice the
  slot's size.

Build, from `docs/poster-themes/generator-source/`: `POSTER_VARIANT=tv python3 build_tv.py` and
`POSTER_VARIANT=tvp python3 build_tv.py` write each design's folder under
`backend/resources/poster-themes/<category>/<key>/` (preview, backdrop SVG, gzip draw list,
placeholders, `variant-<v>.json`); `python3 merge_tv.py` writes the `theme.json` files and
appends the rows to `index.json` (idempotent; it checks slot parity). `POSTER_REPO` points the
scripts at another checkout. Run them without `-I`: the scripts import each other from their own
folder. They need fontTools, qrcode, svgelements, cairosvg and Pillow. The designs are listed in
`tv_posters.py` (`D`); a new one is a row there, built and merged the same way, and
`PosterThemesTest` holds every screen theme to this section.

## 7. Notes

- All prices, discounts and times in the designs are placeholders.
- The logo is the current light logo (dark lettering) from `public/brand/logo-animated.svg` via `LogoVector`. On colour it sits on a cream badge.
- Photo slots show placeholder art only: the bajiya photo from `public/brand/photos/bajiya` and simple illustrations.
- If geometry is unclear, check `docs/poster-themes/generator-source/`:
  - `lib.py`: primitives and the two variants (`POSTER_VARIANT=large|small`);
  - `archetypes.py`: the 15 newer layout styles;
  - `posters*.py`: the template content;
  - `catalog.py`: numbering and categories;
  - `build_variant.py` + `merge.py`: the export.
