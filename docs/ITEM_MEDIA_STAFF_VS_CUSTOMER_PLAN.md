# Item Media — Split Staff Thumbnail from Customer Gallery — Implementation Plan

**Repository:** `ampilarey/Bakeandgrill`
**Branch:** `claude/item-media-staff-vs-customer`
**Status:** Plan only — no feature code written yet.

## Objective
Today an item's **main image** (`items.image_url` + `items.thumb_url`) is both the POS thumbnail
AND the first slide customers see, followed by the gallery (`item_photos`, which now holds photos
AND videos). Desired:

- **Main image = staff-only** → POS, KDS, and other staff surfaces keep using it as a thumbnail.
- **Order app + website = gallery only** → customers see only the pictures/videos added to the
  gallery (`item_photos`), NOT the main image.

## Product decisions (defaults chosen — override if you disagree)
1. **Fallback (DEFAULT: fall back to main image for customers when the gallery is empty).**
   Customer surfaces show the gallery when it has ≥1 item; if the gallery is empty they fall back
   to the main image so existing items (which mostly have only a main image today) don't go
   blank. *Alternative "strict" mode:* empty gallery → placeholder/no image. Flip a single flag to
   switch.
2. **Website homepage "featured items" strip (DEFAULT: keep the main thumbnail).** That strip is
   tiny curated thumbnails; only the order-app cards + item detail switch to gallery-first.
   *Alternative:* pass the first gallery photo to the featured strip too.

## Verified findings
| Surface | File | Current behaviour |
|---|---|---|
| Order app — media builder | `apps/online-order-web/src/utils/itemMedia.ts` `buildItemSlides()` | pushes main `image_url` **first**, then gallery photos/videos (primary→sort_order). `preferThumb` uses `thumb_url`. |
| Order app — item cards | `apps/online-order-web/src/components/menu/ProductCard.tsx:48` | `buildItemSlides(item, {preferThumb:true})` |
| Order app — item detail | `apps/online-order-web/src/components/ItemSheet.tsx:80` | `buildItemSlides({image_url, thumb_url, name, photos})` |
| POS thumbnail | `apps/pos-web/src/components/MenuGrid.tsx:89,812` | reads `item.image_url` directly — **staff, keep as-is** |
| KDS | `apps/kds-web/src` | renders **no item images** — nothing to change |
| Website featured strip | `backend/resources/views/home.blade.php:1113` | renders `$item->image_url` |
| API payload | `backend/app/Http/Controllers/Api/ItemController.php:135` | already returns `image_url` (display), `thumb_url`, and `photos[]` (with `media_type`,`poster_url`,`thumb_url`) |

Other `image_url` uses in the order app (`CategoryRail`, `CategoryShortcuts`, `MenuSectionHeader`)
are **category** images, not item media — out of scope.

## The change (small, front-end only)
Single behavioural change in `buildItemSlides` + a customer/staff mode flag. No DB, no API change
(the payload already carries everything).

### 1. `apps/online-order-web/src/utils/itemMedia.ts`
- Add an option `source: 'gallery' | 'all'` (default `'gallery'` for customer callers).
- When `source==='gallery'`:
  - Build slides from `photos` only (photos + videos, primary→sort_order — unchanged ordering).
  - **Do NOT** include the main `image_url` as a slide **when `photos` has ≥1 entry**.
  - **Fallback:** if `photos` is empty, emit a single slide from `image_url`/`thumb_url` (DEFAULT
    #1). Add a `strict?: boolean` to suppress this fallback (emit nothing → placeholder) for the
    "strict" alternative.
- Keep `buildItemSlideUrls` shim behaviour consistent.
- Keep `preferThumb` semantics for cards (first gallery photo uses its `thumb_url`).

### 2. Callers
- `ProductCard.tsx` — call with `{ preferThumb:true, source:'gallery' }`. Cards still show a
  single still (first gallery photo, or video poster) — never autoplay video in the grid
  (existing constraint preserved).
- `ItemSheet.tsx` — call with `{ source:'gallery' }`. Detail shows the full gallery incl.
  autoplay-muted video (existing behaviour), minus the main image.

### 3. Website featured strip (DEFAULT #2 = no change)
Leave `home.blade.php` featured items using `image_url`. (If DEFAULT #2 is overridden: add the
item's first gallery photo URL to the `featuredItems` payload in `HomeController` and use it in
the view, falling back to `image_url`.)

### 4. Staff surfaces — NO change
POS `MenuGrid` keeps `image_url`; KDS unaffected. Explicitly do not touch `apps/pos-web` or
`apps/kds-web`.

## Edge cases
- Item with gallery + main image → customer sees gallery only; POS sees main thumbnail. ✅ (the goal)
- Item with only a main image → customer sees main image (DEFAULT fallback) or placeholder (strict).
- Item with only gallery, no main image → POS shows its placeholder (unchanged); customer shows gallery.
- Video-only gallery → cards show poster; detail autoplays muted (existing).
- De-dupe: main image that also appears in the gallery must not double-render (existing `seen` set).

## Tests
`apps/online-order-web/src/utils/itemMedia.test.ts` (extend):
- `source:'gallery'` with photos → excludes main image; order = primary→sort_order.
- `source:'gallery'` with empty photos → falls back to main image (default).
- `source:'gallery', strict:true` with empty photos → returns [].
- Card mode (`preferThumb`) → first slide is first gallery photo's thumb; video → poster.
- Regression: `source:'all'` preserves old behaviour (main first).
Component tests: `ProductCard`/`ItemSheet` render gallery-first; POS grid untouched (no test change).

## Files
- [ ] `apps/online-order-web/src/utils/itemMedia.ts` (modify — `source`/`strict` option)
- [ ] `apps/online-order-web/src/components/menu/ProductCard.tsx` (modify — `source:'gallery'`)
- [ ] `apps/online-order-web/src/components/ItemSheet.tsx` (modify — `source:'gallery'`)
- [ ] `apps/online-order-web/src/utils/itemMedia.test.ts` (modify — cases above)
- [ ] (only if DEFAULT #2 overridden) `backend/app/Http/Controllers/HomeController.php` + `home.blade.php`
- [ ] Rebuild + re-sync `backend/public/order` dist via `./scripts/build-all.sh order`

## Acceptance criteria
1. An item with gallery media shows ONLY its gallery (photos + videos) in the order-app cards and
   detail — the main image no longer appears as a customer slide.
2. POS still shows the main image as its thumbnail; KDS unchanged.
3. An item with no gallery still shows its main image to customers (default) — nothing goes blank.
4. Cards never autoplay video (poster/first image only); detail keeps muted-autoplay video.
5. All existing order-app tests stay green; `npm run build` clean; order dist re-synced.

## Constraints (do not improvise)
- No DB or API changes — the payload already carries `photos`, `thumb_url`, `poster_url`, `media_type`.
- Do NOT modify `apps/pos-web` or `apps/kds-web` (staff thumbnail stays on `image_url`).
- Preserve: video only in detail (not cards), muted+playsInline autoplay, reduced-motion, SW video guard.
- Keep the fallback default unless told to go strict; keep featured-strip default unless told otherwise.
