# Content Studio — Two Separate Editors (Website vs Order App) — Implementation Plan

**Repository:** `ampilarey/Bakeandgrill`
**Branch:** `claude/content-studio-two-editors-plan`
**Status:** Implemented on this branch.
**Approach:** **UI-only restructure** — no DB migration, no backend rebuild. The scope data model
already stores independent per-app values; we replace the confusing single mixed list with two
clean, self-contained editors and a "copy from the other app" action.
**Author's note:** Separates **VERIFIED findings** (files read) from **RECOMMENDATIONS**.

## 0. Problem & goal

**Problem (verified):** `apps/admin-dashboard/src/pages/ContentStudio/ContentStudioPage.tsx` (665
lines) shows **one mixed list** of blocks; each block has a `state` of `shared`|`split`, and a
global Website/Order-App tab that only matters for split blocks. To edit "the website" you must
reason about scope per block. Feels mixed and hard.

**Goal:** two fully separate editors — **Website** and **Order App** — each showing only its own
content, editing its own values directly, with a per-section / per-block **"Copy from the other
app"** button for when you want them identical. No "shared/split" concept exposed.

## 1. Verified findings (the data layer is already ready)

| Area | Path | Note |
|---|---|---|
| Current mixed UI | `apps/admin-dashboard/src/pages/ContentStudio/ContentStudioPage.tsx` | one list; `scopeForEdit`, `state==='split'` tabs, `splitContentBlock`/`shareContentBlock` toggles, global `appTab` |
| API client | `apps/admin-dashboard/src/api/content.ts` | `ContentBlock` already has `apps[]`, `website`, `order_app`, `resolved_website`, `resolved_order_app`, `shareable`, `state`; functions: `updateContent({key,scope,value,locale})`, **`copyContentBlock(key,from,to)`**, `uploadContentImage(key,scope,…)`, `getContentRevisions`, `scheduleContent`, `exportContent`/`importContent` |
| Visual editors (Stage 6) | `apps/admin-dashboard/src/components/content-editors/*` | `HeroSlideEditor`, `CategoriesEditor`, `TrustItemsEditor`, `ProofDetailsEditor`, `AboutValuesEditor`, `PreorderStepsEditor`, `FooterLinksEditor`, `BusinessHoursEditor`, `VisualBlockPreview` — signature `{value, onChange, triggerUpload}` (scope-agnostic) |
| Registry (per-app tagging) | `backend/config/content.php` | every block has `'apps' => ['website'|'order_app'|both]`, `shareable`, `type`, `editor`, `default` |
| Backend write | `backend/app/Http/Controllers/Api/ContentController.php` `update()` | `ensureRow(key,scope,locale)` then `writer->write(...)` — writing `scope='website'` (or `'order_app'`) creates/updates that app's row directly; **no split action needed** |
| Copy endpoint | `ContentController::copy` / `copyContentBlock` | copies a scope's value from→to |

**Conclusion:** the store already holds per-app values. This is purely an admin IA/UX change.

## 2. New UX

### 2.1 Entry points
Two nav items under a **Content** group in `navConfig.ts`:
- **Website Content** → `/content/website`
- **Order App Content** → `/content/order-app`
(Old `/content` route → redirect to `/content/website`. Keep permission `website.manage`.)

### 2.2 Each editor (one shared component, `app` prop = `'website' | 'order_app'`)
- **Shows only that app's blocks:** filter registry blocks where `block.apps.includes(app)`.
- **Grouped by section** (left rail or accordions): Hero, Homepage, Contact, Hours, About, Footer,
  Announcements, Legal, SEO, Brand, Order-App — only groups that have blocks for this app.
- **Each field edits that app's value directly:**
  - Display value = `app === 'website' ? (block.website ?? block.resolved_website) : (block.order_app ?? block.resolved_order_app)`.
    (Falls back to the seeded/default so a fresh block shows real content.)
  - On change → `updateContent([{ key, scope: app, value, locale }])`. Writing the app scope
    creates the row; the other app is untouched.
  - Images → `uploadContentImage(key, app, file, locale)`.
  - Visual blocks (hero, categories, etc.) reuse the Stage 6 editors, passing app-scoped
    value/onChange/triggerUpload.
- **Copy from the other app:**
  - Per **block**: a small "Copy from Order App" / "Copy from Website" button →
    `copyContentBlock(key, otherApp, app, locale)` then refresh.
  - Per **section**: "Copy whole section from the other app" → loop `copyContentBlock` over the
    section's blocks (client-side) or the new batch endpoint (§3, optional).
  - Copy must copy the **resolved** value of the source app (so it works even when the source app is
    still on the seed) — see §3.
- **Keep:** locale toggle (EN/DV), unsaved-changes indicator + Save (bulk `updateContent`), revision
  history per block, schedule, import/export — all scoped to the current app.
- **No** `shared`/`split` toggle, no global app tab, no `splitContentBlock`/`shareContentBlock` in
  this UI (those calls are removed from the page; the endpoints can remain for back-compat).

### 2.3 What happens to "shared"
"Shared" stays in the data as the **invisible seed/default** only. Both editors initially show the
same content (from the seed); they diverge when you edit or copy. Editing one app never changes the
other. This is the clean separation requested.

## 3. Backend (minimal / optional)
No migration. Two small checks:
1. **Copy uses resolved source value** — verify `ContentController::copy` copies the source app's
   *resolved* value (app row → shared → default), not just a possibly-null app row. If it currently
   copies the raw scope value, adjust so copying from an app that's still on the seed copies the
   seed content. (Small change in the copy path; add a test.)
2. **(Optional) batch copy** — `POST /api/admin/content/copy-section { group, from, to, locale }`
   to copy all of a section's blocks in one call. If skipped, the UI loops the existing per-block
   copy. Recommend implementing it for fewer round-trips.

No other backend changes; `update`, `upload`, `revisions`, `schedule`, `export/import` are reused.

## 4. Admin files
- `apps/admin-dashboard/src/pages/ContentStudio/ContentStudioPage.tsx` (rewrite → thin router/shell
  or split into:)
- `apps/admin-dashboard/src/pages/ContentStudio/AppContentEditor.tsx` (new — the per-app editor,
  `app` prop)
- `apps/admin-dashboard/src/pages/ContentStudio/CopyFromOtherApp.tsx` (new — block + section copy control)
- `apps/admin-dashboard/src/api/content.ts` (modify — add `copyContentSection` if §3.2 done; types)
- `apps/admin-dashboard/src/components/navConfig.ts` (modify — two entries)
- `apps/admin-dashboard/src/App.tsx` (modify — `/content/website`, `/content/order-app`, redirect `/content`)
- Reuse `components/content-editors/*` unchanged.

## 5. Testing
- `apps/admin-dashboard/src/__tests__/ContentStudio.twoEditors.test.tsx` (new):
  - Website editor lists only blocks whose `apps` include `website`; Order App editor only its own.
  - Editing a field writes `scope: 'website'` (resp. `order_app`) and does NOT change the other app.
  - "Copy from other app" calls `copyContentBlock(key, other, current)` and updates the value.
  - Visual editor (hero) edits persist to the current app scope.
  - Locale switch scopes reads/writes.
- Backend (if §3 done): `ContentCopyResolvedTest` — copy from a seed-only source copies resolved value.
- **Regression:** keep existing Content backend suite green (`ContentBladeParityTest`, resolver,
  scope API). Update/replace the old `ContentStudio.test.tsx`/`ContentStudio.editors.test.tsx` to
  the new structure (don't delete coverage — port it).

## 6. Rollout
UI-only; no migration. Deploy: rebuild admin dist (`./scripts/build-all.sh admin`), commit. Rollback
= revert the admin commits (data untouched). Because writes go to app scopes (which the resolver
already honours), the website and order app immediately reflect per-app edits with no backend change.

## 7. Acceptance criteria
1. Admin has two separate entries — **Website Content** and **Order App Content** — each showing
   only that app's content, grouped by section, with no shared/split toggle.
2. Editing a field in one app changes only that app; the other app is unaffected.
3. Each block and each section has a working "Copy from the other app" that brings over the other
   app's current (resolved) content.
4. Visual blocks (hero, categories, trust, etc.), images, locale, history, schedule, and
   import/export all work within each app editor.
5. At defaults (no edits), both editors show the same seeded content; the public website and order
   app render exactly as before. All existing Content tests stay green.

## 8. Constraints (do not improvise)
- **No DB migration** and no changes to the scope data model. This is a UI restructure.
- Writes go to the app scope directly (`website` / `order_app`) via existing `updateContent`; do NOT
  reintroduce a shared/split toggle in the new UI.
- "Copy from other app" must copy the **resolved** source value (works when source is on the seed).
- Reuse the Stage 6 `content-editors/*` components and the existing content.ts API — do not rebuild them.
- Keep permission `website.manage`; keep EN/DV, history, schedule, import/export working.
- Do not remove the backend `share`/`split`/`copy` endpoints (back-compat); the new UI just stops
  using share/split.

## Implementation notes

- **Routes:** `/content/website`, `/content/order-app`; `/content` and legacy `/content-studio`
  redirect to Website Content. Permission remains `website.manage`.
- **Components:** `AppContentEditor` (prop `app`) + `CopyFromOtherApp` (block + section). Thin
  `ContentStudioPage` exports `WebsiteContentPage` / `OrderAppContentPage` + redirect default.
- **Writes:** drafts always publish with `scope: app` via `updateContent`. Display =
  `app row ?? resolved_* ?? default`. No `splitContentBlock` / `shareContentBlock` in the UI.
- **Copy:** `ContentController::copy` now uses `ContentResolver::for($from)` when `from` is an app
  scope, so seed/shared content copies correctly. Section copy loops per-block client-side
  (`copyContentSection` helper); no batch endpoint added.
- **Import/export:** still locale-wide via existing API (filename includes app for clarity). Not
  filtered to one app — existing endpoint has no app filter.
- **Tests:** ported `ContentStudio.test.tsx` + `ContentStudio.editors.test.tsx`; added
  `ContentStudio.twoEditors.test.tsx` and `ContentCopyResolvedTest`.

## Build log

- Branch: `claude/content-studio-two-editors-plan`
- Commit message: `content: two separate app editors (website / order app) + copy-from`
- Backend: `./vendor/bin/pint` + `php artisan test` → **1526 passed**, 3 skipped
- Admin: `npm test -- --run` → **81 passed** / 29 files; `npm run build` OK
- Dist: `./scripts/build-all.sh admin` → synced `backend/public/admin/`
- Content suites: ContentAdmin, ContentCopyResolved, ContentResolver, ContentScopeApi,
  ContentBladeParity all green; ContentStudio.* vitest green
