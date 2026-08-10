# Content Hub — Desktop Width Fix

Status: **Built** (content hub desktop width). Covered by `ContentHub.desktopWidth.test.tsx` and the live Content hub layout. Body is the rationale for that shipped tweak.

> Rescued from branch `claude/hub-desktop-width-plan` (not written fresh on this branch).

---

**Scope:** Desktop layout of `/content` only. No change to the content model, keys, scopes, or the Same/Different, on/off, reorder and copy behaviours. Mobile layout unchanged.
**Goal:** On desktop the hub currently renders **four competing columns**, leaving ~370px per editor on a 1440px screen (~290px on a 1280px laptop). Reduce it to two, and give the editor 3× the width.

---

## 1. The problem

A block set to "Different per app" renders `grid-template-columns: repeat(2, minmax(0,1fr))` **inside** the editor zone (`ContentHubPage.tsx` ~line 1027). Combined with the section rail and the permanently docked preview, desktop becomes:

```
[ rail 240px ][ website editor ][ order app editor ][ preview 400px ]
```

Measured on a 1440px viewport: 1440 − 240 − 400 − gaps ≈ 750px for the editor zone, split in two ≈ **370px per editor**. A rich-text or hero-slides editor at that width is unusable, and at 1280px it drops to ~290px.

Owner feedback: *"everything is shrieked [squeezed]."* Correct.

---

## 2. The fix — three changes

### 2.1 Per-app editors become TABS, not columns (the main win)

Inside a split block, replace the two-column grid with a segmented control:

```
┌──────────────────────────────────────────────┐
│ Delivery tagline        Same / Different ▾ ⋯ │
│ ┌──────────┬────────────┐                    │
│ │ Website  │ Order app  │   ← tabs           │
│ └──────────┴────────────┘                    │
│ [ full-width editor for the active tab ]     │
└──────────────────────────────────────────────┘
```

- One editor at a time, at the **full width of the editor zone**.
- The inactive tab shows a **dot when it has unpublished edits**, so nothing hides silently.
- Tab choice is **per block** and resets to Website on section change (not sticky globally — the owner is usually working on one app at a time within a block).
- Boolean blocks keep their current compact single-row rendering; do not tab a switch.
- The `⋯` menu, History, and copy-from-other-app continue to act on the **active tab's scope**.

### 2.2 Preview becomes toggleable and remembers state

- Add a **Preview** toggle button in the hub header.
- When on: preview docks as today (400px sticky right column).
- When off: it is removed from the layout entirely and the editor zone expands.
- Persist the choice in `localStorage` (e.g. `bg_hub_preview_open`).
- **Default:** off below 1600px viewport width, on at 1600px and above — so laptops get room by default and wide monitors keep the side-by-side benefit. Only apply the width-based default when no stored preference exists.
- Mobile is unaffected — it keeps the existing full-screen preview sheet.

### 2.3 Section rail collapsible (optional but cheap)

- A collapse control turns the 240px rail into an **icon-only strip (~56px)** with tooltips.
- Persist in `localStorage` (e.g. `bg_hub_rail_collapsed`).
- Section names remain available via `title`/tooltip and the existing label search.

---

## 3. Expected result (1440px viewport)

| Layout | Editor width |
|---|---|
| Today (4 columns) | ~370px |
| Tabs + preview on | ~750px |
| Tabs + preview off | **~1150px** |
| Tabs + preview off + rail collapsed | ~1330px |

Nothing is removed — both app values and the preview are one click away.

---

## 4. Rejected alternative (recorded)

**Page-level app switcher** — putting Website / Order app at the top of the page so the whole hub is in one app's mode. It also yields a single full-width editor, but it is effectively the old two-editor split that was deliberately merged into one hub, and it loses the at-a-glance sense of which blocks are shared versus split. Per-block tabs solve the width problem while keeping that clarity.

---

## 5. Tests

- A split block renders **tabs**, not two side-by-side editor columns; only one editor is in the DOM at a time.
- Switching tabs shows the other scope's value and edits write to that scope.
- The inactive tab shows a modified dot when that scope has an unpublished draft.
- A "Same in both" block renders a single editor with **no** tabs.
- A boolean block renders its compact single-row control (not tabbed).
- History and copy-from-other-app act on the **active tab's** scope.
- Preview toggle: on → preview column present; off → absent and the editor zone is wider; the choice survives a remount (localStorage).
- With no stored preference, viewport ≥1600px defaults preview on; <1600px defaults off.
- Rail collapse toggles to the icon strip and persists.
- Mobile behaviour is unchanged (section grid, no preview column, sheet still opens).
- All existing hub tests continue to pass unchanged.

---

## 6. Acceptance criteria

- [ ] No desktop layout shows more than **two** primary columns at once (rail + editor), plus the preview only when the user has it on.
- [ ] A split block's editor occupies the full editor-zone width; the other app is one tab click away.
- [ ] Unpublished edits on a hidden tab are visibly flagged.
- [ ] Preview and rail states persist across reloads.
- [ ] At 1280px the editor is comfortably usable (report the measured width).
- [ ] Mobile is untouched.
- [ ] Admin suite green against the baseline recorded at start; build green; committed bundle matches a fresh build.

---

## 7. Out of scope

- Any change to the content model, scopes, or Same/Different semantics.
- Mobile layout.
- Inline click-to-edit on the preview.
