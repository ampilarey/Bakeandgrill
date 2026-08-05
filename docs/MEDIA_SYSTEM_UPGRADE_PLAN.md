# Media System Upgrade — Plan

Status: proposed, not yet built.

Goal in plain language: make photos load faster on a phone and cost the server far
less bandwidth, without anyone noticing a drop in quality.

---

## 1. What already exists — do not rebuild any of this

The media system is in good shape. This plan adds to it; it does not replace it.

| Capability | State |
|---|---|
| Media library | **Built** — `media_assets` with disk, path, mime, size, width/height, duration, checksum, tags, uploader, versions. |
| De-duplication | **Built** — `MediaLibraryService` hashes with sha256 and reuses an existing asset on match. |
| Server-side downscale | **Built** — masters capped at `MenuImageProcessor::MASTER_MAX_EDGE` = **3200px**; thumbnails **400×300** at quality 80 (`config/menu_media.php`). |
| Originals retained | **Built** — `image_original_url` on items and categories. |
| Orphan cleanup | **Built** — `media:prune-unreferenced --days=7`, scheduled. |
| Cataloguing backfill | **Built** — `media:backfill`, idempotent. Use it as the model for any new backfill. |
| Lazy loading | **Built** — `loading="lazy"` on menu images, category rail, sliders. |
| iPhone HEIC handling | **Built** — `prepareUpload.ts` converts HEIC/HEIF → JPEG. |
| Video on items | **Built** — `item_photos.media_type` + `poster_url`; capped at 8 MB / 10 s. |
| WebP encoding | **Built but unused for uploads** — `MediaEditor` can encode WebP and `ImageCapabilities::supportsWebp()` already gates it. |

---

## 2. The core finding

**There are only two image sizes: a 3200px master and a 400×300 thumbnail. Nothing in between.**

The menu grid correctly uses thumbnails. But `utils/itemMedia.ts` line 82 picks
`preferThumb ? thumb_url : image_url`, and the item detail sheet does **not** prefer the
thumb — so tapping an item downloads the **3200px master** onto a phone screen roughly
400px wide.

That is about **sixty times more image data than the screen can display**, on the single
most-used interaction in the app. It is the dominant bandwidth cost, and it is also why
the menu feels slow on mobile data.

Nothing in any app emits `srcset`, so the browser is never told a choice exists.

---

## 3. The build

### Stage 1 — a middle size, and let the browser choose (highest value)

- Add a medium rendition, target **max edge 1000px**, quality 80.
- Store it alongside the existing thumb. Follow the established column pattern: `thumb_url`
  was added to `items`, `item_photos` and `categories`; add the medium URL the same way,
  plus `media_assets` for library items.
- Generate it at the same point the thumbnail is generated
  (`MediaEditor::writeThumbnailForPath`, `MenuImageProcessor::storeThumbnail`) so there is
  one place that produces renditions, not two.
- Emit `srcset` + `sizes` wherever menu photography is shown: `MenuImageSlider`,
  `MenuThumb`, `ProductCard`, `CategoryRail`, `ItemSheet`, and the dine-in menu view.
  The browser then downloads the right file for the device.
- Keep the master. It is still correct for the item detail on a large desktop screen and
  for any future zoom.

**Backfill.** Existing images have no medium. Add a chunked, idempotent, resumable command
modelled on `media:backfill` — never a single pass over every row. Prefer
`image_original_url` as the source when present; fall back to the 3200px master. Report
progress and skip anything already done, so it can be run repeatedly and safely.

Until an image has a medium, `srcset` must simply omit that candidate and the existing
behaviour stands. **No image may ever fail to render because its medium is missing.**

### Stage 2 — serve WebP

- On upload, additionally store a WebP rendition of the medium and thumbnail, gated on
  `ImageCapabilities::supportsWebp()` — if the server cannot encode WebP, everything must
  continue working on JPEG alone.
- Serve via `<picture>` with a JPEG fallback, so any browser that cannot take WebP still
  gets an image.
- Typically 25–35% smaller than JPEG at the same visible quality. It compounds with Stage 1:
  a right-sized WebP is a fraction of today's payload.
- Do **not** convert masters or originals. Those stay JPEG — they are the archival copy.

### Stage 3 — shrink photos in the browser before upload

- `prepareUpload.ts` currently converts HEIC and nothing else. A non-HEIC 5 MB photo is
  uploaded at full size and only then downscaled server-side.
- Downscale client-side to the master bound (3200px max edge) before sending.
- This is for the staff member standing in the kitchen photographing a cake on mobile data.
  Faster uploads, less of their data, less server CPU.
- Must not degrade quality below what the server would have produced anyway — the server
  already caps at 3200px, so matching that bound loses nothing.
- Keep the existing HEIC error message and behaviour exactly.

### Stage 4 — move media off the server's disk

- `FILESYSTEM_DISK` is `local`, so the app server sends every byte of every photo. An `s3`
  disk is already configured in `config/filesystems.php` and unused.
- Move media to object storage with a CDN in front.
- **No CSP change is required** — the policy already allows `img-src 'self' data: https:`.
  (Contrast with third-party video embeds, which would need a new `frame-src` and were
  rejected for signage on other grounds.)
- Do this **after** Stages 1–2, or the CDN will simply cache oversized files.
- The signage board and POS must keep working when the network is poor — check their
  caching still behaves before and after.

---

## 4. Risks

1. **Backfill on a large library.** A naive one-pass job over every image will exhaust memory
   or time out. Chunked, resumable, idempotent — and safe to run while the site is live.
2. **A missing rendition must never break an image.** Every consumer falls back: medium →
   master → placeholder. Never a broken image.
3. **Storage growth.** Each image gains a medium and possibly two WebP files. Confirm disk
   headroom before backfilling, and make sure `media:prune-unreferenced` also removes
   renditions of pruned files, or orphans accumulate.
4. **The dine-in QR menu and TV signage use the same photos.** Both must be checked, not
   just the ordering app. Signage runs on a TV where a wrong-sized image is very visible.
5. **WebP support is not guaranteed** on every host. Everything must degrade to JPEG.
6. **Do not touch video in this work.** Video has its own limits and processing path, and
   mixing the two makes any regression hard to attribute.

---

## 5. Test plan

- A medium rendition is produced on upload, at the expected bound, for JPEG and PNG.
- An image with no medium still renders — `srcset` omits the missing candidate.
- The item sheet on a narrow viewport requests the medium, not the 3200px master.
- The menu grid still uses the thumbnail.
- Backfill is idempotent: running it twice produces no duplicates and no re-encoding.
- Backfill is resumable: interrupt it, run again, it completes.
- With WebP unsupported on the server, uploads still succeed and JPEG is served.
- Pruning an unreferenced image also removes its medium and WebP renditions.
- The dine-in menu view and TV signage still show correct images.
- Existing HEIC conversion behaviour and its error message are unchanged.

---

## 6. Sequencing

1. **Stage 1 — medium size + `srcset`, with backfill.** Biggest win, and it makes the menu
   visibly faster on a phone.
2. **Stage 2 — WebP.** Compounds with Stage 1.
3. **Stage 3 — client-side downscale.** Independent and small; can land any time.
4. **Stage 4 — object storage + CDN.** Last, so the CDN caches right-sized files.

Do not start any of this until the platter and promotions work has landed — it touches
image handling across the same apps and would collide.
