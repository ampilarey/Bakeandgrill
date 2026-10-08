# Admin Dashboard — Theming & Mobile Plan

**Scope:** `apps/admin-dashboard` (70 page files)
**Status: Revision 2** — the original audit's conclusions were correct and most of the work has
since shipped. Revised after re-measuring against the code and after the Content Hub mobile work
introduced a reusable sheet pattern that did not exist when this was written.

| Item | Original finding | Today |
|---|---|---|
| Page chrome / structure | Uniform, leave alone | Unchanged. Still correct. |
| Mobile tables | Handled by a catch-all; action: none | Confirmed. 55 pages carry tables, none need a wrapper. |
| Shared modals on mobile | Not covered by the original audit | **Shipped for SharedUI Modal + the six page overlays** — bottom sheet, body-scroll lock, focus return, four-sided safe area, portal to `document.body`. `components/ui/Modal.tsx` still exists (used by `VideoStudioModal`) — see §6.2. |
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
| `#b74b0c` (was `#d4813a` until 2026-09-30, see `docs/brand/PALETTE.md`) | 288 | `--color-primary` |
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

**Done 2026-10-08** (owner: "many admin pages doesn't follow the branding and
mobile friendly"). Every page walked at 390px and 1366px with screenshots.

- Status colours stay green / amber / red. Everything that was blue, indigo,
  violet, purple, teal, sky or emerald now draws one of three brand tones,
  each a `-bg` / `-text` / `-border` triple that flips in dark mode:
  `--color-tone-rust-*` (in progress, info, links), `--color-tone-brown-*`
  (roles, types, plain labels) and `--color-tone-gold-*` (ready, nearly
  done). Badge keeps its old `blue` / `purple` / `teal` names and draws
  rust / brown / gold for them. `--color-info` is cocoa (`#8A6A4F`), not blue.
  Cool greys (`#6b7280` family) became the warm text and border tokens.
- Icons are lucide line icons; `InlineIcon` (SharedUI) sits one in a run of
  text. No colour emoji as icons.
- `Switch` (SharedUI) is the one on/off control: rust on, warm grey off,
  `role="switch"` so the phone 44px rule leaves it alone.
- Shared fixes that reach every page: Badge turns `dine_in` into "Dine in";
  StatCard steps long figures down on a phone; DateInput pairs fill one row;
  visible file pickers get the secondary button; a table's empty message
  stays in view on a phone; grid children may shrink; the tab row centres
  the active tab.
- A React trap found on Purchasing → Suppliers: a `borderColor` that turns
  `undefined` beside a `border` shorthand drops to the text colour (a black
  frame). Set the whole `border` instead.

#### Stage 3e — Deep walk: every tab, pop-up and detail page

**Done 2026-10-08** (owner: "Did u check the each and every pages in admin,
sub page, sub sub pages? And the mobile layout of each too?"). A crawler
opened every route, every tab group two levels deep, the safe pop-ups on each
tab (add / edit / view forms and their own tabs) and the detail pages reached
from lists, at 390px and 1366px: 271 screens on a phone and 277 on a
computer, each checked for overflow, clipping, off-brand colour, emoji and
failed API calls, then the phone set walked again after the fixes and
compared screen by screen, and both again in dark mode. What it found, and
the rule each fix leaves behind:

- Native controls were browser blue: every tick box, radio, slider and
  progress bar. `accent-color: var(--color-primary)` on them in `index.css`;
  the dark theme also sets `color-scheme: dark` so date pickers, select lists
  and scrollbars draw dark.
- The phone rule that makes inputs 44px tall caught tick boxes and radios too,
  so a radio sat in a 44px box away from its label. They are exempt and 18px
  (zero-specificity, so a page's own size wins).
- **Pop-ups render outside the page.** SharedUI `Modal` portals to `<body>`,
  so a rule written as `.specials-page .specials-day-chip` never reaches a
  pop-up: Specials' Sun–Sat buttons ran together as bare text. A pop-up's
  classes are named on their own, never under a page class.
- Row actions: `Btn variant="danger-outline"` (red words on the secondary
  button) for a row's Delete / Remove / Reject / Cancel. Solid `danger` is for
  the final "yes, do it": a confirm, a bulk action.
- Every on/off control draws like `Switch`: Menu items' availability switch
  was green, the ordering and delivery settings toggles used a hard-coded off
  colour, `ui/Toggle` now renders `Switch`, and one Settings switch named an
  undefined `--color-accent`, so it showed no track when on.
- "Select all" chips (All Types, Every day) were green beside rust chips; they
  are rust like the rest. Chip, notice and code-box tints (`#FEF3E8`,
  `#F5F0EA`, `#f0fdf4`, `#fff`) stayed light in dark mode; they use the tone,
  border-light, success and surface tokens.
- `Input` (SharedUI) dropped a caller's `flex`: React writes an undefined
  longhand as `''`, and `flexGrow: ''` after `flex: '1 1 100%'` cleared the
  shorthand, so the menu photo address stayed a stub. It now forwards only the
  keys the caller set.
- A two-column form row on a phone needs `minmax(0, 1fr)`: with `1fr` a date
  field's minimum width pushed the second column past the pop-up's edge.
- SMS → Library: a long `{{reference}}` line in a template card pushed the
  Edit button past a phone's edge. A flex child that holds free text needs
  `minWidth: 0` and wrapping; the button column `flexShrink: 0`.
- Orders' phone filters forced every select to 100%, including "Per page:
  [25]", which then ran past the panel beside its own words; such a label
  takes `mobile-filters-inline`.
- Colour variables that do not exist render as nothing: `--color-accent` (a
  switch with no track), `--color-surface-alt` (two boxes with no
  background). Fallback hexes (`var(--color-primary-soft, #FFF7ED)`) stay
  light in dark mode. Use a token from `index.css`; the walk now checks
  every `var(--…)` against the ones defined.
- Close buttons, warnings and ticks drawn with ✕, ⚠ and ✓ are lucide `X`,
  `AlertTriangle` and `Check` (`InlineIcon` in a label), Modal's included.
  A ✓ is left only inside a `<select>` option, which can hold text alone.
- A field styled with padding but no border draws as a bare browser box
  (GST settings had five); give it `--color-border` and the surface like
  its neighbours.
- Five stylesheet literals that stayed light in dark mode (a skeleton
  shimmer, two borders) are tokens; the hex-in-CSS baseline is down to 19
  and `npm run lint` passes again.
- Four things that were broken, not just plain: Inventory → Waste logs →
  Summary was a server error (a bare `created_at` made ambiguous by a join),
  Reports → Customers → Loyalty and → Promotions asked routes that do not
  exist (`/reports/loyalty`, `/reports/promotions`; both live under
  `/admin`), and Finance → GST → Output and Input GST printed the raw JSON.
  Each has a test. Every API call in the admin was then checked against
  `route:list` for path and method; none is left pointing nowhere (one
  unused helper that did was deleted).
- **Dark mode, page by page.** The dark walk (268 phone and 277 computer
  screens) flagged every box whose background stayed light. Behind them were
  about 150 hard-coded light-theme colours in page styles: pale panels
  (`#FAF7F3`, `#FDFAF7`, `#FAFAF8`…), tab-strip tracks (`#F5F0EB`), picked
  chips (`#F5E6D3`, `#FEF3E8`), pale red / amber / green edges (`#FECACA`,
  `#FCA5A5`, `#FDE68A`, `#86EFAC`), and dark-brown text (`#6B5D4F`,
  `#4A3728`, `#9A3412`) that disappears on a dark card. They map to tokens
  by role:

  | Role | Token |
  |---|---|
  | Pale panel inside a card, row hover, table stripe | `--color-bg` |
  | Tab-strip track, progress track, image placeholder, hairline | `--color-border-light` |
  | Field and box edge (`#E8DDD0`, `#EDE4D4`) | `--color-border` |
  | Picked chip, highlighted row | `--color-tone-rust-bg` (text `--color-tone-rust-text`) |
  | Red / amber / green edge | `color-mix(in srgb, var(--color-danger) 35%, transparent)` (warning, success alike) |
  | Amber or orange words | `--color-warning-strong` |
  | Behind a photo or video, the sign-in page, the bulk-selection bar | `--color-backdrop` / `--color-backdrop-text` |

  `--color-backdrop` is new: near-black in both themes. Pages had used
  `--color-text` for it, which turns cream in dark mode, so the sign-in page
  was a cream sheet round a dark card. Badge's `yellow` is the gold tone;
  Reservations' tab underline was still the retired amber `#D4783A`.
  Left as they are on purpose: print and QR previews (paper is white), the
  camera view, the Google-style search preview, the website hero preview
  (`#1C1408`, as the site paints it), and preset colours that are data (TV
  screen themes, hero swatches, the cut-out backdrop). Hex literals in page
  styles went from 222 to 66, and each that is left is one of those or white
  words on a coloured button.


#### Stage 3f — Tablets, every pop-up, and the screens no walk had reached

**Done 2026-10-08** (owner: "Did u check all?"). Not quite, until now. The
walks had used a phone and a computer, and the computer layout has a
tablet form: `AppShell`'s `useViewportBand()` is `tablet` from 768 to
1023px (the rail folds to icons) and the CSS's compact band runs to 1199px,
so an iPad, 768 upright and 1024 on its side, sees the computer layout in
less room than it was drawn for. Walked at 768 and 1024 (277 screens each),
plus every pop-up behind a button that changes data (Delete, Send, Approve,
Pay…; writes mocked, no six-per-screen cap) on phone and computer, a
catering quote's page (no quote existed in the local data), and every
sign-in screen at three sizes in both themes. What it found:

- **Top bar.** The six section tabs ran under the search and bell buttons;
  Analyze, System and Team were out of sight and the strip's scroll had no
  hint. The bar now uses `shortLabel` (as `MobileTabBar` does; the rail
  keeps the full name and the tab's `aria-label` carries it), search and the
  name chip are icons below 1200px, and below 1024px only the open section
  keeps its label.
- **Rail.** `AppShell` folded the rail when the window *entered* the tablet
  band but not when it *opened* there, so an iPad started with a 220px rail.
  The first state now honours the band.
- **Wide content.** The phone block in `index.css` had the only rules that
  let a `.table-scroll` scroll and a grid item shrink below its content.
  Above 767px a wide table was simply cut off by `main` (`overflow-x: clip`)
  or by a card with `overflow: hidden`. Those two rules now hold at every
  width. A `display: grid` stack of cards with no columns sizes its one
  column to the widest content in any card; give it
  `gridTemplateColumns: 'minmax(0, 1fr)'` (Kitchen's views).
- **Header buttons.** `.page-header-actions` was `flex-shrink: 0`, so a long
  row (Content Studio: EN/DV, status, Desktop/Mobile, View, Publish) ran off
  the page instead of wrapping; Publish was cut off on an upright tablet. It
  may shrink and wrap now.
- **Tab rows.** `.tab-scroll-row` scrolled only on a phone; it scrolls at
  every width now, with `.tab-scroll-wrap`'s fades and chevron. TV Signage's
  eight tabs use `TabScrollRow`.
- A catering quote's quantity − / + were unstyled buttons (a bare hyphen and
  plus); a line's Remove is `danger-outline`.
- **Hidden rules.** A comment in `index.css` had lost its closer, so it ran
  on to the next comment's and took seven rules with it: the website
  editor's Desktop / Mobile switch and "View live site" link drew as plain
  text. Two of the seven had also lost their selectors and styled the
  website rail deleted in August; they are gone. CSS comments do not nest
  and the build does not warn, so `npm run lint` now runs
  `scripts/check-css-comments.mjs`, which fails on a comment that opens
  another before it closes.
- Kitchen → Settings: each time slot is one line (name, from, to, remove)
  at every width; wrapping columns had put a slot's "to" hour and its
  remove button under the next slot's name.
- A `<summary>` styled `display: flex` loses the browser's disclosure
  arrow; TV Signage → Banner's closed "Appearance" and "Advanced" read as
  headings with nothing under them. Leave a summary's display alone.
- A row of filter chips beside a search box goes in `TabScrollRow` (inside
  a `flex: 1 1 …; min-width: 0` wrapper), not a bare `overflow-x: auto`
  div: Customers → Credit accounts cut its last chips off with no hint.
- **Dates and amounts.** At 768px six tables broke a date or an amount
  over two lines ("MVR" above "0.00", "2026-" above "10-08") while the card
  scrolled anyway. A cell holding a date, a time or an amount uses
  `TD_NOWRAP` (SharedUI), or a `whiteSpace: 'nowrap'` span when a note sits
  under the figure. Settlements, Credit accounts, the customer directory,
  Shifts, Kitchen → How it did and Profit & loss do.
- **Roles.** Only the owner and the manager have `admin.access`; staff are
  told so at sign-in. The manager was walked on a phone and a computer, and
  the walk logged every API call the server refused (the owner's had none).
  `PUT /api/site-settings` took `settings.update` but `GET` wanted
  `website.manage`, so a manager's Credit accounts, Refunds & payouts,
  Notifications, Online ordering and SMS automations showed their defaults
  ("Open", a blank limit, every switch "on") and Save would have written
  them over the owner's settings. Owner, approving the fix: "If the manager
  has given the permission he must see the permission." The read now takes
  either permission; without `website.manage` it returns
  `SiteSettingsController::operationsReadableKeys()` (what those screens
  save, plus the schedules, holiday presets and logo they show; a new
  display-only key goes in `OPERATIONS_DISPLAY_KEYS`). Every screen that
  saves site settings also refuses to save what did not load: Save stays
  off with a line saying why, the notification switches lock, the shift
  alerts Save waits for its values. Roles & permissions shows someone who
  cannot edit roles the explanation, the cheat sheet, "Only the owner
  changes…" and "What you can do": their own permissions by name and group
  from `GET /api/auth/me/permissions`. A sweep of every route for a role
  that may change something but not read it (manager, staff, kitchen) left
  one: a trade-account payment needs `customers.credit.repay`, which a
  manager holds, while the account needs `trade.view`, which they do not;
  only Wholesale (trade.view) offers it, so no manager screen reaches it.
  The calls still refused by design: the health banner's quiet check, the
  TV pairing list (owner only) and the X report for someone with no shift
  open.

Every pop-up behind a data-changing button (delete confirmations, pay link,
send, approve…) followed the rules already. Sign-in: password, PIN, two-step
code, forgot password and reset code all fit at 390, 768 and 1366px with no
light boxes in dark mode.

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

### 6.2 SharedUI Modal mobile treatment — shipped; `ui/Modal` still live

The bottom-sheet block at `index.css:705` is scoped to `.modal-backdrop .modal-container`.
`components/SharedUI.tsx` is still the only component that renders `modal-backdrop`.

**What shipped**

1. **SharedUI Modal** now follows the `ContentEditorSheet` pattern: portals to `document.body`,
   saves/restores `document.body.style.overflow` (so nested modals do not leave the page
   permanently locked), focuses the close control on open and returns focus on close, and pads
   safe-area insets on top/left/right on mobile (footer still owns `safe-area-inset-bottom`).
   Desktop look (sizes, colours, borders, radii) is unchanged.
2. **Six hand-rolled overlays converted** to SharedUI Modal (one commit each):
   `OrdersPage`, `CustomersPage`, `WebhooksPage` (logs panel), `DeliveryPage` (order detail),
   `MenuPage` recipe, `MenuPage` barcode label. Left alone as planned:
   `ServiceAvailabilityPage` (toast), `MediaLibraryPage` (already full-screen via `useIsMobile`),
   `MenuPage/ImageCropModal` (already `role="dialog"` full-screen).
3. **Playwright coverage** — `e2e/tests/go-live/10-admin-shared-modal-overlays.spec.ts`
   (`--project=local`) at 320 / 375 / 390. Asserts real layout only (no injected CSS): no
   horizontal document overflow, close control inside the viewport, modal-container fits, body
   scroll locked while open. Proven to go red when scroll-lock is removed and when the mobile
   sheet is forced to `min-width: 3000px`.

**Not deleted — plan was wrong about "imported by no page".**
`components/ui/Modal.tsx` is still exported from `components/ui/index.ts` and **is imported by
`components/VideoStudioModal.tsx`** (Tailwind `fixed inset-0`, no `modal-backdrop`, so the
mobile sheet CSS never reaches it). Deleting it was blocked until VideoStudio is migrated to
SharedUI Modal. Do not leave that migration half-done: either migrate + delete, or add
`modal-backdrop` / drop the misleading comment.

**FINDING (app, not fixed here):** at **320px** the SharedUI Modal overlay specs fail
`documentElement.scrollWidth` (~4px over). 375 / 390 are green.

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

Outstanding / shipped:

- ~~Replace the faked assertions with Playwright checks at 320 / 375 / 390px~~ **Done**
  (`09-content-hub-mobile-layout.spec.ts`, `10-admin-shared-modal-overlays.spec.ts`).
- Sweep the other suites for the same pattern — any test that both writes CSS and measures it
  (Signage / ContentHub polish self-fulfilling asserts stripped earlier on this branch).
- ~~Once §6.2 lands, add one Playwright spec per converted overlay~~ **Done**.

### 6.4 Two confirmed CSS defects, already fixed — noted so they are not reintroduced

- `index.css:2100` — `.page-header-actions { flex-shrink: 0 }` forced header buttons past the
  viewport edge on phones. Now overridden inside `@media (max-width: 767px)`.
- `index.css:2885` — `.hub-block-more-menu { position: absolute; right: 0; min-width: 200px }`
  opened partly off-screen for right-aligned rows. Now a collision-safe action sheet on mobile.

Both were found by reading CSS, not by a test — which is the point of §6.3.

### 6.5 Sequencing

1. **Stage 3b visual walk** — still not done, and §6.1 is blocked behind it.
2. ~~**Lift `ContentEditorSheet`'s behaviour into the SharedUI Modal**~~ **Done** (scroll lock,
   focus, four-sided safe area, portal). ~~Delete `components/ui/Modal.tsx`~~ **Blocked** —
   `VideoStudioModal` still imports it; migrate that first, then delete.
3. ~~**Convert the six overlays in §6.2**~~ **Done** (one commit per file / overlay).
4. ~~**Real Playwright layout coverage**~~ **Done** for the six overlays
   (`10-admin-shared-modal-overlays.spec.ts`). Content Hub coverage is in
   `09-content-hub-mobile-layout.spec.ts`.
5. **Stage 3c decision, then the twelve files in §6.1.**
6. **Follow-ups from this pass:** migrate `VideoStudioModal` → SharedUI Modal and delete
   `ui/Modal`; fix the real **320px** `scrollWidth` overflow (FINDING in §6.2 / §6.3).
