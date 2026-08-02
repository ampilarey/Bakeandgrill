# Admin Dashboard — Theming & Mobile Plan

**Scope:** `apps/admin-dashboard` (55 pages)
**Status:** Audit complete, implementation not started

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

### Stage 3 — Long tail and verification

1. Sweep remaining ~988 one-off literals; convert what maps cleanly, leave
   genuinely bespoke chart/badge colours as-is.
2. Remove the `[style*="background: #fff"]` hack from `index.css` — it becomes
   dead weight once surfaces use variables.
3. Walk every page in dark mode at 375px width and confirm no dark-on-dark text.

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
