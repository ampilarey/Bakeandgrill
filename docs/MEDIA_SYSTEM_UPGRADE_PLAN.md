# Media System Upgrade — Plan

Status: **Stages 1–3 built. Stage 4 not built.** Revised after a code audit — the first
draft's core finding was wrong, and the stages have been re-ordered by real value.

| Stage | State |
|---|---|
| 1 — serve WebP | Built. `image_webp_url` / `thumb_webp_url` columns, `media:generate-menu-webp` backfill, `<picture>` rendering via `PictureImg`. |
| 2 — client-side downscale before upload | Built. `MASTER_MAX_EDGE = 3200`, `downscaleImageForUpload()` in `prepareUpload.ts`, HEIC conversion preserved. |
| 3 — `srcset` | Built. `PictureImg` accepts `srcSet` / `sizes`; consumers pass the thumb and crop renditions. |
| 4 — object storage + CDN | **Not built.** Still `FILESYSTEM_DISK=local`; the local-disk assumptions listed in §3 Stage 4 remain. |

Stage 4 is a storage-layer refactor, not a config flip — read §3 Stage 4 before attempting it.

Goal in plain language: make photos load faster on a phone and cost the server less
bandwidth, without anyone noticing a drop in quality.

---

## 1. What already exists — do not rebuild any of this

The media system is in good shape. This plan adds to it; it does not replace it.

| Capability | State |
|---|---|
| Media library | **Built** — `media_assets` with disk, path, mime, size, width/height, duration, checksum, tags, uploader, versions. |
| De-duplication | **Built** — `MediaLibraryService` hashes with sha256 and reuses an existing asset on match. |
| Three image sizes | **Built** — thumbnail **400×300** q80, public crop **1200×900** q82 (4:3), master capped at **3200px** q90. Category banners are **1400×600** q82. All from `MenuImageProcessor` / `config/menu_media.php`. |
| Masters kept separately | **Built** — `image_original_url` on items and categories points at the full-frame master in `menu-masters/`. Customers never download it; it exists for admin re-crop. |
| Orphan cleanup | **Built** — `media:prune-unreferenced --days=7`, scheduled. It already collects `thumb_url` across items, item_photos and categories. |
| Cataloguing backfill | **Built** — `media:backfill`, idempotent. Use it as the model for any new backfill. |
| Lazy loading | **Built** — `loading="lazy"` on menu images, category rail, sliders. |
| iPhone HEIC handling | **Built** — `prepareUpload.ts` converts HEIC/HEIF → JPEG. Note there are **two copies**: `apps/admin-dashboard/src/utils/prepareUpload.ts` and `apps/pos-web/src/utils/prepareUpload.ts`. |
| Video on items | **Built** — `item_photos.media_type` + `poster_url`; capped at 8 MB / 10 s. |
| WebP decode/encode plumbing | **Built but unused for serving** — `MediaEditor` can encode WebP and `ImageCapabilities::supportsWebp()` already gates it. Uploads accept WebP input, but everything is served as JPEG. |

## 2. What the audit actually found

The first draft claimed the item detail sheet downloads the 3200px master. **It does not.**
Every upload path (`ImageUploadController`, `ItemPhotoController`, `ContentController`,
`MediaLibraryService`) stores the customer-facing `image_url` / `photo.url` as the
**1200×900 quality-82 crop**. The master goes to a separate field
(`image_original_url`, directory `menu-masters/`) that only the admin re-crop editor
fetches. On a phone with device-pixel-ratio 2–3, a ~400 CSS-px-wide detail sheet wants
800–1200 physical pixels — so today's detail image is already close to right-sized.

The real gaps, in order of value:

1. **Everything is JPEG.** WebP is typically 25–35% smaller at the same visible quality,
   the encoder plumbing already exists, and it applies to every image on every page.
2. **Non-HEIC uploads go up at full camera size.** `prepareUpload.ts` converts HEIC and
   nothing else; a 5 MB photo is uploaded whole and only then downscaled server-side.
3. **No `srcset` anywhere.** The browser is never offered a choice, so small/low-DPR
   devices fetch the full 1200×900 crop where the 400×300 thumb (or an ~800px middle
   size) would do. Real but modest — do not expect the "60×" savings the first draft
   promised.
4. **`FILESYSTEM_DISK` is `local`** — the app server sends every byte of every photo.

## 3. The build

### Stage 1 — serve WebP (highest value)

- On upload, additionally store a WebP rendition of the public crop and the thumbnail,
  gated on `ImageCapabilities::supportsWebp()` — if the server cannot encode WebP,
  everything must continue working on JPEG alone. Follow the established column pattern
  (`thumb_url` was added to `items`, `item_photos`, `categories`): add `image_webp_url`
  and `thumb_webp_url` the same way, plus `media_assets` for library items.
- Generate at the same points the JPEGs are generated (`MenuImageProcessor`,
  `MediaEditor::writeThumbnailForPath`) so there is one place that produces renditions.
- Serve via `<picture>` with the JPEG as fallback, so any browser that cannot take WebP
  still gets an image. Consumers: `MenuImageSlider`, `MenuThumb`, `ProductCard`,
  `CategoryRail`, `ItemSheet`, dine-in menu view, TV signage.
- Do **not** convert masters or originals. Those stay JPEG — they are the archival copy.

**Backfill.** Existing images have no WebP. Add a chunked, idempotent, resumable command
modelled on `media:backfill` — never a single pass over every row.
**The source for each WebP is the existing JPEG rendition itself** (the 1200×900 crop for
`image_webp_url`, the 400×300 thumb for `thumb_webp_url`) — never `image_original_url`,
because the master is full-frame and uncropped, so re-deriving from it changes the
framing customers already see. Report progress, skip anything already done, safe to run
repeatedly while the site is live.

Until an image has a WebP, the `<picture>` simply omits that source and the JPEG
behaviour stands. **No image may ever fail to render because a rendition is missing.**

### Stage 2 — shrink photos in the browser before upload

- Extend **both** copies of `prepareUpload.ts` (admin-dashboard and pos-web) to
  downscale client-side to the master bound (3200px max edge) before sending.
- First verify which paths actually send big files: the admin main-image flow already
  sends a client-cropped canvas; the raw-full-size problem mainly applies to gallery
  photo uploads and the optional `original` master upload.
- This is for the staff member photographing a cake on mobile data: faster uploads, less
  of their data, less server CPU. The server already caps at 3200px, so matching that
  bound loses nothing.
- Keep the existing HEIC conversion behaviour and its error message exactly.

### Stage 3 — `srcset`, and optionally one middle size (modest, do after 1–2)

- Emit `srcset` + `sizes` from the renditions that already exist (thumb 400w, crop
  1200w) wherever menu photography is shown, so the browser downloads the right file
  for the device.
- Optionally add one **~800px middle rendition** for DPR-2 phones, generated in the same
  4:3 crop pipeline as the thumb and crop. If added, backfill it from the existing
  `image_url` crop (same rule as Stage 1 — **never** from the master) with the same
  chunked, idempotent command pattern.
- **Never put the master in a `srcset` with the crops** — it has a different (full-frame)
  aspect ratio and the framing would jump between breakpoints. The master stays
  admin-only.
- The menu grid must keep using the thumbnail; the item sheet keeps the 1200×900-class
  image on high-DPR phones (it is already about right).

### Stage 4 — move media off the server's disk (a real refactor, not a config flip)

- An `s3` disk is already configured in `config/filesystems.php` and unused, but the
  code has deep local-disk assumptions that must be removed first:
  - `MenuImageProcessor::writeBinary()` and `storeThumbnailFromStoragePath()` hardcode
    `storage_path('app/public/…')` — rewrite to go through `Storage::disk()`.
  - DB rows store hardcoded `/storage/…` URL strings — URL generation must move to
    `Storage::url()` and existing rows need a migration or a URL-resolver shim.
  - `MediaEditor` reads files via absolute paths — must use disk streams.
  - `media:prune-unreferenced` and the `MediaUrl` validation rule assume the public
    disk's path shape.
- Then move media to object storage with a CDN in front.
- **No CSP change is required** — verified: the policy already allows
  `img-src 'self' data: https:` (`SecurityHeaders.php`).
- Do this **after** Stages 1–3, or the CDN will simply cache heavier files than needed.
- The signage board and POS must keep working when the network is poor — check their
  caching still behaves before and after.

## 4. Risks

1. **Backfill on a large library.** A naive one-pass job will exhaust memory or time out.
   Chunked, resumable, idempotent — and safe to run while the site is live.
2. **A missing rendition must never break an image.** Every consumer falls back:
   WebP → JPEG, medium → crop → placeholder. Never a broken image.
3. **Wrong backfill source changes framing.** Renditions must derive from the existing
   crop (`image_url`), never from the full-frame master. This is the most likely subtle
   bug in the whole plan.
4. **Storage growth.** Each image may gain up to two WebP files and a medium. Confirm
   disk headroom before backfilling. `media:prune-unreferenced` already tracks
   `thumb_url`; extend the same pattern to every new rendition column so orphans don't
   accumulate.
5. **WebP support is not guaranteed** on every host. Everything must degrade to JPEG —
   `ImageCapabilities::supportsWebp()` is the single gate.
6. **The dine-in QR menu and TV signage use the same photos.** Both must be checked, not
   just the ordering app. Signage runs on a TV where a wrong-sized image is very visible.
7. **Do not touch video in this work.** Video has its own limits and processing path, and
   mixing the two makes any regression hard to attribute.

## 5. Test plan

- A WebP rendition is produced on upload for the crop and thumb, for JPEG and PNG input.
- With WebP unsupported on the server (`ImageCapabilities::supportsWebp()` false),
  uploads still succeed and JPEG alone is stored and served.
- An image with no WebP still renders — the `<picture>` omits the missing source.
- A browser that cannot take WebP receives the JPEG fallback.
- Backfill is idempotent: running it twice produces no duplicates and no re-encoding.
- Backfill is resumable: interrupt it, run again, it completes.
- Backfill derives from the crop, not the master: framing of the served image is
  byte-for-byte the same picture, just re-encoded.
- Client-side downscale produces a file within the 3200px bound; server output is
  unchanged in dimensions and framing. Both admin and POS copies behave the same.
- Existing HEIC conversion behaviour and its error message are unchanged.
- The menu grid still uses the thumbnail; the item sheet still gets the 1200×900-class
  image on a high-DPR phone.
- If the medium is built: `srcset` omits it when missing; master never appears in
  `srcset`.
- Pruning an unreferenced image also removes its WebP (and medium) renditions.
- The dine-in menu view and TV signage still show correct images.

## 6. Sequencing

1. **Stage 1 — WebP + backfill.** Biggest win; applies to every image on every page.
2. **Stage 2 — client-side downscale.** Independent and small; can land any time.
3. **Stage 3 — `srcset` (+ optional 800px medium).** Modest; uses Stage 1's backfill
   pattern if the medium is built.
4. **Stage 4 — object storage + CDN.** Last, so the CDN caches right-sized files; scoped
   as a storage-layer refactor, not a config flip.

The platter and promotions work has landed on `main` (`a7c6506af`), so the previous
"wait for platters" gate is cleared.
