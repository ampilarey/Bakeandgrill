# Signage Stage 3 — slide deletion + persistent info banner

Two pieces of work. Part A is a bug fix and stands alone; Part B is the new
feature. Full reasoning is in `docs/SIGNAGE_STAGE3_PLAN.md` — read it first.

Branch: work on `main` unless told otherwise. Do not open a pull request.

## Part A — add a Delete control to slides

### The defect

`apps/admin-dashboard/src/pages/SignagePage.tsx` (~line 735) gives each slide row
Design / ↑ / ↓ / Seconds / Weight and nothing else. The only `splice` in the file
is the reorder in `moveSlide` (line 290). There is no delete in the UI and none in
`apps/admin-dashboard/src/api/signage.ts`. A slide added by mistake cannot be
removed except by hand-editing playlist JSON.

### What to build

No backend work. Slides are a JSON array on the playlist, persisted wholesale by
the existing `updateSignagePlaylist(id, { slides })` that Save already calls.
Deletion is a local array removal plus the normal save.

- Add a **Delete** button to each slide row, `variant="danger"`, beside Design/↑/↓,
  with `data-testid={`signage-delete-${index}`}` to match the existing
  `signage-design-${index}` convention.
- Require a confirm before removing. A slide can hold real design work and there
  is no undo once the playlist is saved. Use whatever confirm pattern the page
  already uses; if there is none, a `window.confirm` naming the slide is fine.
- Allow deleting the last slide. The list already renders an `EmptyState` at zero,
  and an empty playlist is a valid intermediate state.
- Deletion is local until Save, exactly like Add. Reuse the same toast wording
  ("Slide removed — save playlist to publish.") so the two read consistently.

**The one real trap.** The designer panel is open by index (`designIndex`, used at
line 666). Deleting a slide without adjusting it silently re-points the designer
at a different slide's content:

- if the deleted index **is** `designIndex` → close the designer (`setDesignIndex(null)`)
- if the deleted index is **below** `designIndex` → decrement `designIndex`
- otherwise leave it alone

### Tests

In `apps/admin-dashboard/src/__tests__/SignagePage.test.tsx`:

- deleting a slide removes that row and leaves the others in order
- deleting the slide currently open in the designer closes the designer
- deleting a slide below the open one keeps the same slide open (not its neighbour)
- deleting the only slide shows the empty state

## Part B — persistent info banner

A strip on **every** slide showing today's date, current time, the next prayer,
and time remaining until it. Scrolling.

### Why it is a new layer, not an element

Elements belong to individual slides, and auto-menu slides are regenerated every
loop — anything written into them is discarded. There is no banner/overlay/ticker
concept anywhere in `packages/shared/src/signage/` today.

Render the banner as a **sibling of `.signage-stage`, inside `.signage-page`**
(`SignagePage.tsx` ~line 375), outside the keyed transition wrapper. Outside the
key is what makes it persist instead of re-animating on every slide change. Do not
put it inside `SlideCanvas`.

### Backend

**1. Send the whole prayer schedule, not just the next one.**

In `SignageResolver::resolveFresh()` add:

```php
'prayer_schedule' => [
    ['name' => 'Fajr', 'at' => '2026-08-02T05:12:00+05:00'],
    // …five entries, ISO 8601 with the MVT offset
],
```

Build it from the existing `prayersOnly()` map (`H:i` strings), already loaded in
`variables()` — reuse that call rather than adding another lookup. Leave the
existing `next_prayer` string untouched; hand-authored slides bind to it.

Sending only "the next prayer" would leave the banner showing a stale prayer for
up to 120s after the boundary, until the next config refresh. The full schedule
lets the client roll over instantly.

Prayer lookup is already wrapped in `try/catch` and can yield nothing — emit
`'prayer_schedule' => []` in that case, never a partial or malformed entry.

**2. Banner settings**, as a `signage_banner` SiteSetting:

```json
{
  "enabled": false,
  "position": "bottom",
  "fields": ["date", "time", "next_prayer", "countdown"],
  "speed_seconds": 40
}
```

Mirror `SignageAdminController::updatePrayer` (line 272) exactly — same
validate → `SiteSetting::set` → `SiteSetting::bust()` → audit `touch` →
`SignageCache::bust()` shape. Add `Route::put('/banner', ...)` beside the existing
`/emergency` and `/prayer` routes, and `setSignageBanner()` in
`apps/admin-dashboard/src/api/signage.ts` alongside `setSignagePrayer`.

Expose the resolved settings as `banner` in the resolver payload. Default to
disabled so existing boards are unchanged until someone turns it on.

### Shared component

New `packages/shared/src/signage/SignageBanner.tsx`, exported from
`signage/index.ts`, with styles in `signage.css` following the existing
`.signage-*` naming.

- Derives the next prayer and the countdown from `prayer_schedule` **client-side**.
  The countdown cannot be a server variable: config refreshes every 120s, so a
  server-rendered one would freeze and jump two minutes at a time. `next_prayer`
  is also pre-formatted (`"Fajr 05:12"`, `SignageResolver.php:279`) and useless for
  arithmetic.
- Tick on a **30-second** timer at **minute granularity** ("in 2h 14m"). A seconds
  countdown re-renders every second forever on a device that never sleeps, to show
  precision nobody reads across a room.
- Scrolling marquee, duration from `speed_seconds`. Structure it so switching to a
  static bar is a CSS change, not a rewrite.
- Size in `vmin`/`%` — the board supports portrait as well as landscape.

### Player wiring

- Render the banner only when `config.banner?.enabled`.
- **Hide it when `config.mode` is `prayer_break` or starts with `emergency:`.**
  Those modes replace the board with a single full-screen notice; a banner over
  "Please evacuate" is wrong.
- **Apply `burnInOffset` to the banner.** The board runs all day and the player
  already drifts slides for this reason. The scrolling text moves but the bar's
  background and edges do not, so a fixed strip will burn a line into the panel.
- Degrade to date/time only when `prayer_schedule` is empty — never an empty strip,
  never `NaN`.

### Tests

- Component: picks the correct next prayer from a schedule; rolls to the following
  prayer once the current one passes; formats the countdown at minute granularity;
  falls back to date/time only on an empty schedule; renders nothing when disabled.
- Player: banner hidden under `emergency:*` and `prayer_break`, shown under
  `normal`.
- Backend: `prayer_schedule` present with five ISO entries; empty array when the
  prayer lookup fails; `signage_banner` round-trips through the new endpoint and
  busts both caches.

## Verify before committing

```bash
cd backend && php artisan test
cd apps/admin-dashboard && npx tsc --noEmit && npm run lint && npx vitest run
cd apps/online-order-web && npx tsc --noEmit && npx vitest run
cd apps/pos-web && npx tsc --noEmit && npx vitest run
```

Current baselines to hold or beat: backend 1794 passed / 3 skipped, admin 239,
order 156, POS 151, `tsc` clean everywhere. `npm run lint` must exit 0 with
exactly 2 `no-console` warnings (`ErrorBoundary.tsx:19`, `DeliveryPage.tsx:371`) —
a third is a regression.

No new hex literals in `apps/admin-dashboard/src/pages/**` inline styles; use the
CSS variables in `CLAUDE.md`. Do not regenerate the hex baseline to accommodate
new hex. Signage TV colours in `packages/shared` are outside that rule.

## Rebuild the shipped bundles

This is not optional and was missed last stage. `backend/public/**` is tracked and
served by Laravel — merged source does not reach the TV until the bundles are
rebuilt.

```bash
./scripts/build-all.sh order admin
grep -l "signage-banner" backend/public/order/assets/*.js
grep -l "signage-banner" backend/public/admin/assets/*.js
```

Both greps must return a file. Commit `backend/public/**` in a separate
`chore: rebuild …` commit. Do not commit `apps/*/dist` — it is gitignored.

## Do not

- Do not open a pull request.
- Do not put the banner inside `SlideCanvas` or into slide elements.
- Do not make the countdown a server-rendered string.
- Do not touch video or media work — that is Stage 4, and no video column exists.
