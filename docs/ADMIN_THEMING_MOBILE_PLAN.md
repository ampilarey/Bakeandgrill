# Admin Dashboard — Theming & Mobile Plan

**Scope:** `apps/admin-dashboard` (70 page files)
**Status: Revision 2** — the original audit's conclusions were correct and most of the work has
since shipped. Revised after re-measuring against the code and after the Content Hub mobile work
introduced a reusable sheet pattern that did not exist when this was written.

| Item | Original finding | Today |
|---|---|---|
| Page chrome / structure | Uniform, leave alone | Unchanged. Still correct. |
| Mobile tables | Handled by a catch-all; action: none | Confirmed. 55 pages carry tables, none need a wrapper. |
| Shared modals on mobile | Not covered by the original audit | **Mostly handled** — `index.css:705` turns the SharedUI Modal into a bottom sheet with safe-area footer padding, and all 34 pages that render `<Modal>` inherit it. 6 hand-rolled overlays and 1 dead duplicate Modal do not — see §6.2. |
| Dark mode migration | 3,188 hex literals vs 3 variable usages | **647 hex literals vs 3,110 variable usages — roughly 83% done.** |
| Stage 1 (lint + baseline + CLAUDE.md) | Proposed | **Shipped.** |

**What is genuinely left is in §6. Everything above it is history, kept because the reasoning
still holds and because the "action: none" verdicts stop the work being reinvented.**

---

## 1. Audit findings

### 1.1 Structure is excellent — leave it alone

| Metric | Result |
|---|---|
| Pages using `PageShell` | **55 / 55** |
| Pages using `PageHeader` | **54 / 55** |

Page chrome, headers and navigation are uniform across the entire admin. No
work is needed here, and no work should be *invented* here.

### 1.2 Mobile tables are already handled — no work required

An earlier pass of this audit claimed "32 of 35 table pages break on mobile
because they lack the `.table-scroll` wrapper." **That conclusion was wrong.**

`src/index.css` contains a catch-all inside `@media (max-width: 767px)`:

```css
/* index.css:513 */
:not(.table-scroll) > table {
  display: block;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  max-width: 100%;
}
```

Any `<table>` whose direct parent is *not* already a `.table-scroll` wrapper
gets the block + overflow treatment automatically. The wrapper class is an
optimisation, not a requirement — unwrapped tables scroll correctly. Wrapping
the remaining 43 files would be churn with no user-visible effect.

The surrounding mobile block is also more complete than expected: 44px touch
targets, 16px inputs to prevent iOS zoom-on-focus, `.stat-grid` reflow, reduced
`main` padding, and `.tab-scroll-row` for horizontal tab strips.

**Action: none.**

### 1.3 Dark mode is genuinely broken — this is the real work

The toggle works. `AppShell` sets `data-theme="dark"`, and `index.css:838`
defines a complete dark variable block. The problem is that page content does
not consume those variables:

```
hardcoded hex literals in src/pages:  3,188
CSS variable usages in src/pages:         3
```

Inline styles cannot be overridden by a stylesheet, so toggling dark mode
restyles the shell while page content stays light.

There is a partial mitigation at `index.css:861`:

```css
[data-theme="dark"] .bg-white,
[data-theme="dark"] [style*="background: #fff"],
[data-theme="dark"] [style*="background: white"] { … }
```

This is a narrow string-match hack. It catches only that exact substring — not
`#FFFFFF`, not `backgroundColor`, and critically **not text colours**, which
are the bulk of the problem:

| CSS property | Hex literals |
|---|---|
| `color` | **1,664** |
| `background` | 379 |
| other (`stroke`, `borderColor`) | 2 |

Dark text on a dark surface is the dominant failure mode.

### 1.4 The migration is far more tractable than 3,188 suggests

The literals are highly concentrated. Ten values account for **2,200 of 3,188
(69%)**, and each maps 1:1 onto a variable that already exists:

| Hex | Count | Variable |
|---|---|---|
| `#6b5d4f` | 490 | `--color-text-secondary` |
| `#9c8e7e` | 471 | `--color-text-muted` |
| `#e8e0d8` | 372 | `--color-border` |
| `#d4813a` | 288 | `--color-primary` |
| `#1c1408` | 237 | `--color-text` |
| `#ef4444` | 126 | `--color-danger` |
| `#f8f6f3` | 79 | `--color-bg` |
| `#22c55e` | 55 | `--color-success` |
| `#f59e0b` | 48 | `--color-warning` |
| `#f0ebe5` | 34 | `--color-border-light` |

This is a mechanical, case-insensitive find-and-replace over ten pairs — not
3,188 individual judgement calls. The remaining ~31% is a long tail of one-off
badge and chart colours that can be left alone or handled opportunistically.

**Secondary benefit:** the brand-colour setting currently reaches the website
and order app but can never reach the admin. Migrating to variables fixes that
in the same stroke.

### 1.5 Minor observations

- **`useIsMobile` is used by 2 of 55 pages** (`MediaLibraryPage`,
  `ContentHubPage`). Everything else relies on CSS reflow. Given §1.2, this is
  mostly fine — flag it, don't fix it speculatively.
- **Navigation is dense:** 59 items across 7 groups, with 6 surfaced in the
  mobile bottom bar. Not wrong for a system this size. Out of scope here.

---

## 2. Decision required before Stage 2

**Do you want dark mode in the admin at all?**

- **Yes** → run Stages 1–3 below.
- **No** → run Stage 1 only, then delete the toggle from `AppShell` and the
  `[data-theme="dark"]` blocks from `index.css`. A button that half-works is
  worse than no button, and this saves the entire migration.

Stage 1 is worth doing under either answer.

---

## 3. Implementation stages

### Stage 1 — Enforce the design system going forward (small, no risk)

Prevents the problem getting worse while the decision above is pending.

1. Add an ESLint rule banning hex literals in `style={{…}}` objects within
   `src/pages/**`, set to `warn`.
2. Baseline existing violations so only *new* ones surface.
3. Document the ten canonical mappings from §1.4 in `CLAUDE.md` so future work
   reaches for variables first.

*No runtime change. Nothing can break.*

### Stage 2 — Mechanical migration of the top ten (medium, staged)

Only if dark mode is staying.

Order by traffic so regressions surface on screens that get looked at daily:

1. `DashboardPage` (150 literals)
2. `OrdersPage` (84)
3. `ReportsPage/ReportsTabPanels` (180)
4. `ForecastPage` (166)
5. …remaining pages in descending count

Per page:
- Case-insensitive replace of the ten mappings → `var(--color-…)`
- Visually diff light mode — **it must be pixel-identical**, since every
  mapping resolves to the same value it replaced in light theme
- Then check dark mode, which is where the actual improvement appears

**Do not migrate all pages in one commit.** One commit per page, or per small
group, so a regression bisects cleanly.

### Stage 2b — Shared components (do this BEFORE the rest of Stage 2)

Discovered while migrating `OrdersPage`. `src/components/` holds **495 hex
literals, 366 of them canonical** — and it is outside both the ESLint guard's
`src/pages/**` scope and the page-by-page migration order, so nothing in the
original plan ever reaches it.

These are shared components used by all 55 pages. `Badge` is the clearest case:

```js
// SharedUI.tsx — gray variant is three of the ten canonical values
gray: { bg: '#F8F6F3', text: '#6B5D4F', border: '#E8E0D8' },
```

Until this is migrated, every badge in the admin stays light in dark mode
regardless of how many pages are done.

Highest leverage in the whole migration — `SharedUI.tsx` is 49 literals and
fixes badges everywhere at once. Do it first, in this order:

1. `SharedUI.tsx` (49)
2. `CustomerCreditSection.tsx` (33)
3. `MediaPicker.tsx` (29), `CustomerDepositSection.tsx` (29)
4. `Customer360Drawer.tsx` (26), then descending

Also widen the ESLint guard's `files` glob from `src/pages/**` to include
`src/components/**`, and regenerate the baseline, so the ratchet covers them.

### Stage 2c — Component subdirectories (missed by Stage 2b's file list)

The Stage 2b file list was built from a non-recursive `src/components/*.tsx`
glob while quoting a recursive total, so two subdirectories were never listed.
**184 canonical literals remain** after the eleven leaf components:

| Location | Canonical hexes | Files |
|---|---|---|
| `src/components/content-editors/` | ~110 | 14 |
| `src/components/ui/` | ~30 | 9 |
| `src/components/ErrorBoundary.tsx` | 1 | 1 |

Both directories **are** covered by the widened ESLint guard, so they are
protected against regression — they simply have not been migrated.

**`src/components/ui/` is a different shape and needs care.** It is the design
system (Button, Card, Input, Modal, Badge, Tabs…) and it styles via **Tailwind
v4 arbitrary-value classes**, not inline style objects:

```jsx
primary: 'bg-[#D4813A] hover:bg-[#B5692E] text-white shadow-sm',
```

Two consequences:

1. **The ESLint guard is blind to these.** It scans `style={{…}}` objects only,
   so `ui/` shows 3 baselined violations against ~30 actual literals. New
   Tailwind-class hexes can land here unnoticed. Extending the rule to cover
   `bg-[#…]` / `text-[#…]` class strings is worth doing, but is its own task.
2. **The mechanical replacement still works**, verified against Tailwind v4.2:
   `bg-[#D4813A]` → `bg-[var(--color-primary)]` compiles to
   `background-color: var(--color-primary)`, and opacity modifiers survive —
   `ring-[var(--color-primary)]/20` emits
   `color-mix(in oklab, var(--color-primary) 20%, transparent)`.
   The brackets are already present, so the same ten-pair substitution applies
   unchanged.

Order: `content-editors/` first (bulk, same inline-style shape as everything
migrated so far), then `ui/`, then `ErrorBoundary.tsx`.

### Stage 2d — Preview components must NOT follow the admin theme (regression)

A class of site the mechanical substitution gets wrong, found in the top-25
page batch. Some components render a **mock of an external surface** — the
customer-facing site, a Google search result. Their colours are preview
fidelity, not admin chrome, and must stay fixed literals.

The substitution is invisible to every check in the Stage 2 prompt: it passes
`tsc`, tests and eslint, and is pixel-identical in admin *light* mode, because
`--color-text` resolves to exactly the literal it replaced. It only breaks in
dark mode.

**`ContentHub/BrandKitCards.tsx` — confirmed broken.** Renders `header-light`
and `header-dark` previews of the customer site:

```jsx
const dark = kind === 'header-dark';
background: dark ? 'var(--color-text)' : '#FFFDF9',   // was '#1C1408'
color:      dark ? '#f5e6cc' : 'var(--color-text)',   // was '#1C1408'
```

In admin dark mode `--color-text` is `#F0EAE0`, so the dark-header preview
renders near-white and the light-header preview gets near-white text on
`#FFFDF9` — invisible. Neighbouring literals (`#2a1a0a`, `#F0EBE4`) were left
alone because they fall outside the ten, so the preview is now half
theme-locked and half theme-following.

**`content-editors/SeoSnippetPreview.tsx` — confirmed broken.** A Google SERP
mock. `background: var(--color-bg)` goes near-black in dark mode while the
Google link blue `#1a0dab` and URL green `#006621` stay hardcoded, destroying
both contrast and the point of the mock (a real SERP is always white).

**`content-editors/VisualBlockPreview.tsx` — review, likely acceptable.** Uses
`background: var(--color-text); color: var(--color-bg)` as a deliberate
inversion. It flips from a dark panel to a light one in dark mode, but stays
internally consistent and readable in both. Judgement call, not a defect.

**Fix:** revert the substitution at preview sites in the first two files back
to fixed literals, and add a comment marking them as preview fidelity so a
later sweep does not re-migrate them.

**Rule for the remaining work:** before migrating a file, ask whether it
renders a mock of something outside the admin. If so, its colours are content,
not theme. Grep for `preview`, `Preview`, `mock`, `snippet`, `BrandKit`.

### Stage 2e — Themed text on hardcoded surfaces (29 sites, 17 invisible)

The most serious defect found. **The migration caused it**, and it follows
directly from the ten-mapping set being incomplete.

The ten mappings theme text, borders and status colours but **not surfaces**.
`#fff` is not among them, so every white background stayed a hardcoded literal
while the text on it became `var(--color-text)`. In dark mode that is
`#F0EAE0` — near-white text on a white box.

```jsx
// before: dark text on white — readable in dark mode, just un-themed
background: '#fff', color: '#1C1408'
// after: near-white on white — 1.2:1
background: '#fff', color: 'var(--color-text)'
```

Measured contrast across the tree: **29 failures, 17 at 1.1–1.2:1**, mostly
form inputs (`SharedUI` Input, `ItemSearch`, `RichTextEditor`, the content
editors, and a dozen pages).

**The existing mitigation never worked.** `index.css:861` tries to catch this:

```css
[data-theme="dark"] [style*="background: #fff"] { … }
```

React sets inline styles through the CSSOM, and the browser serialises the
attribute as `background: rgb(255, 255, 255)`. Verified in Chromium: neither
`[style*="background: #fff"]` nor `[style*="background: white"]` matches. Only
the rule's `.bg-white` selector has ever fired. Delete the two attribute
selectors — they are dead weight that created false confidence.

**Fix — add the missing surface mapping (11th):**

| Hex | Variable | Light value |
|---|---|---|
| `#fff` / `#ffffff` / `white` | `--color-surface` | `#FFFFFF` |

Light mode stays pixel-identical, same as the other ten. Apply to
**background properties only** — `color: '#fff'` is white text on a coloured
button and is correct in both themes. This resolves all 17 invisible sites.

**The ~12 tint backgrounds need judgement, not a mapping.** `#F9F5F0`,
`#FAF7F3`, `#FAF7F4`, `#FEF3E8`, `#FFF7ED`, `#FEE2E2` are semantic tints with
no dark equivalent. Per site, either revert the text to a literal (keeps the
pair un-themed and readable) or introduce a proper tint variable. Do not guess.

**Method note.** Every one of these passed `tsc`, tests, eslint and the
light-mode invariant. The invariant is blind by construction: literal and
variable agree in light mode and diverge only in dark. Contrast has to be
checked directly — a script computing WCAG ratios against the
`[data-theme="dark"]` values catches this class in seconds and should run
before the remaining files are migrated, not after.

### Stage 3d — The stylesheet was never in scope (160 literals)

Found by the Stage 3b visual walk, which caught what static analysis could not.

Every stage so far scoped to `.tsx` files. `src/index.css` — 2,937 lines — was
never migrated, never audited, and is not covered by the ESLint guard, which
only inspects `style={{…}}` objects in `src/pages/**` and `src/components/**`.

**160 hardcoded colour literals sit in its rules**, outside the `:root` and
`[data-theme="dark"]` blocks where literals belong. 125 are the canonical ten:

| Hex | Count | | Hex | Count |
|---|---|---|---|---|
| `#e8e0d8` | 27 | | `#9c8e7e` | 15 |
| `#fff` | 26 | | `#6b5d4f` | 15 |
| `#1c1408` | 25 | | `#d4813a` | 11 |
| `#f8f6f3` | 16 | | others | 25 |

These rules do not respond to `[data-theme="dark"]` at all, which is why the
admin still shows light surfaces in dark mode. Confirmed example:

```css
/* index.css:803 */
.modal-backdrop .modal-container { background: #fff; }
```

This accounts for the failures the visual walk named — modals, the cheat
sheet, Inventory tabs, Brand Kit — none of which any `.tsx` change could fix.

**This is the highest-value work remaining and it is mechanical.** The same
ten mappings apply, and `var()` in a stylesheet is ordinary CSS with none of
the caveats that applied to inline styles, Tailwind classes or SVG attributes.
Light mode stays byte-identical by the same construction as everywhere else.

Do this **before** deciding Stage 3c: much of what looks wrong in dark mode
today is the stylesheet, not the badge palette, and the badge question cannot
be judged fairly until the surfaces behind them are correct.

**Also extend the guard.** The ESLint rule cannot see CSS. Either add a
stylelint-style check for hex literals outside `:root`/`[data-theme]` blocks
in `src/**/*.css`, or accept that this file needs manual discipline — but do
not assume the existing guard protects it.

### Stage 3 — Long tail and verification

#### Stage 3a — Dead attribute selectors (done in Stage 2e)

Removed from `src/index.css`:

```css
[data-theme="dark"] [style*="background: #fff"],
[data-theme="dark"] [style*="background: white"]
```

Kept `[data-theme="dark"] .bg-white`. Confirmed absent on tip; React serialises
inline styles as `background: rgb(255, 255, 255)`, so the attribute selectors
never matched.

#### Stage 3b — Visual dark-mode walk (report only; no code changes)

Walk Dashboard, Orders, Inventory/Reports, Settings, Menu modal, ContentHub at
desktop and 375px. Screenshots under `/opt/cursor/artifacts/theme-qa/`. Do not
start Stage 3c until 3b is reviewed.

#### Stage 3c — Status palette (DESIGN DECISION, gated on 3b)

~937 remaining literals are semantic variants (danger/success/warning shades,
tints, brown text). Cannot be mechanically mapped without light-mode change.
Requires explicit decision on whether status badges should theme, then new
variable pairs (`--color-danger-strong`, `--color-danger-bg`, …) in `:root` and
`[data-theme="dark"]`.

---

## 4. Explicitly out of scope

- Wrapping tables in `.table-scroll` (§1.2 — no user-visible effect)
- Navigation restructuring (§1.5)
- Adding `useIsMobile` to pages that reflow correctly via CSS
- Any change to `PageShell` / `PageHeader` (§1.1)

---

## 5. Verification

Light mode is the regression risk, not dark mode. After each Stage 2 commit:

```bash
cd apps/admin-dashboard && npm test
```

The migration is value-preserving in light theme by construction — every
mapping substitutes a variable whose `:root` value is byte-identical to the
literal it replaces. Any visible light-mode change means a mapping was applied
to the wrong property and should be reverted rather than adjusted.

---

## 6. What is genuinely left (Revision 2)

Everything above §6 is history. It is kept because the reasoning still holds and because the
"action: none" verdicts stop finished questions being reopened. This section is the only part
that describes outstanding work.

Measured on the current tip of `claude/service-availability-maintenance-zj4whc`.

### 6.1 The hex tail — 647 literals across 70 page files

Down from 3,188. Variable usages are now 3,110, so roughly 83% of the migration has landed and
the ten-value mechanical pass of §1.4 is done. What is left is **not** another find-and-replace;
these are the one-off shades §1.4 predicted would need judgement.

Concentration, highest first:

| File | Literals |
|---|---|
| `ForecastPage.tsx` | 39 |
| `DashboardPage.tsx` | 34 |
| `TestChecklistPage.tsx` | 33 |
| `ReportsPage/ReportsTabPanels.tsx` | 29 |
| `MediaLibraryPage.tsx` | 26 |
| `MenuPage/MenuItemEditorModal.tsx` | 22 |
| `CustomersPage.tsx` | 22 |
| `DeliveryPage.tsx` | 21 |
| `ServiceAvailabilityPage.tsx` | 20 |
| `OrdersPage.tsx` | 20 |
| `OnlineOrderingPage/orderingControlUi.tsx` | 20 |
| `SmsPage/RecipientsTab.tsx` | 19 |

Those twelve files hold 305 of the 647 — 47%. The rest is a thin scatter.

**This is gated on Stage 3c, not on effort.** Most of the remainder is status colour: badge
tints, chart series, danger/success/warning shades that have no existing variable. Replacing
them requires deciding *what the dark-mode value should be*, which is a design decision, not a
substitution. Do not let anyone run a bulk pass over these — a wrong mapping here changes light
mode, which §5 identifies as the actual regression risk.

Recommended order: do the Stage 3b visual walk first (it has still not been done), then decide
Stage 3c, then migrate the twelve files above. Migrating before the walk means guessing.

### 6.2 Six hand-rolled overlays skip the shared mobile treatment

The bottom-sheet block at `index.css:705` is scoped to `.modal-backdrop .modal-container`.
`components/SharedUI.tsx:405` is the only component that renders `modal-backdrop`, so it is the
only one the rule reaches. All 34 page files that render `<Modal>` resolve to it — either
directly, or through the deprecated `components/Layout.tsx` re-export — so they all inherit the
treatment correctly.

**Dead second Modal.** `components/ui/Modal.tsx` is a separate implementation, exported from
`components/ui/index.ts` but imported by no page. Its root is Tailwind `fixed inset-0` with no
`modal-backdrop` class, so the mobile rule cannot match it — yet the comment at line 46 states
that `modal-container` "is the hook our global mobile @media rule targets so the dialog snaps to
a full-width bottom sheet on phones." That is false for this component. It also hardcodes
`bg-white`, relying on the `.bg-white` dark-mode hack §3a deliberately kept. Delete it, or fix
the class and the comment. Leaving it is how someone imports it in six months and ships a modal
that is broken on phones and in dark mode at the same time.

Eight page files build their own `position: 'fixed'` overlay in an inline style, and those
inherit nothing.

Two of the eight are fine and should be left alone:

- `ServiceAvailabilityPage.tsx` — the fixed element is a toast, not a modal.
- `MediaLibraryPage.tsx` — already branches on `useIsMobile` and goes full-screen with
  `paddingBottom: 96`. This is the pattern the others should copy.
- `MenuPage/ImageCropModal.tsx` — already full-screen with `role="dialog"` and `aria-modal`.

The remaining six have a real mobile problem:

| File | Overlay | Behaviour on a 320–390px phone |
|---|---|---|
| `OrdersPage.tsx` | right drawer, `width: min(420px, 100vw)` | Full width, but `padding: 24` on all sides and no safe-area inset — content runs under the home indicator. |
| `CustomersPage.tsx` | right drawer, `width: min(480px, 100vw)` | Same. Also `zIndex: 40/50` as raw numbers rather than the `--z-*` scale. |
| `WebhooksPage.tsx` | right panel, `maxWidth: 480`, `height: 100%` | Full width; no safe-area inset; raw `zIndex: 40`. |
| `DeliveryPage.tsx` | centred card, `maxWidth: 480`, backdrop `padding: 24` | 48px of the 320px viewport is spent on backdrop padding. |
| `MenuPage.tsx` (recipe) | centred card, `width: 90%`, `maxHeight: 80vh` | Cramped; `80vh` not `80dvh`, so the mobile browser chrome eats the bottom. |
| `MenuPage.tsx` (barcode) | centred card, `width: 90%`, `maxWidth: 360` | Same. |

Two defects are shared by **all six, and by the shared Modal as well**:

1. **No body scroll lock.** Nothing in `src/pages` sets `document.body.style.overflow`. On a
   phone, scrolling inside an open drawer scrolls the page behind it.
2. **No safe-area insets except the shared Modal's footer.** No page-level overlay references
   `env(safe-area-inset-*)` at all.

`ContentEditorSheet.tsx`, built during the Content Hub mobile work, already solves both — it
portals, locks body scroll and restores the previous value, moves focus to the close button and
returns it to the trigger on close, and pads all four safe-area insets. **That component is the
reference implementation.** The right fix is to lift its behaviour into the shared Modal and then
convert the six, not to reimplement it six more times.

### 6.3 There is no real layout test coverage — and one suite faked it

`ContentHub.mobileEditorSheet.test.tsx` contained a helper, `applyMobileViewportCss(width)`, that
injected its own stylesheet declaring `width: ${width}px; overflow-x: hidden` on the very
elements the test then measured, and asserted `document.documentElement.scrollWidth <= width`.
The assertion could not fail. Proven twice: disabling the real mobile media query entirely left
all six tests green, and forcing `.content-editor-sheet { position: static; width: 3000px }` also
left all six green.

jsdom has no layout engine. `scrollWidth` is not a measurement there — it is whatever the test
put in. **Overflow assertions belong in Playwright against a real browser at a real viewport, or
they belong nowhere.** A vitest suite may assert structure (the sheet mounted, focus moved, the
draft label reads correctly); it may not assert pixels.

Outstanding:

- Replace the faked assertions with Playwright checks at 320 / 375 / 390px (in progress).
- Sweep the other suites for the same pattern — any test that both writes CSS and measures it.
- Once §6.2 lands, add one Playwright spec per converted overlay rather than per page.

### 6.4 Two confirmed CSS defects, already fixed — noted so they are not reintroduced

- `index.css:2100` — `.page-header-actions { flex-shrink: 0 }` forced header buttons past the
  viewport edge on phones. Now overridden inside `@media (max-width: 767px)`.
- `index.css:2885` — `.hub-block-more-menu { position: absolute; right: 0; min-width: 200px }`
  opened partly off-screen for right-aligned rows. Now a collision-safe action sheet on mobile.

Both were found by reading CSS, not by a test — which is the point of §6.3.

### 6.5 Sequencing

1. **Stage 3b visual walk** — still not done, and §6.1 is blocked behind it.
2. **Lift `ContentEditorSheet`'s behaviour into the SharedUI Modal** (scroll lock, focus
   management, four-sided safe area). This improves all 34 pages in one change. Delete the dead
   `components/ui/Modal.tsx` in the same commit so there is one Modal, not two.
3. **Convert the six overlays in §6.2** to the SharedUI Modal, one commit each.
4. **Real Playwright layout coverage** (§6.3), added alongside step 3 so each conversion ships
   with a test that can actually fail.
5. **Stage 3c decision, then the twelve files in §6.1.**

Steps 2 and 3 are worth more to a phone user than the whole of step 5. Dark mode is 83% done and
mostly invisible in daylight; a drawer that scrolls the page behind it is felt every day.
