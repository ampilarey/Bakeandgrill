# Mobile first

Owner, 2026-10-20: "I want change everything mobile 1st rule. Not now. Slowly."

Every screen is written for the phone first and widened for bigger screens. New screens are
built that way from the start; existing ones are converted a little at a time, never in one
big rewrite.

## The rule

1. **Phone first.** The plain styles are the phone layout (390 px). Wider screens add to it
   with `@media (min-width: …)`. A tablet band (`(min-width: 768px) and (max-width: 1023px)`)
   is fine; a bare `@media (max-width: …)` that squeezes a computer layout down is not.
2. **Prefer layouts that size themselves** over breakpoints: one column that grows into more
   (`grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr))`), rows that
   `flex-wrap`, and `minmax(0, 1fr)` on a grid column that holds long text or a table.
3. **Same controls everywhere.** A phone gets every control a computer has, changed in shape,
   never hidden (CLAUDE.md, admin layout). Never gate a control on `isMobile` alone.
4. **Touch sizes.** Inputs and selects 44 px tall with 16 px text (no iPhone zoom); buttons
   follow CLAUDE.md (`Btn` 38 px, `Btn small` 32 px).
5. **Nothing scrolls sideways** at 390, 768, 1024 or 1366 px.

The model to copy: `apps/admin-dashboard/src/pages/ClockMachinePanel.tsx` (no media queries at
all; fluid grids, wrapping rows, cards instead of a wide table).

## The guard

`node scripts/check-mobile-first.mjs` (CI: "Mobile-first guard") counts desktop-first rules,
`@media` with `max-width` and no `min-width`, in the apps, the shared package and the website
views. Each file keeps at most the count it had in `scripts/mobile-first-baseline.json`; a new
file has none. After converting a file, run `node scripts/check-mobile-first.mjs --update` so
the lower count becomes the new ceiling. The script only reads CSS; a width check in script
(`useIsMobile`, `matchMedia('(max-width…')`) is reviewed by hand.

## Converting slowly

Never convert as a project of its own. When a change touches a screen anyway:

1. Rewrite that file's `max-width` rules as the phone default plus `min-width` additions (or
   remove them in favour of fluid grids).
2. Check it at 390, 768, 1024 and 1366 px (the e2e phone-width spec covers 390).
3. Run the guard with `--update` and say in the commit that the file went mobile first.

Order, when there is a choice: the screens customers and staff use most on a phone first, the
order app, then the till, then the admin's daily pages, then the website, then the rest.

## Where it stands

Baseline written 2026-10-20: 123 desktop-first rules in 24 files.

| Area | Rules left |
|---|---|
| Website views (`backend/resources`) | 46 |
| Admin (`apps/admin-dashboard`) | 38 |
| Order app (`apps/online-order-web`) | 24 |
| Till (`apps/pos-web`) | 12 |
| Kitchen screen (`apps/kds-web`) | 3 |

`scripts/mobile-first-baseline.json` has the per-file list. Already mobile first: the Clock
machine tab (`ClockMachinePanel.tsx`).
