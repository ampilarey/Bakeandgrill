# Signage Stage 3 — slide deletion + persistent info banner

Two pieces of work. The first is a bug fix and should land regardless; the second
is the new feature.

## Part A — you cannot delete a slide (bug)

### What is wrong

The slide row in `apps/admin-dashboard/src/pages/SignagePage.tsx` (~line 735)
renders exactly four controls: **Design**, **↑**, **↓**, and the Seconds/Weight
inputs. There is no remove control, and the only `splice` in the file is the
reorder in `moveSlide` (line 290). No delete exists in the API client either.

So a slide added by mistake is permanent through the UI. The only escapes today
are hand-editing the playlist JSON or rebuilding the playlist from scratch.
"Add slide" shipped without its counterpart; this is a defect, not a missing
nicety.

### How it should work

No backend work is needed. Slides live as a JSON array on the playlist and are
persisted wholesale by the existing `updateSignagePlaylist(id, { slides })` call
that Save already uses. Deleting is a local array removal followed by the normal
save.

- Add a **Delete** button to each slide row, styled `danger`, alongside Design/↑/↓.
- Require a confirm step before removal — a slide can carry a lot of design work
  and there is no undo once the playlist is saved.
- Removing the last slide is allowed. The list already has an `EmptyState` for
  zero slides, and an empty playlist is a legitimate intermediate state.
- Deletion is local until Save, matching how Add already behaves (it toasts
  "save playlist to publish"). Use the same wording so the two are consistent.
- The designer panel is open by index (`designIndex`). Deleting a slide at or
  before that index would silently re-target the designer at a different slide —
  close the designer if the deleted index is the one being edited, and decrement
  it if the deleted index is below it.

That last point is the only real trap in this part.

## Part B — persistent info banner

### What is being asked for

A strip visible on **every** slide showing: today's date, current time, the next
prayer, and the time remaining until it. Sliding.

### Why this needs a new layer

Elements belong to individual slides. There is no banner, overlay or ticker
concept anywhere in `packages/shared/src/signage/` or the player — I checked.

"On every slide" therefore cannot mean "add an element to each slide": auto-menu
slides are generated fresh on every loop, so any element written into them would
be discarded and regenerated. The banner has to be a **persistent layer rendered
outside the slide**, as a sibling of `.signage-stage` inside `.signage-page`
(`SignagePage.tsx` ~line 375). Rendering it outside the keyed transition wrapper
is what makes it survive slide changes instead of re-animating on every swap.

### Why the countdown cannot be a server variable

Three of the four fields already exist in `variables`: `today`, `current_time`,
`next_prayer`. Time remaining does not, and adding it as another string would not
work:

- The config refreshes every 120 seconds, so a server-rendered countdown would
  sit frozen and then jump two minutes at a time.
- `next_prayer` is pre-formatted as `"Fajr 05:12"` (`SignageResolver.php:279`) —
  a display string, useless for arithmetic.

So the server must send machine-readable times and the client must do the
counting. The player already runs a clock tick for exactly this reason.

### Rollover

Sending only "the next prayer" creates an edge case: when the countdown reaches
zero the banner would show a stale prayer for up to two minutes until the next
config refresh. Sending **today's whole schedule** — five prayers as absolute
timestamps — lets the client pick the next one itself and roll over instantly at
the boundary. That is the design: one array, resolved client-side.

### Shape

Backend, in `SignageResolver::resolveFresh()` output:

```php
'prayer_schedule' => [
    ['name' => 'Fajr',    'at' => '2026-08-02T05:12:00+05:00'],
    ...five entries, ISO 8601 with the MVT offset...
],
```

Built from the existing `prayersOnly()` map, which returns `H:i` strings and is
already loaded in `variables()`. Also keep the existing `next_prayer` string
untouched — hand-authored slides bind to it.

Banner settings as a `signage_banner` SiteSetting, mirroring `signage_prayer`
exactly (`SignageAdminController::updatePrayer`, line 272 — same validate → set →
`SiteSetting::bust()` → `SignageCache::bust()` shape, same audit `touch`):

```json
{
  "enabled": false,
  "position": "bottom",
  "fields": ["date", "time", "next_prayer", "countdown"],
  "speed_seconds": 40
}
```

Surface it in the resolver payload as `banner`, and add
`PUT /admin/signage/banner` next to the existing emergency/prayer routes.

Client: a `SignageBanner` component in `packages/shared/src/signage/`, rendered by
the player, deriving next-prayer and countdown from `prayer_schedule` on a 30s
timer. Minute granularity ("in 2h 14m") — a seconds countdown would force a
re-render every second, forever, on a device that never sleeps, to display
something nobody is reading that precisely.

### Details that will bite if missed

- **Hide the banner during emergency and prayer-break modes.** Those replace the
  board with a single full-screen notice; a banner over the top of "Please
  evacuate" is wrong. `config.mode` already carries `emergency:*` / `prayer_break`.
- **Burn-in.** The board runs all day and the player already drifts slides via
  `burnInOffset`. A fixed bar will burn a line into the panel. The scrolling text
  moves, but the bar's background and edges do not — apply the same drift offset
  to the banner.
- **Empty schedule.** Prayer time lookup is wrapped in `try/catch` and can return
  nothing. The banner must degrade to date/time only rather than rendering an
  empty strip or `NaN`.
- **Portrait.** The board supports portrait orientation; the banner needs to work
  in both, so size it in `vmin`/`%` like the rest of the signage CSS.

### On "sliding"

Worth one line since it is a design call, not a technical one: a static bar with
values updating in place is easier to read at a glance across a room than moving
text, and avoids a permanent animation on an always-on panel. I have specified it
as a scrolling marquee as asked, with `speed_seconds` exposed so it can be slowed
right down, and the component structured so switching to static is a CSS change
rather than a rewrite.

## Out of scope

- Video and media work — that is Stage 4, and there is still no video column.
- The `showcase_cap` / `rows_per_slide` / `show_thumbs` admin controls still
  missing from Stage 2. Separate, smaller, and not urgent.
