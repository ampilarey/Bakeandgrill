# Content & Branding Hub — Layout Redesign (desktop + mobile)

Status: **Built** (Content hub shell with Brand Kit + content editing). `ContentHubPage`, Brand Kit cards, and home layout editing are live. Original “proposed” framing is obsolete for the hub shell described here.

> Rescued from branch `claude/content-hub-layout-plan` (not written fresh on this branch).

---

**Scope:** Layout and navigation of `/content` only. No change to the content model, keys, scopes, or the Same/Different, on/off and reorder behaviours.
**Goal:** The hub is correct but still hard to use — a flat list of up to 124 blocks behind a thin section filter. Replace it with a two-level structure (sections overview → section editor) and put the live preview beside the editing, on both desktop and mobile.

---

## 1. What is wrong with the current layout

Observed in `ContentHubPage.tsx` + `index.css` (`.content-studio-*`):

1. **Flat list, too long.** Even filtered, "Pages" holds 44 blocks and "Homepage" 35. One scrolling column of near-identical cards.
2. **Preview is unreachable.** `LivePreviewFrame` renders at the **bottom of the blocks column** — you must scroll past every block to see the effect. On mobile it is effectively invisible.
3. **Section nav carries no information.** Desktop = plain text list; mobile = horizontal scrolling chips (poor discoverability, hides most sections off-screen). Neither shows how many blocks a section has or whether it has unpublished edits.
4. **Every block looks the same.** A boolean toggle, a colour, a hero-slides editor and a legal document all render as the same card with the same `key · type · locale · app` metadata line.
5. **Developer metadata is front and centre.** `home_hero_fallback_title · text · en · Website` means nothing to the owner and appears on every card.
6. **Header is overloaded.** Export, Import, Media, draft status and Publish compete for the same row; on mobile they wrap badly.
7. **Schedule-publish occupies prime toolbar space** although it is rarely used.
8. **No task-oriented entry.** Owners think "change my hero", "fix the delivery message" — not "edit block X".

---

## 2. Target structure

### 2.1 Desktop (≥ 1024px) — three zones

```
┌───────────────┬─────────────────────────────┬──────────────────┐
│ SECTION RAIL  │ SECTION EDITOR              │ LIVE PREVIEW     │
│ 240px sticky  │ flexible                    │ 400px sticky     │
│               │                             │                  │
│ BRAND         │  Hero                       │ [Website|Order]  │
│  Brand kit  6 │  ─────────────────          │ [Desktop|Mobile] │
│ HOME          │  ▸ Show this section  [on]  │                  │
│  Hero       2•│  ▸ Hero slides   (3 slides) │  ┌────────────┐  │
│  Homepage  35 │                             │  │            │  │
│  Announce.  4 │                             │  │  live page │  │
│ PAGES         │                             │  │            │  │
│  Contact   18 │                             │  └────────────┘  │
│  ...          │                             │                  │
└───────────────┴─────────────────────────────┴──────────────────┘
```

- **Section rail** — grouped into clusters (**Brand · Home · Pages · Order app · Settings**), each row showing an icon, the section name, its block count, and a **dot when it has unpublished edits**.
- **Section editor** — only the active section. Blocks grouped under sub-headings where a section is large (see §2.3).
- **Live preview** — always visible, sticky, with an **app toggle (Website / Order app)** and a **device toggle (Desktop / Mobile)**. This is the single biggest usability win: edit and effect side by side.

### 2.2 Mobile (< 768px) — two levels

**Level 1 — Sections overview (the landing screen).** A 2-column card grid replacing the horizontal chip strip. Each card: icon, section name, block count, and a dot if it has unpublished edits. Everything is visible without horizontal scrolling.

**Level 2 — Section editor (full screen).** Sticky header with a back arrow + section name; blocks stacked one per row; the existing sticky publish bar stays pinned at the bottom.

**Preview on mobile** — a floating "Preview" button in the section editor opens a **full-screen preview sheet** with the same app/device toggles, dismissible by swipe or a close button. Never buried at the bottom of a scroll.

### 2.3 Block card, simplified

Currently every card shows label, description, `key · type · locale · app`, History, Copy-from-other-app, editor, and a "resolved …" line.

New anatomy:

- **Line 1:** the plain-English label.
- **Line 2:** the helper sentence (what it is / where it shows) — always present; write one for any block missing it.
- **The editor**, sized to its type (a boolean is a switch on the same row as its label; a colour is a swatch; long text gets room).
- **A `⋯` menu** holding: History, Copy from other app, the raw value, and the technical key/type/locale. Nothing technical on the card face.
- **The Same/Different control** stays where it is — it is content-meaningful, not technical.

For large sections, group blocks under sub-headings (e.g. Homepage → *Specials*, *Featured*, *Categories*, *Social proof*, *CTA*) so no section is an undifferentiated run of 35 cards.

### 2.4 Header and toolbar

- **Primary, always visible:** draft-save status + **Publish (n)**.
- **Moved into a `⋯ More` menu:** Export, Import, Schedule publish, Media library link.
- **Search is promoted** to the header: one field that matches blocks by **label** (not key) across all sections, e.g. "hours", "logo", "delivery" — results show section + block, tapping jumps straight to it. This is the fastest path for an owner who knows what they want to change but not where it lives.
- **Locale switch (EN / DV)** stays, but as a compact segmented control.

### 2.5 Branding

The Brand Kit cards already exist. Layout only: **2-column grid on desktop, 1-column on mobile**, with the brand-kit summary strip pinned at the top of the section.

---

## 3. Implementation notes

- Work inside `apps/admin-dashboard/src/pages/ContentHub/`. Extract from `ContentHubPage.tsx`:
  - `SectionRail.tsx` (desktop rail + mobile card grid — one component, responsive)
  - `SectionEditor.tsx` (active section, sub-group headings)
  - `PreviewPane.tsx` (wraps the existing `LivePreviewFrame`; adds app + device toggles; renders as a sticky column on desktop and a sheet on mobile)
  - `BlockCard.tsx` (simplified anatomy + `⋯` menu)
- Reuse **all** existing editors, autosave, publish, schedule, history, Same/Different and section on/off logic unchanged. This is a presentation refactor.
- Drive the section clusters from a small config map (section → cluster, icon, sub-groups), not hardcoded JSX.
- Use the existing `useIsMobile()` hook and the established 768/1024 breakpoints.
- Preserve deep links: `/content?group=Branding` must still open that section directly; add `?section=` as an alias.

---

## 4. Tests

- Desktop renders rail + editor + preview; mobile renders the section card grid and no preview column.
- Tapping a mobile section card opens the section editor; back returns to the grid.
- The mobile preview sheet opens and closes.
- A section with unpublished edits shows the modified dot in both rail and grid.
- Search by label finds a block in a non-active section and navigates to it.
- The `⋯` menu exposes History and the technical key; the card face does not show `key · type · locale`.
- Deep link `/content?group=Branding` opens Branding.
- Existing hub tests (autosave, publish, Same/Different, section toggles) continue to pass unchanged.

---

## 5. Acceptance criteria

- [ ] No screen presents more than one section's blocks at a time.
- [ ] The live preview is visible **while editing** on desktop, and one tap away on mobile.
- [ ] Mobile navigation is a card grid — no horizontal chip scrolling.
- [ ] A block card shows no technical key, type or locale on its face.
- [ ] Every block has a helper sentence explaining what it does.
- [ ] Export / Import / Schedule are behind a More menu; Publish is always visible.
- [ ] Search finds blocks by their plain-English label across all sections.
- [ ] Branding renders as a 2-up card grid on desktop, 1-up on mobile.
- [ ] All existing hub behaviour tests still pass; admin build green; committed bundle matches a fresh build.

---

## 6. Out of scope

- Any change to content keys, scopes, or the Same/Different, on/off, and reorder semantics.
- Inline click-to-edit on the live preview (possible later).
- Changing the Media Library or Brand Kit card internals (layout/grid only).
