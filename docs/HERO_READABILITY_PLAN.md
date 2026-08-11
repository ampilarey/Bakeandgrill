# Hero Text Readability — Plan

Status: **§2.1 and §2.2 built** on this branch. §2.3 and §2.4 not started.

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
