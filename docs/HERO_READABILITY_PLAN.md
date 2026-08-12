# Hero Text Readability — Plan

Status: **§2.1 and §2.2 built** on this branch. §2.3 and §2.4 not started.
**§7 is Revision 2** — what the owner reported after using 2.1/2.2 on a real phone. Read it
before doing anything else; it changes the shape of §2.4.

Owner's ask: *"How about adding setting to change the background color and other important
features to change the all wording better visually"* — prompted by a live screenshot where the
hero text is genuinely hard to read over a shop-front photo.

**The ask is right; the proposed remedy would not have worked.** A background colour setting
changes nothing when the background is a photograph. The real fault is in how the existing dim
control is wired, and it is a one-line-of-thinking fix rather than a pile of new colour pickers.

---

## 1. What is actually wrong

Both apps render the hero identically — website `home.blade.php` and order app `index.css` share
the same values, deliberately kept "in lockstep". Each slide has a single `dim` value (0-100),
exposed as `--hero-dim`, and that ONE number drives TWO separate effects:

**a) It fades the photograph.**
```
opacity: calc(1 - 0.55 * var(--hero-dim, 1))
```
At full dim the photo sits at 45% opacity over `#1C1408`. The picture does not darken — it
washes out. Food looks muddy.

**b) It controls the text scrim.**
```
background: linear-gradient(180deg,
  rgba(28,20,8, calc(0.22 * var(--hero-dim,1))) 0%,
  rgba(28,20,8, calc(0.72 * var(--hero-dim,1))) 55%,
  rgba(28,20,8, calc(0.92 * var(--hero-dim,1))) 100%);
```

**These are coupled, and that is the bug.** The owner wants a bright, appetising photo, so he
turns the dim down — and the scrim vanishes with it, because both are multiplied by the same
variable. Turn it up for readable text and the food looks washed out.

There is no setting combination that produces *bright photo + readable text*, which is precisely
what every good hero does and precisely what he is asking for.

The screenshot shows the predictable result: eyebrow text over a light blue sign, a grey subtitle
over a white shop board, and a title straddling both.

---

## 2. The fix, in order of value

### 2.1 Separate the photo from the scrim — do this first

Split the single `dim` into two independent values:

| Field | Admin label | Meaning | New-slide default |
|---|---|---|---|
| `photo_brightness` | Photo brightness | 100 = full bright; 0 = max knock-back (old dim=100) | **100** |
| `text_background` | Text background | 100 = strong scrim; 0 = no scrim | **100** |

CSS vars (both apps, lockstep): `--hero-photo` / `--hero-scrim` (0–1). **Remove `--hero-dim`.**

```css
/* mobile photo */
opacity: calc(0.45 + 0.55 * var(--hero-photo, 0));
/* desktop photo */
opacity: calc(0.62 + 0.38 * var(--hero-photo, 0));
/* scrim — same stop alphas as before, driven by --hero-scrim */
```

**Legacy mapping (identical look on ship day):**

- If `photo_brightness` / `text_background` present → use them
- Else if `dim` present → `photo_brightness = 100 - dim`, `text_background = dim`
- Else (neither) → treat as legacy dim=100 → photo=0, scrim=1

Admin strips `dim` on save; new slides always persist the new keys.

### 2.2 Text position

Where the text sits matters more than any colour choice. A title moved off a busy sign is legible
with no scrim at all.

Per slide: **top / middle / bottom** (`text_position`). Default **bottom** so existing slides do
not move. Both apps via `data-text-position` on the overlay.

### 2.3 A contrast warning in admin

The feature that stops this recurring. When a slide is edited, sample the image behind where the
text will sit and warn if the combination will be hard to read — before it reaches customers.

Approximate is fine. "This text may be hard to read on this photo — try a stronger scrim or move
the text" is worth more than a precise number nobody acts on.

### 2.4 Curated presets, not free colour pickers

The owner has said plainly: *"How can an uneducated man like me select colors using codes."*

Free pickers for background and every text element are how a good-looking site becomes an
unreadable one, with no way to notice until it is live. The system currently has exactly **one**
colour setting in the whole content registry — `primary_color` — and that restraint has served it
well.

Offer instead a small set of tested looks per slide:
- Light text, strong scrim (default — works on almost any photo)
- Light text, light scrim (for already-dark photos)
- Dark text, light wash (for pale, plain photos)

Each guaranteed readable. If a per-slide accent colour is ever wanted, restrict it to the brand
palette rather than a free picker.

---

## 3. What NOT to build

- **A background colour setting for the hero.** The background is a photo. It would do nothing.
- **Free colour pickers** for text and background. See §2.4.
- **Per-element font controls.** Type scale is set globally and consistently; letting it vary per
  slide produces a jumble, not a brand.
- **A second dim mechanism** alongside the existing one. Replace it; do not add to it.

---

## 4. Risks

1. **Existing slides changing appearance on deploy.** The highest risk. Old `dim` must map onto
   the new pair so day-one output is unchanged. Test with real stored values, not just defaults.
2. **The two apps drifting apart.** They are deliberately kept in lockstep. Any change lands in
   both, with a test asserting they agree.
3. **Defaults that flatter empty state but fail real photos.** Test against a genuinely busy
   photograph — the shop front in the owner's screenshot is the right benchmark, not a plain
   backdrop.
4. **Over-configuring.** Every new control is another thing that can be set wrong. Position and
   scrim earn their place; a colour wheel does not.

---

## 5. Test plan

- An existing slide with a stored `dim` renders identically before and after the split.
- Photo brightness and scrim can be set independently; bright photo with a strong scrim is
  achievable.
- Text position moves the text in both apps.
- Website and order app produce matching treatment for the same slide.
- The contrast warning fires on a light photo with light text and stays quiet on a dark one.
- Presets produce readable output over the owner's actual shop-front photograph.
- Hidden slides (see the complaints/hero work) and the empty-hero fallback are unaffected.

---

## 6. Sequencing

§2.1 alone probably fixes the screenshot and needs no new decisions from the owner. §2.2 is small
and high-value. §2.3 is the one that prevents recurrence. §2.4 only matters once someone wants to
deviate from the default, which may be never.

Ship 2.1 and 2.2 together; 2.3 after; 2.4 only if asked.

---

## 7. Revision 2 — after 2.1/2.2 shipped

The owner used the new sliders on a phone and reported three things. All three check out.

### 7.1 "When I change text background the whole photo colour changes" — correct, and it is the
### remaining half of the original bug

§2.1 split the *photo fade* from the *scrim*, and that part works: `photo_brightness` now drives
only the image's own `opacity`. But the scrim was never confined to the text. It is still a single
gradient painted on `.banner-overlay`, which is `position: absolute; inset: 0` — **the full slide**.

Website `home.blade.php:89`:

```css
.banner-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg,
        rgba(28,20,8, calc(0.22 * var(--hero-scrim, 1))) 0%,
        rgba(28,20,8, calc(0.72 * var(--hero-scrim, 1))) 55%,
        rgba(28,20,8, calc(0.92 * var(--hero-scrim, 1))) 100%);
}
```

Identical in order-app `index.css:348`, and again in both desktop variants
(`home.blade.php:311`, `index.css:522`).

At the owner's setting — photo 100%, text background 100% — the image renders at full opacity and
is then covered by a wash reaching 92% at the bottom. So "text background" is, in fact, a
whole-photo dimmer wearing a different label. He is describing the code accurately.

**The fix is to move the dark from behind the *slide* to behind the *words*.** A per-element
background (a panel or pill behind eyebrow / title / subtitle) leaves the rest of the photograph
untouched, which is exactly the outcome §2 was aiming at and only got halfway to.

### 7.2 No element can be styled on its own — five hardcoded backgrounds

The hero renders five things. Every one has a fixed background baked into the stylesheet, none of
them per slide:

| Element | Class | Current background |
|---|---|---|
| Eyebrow | `.banner-eyebrow` | `rgba(212,129,58,0.22)` pill + `rgba(212,129,58,0.4)` border |
| Title | `.banner-title` | none — only `text-shadow: 0 2px 24px rgba(0,0,0,0.4)` |
| Subtitle | `.banner-sub` | none |
| Button 1 | `.banner-cta-primary` | `var(--amber)` |
| Button 2 | `.banner-cta-secondary` | `rgba(255,255,255,0.1)` + border, `backdrop-filter: blur(6px)` |

So the title and subtitle — the two hardest things to read in the owner's screenshot — have no
background at all. They rely entirely on the full-bleed scrim from §7.1. That is why turning the
scrim down makes them unreadable and turning it up ruins the photo. There is no third option
today.

**This supersedes §2.4.** That section argued against per-element colour on the grounds that the
scrim would carry the readability. It does not carry it, and the owner has asked twice. Build the
control — but as swatches plus an opacity slider, not a hex field. The owner's own words remain
the constraint: *"How can an uneducated man like me select colors using codes."* A row of tappable
swatches (None, Dark, Light, brand amber, brand dark) with a 0–100% strength slider gives him
complete control over what he is asking for, in a form he can use on a phone, and a free hex entry
can sit behind an "Advanced" disclosure for anyone who wants it.

### 7.3 Scheduled publish on the phone — present, but unreachable from where he was

It has not been removed. `ContentHubPage.tsx:1489–1530` builds a "Schedule publish" block, and
line 1612 renders it inside `MobileActionSheet` on mobile. Two things hide it:

1. **The trigger is icon-only on mobile.** Line 1604: `{isMobile ? null : <span>⋯ More</span>}`.
   On desktop it reads "⋯ More". On a phone it is a bare glyph next to Publish.
2. **A slide editor sheet covers the page header.** The owner's screenshot is the full-screen
   "Slide 1" sheet, whose only actions are Duplicate / Delete / Done. The header holding ⋯ is
   behind it. To schedule, he must close two sheets, find an unlabelled icon, and open a third.

Not a missing feature — a placement failure. Fix by labelling the trigger and by surfacing
scheduling where hero edits are actually made.

### 7.4 Per-slide scheduling is not possible today, and the existing scheduler is unsafe for hero

`ContentSchedule` stores `(key, scope, locale, value, publish_at)`. `hero_slides` is **one key
holding the entire carousel as a JSON array**. So scheduling a hero change stores a snapshot of
all slides taken at the moment Schedule is pressed.

Two consequences, the second serious:

- You cannot schedule one slide. The unit of scheduling is the whole carousel.
- **Two pending hero schedules silently destroy each other.** Schedule A on Monday (snapshot with
  slides 1–3), then edit slide 2 and schedule B on Tuesday (snapshot with the edit). When A fires
  it writes its old array back, undoing the edit; when B fires it writes its array, undoing
  anything else changed in between. Last write wins over the whole carousel, with no warning.

**Do not solve this by extending `ContentSchedule`.** The right shape for what the owner wants —
"this slide runs during Ramadan, that one over the weekend" — is per-slide dates stored on the
slide itself:

- `show_from` (optional) — do not display before this moment
- `show_until` (optional) — do not display after it

Evaluated in `HeroSlides::isRenderableSlide()` alongside the existing `showing` flag, and mirrored
in the order app. `showing: false` stays as the manual override and wins over any dates. No new
table, no snapshot, no conflict between two schedules, and the owner sets it in the same sheet
where he edits the slide.

The whole-carousel `ContentSchedule` path stays for everything else, but the Content Hub should
warn when a second pending schedule already exists for the same key.

### 7.5 Order

1. §7.1 — confine the scrim to the text block. This alone changes what he sees most.
2. §7.2 — per-element background colour + strength for the five elements.
3. §7.4 — per-slide `show_from` / `show_until`.
4. §7.3 — label the ⋯ trigger and put scheduling within reach of the hero editor.
5. The duplicate-pending-schedule warning.

1 and 2 are one piece of work and should ship together; doing 1 without 2 leaves the title with
no background at all.

### 7.6 Shipped (this branch)

| Item | What landed |
|---|---|
| §7.1 | `--hero-scrim` paints `.banner-copy` / `.home-promo-hero__copy` only. Overlay is `background: none`. Photo opacity still only via `--hero-photo`. |
| §7.2 | Per-slide `*_bg` + `*_bg_strength` (+ `title_bg_full_width` / `subtitle_bg_full_width`) for eyebrow, title, subtitle, cta1, cta2. Swatches + strength in `HeroSlidesEditor`; absent = hardcoded CSS look. Wired through PHP + both TS `heroSlidePresentation` helpers. |
| §7.4 | Optional `show_from` / `show_until` on each slide; `HeroSlides::isRenderableSlide()` + order-app `isRenderableHeroSlide()`. Restaurant TZ (`Indian/Maldives`). `showing: false` wins. Plain-language label next to Showing. |
| §7.3 | More trigger always shows “⋯ More”; Schedule publish surfaced inside Content Hub editor sheets + hero slide sheet. |
| Warning | Content Hub warns when a pending schedule already exists for a key about to be re-scheduled. |

**Legacy look after §7.1:** photo outside the text block is no longer washed by the full-bleed scrim (brighter edges). Text still sits on the copy-panel gradient at the same `text_background` strength. Mapping was not remapped.

**Cache FINDING (§7.4):** website re-resolves slides each request (OK). Order app loads public content once into React context and filters at parse time — expired windows do not drop mid-session until refetch/navigation.

**FINDING (§7.2 text-hug):** Paint must live on an inner inline `.hero-text-bg` (flex items blockify the heading into one rectangle). Do **not** split on `<br>` into `display:block` pills. Do **not** open `line-height` to avoid overlap. Do **not** set inline `background:` on the hug span (shorthand overrides stylesheet). Correct approach: one inline span + `box-decoration-break: clone`, horizontal pad, and a shorter centered band via `background-size: 100% 0.7em` so translucent strips don’t double-paint between lines. Full-width bar still paints the heading.
