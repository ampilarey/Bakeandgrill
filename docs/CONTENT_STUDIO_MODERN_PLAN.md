# Content Studio — Modern Editing Upgrade (no limits, drag-drop, crop, live preview, WYSIWYG)

**Repository:** `ampilarey/Bakeandgrill`
**Branch:** `claude/content-studio-modern-plan` (builds on `claude/content-studio-two-editors-plan`)
**Status:** Plan only — no feature code written yet.
**Author's note:** Separates **VERIFIED findings** (files read) from **RECOMMENDATIONS**.

## 0. Goal

Turn the two separate app editors (Website / Order App) into a genuinely modern content studio:
**no item limits**, drag-and-drop repeaters, interactive image cropping + focal point (reusing the
menu-item media tools), **real desktop/mobile live preview** of the actual page, inline WYSIWYG
rich text, and a proper draft → publish flow with autosave. Reuse everything that exists; the only
customer-facing structural change is consolidating the hero into a flexible array.

## 1. Verified findings (current state)

| Area | Path | State today |
|---|---|---|
| Two-editor UI | `apps/admin-dashboard/src/pages/ContentStudio/AppContentEditor.tsx` (608), `CopyFromOtherApp.tsx` | per-app editors, write to `website`/`order_app` scope, copy-from |
| Visual editors | `apps/admin-dashboard/src/components/content-editors/*` | `HeroSlideEditor`, `CategoriesEditor`, `TrustItemsEditor`, `ProofDetailsEditor`, `AboutValuesEditor`, `PreorderStepsEditor`, `FooterLinksEditor`, `BusinessHoursEditor`, `VisualBlockPreview` |
| **Hardcoded limits (BUG per goal)** | those editors | `.slice(0, N)`: categories 4, trust 4, about 4, proof 3, preorder 3 |
| **Hero fixed at 3** | `backend/config/content.php` (`hero_slide_1/2/3`), `backend/resources/views/home.blade.php` (reads `hero_slide_{i}` 1..3), `apps/online-order-web/src/context/SiteSettingsContext.tsx` (`heroSlides` parser reads _1/_2/_3) | three separate keys |
| Reorder | editors | up/down arrows only |
| Preview | `content-editors/VisualBlockPreview.tsx` (161) | hand-built mini-mock; **no device sizes**, not the real page, covers few blocks |
| Content image upload | `backend/app/Http/Controllers/Api/ContentController.php::upload` | auto center-crop 1200×900 + thumbnail via `MenuImageProcessor`; **no interactive crop, no focal point, no master** |
| Item media tools (reuse) | `apps/admin-dashboard/src/pages/MenuPage/{ImageCropModal,cropImage,PhotosTab,mediaUrl}.tsx`; `backend/app/Services/MenuImageProcessor.php` (crop+thumb+master), item video pipeline (`ItemPhotoController`, poster, sw.js video guard) | interactive crop, master, gallery, video with poster |
| Rich text | `content-editors/*`, `backend/app/Support/ContentSanitizer.php` | raw HTML in textarea; server sanitizes allowed tags |
| Drafts/versioning | `content_revisions`, `content_schedules`, `ContentController` revisions/schedule | revisions + scheduled publish exist; no autosave, no explicit draft state, no visual diff |
| Alt text | image fields | images stored without alt; customer renders `alt=""` |

## 2. Phase 1 — Unlimited repeaters + drag-and-drop + duplicate (the "no limits" ask)

- **Remove all `.slice(0, N)`** caps in `content-editors/*` — add/remove/reorder **unlimited** items.
- **Drag-and-drop reordering** (replace arrow buttons). Use a small, dependency-light DnD approach
  (HTML5 drag events or an already-present lib — do not add heavy deps); keyboard-accessible move
  fallback retained for a11y.
- **Duplicate / clone** an item (slide, card, value, step, link).
- **Hero → flexible array (structural, both apps):**
  - New registry block `hero_slides` (`type: json`, `editor: hero`, array of slide objects
    `{image, image_focal_x/y, eyebrow, title, subtitle, cta_text/url, cta2_text/url, video?}`),
    unbounded.
  - **Migration** seeds `hero_slides` from existing `hero_slide_1/2/3` per scope+locale (data
    carry-over); keep old keys briefly as deprecated (read-fallback) then stop reading them.
  - **Website reader** `home.blade.php`: loop `hero_slides` array (fallback to `_1/_2/_3` if array
    empty during transition).
  - **Order-app reader** `SiteSettingsContext.tsx` `heroSlides`: parse the array (fallback to
    _1/_2/_3).
  - **Parity tests** prove both apps render identically before/after with the same content.
- **Risk:** hero is the only customer-facing structural change — isolate it, ship with parity tests.

## 3. Phase 2 — Interactive crop + focal point + master; optional hero video

- **Reuse `ImageCropModal` + `cropImage.ts`** in content image fields (hero, categories, any image
  block) so admins position/zoom the crop instead of auto-center-crop.
- **Focal point** (x/y %) stored on the slide/image so responsive renders keep the subject centered.
- **Keep a high-res master** (like items' `image_original_url`) so content images are re-croppable;
  `ContentController::upload` already makes a thumbnail — add master storage + return it.
- **Optional hero video:** allow a muted-autoplay-loop background video on a hero slide, reusing the
  item video pipeline (upload + poster capture; the `sw.js` video guard already exists). Scope video
  to hero only (not every block).
- Cleanup superseded files via the existing `MediaFileCleaner` (already used by content upload).

## 4. Phase 3 — Real desktop/mobile live preview (iframe of the actual page)

- **Admin-only preview routes** that render the **real** page with the current draft injected:
  - Website: a signed, staff-token-gated route (e.g. `/admin/preview/website/home?draft=<token>`)
    that renders `home.blade.php` etc. resolving content from a **draft overlay** instead of
    published values.
  - Order app: a preview mode (`?previewToken=…`) where `SiteSettingsContext` loads draft content
    for staff.
  - Drafts must **never leak publicly** — signed short-lived token, staff permission enforced.
- **Admin preview pane** replaces `VisualBlockPreview`: an `<iframe>` with a **Desktop / Mobile
  toggle** (≈1280 / ≈390 widths) showing the live page; updates as drafts change (debounced reload
  or postMessage). Works for **both** apps.
- Covers the whole page, not a few block types.

## 5. Phase 4 — WYSIWYG rich text + draft/publish + autosave

- **Inline WYSIWYG** for `rich` blocks (bold/italic/link/lists) — a lightweight editor, output
  sanitized by the existing `ContentSanitizer` server-side (never trust client HTML).
- **Draft → Publish flow:** edits accumulate as a **draft** (autosaved every few seconds to a draft
  store or as unpublished revisions); an explicit **Publish** promotes the draft to live (busts
  cache). Reuse `content_revisions`; add a lightweight draft state.
- **Unsaved-changes guard** (warn on navigate-away) + "last saved" indicator.
- **Autosave** so nothing is lost mid-edit.

## 6. Phase 5 — Trust & polish (Tier 2)

- **Alt-text prompt on every image** (a11y/SEO); persist per image; customer renders real `alt`.
- **SEO snippet preview** for meta title/description with character counters + Google-style preview.
- **Visual revision diff + one-click restore** (reuse `content_revisions`).
- **Media library** — browse/reuse previously uploaded content images instead of re-uploading.
- **Optimistic saves, toasts, skeletons, empty states.**

## 7. Data model
- **New** registry block `hero_slides` (array); migration to seed it from `hero_slide_{1,2,3}` per
  scope+locale (additive; old keys deprecated, not dropped immediately).
- **Content image master + focal point:** store master URL + focal x/y in the image/slide JSON (no
  new columns needed — they live in the block JSON) or a small `content_media` table if a media
  library warrants it (Phase 5 decision).
- **Draft state:** reuse `content_revisions` (add an `is_draft`/`published_at` flag) rather than a
  new table if possible.
- No change to the scope model or the two-editor structure.

## 8. Backend files
- `backend/config/content.php` (modify — add `hero_slides`; keep `hero_slide_*` as deprecated)
- `backend/database/migrations/…_seed_hero_slides_from_legacy.php` (new)
- `backend/app/Http/Controllers/Api/ContentController.php` (modify — master on upload; draft/publish; preview draft resolution)
- `backend/app/Http/Controllers/Api/ContentPreviewController.php` (new — signed draft preview for website + order app)
- `backend/app/Domains/Content/ContentResolver.php` (modify — optional draft overlay for preview)
- `backend/resources/views/home.blade.php` + other hero readers (modify — loop `hero_slides`)
- `backend/app/Support/ContentSanitizer.php` (reuse for WYSIWYG output)
- `backend/routes/domains/staff.php` + `routes/web.php` (modify — preview routes)

## 9. Order-app files
- `apps/online-order-web/src/context/SiteSettingsContext.tsx` (modify — parse `hero_slides` array; draft preview mode)
- hero consumer components (modify — render N slides from the array)

## 10. Admin files
- `apps/admin-dashboard/src/components/content-editors/*` (modify — unlimited, DnD, duplicate; crop modal; WYSIWYG; alt-text)
- `apps/admin-dashboard/src/pages/ContentStudio/AppContentEditor.tsx` (modify — iframe preview pane w/ device toggle; autosave/draft-publish; unsaved guard)
- `apps/admin-dashboard/src/pages/ContentStudio/LivePreviewFrame.tsx` (new — iframe + device toggle)
- `apps/admin-dashboard/src/pages/ContentStudio/MediaLibrary.tsx` (new — Phase 5)
- reuse `pages/MenuPage/{ImageCropModal,cropImage,mediaUrl}.tsx`
- `apps/admin-dashboard/src/api/content.ts` (modify — draft/publish, preview token, master)

## 11. Testing
- **Phase 1:** unlimited add/remove/reorder; drag-drop reorder persists order; duplicate; hero
  migration seeds array; **parity — both apps render the same hero before/after** (backend +
  frontend). Regression: existing Content suite green.
- **Phase 2:** crop modal writes cropped image + master + focal point; hero video upload + poster;
  file cleanup on replace.
- **Phase 3:** preview route requires staff token; draft overlay renders draft not published;
  device toggle sets iframe width; drafts never public without token.
- **Phase 4:** WYSIWYG output sanitized; autosave persists draft; publish promotes draft + busts
  cache; unsaved guard.
- **Phase 5:** alt-text persists + renders; SEO counters; revision diff/restore; media library reuse.
- Frontend component tests for each editor; keep `ContentBladeParityTest` + two-editors tests green.

## 12. Rollout
Phases are independent commits in one branch. Only Phase 1 (hero array) touches customer rendering —
ship it with parity tests + a transition read-fallback. Preview/draft are admin-only. Deploy:
`migrate --force` (hero seed), rebuild admin + order dist, `config:cache`. Rollback per phase.

## 13. Acceptance criteria
1. No caps: admin can add unlimited hero slides, categories, trust items, proof, about values,
   preorder steps, footer links, and reorder them by drag-and-drop; both apps render all of them.
2. Content images crop interactively (position/zoom) with a focal point and a re-croppable master;
   hero supports an optional muted-autoplay video.
3. A Desktop/Mobile live preview shows the **real** page (website and order app) with the current
   draft; drafts never leak publicly.
4. Rich blocks edit via WYSIWYG (sanitized); edits autosave as a draft; Publish promotes them;
   navigating away warns about unsaved changes.
5. Every image has an alt-text field; SEO fields show length + snippet; revisions show a diff with
   one-click restore; a media library lets you reuse uploads.
6. At defaults both apps render exactly as before; all existing Content tests stay green.

## 14. Constraints (do not improvise)
- **Remove limits** — do not reintroduce caps; repeaters are unbounded.
- Hero array is the ONLY customer-facing structural change — isolate it, ship with parity tests and
  a legacy read-fallback during transition; never drop `hero_slide_*` data before it's migrated.
- Reuse item media tools (`ImageCropModal`, `cropImage.ts`, `MenuImageProcessor`, video pipeline) —
  do not build new croppers/uploaders.
- Preview must be **staff-token gated**; drafts must never be publicly reachable.
- WYSIWYG HTML must be sanitized **server-side** (`ContentSanitizer`) regardless of client.
- Keep the two-editor structure, scope model, EN/DV, copy-from, history, schedule, import/export.
- No heavy new frontend dependencies without justification; keep bundles lean; keep DnD accessible.

## Implementation notes

- **Draft store:** reused `content_revisions` with `is_draft` / `published_at` (migration
  `2026_07_23_030000_add_is_draft_to_content_revisions`). Autosave = `PUT /admin/content/drafts`
  (sanitized, never writes `SiteSetting`). Publish = existing `PUT /admin/content` which clears
  draft rows + busts cache.
- **WYSIWYG:** lightweight `contentEditable` (`RichTextEditor`); `ContentSanitizer` allow-list
  normalises `<b>`/`<i>` → `<strong>`/`<em>`.
- **Preview:** staff `preview-token` + signed Blade home + order `?previewToken=`; drafts never on
  public `/api/content`.
- **Media library:** filesystem scan of `storage/app/public/site*` (no new `content_media` table).
- **SEO:** paired title/description keys share one `SeoSnippetPreview`; lone `*_meta_description`
  blocks are hidden when the title pair exists.
- **Alt text:** hero slides (Phase 2) + homepage categories (`image_alt`); Blade + order
  `CategoryShortcuts` render it. Plain `type=image` URL blocks keep URL storage (alt via label /
  site name at render time) to avoid breaking string readers.
- **Fake timers:** admin autosave vitest uses fake timers only inside the autosave case to avoid
  cross-file `waitFor` timeouts.

## Build log

| Phase | Commit | Backend | Admin | Order |
|---|---|---|---|---|
| 1 unlimited + DnD + hero array | `5b7b085c` | ~1530 pass | green | green |
| 2 crop + focal + master + video | `2e4249db` | ~1531 pass | 84 | 89 |
| 3 desktop/mobile live preview | `ec098470` | 1535 pass / 3 skip | 84 | 89 |
| 4 WYSIWYG + autosave draft→publish | `daa3c90f` | 1538 pass / 3 skip | 88 | 89 |
| 5 polish (alt, SEO, diff, media) | (this commit) | **1540 pass / 3 skip** | **91** | **90** |

Final verify (Phase 5): `./vendor/bin/pint`, `php artisan test`, `npm test -- --run` + `npm run build`
in admin + order; `./scripts/build-all.sh admin order` synced `backend/public/{admin,order}`.

Branch: `claude/content-studio-modern-plan` — no PR opened (per brief).
