# Shared typography layer

Rather than wiring the Thaana font into the signage board alone, build one
typography block every app consumes. The audit below is the argument for it.

## What the audit found

### The admin loads one font and uses another

`apps/admin-dashboard/index.html:15` loads **Inter** from Google Fonts.
`apps/admin-dashboard/src/index.css:70` declares **Plus Jakarta Sans**.

Inter is downloaded on every admin load and never applied; Plus Jakarta Sans is
never loaded, so the admin actually renders in the `-apple-system` fallback. A
network round-trip is being paid for nothing, and the intended typeface has never
shipped.

### The same stack is copy-pasted in four places

```
'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif
```

appears verbatim in `admin-dashboard/src/index.css:70`,
`delivery-web/src/index.css:31`, `online-order-web/src/index.css:668`, and
`backend/resources/views/layouts/document.blade.php:64`. Four copies to keep in
sync, and they are already out of sync with what the admin loads.

### Apps disagree about whether there is a font at all

| App | Loads | Declares |
|---|---|---|
| admin-dashboard | Inter | Plus Jakarta Sans |
| online-order-web | Plus Jakarta Sans | Plus Jakarta Sans |
| delivery-web | Plus Jakarta Sans | Plus Jakarta Sans |
| pos-web | nothing | one local stack |
| kds-web | nothing | nothing |
| signage board | nothing | `system-ui, sans-serif` |

Six surfaces of one product, five different answers.

### The Thaana font exists but is wired into exactly one page

`backend/public/fonts/a_faruma.ttf` is self-hosted and used only by
`backend/resources/views/prayer-times.blade.php`, which also defines `--font-ui`
and `--font-dhivehi` — good variables, scoped to a single blade file where nothing
else can reach them.

### Everything else comes from Google Fonts

Every app that loads a font loads it from `fonts.googleapis.com`. For a POS
terminal and a TV board in a restaurant, that is a dependency on the internet
being up for the interface to look right. The signage board already has an offline
mode; its typography should not quietly depend on a CDN.

## Design

A new `packages/shared/src/styles/fonts.css`, imported once per app, that:

1. **Self-hosts every font.** Move Plus Jakarta Sans into
   `backend/public/fonts/` alongside `a_faruma.ttf`. `font-src 'self'` is already
   in every CSP, so this narrows the policy rather than widening it — the
   `fonts.gstatic.com` and `fonts.googleapis.com` entries can then come out.
2. **Declares `@font-face` once**, with `font-display: swap`.
3. **Exposes the whole scale as custom properties:**

   | Variable | Purpose |
   |---|---|
   | `--font-ui` | body and interface text |
   | `--font-display` | headings, TV board titles |
   | `--font-dhivehi` | Thaana |
   | `--font-mono` | codes, receipts, order numbers |

4. **Applies Thaana automatically:**

   ```css
   [lang="dv"], [dir="rtl"] { font-family: var(--font-dhivehi); }
   ```

   This is the part that makes it a system rather than a variable. No component
   has to remember to set the Dhivehi font — marking the content as Dhivehi is
   enough, which is also what screen readers and browsers need.

5. **Keeps the fallback stack** `'A_Faruma', 'MV Faseyha', 'MV Waheed', serif` from
   the existing blade file — `MV Faseyha` and `MV Waheed` are common on Maldivian
   machines.

## Path trap

The stylesheet is bundled into `/order/assets/`, `/admin/assets/`, `/pos/assets/`
and so on, but the fonts live at `/fonts/`. Every `url()` must be **absolute**
(`/fonts/…`). A relative path resolves against the bundle directory, fails
silently, and falls back to serif — which looks like "the font didn't work" rather
than a broken path, so it can sit undiagnosed for a long time.

## Rollout

Do it in this order so nothing regresses invisibly:

1. Build `fonts.css` and self-host the files. Change no app yet.
2. Import it into **one** app — online-order-web, which already declares the
   correct font — and confirm rendering is unchanged.
3. Roll through the remaining apps, deleting each duplicated stack and each
   Google Fonts `<link>` as its app is converted.
4. Convert the blade layouts last; they are server-rendered and easiest to verify
   visually.
5. Only then narrow the CSPs to drop the Google Fonts hosts.

The admin will visibly change appearance — it currently renders in a system
fallback and will start rendering in the intended typeface. That is the fix, not a
regression, but it should be expected rather than discovered.

## Signage specifics

Replace the hardcoded `system-ui, sans-serif` in `signage.css` with
`var(--font-ui)`, and let the banner's `dir="rtl"`/`lang="dv"` pick up
`--font-dhivehi` through the automatic rule rather than setting it per element.

That removes the need for the signage-only font work entirely — the banner gets
Thaana because it is marked as Dhivehi, not because the banner code knows about
fonts.

## Testing

- `fonts.css` declares every `url()` as an absolute `/fonts/…` path. Assert this;
  it is the failure that degrades silently.
- Each of the four custom properties resolves to a non-empty stack.
- An element with `lang="dv"` resolves to the Dhivehi stack without any explicit
  font declaration.
- No app CSS still hardcodes `'Plus Jakarta Sans'` — a source grep in a test stops
  the duplication returning.
- No `index.html` still links `fonts.googleapis.com`.
- The signage banner with `direction: rtl` renders with the Dhivehi stack.

## Out of scope

- Choosing a different typeface.
- Font sizing and spacing scales — this is font families only.
- Any per-tenant or per-brand font selection.
