# Banner speed, full prayer times, and emergency media

Three requests. Audit findings first, since two of them are smaller than they look
and one is bigger.

## 1. Speed cap is a UI limit, not a real one

`BANNER_SPEED_PRESETS` (`bannerConfig.ts:33`) offers only Slow 60 / Medium 40 /
Fast 20. The backend already validates `min:10|max:180`
(`SignageAdminController.php:366`), so anything down to 10s is storable today —
the UI simply never offers it.

Two changes:

- **Extend the presets** to Very slow 90 / Slow 60 / Medium 40 / Fast 20 /
  Very fast 10, and lower the backend floor to 5 so there is genuine headroom.
- **The deeper problem: `speed_seconds` is the wrong unit.** In ticker mode the
  text always travels two screen-widths regardless of how long the message is, so
  a fixed duration means a short message crawls and a long one blurs past. The
  same "Fast" setting is unreadable for one banner and sluggish for another.

  The right unit is **travel speed** (screen-widths per second, or px/s), not
  total duration. Then "Fast" reads the same whatever the message length, and the
  cap question mostly disappears.

  Keep `speed_seconds` stored for compatibility, derive the animation duration
  from the measured track width, and label the control by outcome
  (Very slow → Very fast) as it already is. Nobody needs to see either number.

## 2. All prayer times — the data is already there

`prayer_schedule` (all five, absolute timestamps) is already passed to
`SignageBanner` as the `schedule` prop and consumed by `pickNextPrayer`
(`SignageBanner.tsx:292`). Only the field list is missing an option:
`fields` is `date | time | next_prayer | countdown` (`types.ts:74`).

Add an `all_prayers` field that renders the full day:

> Fajr 5:12 · Dhuhr 12:18 · Asr 15:34 · Maghrib 18:11 · Isha 19:24

- Add to the `fields` union, the backend `in:` validation, and the admin
  checkboxes beside the existing four.
- Highlight the next prayer within the list — bold or the accent colour — so the
  banner still answers "what's next" at a glance while showing the whole day.
- Degrade to nothing when `prayer_schedule` is empty, exactly as `next_prayer`
  already does.

This is a genuinely small change: one field, one renderer, one checkbox.

## 3. Emergency notices — audit

### What already exists

More than the request assumes. Banner v2 already delivered:

- **Multiple entries with schedules.** `signage_emergency_entries` holds a list;
  each has `mode`, `priority`, `is_active`, `layout`, `title`, `body`, `title_dv`,
  `body_dv`, `reopen_at` and `schedule` (`SignageEmergencyNormalizer`). Manual
  override still beats all of them.
- **Four layouts** — `notice`, `alert`, `split`, `countdown`, with fire alarm
  defaulting to `alert` on a red background (`SignageTemplateFactory:284`).
- **Dhivehi copy** per entry.

So "more than one emergency schedule" is already built. What is genuinely missing
is media.

### What is missing: media

Every layout is text plus, at most, the site logo. `split`
(`SignageTemplateFactory:342`) hardcodes a `logo` element where an image would go
— the slot exists, it just cannot be pointed at anything else.

Add to each entry:

| Field | Purpose |
|---|---|
| `media_type` | `none` / `image` / `video` / `icon` |
| `media_url` | picked via the existing MediaPicker, not typed |
| `icon` | named icon for the common cases, so no upload is needed |

`SlideCanvas` already renders `image` and `video` elements, so the renderer needs
no new element types — `emergencyElements()` just needs to emit an `image` or
`video` element instead of the hardcoded `logo` when media is set.

### Recommended layouts per circumstance

The layouts should follow what the situation actually demands, not be a free
choice with no guidance:

| Circumstance | Layout | Media | Why |
|---|---|---|---|
| Fire alarm / evacuate | `alert` | icon only | Legibility across a room in one glance. No photos, no branding, nothing to decode. |
| Closed / holiday | `split` | image | A closed sign can afford to look good; a photo carries the brand. |
| Reopening soon | `countdown` | icon | The time remaining is the message. |
| Kitchen closed / staff only | `notice` | icon | Short, informational, no ceremony. |
| Private event | `full_bleed` (new) | image or video | The event's own artwork should fill the screen. |
| Power failure | `notice` | icon | Likely running on a UPS — keep it cheap to render. |

Two additions worth making:

- **A new `full_bleed` layout** — media fills the screen with text overlaid. This
  is what a private event or a promotional closure actually wants, and none of the
  four current layouts can do it.
- **Video must be muted, looping and `playsInline`**, matching how `SlideCanvas`
  already renders video. An emergency notice that waits for an autoplay gesture
  shows nothing at all.

### One constraint worth stating plainly

**Fire alarm should not accept image or video.** A photo takes longer to parse
than a word, network or disk trouble can delay it, and the one notice that must
never fail to render is the evacuation one. Restrict it to icon-only in the
validation, not just by convention.

## Testing

- Presets include the extended range; backend accepts 5s and rejects below it.
- Ticker duration derives from measured track width, so two banners with very
  different message lengths travel at the same visual speed at the same setting.
- `all_prayers` renders five entries and highlights the next one.
- `all_prayers` renders nothing when the schedule is empty.
- An emergency entry with `media_type: image` emits an `image` element; `video`
  emits a muted looping `video`.
- `full_bleed` renders media behind overlaid text.
- **Fire alarm rejects image and video media** — assert the validation, not just
  the default.
- Existing emergency entries with no media keep rendering exactly as they do now.

## Out of scope

- Per-screen emergency overrides.
- Uploading media from the emergency form — reuse the existing MediaPicker.
