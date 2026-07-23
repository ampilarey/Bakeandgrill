# Admin Panel Layout Redesign — Two-Level Navigation (top sections + contextual left rail)

**Repository:** `ampilarey/Bakeandgrill`
**Branch:** `claude/admin-layout-redesign-plan`
**Status:** Plan only — no feature code written yet.
**Author's note:** Separates **VERIFIED findings** (files read) from **RECOMMENDATIONS**. Shell/layout
only — **no routing, no backend, no page-logic changes.**

## 0. Goal

The admin panel crams **~55 nav items across 5 groups into one flat left sidebar** — it feels messy.
Redesign the **shell only** into a **two-level navigation**:
- **Desktop:** the 5 sections as **headings across the top**; the current section's **~10 items in a
  left column**; page in the main area. (Left rail drops from 55 → ~10.)
- **Mobile:** the same model — **bottom tab bar for the 5 sections**, then that section's items as a
  list. One mental model on both.
Fold the inconsistent Settings "hub" nav into the same model, rebalance the overloaded group, and
add shared layout primitives so every page is responsive by default. **Pages keep working; only the
frame changes.**

## 1. Verified findings

| Area | Path | Note |
|---|---|---|
| Shell | `apps/admin-dashboard/src/components/Layout.tsx` (**860 lines**) | single collapsible left sidebar; `ViewportBand` mobile(<768)/tablet(<1024)/desktop; mobile **drawer**; tablet auto-collapses; built largely from **inline styles** |
| Nav config | `apps/admin-dashboard/src/components/navConfig.ts` (263 lines) | `NAV_GROUPS` = 5 groups, **55 items**: Monitor 9, Manage 11, Customers & Marketing 10, Analyze 9, **System & Team 16** |
| Routes | `apps/admin-dashboard/src/App.tsx` (496 lines) | 55 routes; nested under one `<Layout>` |
| Settings (2nd nav paradigm) | `apps/admin-dashboard/src/pages/SettingsPage.tsx` | own `HUB_CARDS` + `?tab=` hub — inconsistent with the sidebar |
| Shared UI | `apps/admin-dashboard/src/components/SharedUI.tsx` (`PageHeader`, `Btn`) | exists but **underused**; **2,555 `style={{…}}`** occurrences across pages |
| Command palette | `apps/admin-dashboard/src/components/CommandPalette.tsx` | quick-jump exists (keep) |

**Routing health (verified):** cross-referenced 55 nav items vs 55 routes →
- **No broken nav links** (every item has a route).
- **No orphan pages** — only `/login` (expected), `catering/:id` (detail), and `content`/`content-studio`
  (redirects to `/content/website`, which IS in nav). **So this is layout/IA only, not routing.**

## 2. Proposed design

### 2.1 Navigation model (two levels, one mental model)
- **Section (level 1):** the existing 5 `NAV_GROUPS` (rebalanced — see §2.3). Each has an icon + label.
- **Item (level 2):** that section's pages (existing `NavItem`s).
- The active section is derived from the current route (which group contains the active path) and is
  also user-selectable. Selecting a section navigates to its first permitted item (or remembers the
  last item per section).

### 2.2 Desktop layout (Windows)
```
┌───────────────────────────────────────────────────────────┐
│  Brand │  Monitor  Manage  Customers  Analyze  System  │ 🔔 ⌘K user │   ← top section bar (level 1)
├──────────────┬────────────────────────────────────────────┤
│ Section rail │                                            │
│  • Dashboard │            Page content                    │
│  • Orders    │                                            │
│  • KDS  …    │   (PageHeader: main heading + actions)     │
│ (~10 items)  │                                            │
└──────────────┴────────────────────────────────────────────┘
```
- **Top bar:** brand, the 5 section tabs (active highlighted), notifications bell, command-palette
  (⌘K), user menu. Sticky.
- **Left rail:** ONLY the active section's items (~10). Optional collapse to icons (keep the existing
  `bg_sidebar_collapsed` behaviour). No more 55-item scroll.
- **Main:** page, wrapped in a shared `PageShell`/`PageHeader` (heading + breadcrumb "Section ›
  Page" + right-aligned actions).

### 2.3 Rebalance the overloaded group
Split **System & Team (16)** so no section exceeds ~10 and the top bar reads cleanly. Recommended:
- **System** (Settings, Devices, Print Queue, Webhooks, Xero, System Health, Service Availability, Checklist…)
- **Team** (Staff, Time Clock, Shifts, roles/permissions entry)
(Exact split decided in impl from the current items; keep every item, just regroup. `navConfig` stays
the single source — only group assignment changes.)

### 2.4 Fold Settings into the model (kill the 2nd paradigm)
`SettingsPage` "hub cards" become **items in the section rail** under System → Settings (or sub-rail
entries), navigated by route like everything else. Keep `?tab=` legacy redirects. One nav paradigm
across the whole app.

### 2.5 Mobile layout
```
┌───────────────────────────────┐
│  ‹Section›  Page title    🔔 ⌘ │  ← compact top bar
│  ───────────────────────────  │
│        Page content           │
│                               │
├───────────────────────────────┤
│ Monitor  Manage  Cust  ⋯ More │  ← bottom tab bar = 5 sections
└───────────────────────────────┘
```
- **Bottom tab bar** = the 5 sections (icons + short labels), thumb-reachable. Active highlighted.
- Tapping a section → a **section sheet/list** of its ~10 items (or a top pill-row), then the page.
- Replaces the single giant drawer. Same two-level model as desktop → nothing to relearn.
- Keep the notifications bell + command palette accessible from the top bar.

### 2.6 Shared layout primitives (fix "layout issues in each and every part")
Introduce/expand primitives so pages are responsive by default instead of ad-hoc inline styles:
- `PageShell` — standard page padding/max-width/scroll container.
- `PageHeader` (extend existing) — main heading + breadcrumb + actions slot; used by **every** page.
- `ResponsiveTable` / `ScrollX` — wraps wide tables so they scroll inside their own container (no
  page-level horizontal overflow on mobile).
- `Toolbar` — filter/action row that wraps on small screens.
Wrap each page with `PageShell` + `PageHeader`; convert the worst inline-styled/overflowing pages to
use `ResponsiveTable`/`ScrollX`. (Systematic pass — see §4.)

## 3. Component/file changes (admin only)
- **New** `components/AppShell.tsx` — the two-level shell (top section bar + section rail + mobile
  bottom tabs). Replaces `Layout.tsx` as the frame (keep `Layout.tsx` thin or fold in).
- **New** `components/SectionBar.tsx` (top level-1 tabs), `SectionRail.tsx` (level-2 items),
  `MobileTabBar.tsx` (bottom), `MobileSectionSheet.tsx`.
- **Modify** `components/navConfig.ts` — add section metadata (icon/label/order) + **rebalance groups**
  (§2.3); export a `getActiveSection(pathname)` helper. Single source of truth for the two levels.
- **Modify** `App.tsx` — render pages inside `AppShell`; no route changes.
- **New/extend** `components/SharedUI.tsx` → `PageShell`, `PageHeader` (extend), `ResponsiveTable`,
  `ScrollX`, `Toolbar`.
- **Modify** `pages/SettingsPage.tsx` — hub cards become section-rail items (§2.4); keep `?tab=`
  redirects.
- **Modify** each `pages/*.tsx` — wrap in `PageShell` + `PageHeader` (mechanical); convert wide tables
  to `ResponsiveTable` where they overflow.
- **CSS** — move shell styling from inline to classes (`admin-shell-*`), theme-aware, mobile-first.
- Keep: `CommandPalette`, notifications bell, permission-gating on nav items, collapse persistence.

## 4. Per-page systematic pass (the "check every part" ask)
- Wrap **every** routed page in `PageShell` + `PageHeader` (consistent heading + spacing everywhere).
- Audit each page for **horizontal overflow on mobile**; wrap tables/wide grids in `ResponsiveTable`/
  `ScrollX`. Priority offenders: Orders, Inventory, Reports, Analytics, Purchase Orders, Shifts,
  Customers, Promotions, GST, Profit & Loss (data-dense tables).
- Ensure filter/toolbars wrap (use `Toolbar`).
- Verify permission-hidden sections don't leave an empty section tab (hide a section with zero
  permitted items).

## 5. Accessibility & behaviour
- Top section tabs: `role="tablist"`; left rail `nav`; bottom bar `role="navigation"`; active states
  with `aria-current`.
- Keyboard: section tabs arrow-navigable; ⌘K palette preserved; focus management on mobile sheet.
- Preserve deep-linking (route → correct section auto-selected).
- Respect `prefers-reduced-motion`; theme-aware (existing CSS vars).

## 6. Testing
- `components/__tests__/AppShell.test.tsx` — active section derived from route; selecting a section
  navigates to its first permitted item; permission-empty sections hidden.
- `SectionRail`/`MobileTabBar` render only permitted items; active highlighting.
- `navConfig` — every item belongs to exactly one (rebalanced) section; `getActiveSection` maps all
  routes; no item without a route (guard test).
- Keep existing admin tests green (nav/route tests, page tests). Update `navConfig.test.ts` for the
  new section metadata.
- Manual matrix: desktop (section switch, rail, collapse), mobile (bottom tabs, section sheet),
  tablet; a few data-dense pages for no horizontal overflow.

## 7. Rollout
Shell-only, no routing/backend change. Land in one branch, staged commits:
1. `navConfig` section metadata + group rebalance + `getActiveSection`.
2. `AppShell` + SectionBar/SectionRail/MobileTabBar/MobileSectionSheet + CSS; wire in `App.tsx`.
3. Shared primitives (`PageShell`/`PageHeader`/`ResponsiveTable`/`ScrollX`/`Toolbar`).
4. Settings unification.
5. Per-page wrapping + overflow fixes (systematic pass).
Rebuild admin dist; `git`-only, no migrations. Rollback = revert admin commits. Deep links and
permissions unchanged throughout.

## 8. Acceptance criteria
1. Desktop shows 5 section headings on top; the left rail shows only the active section's items
   (~10, never 55); the page renders in the main area with a consistent header.
2. Mobile shows a bottom tab bar of the 5 sections; tapping one lists its items; no giant drawer.
3. Navigating to any route auto-selects the correct section; all existing links work (no broken/orphan).
4. Settings uses the same nav model (no separate hub paradigm); `?tab=` legacy links still resolve.
5. No section exceeds ~10 items; permission-empty sections are hidden.
6. Data-dense pages no longer overflow horizontally on mobile (tables scroll in their own container).
7. Every page renders inside the shared `PageShell`/`PageHeader`; theme + a11y preserved; all tests green.

## 9. Constraints (do not improvise)
- **Shell/layout only** — no route changes, no backend, no page business logic.
- `navConfig` stays the single source of truth for both nav levels; regroup items, don't invent pages.
- Preserve: permission-gating, deep-linking, command palette, notifications, collapse persistence,
  theme, EN/DV where present.
- No heavy new UI dependency for nav/DnD; keep the bundle lean; mobile-first, accessible.
- Keep every existing page reachable; do not remove any nav item — only reorganize into sections.

## Implementation notes

- **Six sections, not five:** Splitting System & Team yields Monitor / Manage / Customers & Marketing /
  Analyze / System / Team. Desktop section bar and mobile bottom tabs render all *permitted* sections
  (horizontally scrollable on narrow viewports). Acceptance criteria that said “5” were treated as
  “one tab per IA section after rebalance.”
- **Soft ~10 cap:** Manage stays at 11 items; System is 10 + checklist via `getNavGroups()`. Soft limit
  per plan (“~10”), not a hard cut that would invent orphan pages.
- **Team absorbs ops staffing:** Shifts & Time Clock moved from Monitor → Team (alongside Staff / My
  Account) to match §2.3 recommendation without dropping routes.
- **Settings hub → rail deep-links:** Replaced single `/settings` nav item with
  `/settings?tab=permissions` and `/settings?tab=notifications`. Website hub card remains reachable via
  Content editors + `?tab=website`. Bare `/settings` and legacy tabs still redirect. No new routes.
- **Layout.tsx:** Thin re-export of `AppShell` so existing `from './Layout'` / SharedUI re-exports keep
  working. `BOTTOM_TABS` kept but unused by the new mobile shell.
- **PageHeader breadcrumbs:** `section` prop renders “Section › Page”; page tests assert
  `getByRole('heading')` to avoid duplicate-text matches with the breadcrumb.

## Build log

- Branch: `claude/admin-layout-redesign-plan`
- Tip: `78313d53` (docs + implementation notes; tests green at `fa25be28`)
- `npm ci` (repo root) — ok
- `cd apps/admin-dashboard && npm test -- --run` — **101/101 passed** (34 files)
- `npm run build` / `./scripts/build-all.sh admin` — ok; dist synced to `backend/public/admin/`
- Staged commits: navConfig rebalance → AppShell → SharedUI primitives → Settings fold → per-page
  PageShell pass → test assertion fixes
- No PR opened (per instructions)
