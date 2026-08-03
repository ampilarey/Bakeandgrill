# TV Signage — mobile layout audit and fix plan

Audit of `apps/admin-dashboard/src/pages/SignagePage.tsx` and
`apps/admin-dashboard/src/pages/signage/SignageDesigner.tsx` at a 390px viewport
(iPhone), which is where the reported breakage occurs.

## Root cause

The admin app already has a working mobile strategy: **class hooks styled by a
`@media (max-width: 767px)` block in `src/index.css`**. `.form-grid-2`,
`.form-grid-3`, `.stat-grid`, `.kds-grid`, `.table-scroll` and the modal
bottom-sheet all work this way (`index.css:470`, `:610-630`). `AppShell` also
already resolves a responsive band via `matchMedia('(max-width: 767px)')`
(`AppShell.tsx:46`).

`SignageDesigner.tsx` contains **zero `className` attributes**. Every style is an
inline `style={{…}}` object. Inline styles cannot be reached by a media query, so
the designer is structurally invisible to the app's entire responsive system. No
amount of CSS will fix it until class hooks exist.

That single fact explains why the designer is the worst screen in the app on
mobile, while `SignagePage` itself mostly survives — the latter uses
`.form-grid-2` / `.form-grid-3` hooks and `repeat(auto-fit, minmax(…))`.

## Defects

### D1 — Designer three-column grid collapses the canvas (critical)

`SignageDesigner.tsx:334`:

```ts
gridTemplateColumns: '160px 1fr 260px'
```

Hard-coded, no media query. At 390px the two fixed tracks plus gaps total ~444px,
already wider than the viewport. The `1fr` canvas column is squeezed to near zero
and the properties panel is pushed off-screen.

This is exactly the screenshot: a tall black sliver where the canvas should be,
and the "Slide / Name / Hero" panel cut off at the right edge.

### D2 — Drag-and-drop cannot work on a phone regardless of layout (critical)

Even with the grid fixed, a full-width canvas on a 390px screen is ~360px wide
representing a 1920px board — a scale of roughly 0.19. The resize handle is 12px
(`SignageDesigner.tsx:434`); at that scale a fingertip (~44px of real contact
area) covers a quarter of the slide. Precise placement is not achievable.

Fixing the grid alone would produce a designer that *looks* usable and isn't. The
touch editing model has to change, not just the column widths.

### D3 — Toolbar wraps to three rows (high)

Undo / Redo / 16:9 / preview-size select / Save as template / Cancel / Apply all
sit in one `flexWrap: 'wrap'` row (`:317`). On mobile this becomes three rows and
consumes roughly a third of the visible height before any content appears. The two
primary actions — Cancel and Apply to playlist — end up floating mid-page instead
of somewhere predictable.

### D4 — Nested scroll regions trap touch scrolling (high)

The Add palette is a vertical stack of ten-plus buttons in a 160px column, and the
element list below it is capped with `maxHeight: 220, overflow: 'auto'` (`:345`).
A scrollable box inside a scrolling page is a well-known touch trap: dragging
inside it scrolls the inner list and the page appears frozen.

### D5 — Tab row costs a third of the fold (medium)

Seven tabs (Screens & Groups, Playlists, Campaigns, Emergency, Prayer, Banner,
Devices) wrap to two rows at 390px, pushing real content below the fold before
anything has been read.

### D6 — Campaign window editor has a hard-coded grid (medium)

`SignagePage.tsx:1056`:

```ts
gridTemplateColumns: '1fr 200px auto'
```

No class hook, so the mobile block cannot reach it. The 200px and `auto` tracks
force horizontal overflow. Every other grid on the page uses
`repeat(auto-fit, minmax(…))` or a `.form-grid-*` hook; this one was missed.

### D7 — Preview-size selector is meaningless on mobile (low)

`maxW` resolves to 560 / 720 / 960 (`:292`) but the canvas is `width: '100%'`, so
below 560px the selector changes nothing. It occupies toolbar space to no effect.

### D8 — Canvas wrapper forces 360px of dark box (low)

`minHeight: 360` on the canvas wrapper (`:365`) is unrelated to the aspect-ratio
box inside it. In portrait orientation on a narrow screen this leaves a band of
empty dark background.

## Fix plan

### Phase 1 — Make the designer reachable by CSS

Add class hooks to `SignageDesigner.tsx`, keeping the existing inline styles as
the desktop defaults so nothing changes on desktop:

| Hook | Element |
|---|---|
| `signage-designer-toolbar` | the wrapping button row (`:317`) |
| `signage-designer-grid` | the three-column grid (`:334`) |
| `signage-designer-palette` | the Add column |
| `signage-designer-canvas-wrap` | the dark canvas wrapper (`:365`) |
| `signage-designer-props` | the right properties panel (`:442`) |

Then add one scoped `@media (max-width: 767px)` block in `index.css`, next to the
existing `.form-grid-*` rules and following the same `!important` convention.

Moving these declarations into CSS also removes inline hex literals from a
`pages/**` file, which is a small win against the rule in `CLAUDE.md`.

### Phase 2 — Single-column stack on mobile

`signage-designer-grid` becomes `grid-template-columns: 1fr`, with explicit
`order` so the sequence is: **toolbar → canvas → properties → palette**.

Canvas first because it is the thing being edited; palette last because adding
elements is the rarest action on a phone. Drop `minHeight` to `auto` (D8) and
remove the `maxHeight`/`overflow` cap on the element list (D4) so the page scrolls
as one surface.

### Phase 3 — Replace drag with property editing on mobile

This is the substantive change, and the one that makes the screen genuinely usable
rather than merely visible.

- Reuse the `isMobile` band already computed in `AppShell` (or a small shared
  `useIsMobile` hook wrapping the same `matchMedia` query) so there is one source
  of truth for the breakpoint.
- On mobile, the canvas renders as a **read-only preview**: skip the interaction
  overlay entirely, exactly as is already done for `auto_menu` slides.
- Element selection moves to the existing element list — tap a row to select.
- Position and size are edited through numeric X / Y / W / H fields (percentages)
  in the properties panel. These are precise, accessible, and need no gestures.
- Desktop keeps drag and resize untouched.

Do **not** attempt pinch-zoom or a scaled drag surface. That is a large amount of
gesture code to make a fundamentally imprecise interaction slightly less bad.

### Phase 4 — Pin the primary actions

On mobile, move Cancel / Apply to playlist into a sticky bar at the bottom of the
designer (`position: sticky; bottom: 0`), leaving Undo / Redo / aspect in the
scrolling toolbar and hiding the preview-size select (D7). The user should never
have to hunt for Apply.

### Phase 5 — Tabs as a single scrolling strip

Make the tab row one row with `overflow-x: auto`, `flex-wrap: nowrap`,
`scroll-snap-type: x proximity` and momentum scrolling. Recovers roughly 70px of
vertical space and reads as a standard mobile pattern.

### Phase 6 — Fix the campaign window grid

Give `SignagePage.tsx:1056` the existing `.form-grid-3` hook, or switch it to
`repeat(auto-fit, minmax(140px, 1fr))` to match every other grid on the page.

## Testing

The existing suites render at jsdom's default 1024px, so none of this is covered
today. Add a small viewport helper that sets `window.innerWidth` and stubs
`matchMedia` for `(max-width: 767px)`, then:

- at 390px, the designer host has no horizontal overflow
  (`scrollWidth <= clientWidth`) — this is the assertion that would have caught D1
- at 390px, the canvas element is at least ~80% of the container width
- at 390px, drag and resize handlers are not attached; at 1024px they are
- at 390px, the campaign window row does not overflow
- desktop rendering is unchanged — same three-column grid, drag handlers present

The overflow assertion is the important one. It is cheap, and it fails loudly on
exactly the class of bug being fixed here.

## Explicitly out of scope

- Any change to the TV board itself (`packages/shared/src/signage/`). This is
  admin-side layout only.
- The signage preview iframe fix (separate prompt already written).
- Video and media work — Stage 4.
