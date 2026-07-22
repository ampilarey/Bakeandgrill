# Menu Media — Hardening, Enhancements & Video Clips — Implementation Plan

**Repository:** `ampilarey/Bakeandgrill`
**Branch to develop on:** `claude/service-availability-maintenance-zj4whc` (continue on the current feature branch, or cut a new `claude/menu-media-*` branch if preferred — decide before starting; do all work on ONE branch).
**Status:** Plan only — no feature code written yet.
**Author's note:** This separates **VERIFIED findings** (files actually read) from **RECOMMENDATIONS**. Every path in the "Findings" tables was opened. Proposed new paths are marked **(new)**.

---

## 0. TL;DR for Cursor

Three phases, each independently shippable, ordered by risk:

1. **Phase A — Bug fixes (safe, no UX change):** stop leaking image files on item delete + main-image replace; cap decompression memory; fix the WebP validation/processing mismatch; make gallery reorder atomic. All backend, all covered by tests.
2. **Phase B — Enhancements (bandwidth + a11y):** generate a small thumbnail alongside the 1200×900 crop and serve it to menu cards; expose **alt text** in admin; add `loading="lazy"`; add a scheduled orphan-file prune; (optional) give categories the item-grade crop pipeline.
3. **Phase C — Video clips (the new feature):** gallery-only, muted-autoplay-loop, poster-required, **plays in the item detail sheet only** (cards stay images), no server transcoding.

**Hard constraints:** do not rebuild `MenuImageProcessor`, the crop UI, or the slider from scratch — extend them. Do not make menu cards autoplay video (data cost). Do not add ffmpeg/transcoding. Do not break the existing `item_photos` API shape (older clients read `url`/`is_primary`).

---

## 1. Verified findings (files actually inspected)

### Backend
| Area | Path | Note |
|---|---|---|
| Image crop/master pipeline | `backend/app/Services/MenuImageProcessor.php` | GD only; `storeProcessed()` → 1200×900 JPEG@82, `storeMaster()` → ≤3200px JPEG@90; writes `storage/app/public/{dir}/{uuid}.jpg` |
| Single main-image upload | `backend/app/Http/Controllers/Api/ImageUploadController.php` | `POST /api/admin/upload-image`; max 10 MB, `dimensions:max=8192`; returns `{url, original_url, width, height}`; stateless |
| Gallery photo CRUD | `backend/app/Http/Controllers/Api/ItemPhotoController.php` | `index` (public), `store/update/destroy`; `destroy` deletes disk files with shared-master guard; `store` auto `sort_order=max+1`, unsets sibling primary |
| Item model | `backend/app/Models/Item.php` | `image_url`, `image_original_url` (28-29); `photos()` HasMany ordered by `sort_order` (113); `getDisplayImageUrlAttribute` (121) |
| Photo model | `backend/app/Models/ItemPhoto.php` | fields `url, original_url, alt_text, sort_order, is_primary` |
| Category model | `backend/app/Models/Category.php` | `image_url` only (24); no master, no gallery |
| **Item delete (BUG)** | `backend/app/Http/Controllers/Api/ItemController.php:566-569` | `destroy()` = `$item->delete()` only — no disk cleanup |
| **Item update (BUG)** | `backend/app/Http/Controllers/Api/ItemController.php:501+` | saves new `image_url`/`image_original_url`; never deletes replaced files |
| Request validation | `backend/app/Http/Requests/StoreItemRequest.php`, `UpdateItemRequest.php` | `image_url`/`image_original_url`: `nullable|string|max:2048|MediaUrl` |
| Media URL rule | `backend/app/Rules/MediaUrl.php` | accepts `http(s)://…` or same-origin `/storage/…` |
| Category image rule | `backend/app/Http/Controllers/Api/CategoryController.php:53,63,101,111` | raw `image_url` string + `MediaUrl`; no processing |
| Thumbnail (seed only) | `backend/app/Http/Controllers/ImageThumbController.php` | `/thumb/{path}` — only `public/images/cafe/` prefix; never uploads |
| Migrations | `…_create_item_photos_table.php`, `2026_07_20_103000_add_image_original_urls.php` | `item_photos`; `original_url` masters added later |
| Routes | `backend/routes/domains/catalog.php:64-70` (photos), `staff.php:112` (upload-image) | photo mutations gated `permission:menu.manage`; `index` public |
| Storage disk | `backend/config/filesystems.php:43-47,85-86` | `public` disk → `storage/app/public`, symlinked to `public/storage` (**needs `php artisan storage:link`**) |
| Observers pattern | `backend/app/Observers/OrderObserver.php`; registered in `AppServiceProvider.php:41-42` via `Model::observe(...)` | reuse this pattern for cleanup |

### Frontend (admin)
| Area | Path | Note |
|---|---|---|
| Item editor (tabs) | `apps/admin-dashboard/src/pages/MenuPage/MenuItemEditorModal.tsx` | Details + Photos tabs; main image via `ImageUploadField` (634-640); `<PhotosTab itemId>` (695) |
| Gallery manager | `apps/admin-dashboard/src/pages/MenuPage/PhotosTab.tsx` | upload+crop, edit-crop from master, set primary, reorder (◀▶), delete; renders `alt=""` (no alt input) |
| Main-image field | `apps/admin-dashboard/src/pages/MenuPage/menuFormPrimitives.tsx` | `ImageUploadField` → `uploadMenuImage()` (79) |
| Crop modal | `apps/admin-dashboard/src/pages/MenuPage/ImageCropModal.tsx`, `cropImage.ts` | interactive crop; client downscale in `mediaUrl.ts` (≤2048 work, ≤3200 master) |
| API client | `apps/admin-dashboard/src/api/menu.ts:248-296` | `uploadMenuImage`, `getItemPhotos`, `uploadItemPhoto`, `updateItemPhoto` (already accepts `alt_text`), `deleteItemPhoto`; `ItemPhoto` type has no `alt_text`/`media_type` |

### Frontend (customer)
| Area | Path | Note |
|---|---|---|
| Media builder | `apps/online-order-web/src/utils/itemMedia.ts` | `buildItemSlideUrls()` → `string[]`, main image FIRST then gallery primary-first; **primary flag ignored when main image set** |
| Slider | `apps/online-order-web/src/components/menu/MenuImageSlider.tsx` | `slides: string[]`, renders `<img>`; IntersectionObserver + `prefers-reduced-motion`; auto-advance |
| Consumers | `ItemSheet.tsx` (76-100), `menu/ProductCard.tsx` | **both cards and sheet use the slider** — cards must NOT autoplay video |
| PWA service worker | `apps/online-order-web/public/sw.js` | `CACHE_VERSION='bg-pwa-v8'` (now v9 after availability work — confirm current); rule 6 `staleWhileRevalidate` for "everything else" would wrongly cache video/range responses |
| Photo type | `apps/online-order-web/src/api/menu.ts:~280` | `ItemPhoto` type: `url, sort_order, is_primary` |

---

## 2. Phase A — Bug fixes (backend, no UX change)

### A1. Stop leaking files on item delete & main-image replace — **Medium**
**Root cause:** `ItemController::destroy` and `::update` never remove superseded/child files from the `public` disk.

**Fix (observer-based, matches repo convention):**
- **New** `backend/app/Observers/ItemPhotoObserver.php` — on `deleting`, delete `url` + `original_url` from the `public` disk **unless another `item_photos` row references the same file** (shared-master guard, same logic already in `ItemPhotoController::destroy`). This makes cascade-deletes clean up automatically.
- **New** `backend/app/Observers/ItemObserver.php` — on `deleting`, delete the item's `image_url` + `image_original_url` files (guarded: skip if the URL is an `images/cafe/` seed path or an external `http(s)` URL — only remove owned `/storage/` uploads). Child photos are handled by `ItemPhotoObserver` via cascade.
- Register both in `backend/app/Providers/AppServiceProvider.php` (`Item::observe`, `ItemPhoto::observe`).
- **Replace-cleanup:** in `ItemController::update`, before saving, if `image_url`/`image_original_url` changed and the old value was an owned `/storage/` upload no longer referenced, delete the old files. Extract a shared helper `App\Support\MediaFileCleaner` **(new)** with `deleteIfOwnedAndUnreferenced(?string $url, array $keepUrls = [])` and `storagePathFromUrl(?string $url)` (lift the existing private method out of `ItemPhotoController` so all three call sites share it). Refactor `ItemPhotoController::destroy` to use it too.

**Guards (critical — do not delete the wrong file):**
- Only delete paths under the `public` disk resolved from `/storage/…` (reuse `storagePathFromUrl`).
- Never delete `images/cafe/…` seed files or external URLs.
- Before delete, check no other `item_photos` row (and no other item) still points at that exact path.

**Risk:** deleting a still-referenced master. Mitigated by the shared-master guard + tests.

### A2. Cap decompression memory — **Medium (DoS)**
In `ImageUploadController` and `ItemPhotoController` validation, lower `dimensions:max_width/max_height` from **8192 → 5000**, and add a pre-decode pixel-count guard in `MenuImageProcessor::loadUploaded` (use `getimagesize()` first; reject if `width*height > ~25_000_000` or memory estimate exceeds a configurable cap). Return a friendly 422. Add `config/menu_media.php` **(new)** with `max_edge`, `max_megapixels`, size limits so these aren't magic numbers.

### A3. WebP validation/processing mismatch — **Low**
If GD lacks WebP (`!function_exists('imagecreatefromwebp')`), reject WebP **at validation time** with a clear message ("WebP isn't supported on this server; upload JPEG or PNG"), instead of passing validation then throwing a generic "corrupt image." Add a tiny `App\Support\ImageCapabilities::supportsWebp()` **(new)** helper and use it in both upload requests.

### A4. Atomic gallery reorder — **Low**
- **New** endpoint `POST /api/items/{itemId}/photos/reorder` body `{ order: number[] }` (photo IDs in desired order) → single transactional update of all `sort_order`s. Gated `permission:menu.manage`.
- `PhotosTab.movePhoto` calls the new endpoint instead of two independent PATCHes.

---

## 3. Phase B — Enhancements

### B1. Card thumbnails (bandwidth) — **Medium value**
- Extend `MenuImageProcessor` with `storeThumbnail(UploadedFile|GdImage): string` → **400×300 JPEG@80** (or reuse the crop then downscale). Write to `…/thumbs/{uuid}.jpg`.
- Add nullable `thumb_url` to `items` and `item_photos` (**new** migration). Populate on upload in both controllers. Backfill command `menu:generate-thumbnails` **(new)** for existing rows (idempotent, skips rows that already have `thumb_url`).
- API: include `thumb_url` in item/photos responses (additive).
- Customer: menu cards (`ProductCard`) use `thumb_url` when present, fall back to `url`; the item sheet keeps full-res. Cuts card payloads ~5-8×.

### B2. Alt text in admin (a11y/SEO) — **Low effort**
- `PhotosTab.tsx`: add an `alt_text` input per photo (and on the crop-confirm form). The API (`updateItemPhoto`) already accepts `alt_text` — just wire the UI and add `alt_text` to the `ItemPhoto` TS type in both apps.
- Customer slider: pass real `alt` (fallback to item name) instead of `""`.
- Optional: main-image alt on the item (would need an `image_alt` column — defer unless wanted).

### B3. Scheduled orphan-file prune (safety net) — **Low**
- **New** command `backend/app/Console/Commands/PruneUnreferencedMedia.php` — scans `storage/app/public/{menu,item-photos,menu-masters,thumbs}`, deletes files not referenced by any `items`/`item_photos` row, older than N days (default 7, dry-run flag). Schedule weekly in `routes/console.php` with the existing `onFailure`/`after(trackSuccess)` wrappers.

### B4. (Optional) Category crop pipeline — **Medium value, larger**
Give categories the same `ImageUploadField` + `MenuImageProcessor` flow (crop, master, cleanup) instead of a raw URL string. Add `image_original_url` + `thumb_url` to `categories`. Mark this **optional / can be a later PR** — it doesn't block A/B/C.

### B5. WebP output (optional) — smaller files
Add a config switch to emit WebP (with JPEG fallback for old clients). Defer unless server GD-WebP is confirmed present.

---

## 4. Phase C — Video clips (new feature)

**Product scope (locked, keep it small):**
- Video lives in the **gallery** (`item_photos`), not the main image.
- Plays **only in the item detail sheet** (`ItemSheet`). Menu cards (`ProductCard`) show the **poster image only** — never autoplay video in a scrolling grid.
- **Muted, looping, autoplay, `playsInline`**, ≤ ~8-10s, ≤ ~5 MB, ~720p. Poster **required**.
- **No server-side transcoding** (no ffmpeg). Store as uploaded.

### C1. Database
**New** migration `…_add_video_support_to_item_photos.php`:
- `media_type` string(8) default `'image'` — `'image' | 'video'`
- `poster_url` string(500) nullable — still frame
- (reuse existing `url` for the video file, `original_url` unused for video)
- index `media_type` (optional).

### C2. Backend upload
- Extend `ItemPhotoController::store` (or a sibling `storeVideo`) to accept:
  - `media_type=video`, `video` file (`mimetypes:video/mp4,video/webm`, `max:` from `config/menu_media.php`, e.g. 8192 KB),
  - `poster` image file (goes through `MenuImageProcessor::storeProcessed` like any photo).
- **Do not** run video through `MenuImageProcessor`. Store the raw video on the `public` disk under `item-photos/{itemId}/video/{uuid}.{ext}` via a new `MenuImageProcessor::storeRaw()` or a small `VideoStorage` helper **(new)**.
- Server-side **duration is not enforced** (needs ffprobe) — rely on client-side duration check + size cap. Document this.
- Validation request **new** `StoreItemVideoRequest.php` (or extend the inline validate) — enforce mimetypes, size, require `poster` when `media_type=video`.
- Reuse the existing `is_primary`/`sort_order`/cleanup logic. `ItemPhotoObserver` (A1) already cleans up `url` + `poster_url` on delete — ensure `poster_url` is added to the cleanup list.

### C3. Frontend admin (PhotosTab)
- Add a second uploader: **"Add video clip"** (accept `video/mp4,video/webm`).
- On file pick: load into a hidden `<video>`, **check `duration ≤ maxSeconds`** and size; **capture the first frame** to a `<canvas>` → produce a poster `File`; upload video + poster together.
- Show video slides in the gallery grid with a ▶ badge; allow set-primary/reorder/delete like photos.
- API: add `uploadItemVideo(itemId, videoFile, posterFile, opts)` to `apps/admin-dashboard/src/api/menu.ts`; extend `ItemPhoto` type with `media_type` + `poster_url`.

### C4. Frontend customer
- **Change the media contract** from `string[]` to typed slides. In `itemMedia.ts`:
  ```
  type MediaSlide = { type: 'image' | 'video'; url: string; poster?: string | null; alt?: string };
  buildItemSlides(item): MediaSlide[]   // replaces buildItemSlideUrls (keep a shim)
  ```
- `MenuImageSlider`: accept `slides: MediaSlide[]`. For `type==='video'` render:
  ```
  <video src={url} poster={poster} autoPlay muted loop playsInline preload="metadata" />
  ```
  - Respect `prefers-reduced-motion` → render poster `<img>` only (no autoplay).
  - Reuse the existing IntersectionObserver to **pause off-screen** and only play the active slide.
  - `ProductCard` passes a `posterOnly`/`imagesOnly` flag so cards render video slides as their poster image (no `<video>`).
- Add `media_type`/`poster_url` to the customer `ItemPhoto` type and ensure `/items` + `/items/{id}/photos` return them (additive).

### C5. PWA / service worker (must-fix for video)
- In `apps/online-order-web/public/sw.js`, add a guard **before** rule 6: if the request path ends in `.mp4`/`.webm` (or `Accept: video/*`), `return;` (network-only). Video uses HTTP **range/206** responses that corrupt `cache.put`. **Bump `CACHE_VERSION`** on release.

### C6. Config & limits
`config/menu_media.php` **(new)** centralizes: `video.max_kb`, `video.max_seconds`, `video.mimetypes`, `image.max_edge`, `image.max_megapixels`, `thumb.width/height`. Referenced by requests + processor + admin (via a small public settings echo or hardcoded mirror in the client — keep client limits in one TS const).

---

## 5. Data model changes (summary)

| Table | Column | Type | Null | Default | Phase |
|---|---|---|---|---|---|
| `items` | `thumb_url` | string(500) | yes | null | B1 |
| `item_photos` | `thumb_url` | string(500) | yes | null | B1 |
| `item_photos` | `media_type` | string(8) | no | `'image'` | C1 |
| `item_photos` | `poster_url` | string(500) | yes | null | C1 |
| `categories` | `image_original_url`,`thumb_url` | string(500) | yes | null | B4 (optional) |

All migrations must be **additive and default-safe** (existing rows become `media_type='image'`, null thumbs → fall back to `url`). Nothing disables or hides existing images.

---

## 6. API contract (additive, non-breaking)

- `GET /api/items`, `GET /api/items/{id}`, `GET /api/items/{id}/photos` — each photo gains `media_type`, `poster_url`, `thumb_url`; items gain `thumb_url`. Older clients ignore unknown keys.
- `POST /api/items/{itemId}/photos` — unchanged for images; accepts `media_type=video` + `video` + `poster` for clips.
- `POST /api/items/{itemId}/photos/reorder` **(new)** — `{ order: number[] }`.
- Validation errors: 422 with existing message shape. Oversized/too-long video → 422 with a clear message.

---

## 7. Security & privacy

- Video/image mutations stay behind `permission:menu.manage` + staff token (unchanged).
- MIME allow-list re-checked server-side after Laravel validation (as images already do).
- File-delete helpers only touch the `public` disk, only `/storage/` owned paths, never seed/external URLs, always with a shared-reference guard (prevents deleting a file another row uses).
- Pixel-count / size caps (A2) prevent decompression-bomb OOM.
- No user-supplied HTML; alt text is plain text, escaped on render.

---

## 8. Testing plan (repo uses PHPUnit + RefreshDatabase; Vitest frontend)

**Backend — `backend/tests/Feature/Media/`**
- `ItemPhotoCleanupTest.php` — deleting a photo removes its files; deleting an **item** removes main + all gallery + master files; a **shared master** is NOT deleted while still referenced; seed/external URLs are never deleted.
- `ItemImageReplaceCleanupTest.php` — updating `image_url` deletes the superseded owned file, keeps external/seed URLs.
- `ImageUploadLimitsTest.php` — oversized dimensions/megapixels rejected 422; WebP rejected cleanly when unsupported (mock capability).
- `ItemPhotoReorderTest.php` — reorder endpoint sets contiguous orders atomically; rejects foreign photo IDs.
- `ItemVideoUploadTest.php` — accepts mp4/webm + poster; rejects oversize; requires poster; `media_type=video` persisted; poster cleaned on delete.
- `ThumbnailGenerationTest.php` — upload produces `thumb_url`; backfill command idempotent.
- **Regression:** existing image upload/photo/menu tests stay green.

**Frontend**
- Admin `PhotosTab` — alt input persists; video picker enforces duration/size; poster captured; reorder calls new endpoint.
- Customer `MenuImageSlider` — video slide renders `<video muted playsinline loop>`; reduced-motion shows poster only; card variant renders poster image, never `<video>`; off-screen pauses.
- `itemMedia` builder — typed slides order (primary/main), dedupe, video mapping.

**Manual / verification checklist**
- `php artisan storage:link` present; uploaded media resolves.
- Upload a clip → shows in sheet, autoplays muted/looping on mobile Safari + Chrome; card shows poster.
- Delete item → files gone from `storage/app/public` (check disk).
- Menu grid on throttled mobile loads thumbnails, not full crops.

---

## 9. Rollout phases

**Phase A (bug fixes):** migrations none (except optional); backend + observers + config; tests; deploy backend. Rollback: revert commit (pure backend, no schema).
**Phase B (enhancements):** migration adds `thumb_url`; backfill command; admin alt UI; customer thumb usage; prune command scheduled. Rollback: `thumb_url` is additive/nullable — safe to leave; revert UI.
**Phase C (video):** migration adds `media_type`/`poster_url`; backend upload; admin video UI; customer slider + `itemMedia` typed slides; SW guard + `CACHE_VERSION` bump; deploy order = backend → admin → order-app (SW bump last). Rollback: feature-flag the admin video uploader; `media_type` defaults `'image'` so existing data is unaffected; revert order-app to hide video slides.

**Deploy note (cPanel):** every phase needs `php artisan migrate --force` (B, C) + `config:cache`; Phase C order-app is served from committed `backend/public/order` dist — rebuild + resync dist. Confirm `storage:link` exists.

---

## 10. File-by-file checklist

**Migrations**
- [ ] `…_add_thumb_url_to_items_and_item_photos.php` (new, Phase B)
- [ ] `…_add_video_support_to_item_photos.php` (new, Phase C)
- [ ] `…_add_media_columns_to_categories.php` (new, Phase B4 optional)

**Backend**
- [ ] `app/Observers/ItemObserver.php` (new)
- [ ] `app/Observers/ItemPhotoObserver.php` (new)
- [ ] `app/Support/MediaFileCleaner.php` (new)
- [ ] `app/Support/ImageCapabilities.php` (new)
- [ ] `config/menu_media.php` (new)
- [ ] `app/Services/MenuImageProcessor.php` (modify — `storeThumbnail`, `storeRaw`, pixel guard)
- [ ] `app/Http/Controllers/Api/ItemController.php` (modify — replace-cleanup in `update`)
- [ ] `app/Http/Controllers/Api/ItemPhotoController.php` (modify — thumb, video, reorder, use MediaFileCleaner)
- [ ] `app/Http/Requests/StoreItemRequest.php`, `UpdateItemRequest.php` (modify — dimension caps, webp guard)
- [ ] `app/Http/Requests/StoreItemVideoRequest.php` (new, Phase C)
- [ ] `app/Console/Commands/GenerateMenuThumbnails.php` (new, B1)
- [ ] `app/Console/Commands/PruneUnreferencedMedia.php` (new, B3)
- [ ] `app/Providers/AppServiceProvider.php` (modify — register observers)
- [ ] `routes/domains/catalog.php` (modify — reorder + video routes)
- [ ] `routes/console.php` (modify — schedule prune)
- [ ] `app/Http/Resources/*` or controller payloads (modify — add `thumb_url`/`media_type`/`poster_url`)

**Admin UI (`apps/admin-dashboard/src`)**
- [ ] `pages/MenuPage/PhotosTab.tsx` (modify — alt input, video uploader+poster capture, reorder endpoint)
- [ ] `api/menu.ts` (modify — `uploadItemVideo`, `reorderItemPhotos`, `alt_text`/`media_type`/`poster_url`/`thumb_url` on types)
- [ ] `pages/MenuPage/ImageCropModal.tsx` / `cropImage.ts` (reuse for poster; no change expected)

**Order-app UI (`apps/online-order-web/src`)**
- [ ] `utils/itemMedia.ts` (modify — typed `MediaSlide`, `buildItemSlides`, keep `buildItemSlideUrls` shim)
- [ ] `components/menu/MenuImageSlider.tsx` (modify — video rendering, poster-only card mode, reduced-motion)
- [ ] `components/menu/ProductCard.tsx` (modify — pass poster-only flag; use `thumb_url`)
- [ ] `components/ItemSheet.tsx` (modify — pass typed slides)
- [ ] `api/menu.ts` / `types.ts` (modify — `media_type`/`poster_url`/`thumb_url`/`alt_text`)
- [ ] `public/sw.js` (modify — video network-only guard; bump `CACHE_VERSION`)

**Tests** — as §8 (`backend/tests/Feature/Media/*`, frontend `*.test.tsx`).

**Docs**
- [ ] This file.

---

## 11. Risks & decisions Cursor must not improvise

1. **File-delete safety** — the cleanup helpers MUST guard against (a) shared masters, (b) `images/cafe/` seed files, (c) external `http(s)` URLs. Deleting the wrong file is data loss. Cover every guard with a test before wiring observers.
2. **No transcoding** — do not add ffmpeg or attempt server-side video processing. If a clip is too big/long, reject it; don't try to shrink it.
3. **Cards never autoplay video** — `ProductCard` renders posters only. Only `ItemSheet` plays video. This is a data-cost decision, not optional.
4. **Autoplay requires `muted` + `playsInline`** — omitting either breaks iOS. Respect `prefers-reduced-motion`.
5. **SW must exclude video from cache** — range/206 responses corrupt `cache.put`; bump `CACHE_VERSION`.
6. **Additive schema only** — `media_type` defaults `'image'`; nullable `thumb_url`/`poster_url`; existing rows/behaviour unchanged.
7. **API back-compat** — keep `url`/`is_primary`/`sort_order` exactly; only add keys.
8. **Branch/dist** — confirm which branch; rebuild & resync committed `backend/public/{order,admin}` dist for the frontend phases.

---

## 12. Acceptance criteria

1. Deleting an item removes its main image, master, and every gallery photo + master + poster from disk; a shared master referenced elsewhere is retained; seed/external URLs are never touched.
2. Replacing an item's main image deletes the superseded owned file only.
3. Uploads above the megapixel/dimension cap are rejected with a clear 422; PHP memory does not spike on large images.
4. WebP uploads either work or are rejected at validation with a clear message — never a generic "corrupt image" after passing validation.
5. Gallery reorder is atomic via one request; orders stay contiguous.
6. Menu cards load thumbnails (`thumb_url`) where available; the item sheet loads full-res; measured card payload drops materially.
7. Admins can set alt text per photo; customer images render meaningful `alt`.
8. An admin can upload a ≤ configured-limit muted clip with an auto-captured poster; it autoplays muted+looping in the item sheet on Chrome and iOS Safari; menu cards show only the poster.
9. The service worker does not cache video; stale video never blocks playback; bumping `CACHE_VERSION` ships cleanly.
10. All existing menu/photo/upload tests remain green; new Media tests pass.

---

## 13. Cursor execution sequence

**Stage A1 — File cleanup**
Goal: observers + `MediaFileCleaner`, replace-cleanup, refactor `ItemPhotoController::destroy`.
Files: observers, `MediaFileCleaner`, `AppServiceProvider`, `ItemController::update`, `ItemPhotoController`.
Tests: `ItemPhotoCleanupTest`, `ItemImageReplaceCleanupTest`. Run full backend suite.
Commit: "media: clean up orphaned image files on delete/replace".

**Stage A2 — Upload limits + WebP guard + config**
Files: `config/menu_media.php`, `ImageCapabilities`, `MenuImageProcessor` (pixel guard), Store/Update requests, `ImageUploadController`.
Tests: `ImageUploadLimitsTest`. Commit: "media: cap decompression + fix webp validation".

**Stage A3 — Atomic reorder**
Files: `catalog.php`, `ItemPhotoController::reorder`, `PhotosTab.tsx`, admin `menu.ts`.
Tests: `ItemPhotoReorderTest`. Commit: "media: atomic gallery reorder".

**Stage B1 — Thumbnails**
Files: migration, `MenuImageProcessor::storeThumbnail`, controllers, backfill command, customer `ProductCard`/types.
Tests: `ThumbnailGenerationTest`. Commit: "media: card thumbnails".

**Stage B2 — Alt text**
Files: `PhotosTab.tsx`, both `ItemPhoto` types, customer slider `alt`.
Tests: admin alt test. Commit: "media: editable alt text".

**Stage B3 — Prune command**
Files: `PruneUnreferencedMedia`, `console.php`. Commit: "media: scheduled orphan prune".

**Stage C1 — Video backend**
Files: migration, `StoreItemVideoRequest`, `ItemPhotoController` video branch, `VideoStorage`/`storeRaw`, observer poster cleanup, config.
Tests: `ItemVideoUploadTest`. Commit: "media: item video upload (backend)".

**Stage C2 — Video admin UI**
Files: `PhotosTab.tsx` (video picker + poster capture), admin `menu.ts`.
Tests: admin video test. Commit: "media: video upload UI + poster capture".

**Stage C3 — Video customer playback + SW**
Files: `itemMedia.ts` (typed slides), `MenuImageSlider`, `ProductCard`, `ItemSheet`, customer types, `sw.js` (+ `CACHE_VERSION`).
Tests: slider/video + itemMedia tests. Manual: iOS Safari + Chrome autoplay, card poster-only.
Commit: "media: autoplay video clips in item sheet".

**(Optional) Stage B4 — Category crop pipeline** — separate PR after C.
