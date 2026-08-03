# Info banner — comprehensive audit and enhancement plan

Audit of the banner feature after Stage 4, covering the reported gaps: appearance
settings, date options, and prayer location.

## A — Prayer location: it exists, in the wrong place

**It is not missing.** The island selector is at `SignagePage.tsx:1092`
(`data-testid="signage-prayer-island"`), backed by `prayer_islands` via
`SignageAdminController::prayerIslandOptions()`, validated with
`exists:prayer_islands,id`, and confirmed present in the shipped admin bundle.

The problem is discoverability: it sits inside the **Prayer** tab (`tab === 'prayer'`,
line 1059), while the countdown it governs is a **Banner** feature. Anyone
configuring the banner looks in Banner, does not find it, and concludes it was
never built — which is exactly what happened.

**Fix — surface, do not duplicate.** Add a read-only summary line to the Banner
tab: *"Prayer times: Malé — change in the Prayer tab"*, with the island name
resolved from the same overview payload and a control that switches tabs. Do not
render a second editable dropdown; two authoritative controls for one setting
invite conflicting saves and a stale-value bug.

Also worth noting in the Prayer tab copy: this island drives **both** the banner
countdown and the automatic prayer-break slides. The existing helper text at line
1096 already says this — keep it.

## B — Banner appearance is entirely hardcoded

Every visual property lives in `packages/shared/src/signage/signage.css` and none
is configurable per banner:

| Property | Current value | Line |
|---|---|---|
| Height | `5.2vmin` / `min-height: 36px` | 206–207 |
| Font size | `2.2vmin` | 217 |
| Font weight | `600` | 218 |
| Background | `rgba(12, 8, 4, 0.78)` | 212 |
| Text colour | `#fff8f0` | 213 |
| Letter spacing | `0.02em` | 219 |
| Segment padding | `0 4vmin` | 239 |

A 2.2vmin font on a 1080p board is roughly 24px — fine at desk distance, small
across a dining room. There is currently no way to change it without a deploy.

**The mechanism already exists.** `--signage-banner-speed` is already passed from
the component as a CSS custom property and consumed by the marquee animation
(`signage.css:236`). Extend exactly that pattern rather than inventing a second
approach: derive custom properties from each banner's settings and set them on the
banner element's inline style, with the CSS values above becoming fallbacks.

Add to the per-banner schema:

| Setting | Type | Default | Notes |
|---|---|---|---|
| `font_scale` | number 0.5–3 | 1 | multiplier on the 2.2vmin base, not an absolute px |
| `height_scale` | number 0.5–3 | 1 | multiplier on the 5.2vmin base |
| `text_color` | string | theme text | |
| `background_color` | string | current rgba | must allow alpha |
| `align` | left / center / right | left | only meaningful when not scrolling |
| `scroll` | boolean | true | lets a banner be a static bar |

Use **scale multipliers, not absolute pixels.** The board renders at 1080p and 4K
and in both orientations; the existing `vmin` units are what make it resolution
independent. An admin entering "24px" would get a banner that is correct on one
screen and wrong on every other.

`scroll: false` is worth including — it is a one-line CSS change
(`animation: none`, already noted in the stylesheet at line 244) and a static bar
is genuinely easier to read for short content like a phone number.

## C — Date has no options

`defaultDateLabel()` (`SignageBanner.tsx:57`) hardcodes:

```ts
now.toLocaleDateString(undefined, {
  weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
})
```

Locale `undefined` means the TV's locale, which on a shop-floor device is whatever
it shipped with — not a deliberate choice. There is no way to shorten it, drop the
year, or show a Hijri date.

Add a `date_format` per banner:

- `full` — Monday, 3 Aug 2026 (current behaviour, keep as default)
- `short` — Mon, 3 Aug
- `numeric` — 03/08/2026
- `weekday` — Monday
- `hijri` — Hijri date alongside or instead of Gregorian

**Hijri needs a decision.** There is no Hijri or Dhivehi date support anywhere in
the repo — I checked. Two options:

1. `Intl.DateTimeFormat` with the `islamic-umalqura` calendar. Zero dependencies,
   supported in every browser Chromium-based signage would run, but the arithmetic
   calendar can differ by a day from locally observed dates.
2. A lookup driven by the same source as the prayer times, which would match what
   the mosque announces.

Option 1 is the right starting point — it is free and correct to within a day.
Flag the discrepancy in the admin helper text rather than pretending it is
authoritative, and leave option 2 for later if it matters in practice.

Also pin the locale explicitly rather than passing `undefined`, so two TVs from
different suppliers do not render different date formats.

## D — "Location" beyond top/bottom

`position` is only `top` or `bottom` (validated `in:top,bottom`). Reasonable for a
strip, but two things are missing:

- **Horizontal alignment** for static (non-scrolling) banners — covered by `align`
  above.
- **Inset**, so a banner can sit slightly in from the screen edge. Many TVs
  overscan and clip the outermost few percent; a banner flush to the edge can be
  partly cut on exactly the hardware this runs on. A small `inset_percent`
  (0–5, default 0) addresses it.

Keep it to that. Free positioning would turn the banner into a slide element,
which is what the designer is already for.

## Implementation notes

- Extend `SignageBannerItem` in `packages/shared/src/signage/types.ts` and the
  validation in `SignageAdminController::updateBanner` together — they must not
  drift.
- `SignageBannerNormalizer` already handles the legacy single-banner shape. New
  fields must default there too, so existing saved banners keep working without a
  re-save.
- The admin banner card is already long on mobile. Group the new controls under a
  collapsed "Appearance" section rather than adding eight more always-visible
  fields.

## Testing

- Each new setting round-trips through `updateBanner` and normalises with a
  sensible default when absent.
- A banner saved before this change (no appearance keys) renders identically to
  today — this is the regression that matters.
- `font_scale` and `height_scale` emit the expected custom properties.
- `scroll: false` renders without the marquee animation.
- Each `date_format` produces the expected string for a fixed date; `hijri`
  produces a non-empty string and does not throw where `Intl` lacks the calendar.
- The Banner tab shows the configured island name and no second editable dropdown.

## Out of scope

- Per-screen banner overrides.
- Rich text or images in the banner.
- Video and media work.
