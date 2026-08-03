# Admin mobile — bottom clearance audit

Content keeps ending up under the fixed mobile tab bar, on more than one page. The
clearance has been bumped twice (80px → 112px) and the problem persists. This
audit is about why bumping the number cannot fix it.

## Step zero — confirm the device is actually running the new bundle

The 112px build landed at 12:26 MVT; the latest screenshot is 13:05 MVT. That only
helps if `test.bakeandgrill.mv` was redeployed in between and the phone did not
serve a cached `index.html`.

Check before changing any CSS:

```bash
curl -s https://test.bakeandgrill.mv/admin/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.css'
```

Compare against the file in `backend/public/admin/assets/`. If they differ, this is
a deploy/cache problem and no code change is required. Rule this out first — it is
free, and everything below is wasted effort if the phone is running old CSS.

## F1 — There is no single source of truth for the bar height

Six independent hardcoded expressions, and they disagree:

| Rule | Clearance used |
|---|---|
| `.admin-shell-main--mobile` (`:1319`) | `112px + safe-area` |
| `.signage-designer` (`:656`) | `72px + 56px + safe-area` |
| `.signage-designer-sticky-actions` (`:661`) | `bottom: 56px + safe-area` |
| `.content-studio-page--dirty` (`:1754`) | `72px + 56px + safe-area` |
| `.content-studio-sticky-bar` (`:1777`) | `bottom: 56px + safe-area + 8px` |
| `.hub-preview-float-btn` (`:2280`) | `bottom: 72px + safe-area` |

Five say the bar is 56px. One says 72px. Every future page adds a seventh guess.

## F2 — The bar is not 56px, and its height is not constant

This is the root cause.

`.admin-shell-mobile-tabs` (`:1550`) — the bar that actually renders — is:

```css
min-height: 56px;
padding-bottom: env(safe-area-inset-bottom, 0);
```

`min-height`, not `height`. Under the app's border-box reset the box grows to fit
its content **plus** the safe-area padding. A tab is an icon, a 2px gap, a 10px
label and 12px of vertical padding — roughly 46px — and on a notched iPhone the
safe-area inset adds about 34px. The rendered bar is therefore **~80px on a
notched phone and ~56px on a flat one**, and it shifts again with the user's text
size settings.

No constant can track a value that depends on the device and the user's font
scale. All six numbers above are guesses at a moving target — which is exactly why
raising 80 to 112 did not settle it, and why the next bump will not either.

## F3 — Dead CSS competing with the live class

`.admin-mobile-bottom-nav` (`:1111`) is fully defined — `position: fixed`,
`height: 56px`, padding, background, border — and is referenced by **no TSX file**.
The bar that renders is `.admin-shell-mobile-tabs` (`MobileTabBar.tsx:19`).

The dead rule uses `height: 56px` where the live one uses `min-height: 56px`. Any
developer measuring clearance from the CSS will read the dead class, conclude the
bar is exactly 56px, and be wrong on every notched device. This is almost certainly
where "56px" entered the other five rules.

## F4 — `.hub-preview-float-btn` disagrees with everything else

It clears 72px where every other rule clears 56px. Either it is wrong, or the
others are. Both cannot be right, and neither matches the measured ~80px.

## The fix — measure the bar, publish it, use it everywhere

Stop hardcoding. Have `MobileTabBar` observe its own height with a
`ResizeObserver` and write it to a CSS custom property on the document root:

```
--admin-tabbar-h: 80px;   /* whatever it actually is, right now, on this device */
```

Then every clearance rule becomes:

```css
padding-bottom: calc(var(--admin-tabbar-h, 80px) + 16px);
```

Properties of this approach that the constants do not have: it is correct on
notched and flat devices, it survives text-size changes, it updates on rotation,
and a new page gets it right by using the variable instead of inventing a seventh
number. The fallback keeps it safe if the observer has not run yet.

Then:

- Replace all six expressions in F1 with the variable.
- **Delete `.admin-mobile-bottom-nav`** — dead, and actively misleading.
- Add one shared utility (e.g. `.admin-bottom-safe`) for any page that needs
  clearance beyond what `.admin-shell-main--mobile` provides, so future pages have
  something to reach for.

## Page audit

Every admin page renders inside `.admin-shell-main--mobile` (`AppShell.tsx:293`),
so all of them inherit whatever that rule says — fixing it once fixes the whole
app. There is no page rendering outside the shell.

The pages that need individual attention are those with their **own**
bottom-pinned elements, since they stack on top of the tab bar:

| Page | Element | Risk |
|---|---|---|
| TV Signage → designer | `.signage-designer-sticky-actions` | sticky Cancel/Apply sits at `56px`; under-clears on notched devices |
| Content Studio | `.content-studio-sticky-bar` | fixed publish bar, same `56px` assumption |
| Content Hub | `.hub-preview-float-btn` | floating button at `72px` — the odd one out |
| Any page using the SharedUI modal | bottom-sheet on mobile | verify its action row clears the bar |

`CustomersPage` uses `position: fixed` with `top/right/bottom: 0` — a full-height
drawer, not a bottom bar. It is fine, but confirm its internal action row is
reachable.

## Testing

The existing suites render at 1024px, so none of this is covered.

- Stub `ResizeObserver`, render `MobileTabBar`, assert `--admin-tabbar-h` is
  written to the root element.
- At 390px, for the signage page, Content Studio and Content Hub: assert the last
  interactive control's bounding box bottom is above `window.innerHeight` minus the
  bar height. That is the assertion that reproduces the reported bug.
- Assert no rule in `index.css` still hardcodes `56px` or `72px` as a tab-bar
  clearance — a simple source grep in a test is enough to stop the pattern coming
  back.

## Out of scope

- Redesigning the tab bar.
- Desktop layout.
- The TV board itself.
