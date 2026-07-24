# Central Media Library — Implementation Plan

**Status:** Ready to build
**Goal:** One page that catalogs **all** multimedia in the system, lets admins upload any media type
(image / video / audio / PDF), and lets that media be **reused anywhere without re-uploading** — all
**without changing any existing upload screen**. Existing uploaders keep working exactly as they do;
the library sits alongside them, auto-catalogs what they produce, and adds an optional
"Pick from Library" button beside them.

Section 1 is a **verified audit**. Section 2 is the **gap analysis**. Sections 3–9 are the **build**.
Section 10 is testing; Section 11 is deploy/rollback.

---

## 1. Verified audit — how media works today

**There is no central media model or table.** Every uploader processes a file, stores it on the
`public` disk, and saves only the resulting path/URL onto its own entity.

### 1.1 Upload surfaces (all independent)
| Surface | Handler | Persisted on |
|---|---|---|
| Menu item main photo + gallery (image **and** video) | `app/Http/Controllers/Api/ItemPhotoController.php`, `item_photos` table | `items.image_url` / `items.thumb_url`, `item_photos.url` |
| Category images | `app/Http/Controllers/Api/CategoryController.php` | category record |
| Banners / logos | `app/Http/Controllers/Api/SiteSettingsController.php`, `ImageUploadController` (`purpose=banner`) | SiteSetting values |
| Content Studio images + hero video | `app/Http/Controllers/Api/ContentController.php` (`site/{scope}/…`, `site/video`, mp4/webm) | content blocks |
| Generic admin image upload | `app/Http/Controllers/Api/ImageUploadController.php` (`POST /api/admin/upload-image`) | returns a URL for the caller to store |
| Operational (expense receipts, purchase docs, driver proof, kitchen photos, customer avatar) | various controllers | those records |

### 1.2 Storage + processing
- Disk: **`public`** (`config/filesystems.php:43` → `storage/app/public`, served at `APP_URL/storage/...`).
- Folders in use: `menu/`, `menu/masters/`, `menu/thumbs/`, `menu-banners/`, `content/`,
  `site/{scope}/…`, `site/video/`, `item_photos/`.
- Central image processing: `app/Services/MenuImageProcessor.php` (crop 1200×900 / banner 1400×600,
  master + thumbnail). Video posters already generated in `ContentController::uploadVideo`.
- Cleanup already exists: `app/Console/Commands/PruneUnreferencedMedia.php`,
  `app/Support/MediaFileCleaner.php` — useful references for reference-safety.

### 1.3 Existing schema to model on
`item_photos` (`2026_03_10_800000_…`, `…120522_add_video_support`): `url`, `alt_text`, `sort_order`,
`is_primary`, `media_type` (`image|video`), `poster_url`. The new catalog generalises this.

### 1.4 What does NOT exist
- ❌ No catalog of uploaded media; no way to browse everything in one place.
- ❌ No reuse — the same photo uploaded for two items is stored twice.
- ❌ No audio or PDF handling anywhere.
- ❌ No "where is this used" lookup; deletes rely on the prune command.

---

## 2. Gap analysis vs. the goal

| Need | Today | To build |
|---|---|---|
| View all media in one page | none | `media_assets` catalog + Media Library page |
| Upload any type | images everywhere; video in 2 spots | unified upload (image/video/audio/PDF) in the library |
| Reuse without re-uploading | none | catalog + optional "Pick from Library" picker beside existing uploaders |
| Don't disturb existing uploaders | — | auto-register via a storage reconciler (zero UI change) |
| See old media too | — | one-time backfill scan |

**Owner decisions locked:** additive "Pick from Library" button (existing uploaders untouched);
support **image + video + audio + PDF**; **backfill** all existing media; **admin-defined
Collections** for categorising (Banners, Logos, Falcon, Drinks, …); **image editing tools** (convert
format, resize, crop/re-crop, rotate, regenerate thumbnail, optimize) with an **"ask each time"** edit
model (Replace everywhere + master backup, or Save as new copy).

---

## 3. Data model — `media_assets` (new)

Migration `create_media_assets_table`:
| Column | Type | Notes |
|---|---|---|
| `id` | bigint pk | |
| `disk` | string(32) | default `public` |
| `path` | string(500) | relative path on disk; **unique** |
| `media_type` | string(16) | `image` \| `video` \| `audio` \| `document` |
| `mime_type` | string(100) | |
| `file_size` | unsignedBigInteger | bytes |
| `width`, `height` | unsignedInteger nullable | images/video |
| `duration_seconds` | unsignedInteger nullable | video/audio |
| `thumb_url` | string(500) nullable | poster for video, thumb for image, icon otherwise |
| `original_url` | string(500) nullable | image master for re-crop |
| `title` | string(200) nullable | display name (defaults to filename) |
| `alt_text` | string(300) nullable | accessibility / SEO |
| `tags` | json nullable | free tags for filter/search |
| `source` | string(32) | origin: `library`,`menu`,`banner`,`content`,`gallery`,`category`,`other` |
| `checksum` | string(64) nullable | sha256 for dedupe |
| `uploaded_by` | FK users nullable | |
| timestamps | | |

Indexes: unique(`path`), index(`media_type`), index(`source`), index(`checksum`).
`Media` Eloquent model with a `url` accessor (`Storage::disk($disk)->url($path)`), scopes
(`ofType`, `search`).

> **Dedupe:** on upload, if a row with the same `checksum` exists, return the existing asset instead
> of storing a duplicate — that is the "no need to upload again" guarantee at the storage level too.

---

## 3B. Collections (admin-defined categories)

The `source` field is auto-filled origin; **Collections** are the admin's own categories (exactly the
kind you named: Banners, Logos, Falcon, Drinks, …). An asset can belong to **many** collections.

- Migration `create_media_collections_table`: `id`, `name` (unique), `slug`, `description` nullable,
  `sort_order`, timestamps.
- Migration `create_media_asset_collection_table` (pivot): `media_asset_id`, `media_collection_id`,
  unique together.
- `MediaCollection` model with `assets()` belongsToMany; `Media::collections()`.
- Seed a starter set from the audit's known purposes: **Banners, Logos, Menu Items, Drinks,
  Backgrounds, Documents** (admin can rename/add/delete any).
- The library filters by collection; the picker can be opened pre-filtered to a collection (e.g. the
  banner field's "Pick from Library" opens the **Banners** collection first).

---

## 4. Auto-registration WITHOUT touching uploaders

The existing upload screens must not change. Two zero-touch mechanisms keep the catalog current:

1. **Storage reconciler** — `MediaLibraryService::reconcile()` walks the known public-disk media
   directories (§1.2) plus `item_photos`, upserts a `media_assets` row for any file not yet cataloged
   (keyed by `path`), infers `media_type` from mime, extracts width/height/duration, and links a
   thumbnail/poster if a sibling exists. Idempotent. This is also the **backfill** (§8).
   - Skip derived files (masters/thumbs/posters) as primary rows — attach them to their parent.
   - Run: on-demand ("Sync" button in the library), on a schedule (add to `routes/console.php`), and
     once at deploy for backfill.
2. **Optional inline hook** (nice-to-have, still no UI change): call
   `MediaLibraryService::registerPath($path, $source)` from the shared `MenuImageProcessor` store
   methods and `ContentController::uploadVideo` so new uploads appear **instantly** rather than at the
   next reconcile. Backend-only; the upload screens are unchanged.

---

## 5. Upload handling by type (in the library)
`MediaLibraryController::store` accepts one or more files and routes by kind:
- **Image** → reuse `MenuImageProcessor` (processed + thumbnail + optional master); `media_type=image`.
- **Video** (mp4/webm, reuse `ContentController` limits ≤50 MB) → store raw + generate a **poster**
  (reuse the existing poster path); `media_type=video`, `thumb_url=poster`.
- **Audio** (mp3/mpeg/wav, cap e.g. ≤20 MB) → store raw; `media_type=audio`; `thumb_url` = a static
  audio icon; capture `duration_seconds` if the encoder lib is available (best-effort).
- **Document** (application/pdf, cap e.g. ≤20 MB) → store raw; `media_type=document`; `thumb_url` = a
  static PDF icon (first-page render is a backlog nicety, not required).
- Validate mime per type (reuse `MenuImageValidation` for images); reject unknown types with 422.
- Compute `checksum`; dedupe (§3). Set `source=library`, `uploaded_by`.

---

## 5A. Image editing tools

Editing applies to **images** (GD, already used by `MenuImageProcessor`). Video/audio/PDF support only
metadata edits + poster/thumbnail regeneration — no in-browser media editing.

Tools (all operate on the asset; the full-frame **master** is kept for lossless re-crop/undo):
- **Convert format** — JPEG ⇄ PNG ⇄ WebP (WebP only when `ImageCapabilities::supportsWebp()`; else a
  clear message, matching the existing uploader behaviour).
- **Resize** — scale to a preset (e.g. 1200×900, 1400×600, 512, 256) or custom width/height (keep
  aspect option).
- **Crop / re-crop** — reuse the existing crop pipeline against the retained master
  (`original_url`); same ratios the uploaders use, plus free crop.
- **Rotate / flip** — 90° left/right, horizontal/vertical flip.
- **Regenerate thumbnail / poster** — re-run `MenuImageProcessor::storeThumbnail` (image) or the video
  poster step, on demand.
- **Optimize** — re-encode at a chosen quality to shrink file size.

### 5A.1 "Ask each time" save model (owner decision)
On applying any edit the admin chooses:
- **Replace everywhere** — write the edited file, then update every reference the
  `MediaUsageResolver` (§7) reports so all places using it get the new version. Before overwriting,
  copy the current file to a **master backup** (`…/masters/…` or a `media_asset_versions` row) so the
  edit is **undoable**. If the format/extension changes, update the stored URL on each referencing
  record too (that is why the usage resolver must cover every reference location).
- **Save as new copy** — create a brand-new `media_assets` row from the edited output; the original
  and everything using it are untouched. The admin re-points places via the picker if desired.

> Keep at least one previous version (backup) per asset so "Replace everywhere" is reversible. A
> lightweight `media_asset_versions` table (`media_asset_id`, `path`, `created_at`) is the clean way;
> expose an **Undo/Restore previous** action in the detail drawer.

### 5A.2 Editing API
- `POST /admin/media/{id}/edit` — body `{ op, params, mode: 'replace'|'copy' }` where `op` ∈
  `convert|resize|crop|rotate|thumbnail|optimize`. Returns the updated or newly-created asset. On
  `replace`, also updates referencing records (return the count updated). Audit-logged.
- `POST /admin/media/{id}/restore` — restore the previous version (replace mode only).

---

## 6. API (new — `admin/media`)
Gated by new permissions (see §9).
- `GET  /admin/media` — list with filters: `type`, `source`, `q` (title/alt/tags), `tag`, paginated
  (25/page), newest first. Returns `url`, `thumb_url`, type, size, dimensions, title, alt, tags, usage
  count (cheap — see §7).
- `POST /admin/media` — multi-file upload (§5). Returns the created/deduped asset(s).
- `PATCH /admin/media/{id}` — edit `title`, `alt_text`, `tags`.
- `DELETE /admin/media/{id}` — **reference-safe**: refuse (409) if in use (§7) unless `?force=1`;
  on delete, remove the file(s) via `MediaFileCleaner`.
- `POST /admin/media/reconcile` — run the reconciler/sync (§4).
- `GET  /admin/media/{id}/usage` — where the asset is used (§7).
- `POST /admin/media/{id}/edit`, `POST /admin/media/{id}/restore` — editing (§5A.2).

**Collections (§3B):**
- `GET/POST /admin/media/collections`, `PATCH/DELETE /admin/media/collections/{id}` — manage categories.
- `POST /admin/media/{id}/collections` `{ collection_ids: [] }` — set an asset's collections.
- List (`GET /admin/media`) accepts a `collection` filter.

All writes audit-logged via `AuditLogService`.

## 7. "Where is this used" (usage resolver)
`MediaUsageResolver::for(Media $m)` checks the known reference locations by URL/path:
`items.image_url`/`thumb_url`, `item_photos.url`/`poster_url`, category image column, content blocks,
and SiteSetting banner/logo keys. Returns a list of `{type, label, id}`. Used for the usage count in
the list, the detail drawer, and delete-safety. (Read-only scans; no schema change to those tables.)

## 8. Backfill (one-time)
`php artisan media:backfill` = `MediaLibraryService::reconcile()` over all media dirs + `item_photos`
+ content + banner settings, tagging each row's `source` by folder. Idempotent (safe to re-run).
Run once at deploy so the library is full from day one.

---

## 9. Permissions (PermissionCatalog)
| Slug | Meaning |
|---|---|
| `media.view` | Browse the Media Library + pick from it |
| `media.manage` | Upload, edit metadata, delete, reconcile |

`SATISFIED_BY`: both satisfied by `website.manage` (and `menu.manage` for `media.view`) so existing
content/menu managers keep access. Resync migration seeds them; owner/manager/content roles get
`media.manage`.

---

## 10. Frontend

### 10.1 Media Library page (admin)
`apps/admin-dashboard/src/pages/MediaLibraryPage.tsx` (+ route + nav under Content/Website). Features:
- **Type tabs:** All / Images / Video / Audio / Documents (+ source filter + search + tag filter).
- **Collections sidebar** (§3B): filter by admin-defined category (Banners, Logos, Falcon, Drinks…),
  with add/rename/delete-collection controls (behind `media.manage`).
- **Grid** of thumbnails (poster for video, icon for audio/PDF), infinite scroll / pagination.
- **Upload dropzone** — multi-file, multi-type, progress; shows dedupe ("already in library");
  optional "add to collection" on upload.
- **Detail drawer:** large preview (img/`<video>`/`<audio>`/PDF embed), editable title/alt/tags,
  **collection membership** (multi-select chips), **Copy URL**, **Used in** list, **Delete**
  (blocked with a list if in use).
  - **Edit tools** (images only, §5A): convert format, resize, crop/re-crop, rotate, regenerate
    thumbnail, optimize — a simple editor panel/modal (reuse the existing crop UI where present). On
    **Save**, prompt **Replace everywhere** vs **Save as new copy**; show how many places were updated
    on replace, and offer **Restore previous** afterward.
- Gate actions by `media.manage`; viewers with `media.view` get read-only + Copy URL + Pick.

### 10.2 Reusable picker (additive — existing uploaders untouched)
`apps/admin-dashboard/src/components/MediaPicker.tsx` — a modal that browses the library and returns a
selected asset (url + id). Add a small **"Pick from Library"** button **beside** (not replacing) the
current upload control in the key spots:
- Menu item photo + gallery, Category image, Banner/logo settings, Content Studio image + video.
- The button opens `MediaPicker`; on select it fills the same field the manual upload already writes,
  so **the existing upload flow is completely unchanged** — this is purely an added shortcut.
- pos-web/other apps out of scope for the picker; the library is admin-only.

> Because every target field already accepts a URL/path, "Pick from Library" only needs to set that
> value — no rework of the existing upload components.

---

## 11. Build order
1. Migrations: `media_assets`, `media_collections` + pivot, `media_asset_versions`; `Media` /
   `MediaCollection` models; permissions + resync migration.
2. `MediaLibraryService` (reconcile/register/store/dedupe) + `MediaUsageResolver` + `MediaEditor`
   (convert/resize/crop/rotate/thumbnail/optimize, replace-vs-copy, version backup/restore).
3. `MediaLibraryController` + `MediaCollectionController` + routes + audit.
4. Optional inline registration hooks in `MenuImageProcessor` + `ContentController::uploadVideo`.
5. `media:backfill` command + scheduled reconcile; seed starter collections.
6. Admin: Media Library page (collections sidebar + type tabs) + edit modal + API client.
7. Admin: `MediaPicker` + additive "Pick from Library" buttons (collection-prefiltered) in the spots.

**Invariants:**
- **No existing upload screen changes behaviour** — only an extra button is added beside them.
- Deleting an in-use asset is blocked unless forced (protects the reuse promise).
- Uploading a duplicate (same checksum) returns the existing asset — never stores twice.
- Everything is additive: new table, new page, new buttons. Deploy is behaviour-neutral until used.

---

## 12. Testing
**Backend (PHPUnit, sqlite, RefreshDatabase):**
- `MediaLibraryServiceTest`: reconcile catalogs files idempotently; media_type inferred by mime;
  checksum dedupe returns existing row; derived files (thumbs/masters/posters) not listed as primaries.
- `MediaLibraryControllerTest`: list filters by type/source/search + paginates; upload of each type
  (image/video/audio/pdf) creates a row with correct type + thumb; PATCH edits metadata;
  DELETE blocked (409) when in use, allowed with force; reconcile endpoint; permission gates
  (`media.view` vs `media.manage`).
- `MediaUsageResolverTest`: an asset used as an item image / banner / content block is reported;
  an unused asset reports empty.
- `MediaCollectionTest`: create/rename/delete collections; assign an asset to multiple collections;
  list filters by collection.
- `MediaEditTest`: convert (jpeg→webp when supported), resize, crop (from master), rotate,
  regenerate thumbnail, optimize each produce the expected output; **replace** mode overwrites the
  file, keeps a version backup, and updates every referencing record (assert the count + that a
  format change rewrites the referencing URLs); **copy** mode creates a new asset and leaves the
  original + references untouched; **restore** brings back the previous version.
- Back-compat: existing upload endpoints (`ItemPhotoController`, `ContentController`,
  `ImageUploadController`) behave exactly as before (their tests still pass; add one asserting an
  upload also appears in `media_assets` when the inline hook is enabled).

**Frontend (Vitest):** library grid renders + filters; upload calls the API and shows dedupe;
MediaPicker returns a selection; "Pick from Library" fills a field without altering the manual upload;
actions gated by permission. Run from repo **root** (`npm ci`) then
`cd apps/admin-dashboard && npm test -- --run && npm run build`.

Backend: `cd backend && php artisan test`.

---

## 13. Deploy / rollback
**Deploy (cPanel):**
- `php artisan migrate --force` (media_assets + permissions).
- `php artisan storage:link` (if not already) so `/storage` serves files.
- `php artisan media:backfill` (one-time catalog of existing media).
- `php artisan config:cache`.
- Rebuild + sync `backend/public/admin`.

**Safety:** purely additive — new table, new page, new optional buttons; existing uploaders and their
storage paths are untouched. Rollback = revert the release; the `media_assets` table is harmless if
left (no other table references it). Files on disk are never moved or renamed by this feature.

---

## Appendix — media type detection
`image/*` → image · `video/mp4`,`video/webm` → video · `audio/mpeg`,`audio/mp3`,`audio/wav` → audio ·
`application/pdf` → document. Everything else → reject (422) until explicitly added.
