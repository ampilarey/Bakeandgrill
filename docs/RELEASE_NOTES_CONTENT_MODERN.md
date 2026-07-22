# Release notes — Content Studio modern + related main merges

**Branch tip on `main`:** `78800bf0`  
**Merge commit:** `dde0dd73` — `merge: content studio modern upgrade + item-media + procurement Phase 3 + flaky-test fix`

Conflict-free fast-forward of work that was strictly ahead of `main` (0 behind). Verified green before push.

---

## What shipped

### Two-editor Content Studio + modern upgrade
- Separate **Website Content** and **Order App Content** editors (scope model, EN/DV, copy-from, history, schedule, import/export retained).
- **Unlimited repeaters** with accessible drag-and-drop / keyboard reorder + duplicate (no `.slice` caps).
- **`hero_slides` array** with migration seeding from legacy `hero_slide_1/2/3`; Blade + order app loop the array with `_1/_2/_3` fallback.
- Interactive **crop + focal point + master** image upload (reuses Menu `ImageCropModal` / `MenuImageProcessor`); optional muted hero video.
- Staff-token **Desktop/Mobile live preview** of the real website (Blade) and order app with draft overlay (drafts never public).
- **WYSIWYG** for rich blocks (`ContentSanitizer` server-side); **autosave drafts** → explicit **Publish**; unsaved-changes guard.
- Polish: category **alt text**, SEO snippet + counters, revision **diff + restore**, **media library**, skeletons.

### Item media (gallery-only for customers)
- Staff keep a dedicated main/thumbnail image; customers see the **gallery only** (staff vs customer media split).

### Procurement Phase 3
- Multi-quote capture + cheapest-pick, analytics report, wastage-aware reorder (plus related settings/migrations).

### Flaky-test fix
- Wave8 shift-variances clock pin (earlier) and Content Studio vitest flake fix (no fake timers in autosave suite; longer waitFor on two-editor cases). Post-merge pint fix on `ContentWebsitePreviewController`.

---

## Final verify counts (merged `main`)

| Suite | Result |
|---|---|
| Backend `pint --test` | PASS (1326 files) |
| Backend `php artisan test` | **1540 passed**, 3 skipped |
| Admin `npm test -- --run` | **91 passed** (33 files) |
| Admin `npm run build` | OK |
| Order `npm test -- --run` | **90 passed** (27 files) |
| Order `npm run build` | OK |
| `backend/public/{admin,order}` vs built dist | **Match** (no resync needed) |

---

## Deploy — cPanel TEST server

Do **not** run these from the agent; paste on `sg-s2` / test install:

```bash
cd /home/bakeandgrill/test.bakeandgrill.mv && git pull origin main && cd backend && php artisan migrate --force && php artisan storage:link && php artisan config:cache && php artisan route:cache && php artisan view:clear && php artisan queue:restart && git log -1 --oneline
```

**Notes**
- Order-app service worker bumped → customers pick up the new bundle after refresh / SW update.
- Several **new migrations** run: `hero_slides` seed, content `is_draft` / `published_at`, procurement quotes + settings, media columns.
- Prefer a **full** deploy (migrate + caches) for this tip — not a UI-only quick pull.
- Expected tip after pull: `78800bf0` (or newer if further commits land on `main`).

Production / live (`public_html`) only when explicitly requested.
