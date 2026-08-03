# Banner v2 — ticker motion, sequencing, Dhivehi, logo, scheduling, emergency

Six requests. Items 1–4 are one coherent change to how the banner strip works;
5–6 are separate and larger.

## 1. The banner must fully clear the screen

Today `SignageBanner.tsx:264` builds `displayText` as `${text}   ·   ${text}` and
the CSS animates the track `translateX(0)` → `translateX(-50%)`. With the content
duplicated, the second copy is already on screen as the first leaves — so nothing
ever fully clears, and a short message shows twice at once.

Required behaviour: **one copy, enters from the right edge, exits past the left
edge, gap, repeat.**

- Render a single copy (no duplication).
- Animate `translateX(100%)` → `translateX(-100%)`. Starting at `100%` puts the
  text just off the right edge; ending at `-100%` carries it fully past the left.
- The gap between repeats falls out of the timing, and is what makes item 3 work.

Keep `seamless` (current duplicated behaviour) and `static` as options, but
**ticker becomes the default**, and existing saved banners keep their current look
via migration (`scroll: true` → `seamless`, `scroll: false` → `static`).

## 2. Sequencing without a timer

Drop "Show for (sec)" as the mechanism. A banner should hand over **when its
message has finished passing**, not when a stopwatch expires — a timer either cuts
the message off mid-sentence or leaves the strip empty waiting.

Replace `duration_seconds` with `repeat_count` (default 1):

> Banner A plays 3 times, then banner B plays once, then back to A.

Sequencing rule: when a banner's animation completes its configured number of
passes, advance to the next enabled banner. Drive this from the animation's own
completion (`animationiteration` / `animationend`), not a parallel `setTimeout`,
so the two can never drift apart.

`duration_seconds` stays in the stored shape as deprecated and ignored, so old
saves load without error.

## 3. Direction — English and Dhivehi in the same rotation

Add `direction` per banner: `ltr` (default) or `rtl`.

- `ltr` — enters right, exits left (item 1).
- `rtl` — enters **left**, exits **right**: `translateX(-100%)` → `translateX(100%)`.
- Set `dir="rtl"` and `lang="dv"` on the text element so the glyphs shape and order
  correctly. This is the part that actually matters for Thaana — a reversed
  animation alone renders the text wrong.

**The mixing question answers itself once item 1 is done.** Because each banner
now fully clears before the next begins, an English banner travelling right-to-left
and a Dhivehi banner travelling left-to-right never share the screen. They alternate
cleanly. This is exactly the behaviour asked for, and it is a consequence of the
one-copy ticker rather than extra machinery — which is a good reason to do item 1
first.

Enforce the invariant explicitly: **the next banner must not start until the
current one has fully exited.** Assert it in a test, because a future "optimisation"
that overlaps them would silently break bilingual boards.

There is no Dhivehi font handling anywhere in the repo — `name_dv` fields exist in
the product types but nothing sets a Thaana font or direction. Add a font stack for
Thaana on the banner (system Thaana fonts with a sensible fallback) rather than
assuming the TV has one.

## 4. Logo between banners

Add a logo separator shown during the gap between two banners.

- A per-rotation setting (`show_logo_between`, default off), not per-banner — it is
  a property of the sequence.
- Renders the same `logo_dark ?? logo` the brand card uses, centred in the strip,
  held briefly, then the next banner enters.
- Skip it when only one banner is enabled — there is no "between".

## 5. Scheduling for banners and emergencies

**Reuse the campaign scheduling shape.** `SignageCampaign` already has
`date_start`, `date_end`, `days`, `windows`, `priority`, `is_active`, with matching
logic in `SignageResolver::campaignMatches()` (line 166) that handles overnight
windows correctly. That is tested, working code — do not write a second scheduler.

- Extract the window-matching into a small reusable service so campaigns, banners
  and emergencies all share one implementation.
- Add optional `schedule` to each banner: same fields, absent means always on.
- Add scheduled emergencies as a small list (mode + schedule + priority) rather
  than the single current `signage_emergency` string. Highest-priority active entry
  wins; manual override still beats everything.

**Keep the manual emergency switch immediate and obvious.** Scheduling must not
make it harder to put "We are closed" up right now — that is the control's whole
purpose in a fire or a power cut.

## 6. Emergency types and layouts

Today there are six fixed modes (`SignageTemplateFactory:271`), all rendered
through the same `notice` template, with hardcoded English copy and no way to edit
the wording.

Three changes:

**Editable copy.** Each mode's title and body should be editable and stored,
defaulting to today's text. A Dhivehi variant per mode as well — an evacuation
notice nobody can read is worse than no notice.

**More modes:** add `staff_only`, `private_event`, `holiday`, `special_notice`
(free text), and `reopening_soon` (with a time). Keep the existing six.

**Layouts, chosen per mode:**

| Layout | Use |
|---|---|
| `notice` | current — centred title and body |
| `alert` | full-bleed colour, oversized text, for fire alarm and evacuation |
| `split` | icon or logo beside the message |
| `countdown` | message plus a live countdown, for "reopening at …" |

Fire alarm should default to `alert` with a high-contrast colour and no branding
chrome — legibility from across a room, instantly, is the only requirement that
matters there. Nothing about that slide should be subtle.

## Sequencing of the work

Items 1–4 are one change to the same component and should land together; 3 depends
on 1. Items 5 and 6 are separate and larger — 5 touches the resolver's precedence
chain, 6 adds a settings surface. They can follow.

## Testing

- Ticker renders one copy and animates `100%` → `-100%`.
- Migration: `scroll: true` → `seamless`, `scroll: false` → `static`; a banner
  saved before this change looks identical.
- `repeat_count: 3` plays three passes before advancing.
- Advancing is driven by animation completion, not a timer.
- **An RTL banner never overlaps an LTR banner** — the invariant from item 3.
- `dir="rtl"` and `lang="dv"` are set on RTL banner text.
- The logo separator appears between banners and not with a single banner.
- A banner outside its schedule window does not render; overnight windows behave
  as `campaignMatches()` already does.
- Manual emergency still overrides any scheduled one.
- Each emergency layout renders its distinguishing element; fire alarm defaults to
  `alert`.

## Out of scope

- Per-screen banner overrides.
- Translating existing menu content.
- Video and media work.
