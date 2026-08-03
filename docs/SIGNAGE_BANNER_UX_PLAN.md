# Banner appearance controls — make them usable without technical knowledge

The Appearance section shipped as raw data entry. It is correct and unusable.

## What is wrong

| Control | As shipped | Problem |
|---|---|---|
| Text colour | text box, placeholder `#fff8f0` | requires knowing hex notation |
| Background | text box, placeholder `rgba(12, 8, 4, 0.78)` | requires knowing rgba **and** alpha |
| Font scale | number, 0.5–3, step 0.1 | "1.4" describes nothing a person can picture |
| Height scale | number, 0.5–3, step 0.1 | same |
| Align (static) | select, labelled "(static)" | jargon; unclear why it sometimes does nothing |
| Inset percent | number | "overscan" is a TV engineering term |
| Date format | select showing `Full (Mon, 3 Aug 2026)` | **this one is right** — it shows the result |

The cause is mine: the plan specified storage types (`string`, `number 0.5–3`)
rather than the control the admin should see, and the implementation followed the
plan exactly. Date format came out well only because that line happened to include
examples.

The stored shape is fine and should not change. This is entirely a presentation
problem in the admin.

## Principle

**Every control shows the outcome, not the value.** Date format already does this.
Apply it to the rest: nobody should have to know what `rgba` means, or translate
`1.4` into "a bit bigger", to configure a sign in their own restaurant.

## Fixes

### Colours — swatches, then a picker, never typing

Replace both text boxes with a row of tappable colour swatches drawn from the
board's own theme (background, surface, primary, text, muted) plus black and
white. Selected swatch gets a clear ring. Under it, one "Custom…" control using
the **native `<input type="color">`** — every phone and desktop browser renders its
own colour picker for it, so there is nothing to build and it is already familiar.

Keep storing the resolved colour string. The stored value does not change; only
how it is chosen does.

Background needs transparency, which a native picker cannot express. Handle it as
a separate **Transparency** slider (0–100%, default ~22% to match today's
`rgba(12,8,4,0.78)`), and compose the rgba value from picker + slider. Do not ask
anyone to type an alpha channel.

### Sizes — named, with the number hidden

Replace both scale numbers with named options:

| Label | Stored |
|---|---|
| Small | 0.8 |
| Medium (default) | 1 |
| Large | 1.3 |
| Extra large | 1.6 |

Same for height: **Thin / Normal / Tall**. Store the same multipliers as now, so
nothing downstream changes and existing saved values still load — map an arbitrary
stored number to the nearest named option when rendering.

If a stored value does not match a preset (someone typed 1.15 earlier), show the
nearest and do not silently rewrite it until they change something.

### Align — hide it until it applies

It only affects a banner with scrolling off. Show the Align control **only when
Scroll is unchecked**, and drop the "(static)" suffix from the label. A control
that does nothing is worse than one that is absent.

### Inset — describe the symptom, not the mechanism

Replace the percent number with a checkbox: **"Keep clear of screen edges"**, with
helper text *"Turn on if your TV cuts off the edge of the picture."* Store 3 when
checked, 0 when not. That is the only decision the user can actually make, and it
is phrased as something they can observe.

### Live preview — the real answer

Add a live banner preview strip at the top of the Banner tab, rendering the actual
`SignageBanner` component with the current settings. Every change updates it
immediately.

This matters more than any individual control. The honest answer to "how do I pick
a colour" is that you should not have to imagine the result — you should see it
while you choose. Reuse the shared component so the preview cannot drift from the
board.

## Also worth doing

The section is long on mobile. Order it so the common choices come first: Colours,
Size, then a collapsed **Advanced** block for align, inset and scroll.

## Testing

- Colour swatches set the stored value; the native picker sets an arbitrary one.
- The transparency slider composes valid rgba, and 100% opaque produces a value
  the board renders identically to a hex.
- Named size options store the documented multipliers.
- A banner saved with an off-preset value (e.g. 1.15) loads showing the nearest
  option and is not rewritten until edited.
- Align is absent from the DOM when scroll is on, present when off.
- The edge checkbox stores 3 / 0.
- The preview strip reflects a colour change without a save.
- **A banner saved before this change still renders identically** — storage is
  unchanged, so this must hold.

## Out of scope

- Changing the stored banner schema.
- Theme editing.
- The TV board renderer.
