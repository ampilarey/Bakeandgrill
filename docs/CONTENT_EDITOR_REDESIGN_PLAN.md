# Content & Branding Redesign — Website Content and Order App Content

**Revision 2.** Rewritten after auditing the current branch. The previous revision said
"proposed, nothing built" — that is no longer true, and several of its counts were stale.

Scope: the two admin destinations `/content/website` and `/content/order-app` and the components
they are built from. Nothing else in the admin. The wider navigation audit lives in
`docs/LAYOUT_REDESIGN_PLAN.md`; the data separation history lives in
`docs/SEPARATE_WEBSITE_AND_ORDER_APP_PLAN.md`. Neither is superseded by this document.

---

## 1. Current verified state

**Audited against:** `origin/main` at `a23d51683` ("Merge pull request #92 from
ampilarey/cursor/surface-count-configured-only-d038"). Every number below was re-measured on that
commit. Figures from revision 1 that did not survive re-measurement have been replaced, not
carried forward.

### 1.1 Registry, re-counted

| | Revision 1 said | Verified on `main` |
|---|---|---|
| Non-deprecated blocks | 169 | **173** |
| Blocks targeting both apps | 67 | **67** |
| Website Content blocks | 148 | **149** |
| Order App Content blocks | 88 | **88** |
| Website groups | 12 | **12** |
| Order App groups | 14 | **14** |

Website Content by group: Pages 44, Homepage 32, Contact 19, Footer 16, Order App 10, General 7,
Branding 6, SEO 5, Announcements 4, Legal 4, Hero 1, Menu 1.

Order App Content by group: Order App 18, Footer 15, Homepage 11, Pages 10, Contact 7, General 6,
Branding 5, Announcements 4, Status banners 4, About 2, Menu 2, SEO 2, Hero 1, Legal 1.

Editors: **166 of 173 blocks use the plain editor.** Seven have a purpose-built one — hero,
categories, proof, trust, about values, footer links, business hours (the last is new since
revision 1). Field types: `text` 139, `textarea` 17, `json` 7, `image` 5, `boolean` 4, `color` 1.

### 1.2 Already shipped — do not re-plan these

**App separation is complete and enforced.** `ContentResolver`'s chain is `app+locale → app+en →
registry default`. No shared fallback for customer-facing content. `share()`, `split()`,
copy-between-apps, `linkState()` and `BRAND_SYNCED_KEYS` mirroring are all removed. Preview and
publish status are locked per app (`1299ff4a5`). `HomeLayoutEditor` edits one app only
(`15675b59b`); shared page-block mode is retired (`ded01821a`).

**Operational ownership is enforced in code.** `backend/app/Domains/Settings/OpsOwnedContent.php`
plus its frontend mirror `opsOwnedContentKeys.ts` mark 14 keys as owned elsewhere and render them
read-only in the hub with an owner label and link. `delivery_threshold` points at Ordering Control
Center → Delivery Settings; the rest point at Business Details. There is a client-side fallback so
a stale API payload cannot make them editable again (`9c5acd001`). Exhaustive API write-block +
`managed_by` coverage is in `OpsOwnedSettingsOwnershipTest`.

**Business Details exists** as the shared operational profile at `/business-details`, writing the
`shared` scope only, including structured address keys (`b44cd97f6`, `971eca16f`).

**The canonical component catalog exists.** `ContentHub/canonicalCatalog.ts` is the single source
for surface counts, the configured list, the Add picker and duplicate detection. Its own docblock
forbids independent counters. It provides `listPlacedOnSurface`, `listConfiguredOnSurface`,
`listHiddenOnSurface`, `surfaceCountLabel`, `addableTypesOnSurface`,
`findSingletonDuplicatesOnSurface`, `findDuplicateIdentities`, and a 22-entry
`SINGLETON_SURFACE_TYPES` set. Card label wording is `N components · M hidden`. Parallel
`countBlocksOnSurface` / `listBlocksOnSurface` helpers were removed from `surfaceCatalog.ts`;
`canonicalCatalog.ssot.test.ts` fails if they (or a second surface lister) reappear outside the
canonical module.

**Integrity report + admin warning + safe resolve.** `ContentIntegrityReport.php` reports
duplicates, orphan block types, ops-ownership leaks and needs-review rows without mutating
anything (`GET /admin/content/integrity`). The Content Hub landing shows a persistent
`singleton_duplicate_surface` banner (surface, type, block ids). Opening the surface offers
**Keep #id · hide others** — hides non-kept instances via draft `is_enabled=false`, never
deletes. Live `PageBlockRepository::forSurface` still dedupes singletons for customers.

**Backend singleton enforcement.** `PageBlockController::assertSingletonAvailable` rejects a
second non-`allowsMultiple` type on the same app home page (stricter than surface scope) with a
clear 422. `BlockTypeSingletonClassificationTest` asserts every library type is deliberately
singleton or multi-instance.

**Autosave failure handling exists.** `autosaveFailed` / `autosaveErrorDetail` state, an explicit
`onRetrySave`, and Publish disabled while a draft save is failing — covered by
`ContentStudio.autosave` and `ContentHub.publishAndScope` tests (rows 11–12).

**Hero depth was already reduced.** The separate `hero-editor-sheet` and `hero-slide-editor-sheet`
are gone; the hero now renders an inline slide-overview list and one `ContentEditorSheet` for the
slide.

**Stage 1 (§5 remainder) is shipped** on this branch — see §9.

### 1.3 Remaining gaps — this is what the plan is for

1. **The information architecture is unchanged.** Still 12 storage groups on the website side,
   with "Pages" holding 44 blocks. Homepage wording is still spread across Homepage, Hero,
   Announcements, Footer, General and Branding.
2. **A group labelled "Order App" still appears inside Website Content** — 10 `order_mode_*`
   blocks that legitimately render on the website's homepage mode cards but are named after the
   wrong thing.
3. **Groups still carry engineering names** — "General", "Pages", "Status banners".
4. **`ContentHubPage.tsx` has grown to 2,301 lines** (was 2,046 in revision 1). The ContentHub
   directory is 8,947 lines. `HomeLayoutEditor.tsx` is 1,177 and `HeroSlidesEditor.tsx` is 1,143.
   The file is getting bigger while being restructured, which is the wrong direction.
5. ~~**The surface-count label wording diverges from the agreed spec.**~~ Closed in Stage 1 —
   label is now `N components · M hidden`.
6. ~~**No audited page inventory.**~~ **Closed (Stage 2).** Verified inventory from Blade /
   Order App renderers (not `group` labels): [`docs/CONTENT_SURFACE_INVENTORY.md`](./CONTENT_SURFACE_INVENTORY.md)
   + machine index [`docs/content_surface_inventory.json`](./content_surface_inventory.json).
   `SurfaceCatalog` still models only 4 slots × 2 devices × 2 apps; real pages are inventoried
   for Stage 4 regroup. Coverage test: every non-deprecated app-targeted registry key appears
   exactly once per app in the inventory.
7. **Admin breakpoints are thin.** 29 media queries, dominated by `max-width: 767px` (11
   occurrences). There is one compact band (`768–1199`) and a `min-width: 1200px`. The
   414 / 1366 behaviours in the target spec are untested.


---

## 2. Goals and non-goals

### Goals

- An owner opening Website Content can find the thing they want to change by thinking about
  **where it appears on the site**, not where it is stored.
- A surface card's count is **exactly** the configured instances behind it, and opening it shows
  exactly those.
- Website and Order App never leak into one another, in data, preview, draft, publish or UI.
- One editable owner per operational value; everywhere else shows it read-only with a link.
- Editing works at 320px and at 1366px without a separate mental model.

### Non-goals

- Any change to public customer layout or business workflow.
- Merging the two destinations, or reintroducing any form of "Same in both".
- A second page builder or a WYSIWYG editor.
- Renaming block keys, changing values, or changing scopes for presentation reasons.
- Deleting content because it looks unused.

---

## 3. Ownership model

Content & Branding **must not** offer a second editable field for anything below. It may show the
current value read-only with a "Managed in …" link.

| Value | Sole owner | Content & Branding may |
|---|---|---|
| Free delivery threshold | Ordering Control Center → Delivery Settings | show read-only + link |
| Delivery fee, zones, delivery rules | Ordering Control Center → Delivery Settings | show read-only + link |
| Tax / GST, service charge, packaging fee, invoices | Finance / ordering controls | show read-only + link |
| Menu items, prices, availability, stock | Menu / Inventory | show read-only + link |
| Business phone, email, address, maps, business identity | Business Details | show read-only + link |
| Operating hours and closures | the operating-hours system | show read-only + link |
| Logo, favicon, OG image, brand colour **per app** | Content & Branding (per app) | edit |
| Hero, page copy, footer copy, announcements **per app** | Content & Branding (per app) | edit |

**Business Details is a shared *operational profile*, not shared customer content.** It feeds
invoices, receipts, signage and SMS. It is not the website's branding and it is not the order
app's branding. Those are separate, per-app, and independently editable. The mismatch notice
(`ContentScopeMismatch`) reports disagreement between the three; it never synchronises them.

The enforcement already exists (`OpsOwnedContent.php` + `opsOwnedContentKeys.ts`). What this plan
adds is that **the ownership table above becomes the acceptance criterion**: any new field added
to Content & Branding must be checked against it, and a test must assert that no ops-owned key is
writable through the content API.

---

## 4. Customer surface inventory

**This must be audited from actual routes and renderers before any regrouping begins.** The list
below is the starting point derived from `SurfaceCatalog`, `surfaceRegistry.ts`, the Blade views
and the order-app routes — it is not yet a verified inventory, and Stage 2 does not start until it
is one.

### 4.1 Structural surfaces (already modelled)

`SurfaceCatalog` = app × device × slot:

| App | Desktop slots | Mobile slots |
|---|---|---|
| Website | header, home, footer | header, home, footer, bottom_navigation |
| Order App | header, home, footer | header, home, footer, bottom_navigation |

**These are distinct surfaces and must never be collapsed into one "footer":**

- **Website global footer** — site-wide legal/links chrome on every website page.
- **Order App footer** — the order app's own footer content.
- **Mobile bottom navigation** — a fixed nav bar, not a footer, and mobile-only.

`surfaceRegistry.ts` already distinguishes "Website legal footer" from the Brand footer home
component. That distinction must survive the regroup.

### 4.2 Real pages (verified — Stage 2)

Audited from Blade / Order App **renderers**, not `group` labels. Full per-key tables and
re-run commands: [`docs/CONTENT_SURFACE_INVENTORY.md`](./CONTENT_SURFACE_INVENTORY.md).
Machine index for the coverage test: [`docs/content_surface_inventory.json`](./content_surface_inventory.json).

**Keep distinct (never one “footer”):** Website global footer ≠ Order App footer ≠ Mobile
bottom navigation. Structural matrix: app × device × slot in the inventory doc.

**Website (149 non-deprecated registry keys, each exactly once in inventory)**

| Page | Route(s) | Primary template(s) | Notes |
|------|----------|---------------------|-------|
| Home | `GET /` | `home.blade.php` + `partials/home/*` (+ `page_blocks`) | Includes `order_mode_*`, `events_section_*` |
| Contact | `GET /contact` | `contact.blade.php` | |
| Hours | `GET /hours` | `hours.blade.php` | |
| Legal — Terms / Refund | `GET /terms`, `GET /refund` | `terms.blade.php`, `refund.blade.php` | |
| Legal — Privacy | `GET /privacy` → 301 `/order/privacy` | `privacy.blade.php` exists; public URL is Order App | Keys still inventoried under website |
| Menu | `GET /menu` → 301 `/order/menu` | **No website blade** | 0 unique keys; Order App owns Menu |
| Events & Catering | `/pre-order` → `/order/events` | **No website page**; home `events-band` only | `events_section_*` under Home |
| Everywhere (layout chrome) | all pages via layout | `layout.blade.php` + site footer / overlays | Website global footer lives here |
| Reads nowhere found | — | — | `business_website`, `menu_new_days` (do not delete) |

**Order App (88 non-deprecated registry keys, each exactly once in inventory)**

| Page | Route(s) under `/order` | Primary component(s) | Notes |
|------|-------------------------|----------------------|-------|
| Home | `/` (index) | `HomePage.tsx` + `components/home/*` (+ `page_blocks`) | Mode cards / ordering entry |
| Menu | `/menu` | `MenuPage.tsx` | |
| Ordering | `/checkout` (+ auth) | `CheckoutPage.tsx`, `AuthBlock.tsx` | No `/ordering` route |
| Order history | `/order-history` | `OrderHistoryPage.tsx` | 0 content keys (API UI) |
| Gift cards | `/gift-cards*` | `GiftCardsPage.tsx` (+ buy/success/view) | 0 content keys |
| About / Contact / Hours / Privacy | `/about`, `/contact`, `/hours`, `/privacy` | matching `*Page.tsx` | Extra SPA pages holding registry keys |
| Everywhere (shell chrome) | all routes via `AppShell` | TopNav, BrandFooter, overlays | Order App footer ≠ bottom nav |
| Reads nowhere found | — | — | _(none after settings-context correction; do not delete keys from empty bucket)_ |

Only Home is composable via `page_blocks`. Stage 4 regroups by these verified pages. Do not
trust `group` alone — see inventory §4.4 (e.g. all ten `order_mode_*` keys).

---

## 5. Surface cards, exact component counts, and duplicate prevention

**Treated as a correctness and data-integrity fix, not cosmetic work.** It ships in Stage 1,
before any visual redesign, and is not postponed behind it.

The bug: a card reads `Website · Mobile · Header · 2 components`, and opening it shows every
component type allowed on a header. The count and the list disagree, the admin looks duplicated,
and the count is not trustworthy.

Much of this is already fixed by `canonicalCatalog.ts` and `921e15ab4`. The rules below are the
complete specification; Stage 1 is closing the remainder and proving all of it.

1. **A surface card count means configured component instances** for that exact
   `app · page · device · surface slot`. Nothing else.
2. **The card and the opened editor use the same canonical selector.** Both call
   `listConfiguredOnSurface()`. No independent counter, no regex, no second list.
3. **If the card says 2, opening it shows exactly those 2 configured instances** — never the type
   library.
4. **Available types appear only in a separate "Add component" picker**, never mixed into the
   configured list.
5. **The Add picker shows only types valid for that slot** — `typesForSlot()` /
   `addableTypesOnSurface()`.
6. **Singletons cannot be added twice** to the same app × device × surface. `SINGLETON_SURFACE_TYPES`
   currently holds 22 types including `prayer_bar`, `announcement`, `bottom_nav`, `site_footer`,
   `brand_footer`, `opening_status`, `hero`. The picker excludes an already-placed singleton
   whether it is showing or hidden.
7. **Multiple instances are allowed only for deliberate types** — custom text, image, image with
   text, video, FAQ, button band, divider. Anything not in the singleton set is multi-instance by
   default, so **the singleton set is the thing to keep correct**; a new type defaults to
   multi-instance and that must be a conscious choice, asserted by a test.
8. **Hidden components are labelled, never folded into an ambiguous number.** Required wording:
   `2 components · 1 hidden`. `surfaceCountLabel()` emits that string (structure unchanged).
9. **Legacy true duplicates are never silently deleted.** `ContentIntegrityReport` detects them
   read-only. The admin shows a warning with the offending `component_id`s and a keep/hide
   resolution flow — the owner chooses which instance to keep; nothing is removed automatically.

10. **Tests are part of the fix, not follow-up.** See §10.

Component identity, for anything that has to be addressed unambiguously:
`app · page · surface · viewport · component_id · type` — already the shape of
`CanonicalComponent`.

---

## 6. Page-first content architecture

### 6.1 Group by what the customer sees, in render order

**Ordering answered by the owner: "usually hero".** So the groups below are ordered by how often
he reaches for them, not alphabetically or by size — Home first, Legal and SEO last. And within
Home, the hero is the first component in the list, because `page_blocks` already renders it first
on both apps; no special-casing is needed to achieve that, only a guarantee that render order is
respected (§6.2).

Two consequences that would not otherwise be in this plan:

- **The hero needs a direct route from the Content landing.** If one component accounts for most
  visits, making it three taps away is the wrong default. A "Hero" shortcut on the landing,
  alongside the surface cards, costs almost nothing and removes two levels from the single most
  common task.
- **The hero editor is the benchmark for Stage 6, not an afterthought.** Visual previews (§6.4)
  should be built for the hero first and generalised outward, rather than built generically and
  fitted to the hero last.

**Website Content**

| Group | Contains |
|---|---|
| Home | every block rendering on the homepage, in `page_blocks` order |
| Menu page | menu page copy |
| Contact page | contact copy, form labels, map |
| Hours page | hours page copy |
| Events & Catering | catering copy and CTAs |
| Legal | privacy, terms, refund |
| Everywhere | Website header, Website footer, announcement bar, Website branding, Website SEO |

**Order App Content**

| Group | Contains |
|---|---|
| Home | order app homepage blocks, in `page_blocks` order |
| Menu | menu browsing copy |
| Ordering | mode cards, ordering hours, status banners |
| Order history | order history copy |
| Gift cards | gift card copy |
| Everywhere | Order App header, Order App footer, bottom navigation, Order App branding |

Note that "Everywhere" lists **Website header** and **Order App header** as different things, and
lists **Order App footer** and **bottom navigation** separately. That is deliberate — see §4.1.

### 6.2 Reuse the render order that already exists

The homepage order lives in `page_blocks`. The content editor must read it rather than invent an
alphabetical one, so the list on screen matches the page in the browser and moving a block in the
layout editor moves it here too. One truth, two views.

### 6.3 Rename groups named after the code

- `Order App` inside Website Content → **Order buttons** (or **Ordering section**) — it is the
  homepage mode-card area, and calling it "Order App" inside Website Content is simply wrong.
- `Status banners` → the customer-facing place they appear.
- `General`, `Pages` → dissolved into the page groups above.

Rule: a group name answers *"where on my site is this?"*, never *"which part of the system stores
it?"*

### 6.4 Show the thing, not its key

`VisualBlockPreview` exists — extend it. Where a picture is impractical, render the current value
as the customer sees it. `home_proof_eyebrow` is not something anyone can picture.

---

## 7. Editing flows

### 7.1 The four levels, and only four

| Level | Shows | Never shows |
|---|---|---|
| **Overview** | page / surface cards with exact counts | any component fields |
| **Surface** | the configured component list for that surface | the type library |
| **Component** | one focused edit sheet or drawer | sibling components |
| **Add** | a separate picker of valid, addable types | configured instances |

Reorder is an **explicit separate mode**, not drag-by-accident inside the list. Delete lives under
the More menu and requires confirmation.

Hero is the benchmark: component overview plus **one** focused slide editor. The nested
hero-editor / slide-editor sheets are already gone; the remaining work is keeping it that way as
the hero editor is broken up (it is 1,143 lines).

### 7.2 Responsive behaviour

Three admin layouts, with the breakpoints that must be tested:

| Layout | Widths | Behaviour |
|---|---|---|
| **Mobile** | 320, 375, 390, 414, 767 | Full-screen sheets, one-column cards, **no horizontal overflow at any width**. Preview is one tap and is a preview, not another editing layer. |
| **Tablet / compact** | 768, 1024, 1199 | Compact selector plus editor. **No permanently docked squeezed preview** — a 300px preview beside a 400px editor helps nobody. |
| **Desktop** | 1200, 1366 and above | Main editor plus optional preview pane. Preview follows the selected app and the selected Desktop/Mobile surface. |

Current state to close: 29 media queries, 11 of them `max-width: 767px`, one compact band at
`768–1199`, one `min-width: 1200px`. 414 and 1366 are untested.

### 7.3 Drafts, previews and publishing

- Website draft / save / preview / publish / discard affects **Website only**.
- Order App draft / save / preview / publish / discard affects **Order App only**.
- Autosave failures stay visible, retain the local change, and offer retry. Publish stays disabled
  while a draft save is failing. *(Already implemented — must not regress.)*
- **Publish must not clear local drafts until the server confirms success.**
- Preview must use the same app, device, surface and component list as the editor — the same
  canonical selector from §5, not a parallel query.

---

## 8. Safe technical approach

**Refactor boundaries.** `ContentHubPage.tsx` at 2,301 lines is the main hazard. Split it before
restructuring it, in its own commit, with no behaviour change: surface landing, section/group
list, block list, editor sheet host, preview host, publish bar. A regression then bisects to the
split rather than to the redesign.

**No data migration.** This is presentation. No key renamed, no value rewritten, no scope changed.
The separation work moved 620 key/app/locale combinations under a snapshot test; that test must
still pass untouched at every stage. If a stage needs a migration, the stage is wrong.

**Registry content and page blocks stay one experience.** Two systems exist — registry blocks
(`content.php`, 173 keys) and page blocks (`page_blocks`, composable homepage). The owner must not
have to know which is which. Page groups in §6.1 mix both: a homepage group shows page-block
components and registry copy in one render-ordered list, each labelled by what it does, not by
which table it lives in.

**No second page builder.** `HomeLayoutEditor` is the layout editor. Reuse its ordering and its
`page_blocks` writes. Do not add a parallel drag-and-drop surface and do not add a WYSIWYG editor.

**Canonical selector is mandatory.** Any new code that counts, lists or previews components calls
`canonicalCatalog.ts`. A lint rule or a test asserting no other module counts blocks is cheap and
prevents the original bug from returning.

---

## 9. Staged implementation

**Stage 1 — Count and duplicate correctness. Shipped.**
Closed the remainder of §5: label wording `N components · M hidden`; integrity banner +
keep/hide resolve (never auto-delete); card and editor share `listConfiguredOnSurface` /
`surfaceCountLabel` with an SSOT structural test; Add picker stays separate and slot-filtered;
backend singleton 422 + deliberate multi/singleton classification test; matrix rows 1–7, 9–12
and 16 covered. Correctness only — no IA/regroup/restyle.

**Stage 2 — Audited surface and page inventory. Done on this branch.**
Document every page and surface per app from routes and renderers (not `group`). Deliverables:
verified §4.2 + `docs/CONTENT_SURFACE_INVENTORY.md` + `docs/content_surface_inventory.json`;
`ContentSurfaceInventoryTest` (matrix row 8 early). No UI / config / migration change.
Stage 3 does not start without it.

**Stage 3 — Split `ContentHubPage.tsx`.** Pure refactor, no visible change.

**Stage 4 — Regroup and rename.** §6.1 and §6.3 together, never apart — regrouping without
renaming leaves "Order App" inside Website Content and is worse than doing neither. Guarded by the
every-key-appears-exactly-once test.

**Stage 5 — Responsive bands.** §7.2, including 414 and 1366.

**Stage 6 — Visual block previews and preview-beside-editor.** §6.4 and §7.1. Highest cost,
highest payoff, last.

Stages 1 and 4 carry most of the value. Stage 1 is correctness and cannot be deferred; Stage 4 is
the relief the owner actually asked for.

---

## 10. Test matrix and acceptance criteria

| # | Assertion | Stage |
|---|---|---|
| 1 | Surface card count equals the length of the opened configured list, for every app × device × slot | 1 |
| 2 | The opened editor contains no type that is not a configured instance — no "Not added" rows | 1 |
| 3 | Add picker contains only types valid for the slot, and excludes already-placed singletons (showing or hidden) | 1 |
| 4 | Creating a second instance of a singleton on the same app × device × surface is rejected | 1 |
| 5 | Hidden instances are excluded from the count and labelled `N components · M hidden` | 1 |
| 6 | Legacy duplicates raise an admin warning and nothing is deleted automatically | 1 |
| 7 | A block placed on Website never appears in any Order App surface, list, count or preview, and the reverse | 1, 4 |
| 8 | Every non-deprecated registry key targeting an app appears **exactly once** in that app's inventory / new grouping | 2 (inventory coverage test), 4 (UI regroup) |
| 9 | No ops-owned key (`OpsOwnedContent`) is writable through the content API; each renders read-only with an owner link | 1 |
| 10 | Website publish does not alter any Order App value, draft or publish state, and the reverse | 1 |
| 11 | Publish does not clear a local draft until the server confirms | 1 |
| 12 | An autosave failure stays visible, retains the change, offers retry, and blocks Publish | 1 |
| 13 | Preview resolves the same app, device, surface and component list as the editor | 6 |
| 14 | No horizontal overflow at 320, 375, 390, 414, 767 | 5 |
| 15 | No permanently docked preview between 768 and 1199 | 5 |
| 16 | The 620-combination resolver snapshot is unchanged at every stage | all |

**Layout assertions (14, 15) must be Playwright at real viewports.** jsdom has no layout engine;
a vitest test that injects CSS and then measures it cannot fail. That mistake was made in this
repo once and had to be undone — do not repeat it.

Every stage must demonstrate its tests can fail: break the change, confirm the right test goes
red, restore, confirm green, and report what was broken.

---

## 11. Risks, rollout, rollback

1. **Losing a block during regrouping.** 149 + 88 blocks moved by hand will lose one. Test 8 is
   the guard and it is mechanical.
2. **Half of Stage 4.** Regrouping without renaming moves things without making them findable.
   Ship both or neither.
3. **`ContentHubPage.tsx` growing during the work.** It went from 2,046 to 2,301 lines while being
   improved. Stage 3 must land before Stage 4, and Stage 4 must not add net lines to it.
4. **A parallel counter reappearing.** The original bug was two sources of truth. Any new count
   must go through `canonicalCatalog.ts`; enforce it with a test.
5. **Permissions.** Both destinations sit behind `website.manage`. Regrouping must not create a
   path to a block a user could not previously reach.
6. **Go-live timing.** The go-live checklist covers these screens. Stage 1 is a correctness fix and
   is safe to ship whenever it is ready. Stages 3 to 6 are visual restructuring and should wait
   until the checklist is complete, or they invalidate testing already done.

**Rollout:** one stage per deployment, each independently revertible. Stage 4 one group at a time
so a mistake bisects to a group, not to the redesign.

**Rollback:** because no data migrates, every stage rolls back by reverting its commits. The one
thing that would break that property is a stage that writes to `site_settings` or `page_blocks` —
none is planned, and any proposal to add one should be treated as a redesign of this plan rather
than a detail of it.

---

## 12. Owner input — answered

**Question:** when you open Website Content, what are you usually trying to change?
**Answer (2026-08-13):** *"usually hero"*.

Applied to this plan:

- §6.1 groups are ordered Home first, Legal and SEO last.
- Home lists the hero first, which `page_blocks` render order already produces.
- A hero shortcut is added to the Content landing (§6.1) so the most common task is one tap, not
  three.
- Stage 6 builds visual previews for the hero first and generalises outward (§6.1).

This is the only owner input Stage 4 was waiting on. No open questions remain.
