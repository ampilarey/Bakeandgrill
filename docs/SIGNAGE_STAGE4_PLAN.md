# Signage Stage 4 — brand idle slide, multi-banner, mobile footer clearance

Three requests, audited against the code. Independent of each other; A and B are
features, C is a defect.

## A — brand idle slide instead of a bare name

### What happens now

When a screen has no slides, the player renders one hardcoded line
(`apps/online-order-web/src/pages/SignagePage.tsx:425`):

```tsx
<div className="signage-empty">{interpolate('{{branch_name}}', …)}</div>
```

That is the "Bake & Grill" on black in the screenshot. The same block also covers
the loading state, so an empty board and a still-fetching board look identical —
worth separating, since one is a configuration gap and the other is transient.

### What it should be

Logo, then business name, then phone, then website — shown whenever there is
nothing else to show.

### Available data

`SiteSettingsContext` already carries `site_name`, `logo`, **`logo_dark`**,
`business_phone`, `business_email`, `business_address`, `business_whatsapp`.

Two gaps:

- **There is no `business_website` setting.** It has to be added (site settings
  admin + resolver variables). Do not hardcode the domain.
- **Use `logo_dark ?? logo`.** The board background is `#0d0a07`; the standard
  logo is meant for light surfaces and will disappear or show a white box. This is
  exactly what `logo_dark` exists for.

### Design

Build it as a real slide template — `brand_card` in `SignageTemplateFactory` —
rather than more hardcoded JSX in the player. Two benefits: an admin can add it to
a playlist deliberately (a "who we are" slide between menu slides), and the empty
state then renders the same template through the normal `SlideCanvas` path instead
of a parallel code path that will drift.

Resolver additions to `variables()`: `business_phone`, `business_website`.

Player: when the resolved playlist has no slides, fall back to the `brand_card`
template rather than the bare `.signage-empty` div. Keep a distinct, quieter
loading state for the pre-fetch moment.

## B — info banner: multiple banners, more options, prayer location

### What exists now

A single `signage_banner` SiteSetting:

```json
{ "enabled": false, "position": "bottom", "fields": [...], "speed_seconds": 40 }
```

The admin UI exposes only **enabled / position / scroll speed** — `fields` is in
the stored shape but has no control, so today you cannot even choose which of
date / time / next prayer / countdown to show.

### B1 — multiple banners

Change the stored shape to a list, keeping a migration path from the single
object:

```json
{
  "enabled": true,
  "banners": [
    { "id": "…", "label": "Prayer", "enabled": true, "position": "bottom",
      "fields": ["date","time","next_prayer","countdown"],
      "speed_seconds": 40, "duration_seconds": 30 },
    { "id": "…", "label": "Wi-Fi", "enabled": true, "position": "bottom",
      "custom_text": "Wi-Fi: {{wifi_name}} · {{wifi_password}}",
      "speed_seconds": 40, "duration_seconds": 20 }
  ]
}
```

Read the legacy single-object form and wrap it as a one-entry list so existing
configuration keeps working. Do not require a manual re-save.

**Sequencing: rotate, don't stack.** Multiple banners should take turns in the
same strip on `duration_seconds`, not render as several strips at once. Stacked
strips eat the slide area they sit on top of, and the board is the point. Position
still allows at most one top and one bottom strip simultaneously.

### B2 — more per-banner options

Expose in the admin, per banner: label, enabled, position, field checkboxes,
free-text with `{{variable}}` support, scroll speed, duration in the rotation.
Free text should accept the same variables the slides do, so `{{wifi_name}}`,
`{{next_prayer}}` etc. work without new plumbing.

### B3 — prayer location is hardcoded to Malé

`SignageResolver` resolves prayer times through
`PrayerTimeHelper::findMaleIsland()` (`SignageResolver.php:248`), called from both
`variables()` and `inPrayerBreak()`. There is no way to pick anywhere else — so on
any island other than Malé both the banner countdown **and the automatic prayer
break fire at the wrong times**. That makes this more than a display preference.

There is a full `prayer_islands` table (atoll, name, name_latin, active) already
loaded by `GetIslandCollection`, so this is a data-backed dropdown, not new data
entry.

Add a `signage_prayer_island_id` setting, defaulting to Malé so nothing changes
for existing boards, and use it in **both** call sites. A per-screen override is
tempting but out of scope — one setting per site is enough until there is a second
location.

## C — content hidden under the fixed bottom nav (defect)

The screenshot shows a group card's Save button and playlist select clipped by the
fixed mobile nav.

### What the CSS says

- `.admin-mobile-bottom-nav` — `position: fixed; bottom: 0; height: 56px;
  padding-bottom: env(safe-area-inset-bottom, 0)` (`index.css:1111`)
- `.admin-shell-main--mobile` — `padding-bottom: calc(80px + env(safe-area-inset-bottom, 0))`
  (`index.css:1310`)

80px of clearance against a 56px nav should be sufficient, so the overlap means
one of:

1. the signage page's scroll container is not `.admin-shell-main--mobile`, so the
   clearance never applies;
2. iOS Safari's own bottom toolbar (visible below the app nav in all three
   screenshots) overlays the viewport, and `env(safe-area-inset-bottom)` does not
   account for browser chrome;
3. the clipped element sits in a card with its own overflow.

Determine which before changing numbers — bumping padding until it looks right
hides the cause and breaks again on the next device.

### Also worth fixing while there

`.admin-mobile-bottom-nav` sets `height: 56px` **and** `padding-bottom:
env(safe-area-inset-bottom)`. Under the app's `border-box` reset the safe-area
padding is absorbed inside the 56px rather than added to it, so on notched phones
the nav's icons are squeezed into ~22px instead of the bar growing. Should be
`min-height`, or the height moved to a content box.

Use `100dvh` rather than `100vh` for any full-height container in this path; that
is the standard fix for mobile browser chrome that appears and disappears.

## Testing

- Empty playlist renders the brand card with logo, name, phone and website; uses
  `logo_dark` when set; loading state is visually distinct from the empty state.
- Legacy single-object `signage_banner` is read as a one-entry list.
- Banner rotation advances on `duration_seconds` and wraps.
- A banner with `custom_text` interpolates `{{…}}` variables.
- `signage_prayer_island_id` changes the resolved prayer times, and the same
  island drives `inPrayerBreak()` — assert both, since only fixing the display
  would leave the break firing on Malé times.
- At 390px no interactive control on the signage page is covered by the bottom nav
  (assert the last card's bounding box clears the nav height) — this is the
  regression guard for C.

## Out of scope

- Per-screen prayer location.
- Video and media work.
- Any change to how auto-menu slides are generated.
