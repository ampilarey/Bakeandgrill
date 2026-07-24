# iPhone Media Upload Fix — Implementation Plan

**Status:** Ready to build
**Symptom:** Media taken on an iPhone can't be uploaded.
**Root cause:** iPhones save photos as **HEIC/HEIF** and videos as **QuickTime `.mov`** — formats the
system rejects, and (for HEIC) that the server physically cannot decode.

Section 1 is the **verified audit**. Section 2 is the **fix**. Section 3 is tests; Section 4 deploy.

---

## 1. Verified audit — why iPhone media fails

### 1.1 HEIC photos are rejected at validation (all upload paths)
- Allowed image types are only `image/jpeg`, `image/png`, `image/webp`
  (`app/Support/MenuImageValidation.php` → `allowedMimeTypes()` / `allowedMimes()`, backed by
  `config/menu_media.php:16-17` `mimes`/`mime_types`). HEIC/HEIF is absent → **422**.
- Laravel's `'image'` + `dimensions` rules use `getimagesize()`, which does not recognise HEIC either.
- Every uploader funnels through this: `ItemPhotoController` (`MenuImageValidation::fileRules`),
  `ImageUploadController`, `CategoryController`, `ContentController`, and the new **Media Library**
  (`MediaLibraryService` validates images via `MenuImageValidation::allowedMimeTypes()`).

### 1.2 The server cannot decode HEIC even if allowed
- Probe of this runtime: **GD present, Imagick absent**, no libheif. `grep` finds no `imagick`/`heic`
  reference in `backend/`.
- `app/Services/MenuImageProcessor.php` decodes with **GD** (`imagecreatefromjpeg/png/webp`). GD has
  **no HEIC decoder**. So whitelisting HEIC alone would let the upload pass validation and then fail
  during processing. HEIC must be **converted to JPEG before GD sees it**.

### 1.3 iPhone `.mov` videos are rejected
- Video validation allows only `video/mp4`, `video/webm`:
  - `config/menu_media.php:35-36` (`mimetypes`, `extensions`) used by `ItemPhotoController` gallery.
  - `ContentController::uploadVideo` → `'mimetypes:video/mp4,video/webm'` (hard-coded).
  - `MediaLibraryService` → `in_array($mime, ['video/mp4','video/webm'])`.
- iPhone records **`video/quicktime` (`.mov`)** → rejected.

### 1.4 Secondary: EXIF orientation
- iPhone photos encode rotation in EXIF. GD does **not** auto-rotate, so converted/processed photos
  can appear sideways. `MenuImageProcessor` does not currently apply EXIF orientation.

---

## 2. The fix

Server is **GD-only** and host-side Imagick+libheif is unreliable on shared cPanel, so **convert HEIC
in the browser** (works regardless of server), **accept `.mov`** server-side, and **auto-orient**
photos during processing.

### 2.1 Client-side HEIC → JPEG (admin-dashboard + pos-web)
- Add a browser HEIC decoder dependency at the **workspace root** (so it hoists to both apps):
  `heic2any` (or `heic-to`). Root `npm install`, committed to the root lockfile.
- Add a shared helper in each app, e.g. `src/utils/prepareUpload.ts`:
  ```ts
  // Converts HEIC/HEIF File → JPEG File; returns other files unchanged.
  export async function prepareImageForUpload(file: File): Promise<File>
  ```
  Detect HEIC by `file.type` (`image/heic`, `image/heif`) OR extension (`.heic`, `.heif`) — iOS often
  sends an empty/generic MIME, so **extension check is required**. Convert to JPEG (quality ~0.9),
  preserve the base filename with a `.jpg` extension. Wrap in try/catch: on conversion failure show a
  clear message ("Couldn't read this iPhone photo — in iPhone Settings → Camera → Formats choose 'Most
  Compatible', or try again.").
- **Apply it at every image upload call site** before building `FormData`:
  - admin-dashboard: `pages/MenuPage/PhotosTab.tsx`, `menuFormPrimitives.tsx`,
    `components/content-editors/HeroSlidesEditor.tsx`, `api/media.ts`, `api/menu.ts`, `api/content.ts`,
    `api/settings.ts` (banners/logos), and the Media Library upload dropzone.
  - pos-web: any item-photo/image upload path.
  Centralise by routing uploads through the helper (e.g. call it inside the shared upload API
  functions so no call site is missed).
- Add `accept="image/*,.heic,.heif"` (and `,.mov,video/quicktime` where video is accepted) to the file
  `<input>`s so the iOS picker offers these files in the first place.

### 2.2 Accept `.mov` server-side (store as-is)
- `config/menu_media.php`: `video.mimetypes` → add `video/quicktime`; `video.extensions` → add `mov`.
- `ContentController::uploadVideo`: change the rule to
  `mimetypes:video/mp4,video/webm,video/quicktime` and allow the `mov` extension (extension-normalise
  block already picks `mp4` fallback — extend it to keep `mov`).
- `MediaLibraryService`: add `video/quicktime` to the video mime check and `mov` to the extension map
  (`extensionForMime`/`detectType`). Poster generation from `.mov` may not work under GD — fall back
  to a generic video icon poster when a frame can't be extracted (do not fail the upload).
- Cap unchanged (existing size limits). No transcoding (that would need ffmpeg — out of scope; Safari
  and most modern browsers play H.264 `.mov`).

### 2.3 EXIF auto-orientation (photos not sideways)
- In `MenuImageProcessor`, before cropping/resizing, read EXIF orientation with `exif_read_data()`
  (guard `function_exists('exif_read_data')`) and apply the matching `imagerotate()` / `imageflip()`
  to the GD resource. Strip orientation after rotating so it isn't double-applied. Apply to both the
  processed image and the thumbnail path.

### 2.4 Server messaging for stray HEIC (belt-and-suspenders)
- If a raw HEIC still reaches the server (old cached client, API caller), keep rejecting it but return
  a **specific** message via `MenuImageValidation` (e.g. "iPhone HEIC photos aren't supported directly —
  they're converted automatically in the app; if you're seeing this, refresh and retry."). Do **not**
  attempt GD decode of HEIC.

> Optional (only if the host later adds Imagick+libheif): a server-side HEIC→JPEG branch in
> `MenuImageProcessor` gated on `extension_loaded('imagick')` && Imagick HEIC support. Not required —
> the client conversion already solves it. Flagged as backlog.

---

## 3. Testing

**Frontend (Vitest):**
- `prepareImageForUpload`: a `.heic` File (mocked converter) returns a `image/jpeg` File with a `.jpg`
  name; a JPEG/PNG passes through unchanged; a conversion error surfaces the friendly message.
- An upload component calls `prepareImageForUpload` before sending (spy on the converter).

**Backend (PHPUnit):**
- Video upload accepts a `video/quicktime` `.mov` (content, gallery, media library) and stores it;
  still accepts mp4/webm; rejects an unrelated type.
- `MediaLibraryService` classifies `.mov` as `video` and doesn't crash when a poster can't be made.
- `MenuImageProcessor` applies EXIF orientation: a portrait JPEG with orientation=6 comes out upright
  (assert width/height swap or a pixel probe).
- Image validation still rejects HEIC server-side but with the new specific message.

Run backend: `cd backend && php artisan test`. Frontend from repo **root** (`npm ci`) then each app's
`npm test -- --run && npm run build`.

---

## 4. Deploy / rollback
- Pure additive change: more accepted formats + browser conversion + EXIF orientation. No schema
  changes.
- Rebuild + sync `backend/public/admin` and `backend/public/pos`; bump the pos SW `CACHE_VERSION`
  (clients must load the new JS that does the conversion).
- Rollback = revert the release. Nothing persisted changes shape.
- **iPhone user tip** (support note, not code): Settings → Camera → Formats → **Most Compatible** makes
  iPhones capture JPEG/H.264 directly — a zero-code workaround while the fix rolls out.

---

## Appendix — where each format is gated (quick reference)
- Image mimes: `config/menu_media.php` + `app/Support/MenuImageValidation.php`.
- Video mimes: `config/menu_media.php` (gallery) + `ContentController::uploadVideo` (hard-coded) +
  `MediaLibraryService` (hard-coded).
- Image decode/process: `app/Services/MenuImageProcessor.php` (GD).
- Frontend upload sites: listed in §2.1.
