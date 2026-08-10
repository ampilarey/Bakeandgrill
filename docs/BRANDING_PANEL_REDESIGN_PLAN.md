# Branding Panel Redesign — "Brand Kit"

Status: **Built** (Brand Kit panel live under Content). `BrandKitCards` / brand kit config drive Content → Branding. Body is design history for the shipped panel.

> Rescued from branch `claude/branding-panel-redesign-plan` (not written fresh on this branch).

---

**Depends on:** `feat/content-branding-hub` (the unified Content & Branding hub) being merged.
**Goal:** Make the Branding section of the admin hub genuinely clear and usable. Two of its six fields currently don't fully work — fix those first, then replace the field list with visual, self-explanatory cards that show each asset **in the context where it actually appears**.

---

## 1. Why it feels confusing

The owner reports Branding is *"v confusing."* Investigation shows the cause is not only labelling — **half the panel silently doesn't do what it says**, which destroys trust in the whole section.

### 1.1 Functional defects

- **🔴 F1 — "Logo (Dark)" does nothing.** `logo_dark` is read by **no Blade view and no app**. It appears only in the admin's own "Use as" dropdown (`MediaLibraryPage.tsx:24`) and a TS union (`api/media.ts:164`). Uploading a dark logo shows a success toast and changes nothing, anywhere, ever.
- **🔴 F2 — "Primary Color" only affects the order app.** The order app applies it (`SiteSettingsContext.tsx:333` → `--color-primary`). The website **hardcodes** the palette: `--amber: #D4813A` (`layout.blade.php:146`) and `#e09242` for dark. No Blade view references `primary_color`. Changing the brand colour updates one surface and silently ignores the other.

### 1.2 Wrong contents

- **🟠 F3 — `menu_new_days` ("New items window (days)") is in the Branding group.** It controls how long items are flagged "New" on the dine-in menu — menu behaviour, not branding. It sits between image uploaders looking out of place.
- **🟠 F4 — `og_image` is in the SEO group.** The image shown when a link is shared on WhatsApp/Facebook is a brand asset people look for under Branding. Brand assets are split across two sections.

### 1.3 Interface defects

For one logo field the owner currently sees:

```
Logo (Light)                                    [History]
logo · image · en · Website + Order app         ← developer metadata
[preview] [Choose File] [Library] [/storage/…]  ← three ways to set one image
Current website value "/storage/site/logo_ab12.png"   ← a file path, not a picture
```

- **I1 — "Light"/"Dark" is ambiguous.** Does it mean a light-*coloured* logo, or the logo *for light mode*? (It means: for light backgrounds.) This is the single most commonly inverted label in this kind of panel.
- **I2 — Three competing controls** for one image: a raw unstyled `<input type="file">`, a "Library" button, and a free-text `/storage/…` path box that invites breakage.
- **I3 — Raw developer metadata** (`logo · image · en · …`) shown to a non-technical owner.
- **I4 — The "current value" is a file path, not a picture.**
- **I5 — No context.** Nothing says the favicon is the little browser-tab icon, or where the logo appears.
- **I6 — No size/format guidance** (square, ≥512px, transparent PNG…).
- **I7 — Unexplained missing control.** Branding has no Same/Different toggle (correctly — brand keys are always synced) but nothing says so, making it look broken.

---

## 2. Phase A — make the fields actually work

Ship before/with the UI work. A pretty panel over dead fields is worse than the current state.

### 2.1 F1 — Wire up the dark logo

Both surfaces already share the same convention: `document.documentElement[data-theme="dark"]` (website `layout.blade.php`, order app `hooks/useTheme.ts:18`).

- **Website** (`layout.blade.php` header, and anywhere `content('logo')` renders in a themed context): render both logos and swap with CSS on `[data-theme="dark"]` — e.g. `.brand-logo--light { display:block } .brand-logo--dark { display:none }` and the inverse under `[data-theme="dark"]`. Avoid JS so there is no flash on load.
- **Order app**: `components/shell/navTabs.tsx:8` and `components/AuthBlock.tsx:153` currently do `settings.logo || '/logo.png'`. Pick `logo_dark` when the dark theme is active.
- **Fallback is mandatory:** when `logo_dark` is empty, **both** surfaces must fall back to `logo`. Never render a broken/empty image.
- Standalone pages (`maintenance`, `order-gateway`, `prayer-times`) may keep using `logo` only — out of scope, but they must not break.

### 2.2 F2 — Wire the website to `primary_color`

The website palette is a **hand-tuned set of four related tokens per theme**, not a single colour:

| Token | Light | Dark |
|---|---|---|
| `--amber` | `#D4813A` | `#e09242` |
| `--amber-hover` | `#B86820` | `#c97a2a` |
| `--amber-light` | `#FEF3E8` | `rgba(224,146,66,0.15)` |
| `--amber-glow` | `rgba(212,129,58,0.22)` | `rgba(224,146,66,0.22)` |

**Do not flat-replace all four with the same colour** — that destroys the design. Instead **derive** them from `primary_color`, preserving the existing relationships:

- `--amber` = the chosen colour (dark theme: a ~10% lightened variant, mirroring `#D4813A → #e09242`)
- `--amber-hover` = ~12% darkened (dark theme: ~12% darkened from its own base)
- `--amber-light` = mix with white ~92% (dark theme: the colour at ~15% alpha)
- `--amber-glow` = the colour at 22% alpha

Implementation:
- Compute the derivations **server-side in PHP** (a small `BrandPalette` helper — deterministic, no runtime JS, no flash) and inject a `<style>` block in `layout.blade.php` that overrides `:root` and `[data-theme="dark"]`.
- **Only override when `primary_color` is set and is a valid hex.** When unset or invalid, emit nothing and the existing hardcoded defaults stand. This makes the change non-breaking by construction.
- **Contrast guard:** `--amber` is used as a *background* with dark text (e.g. the mobile bottom-nav Order badge uses `#1C1408` on amber). Compute relative luminance and pick a readable foreground (dark text on a light brand colour, light text on a dark one), exposed as `--amber-contrast`. Update the few places that hardcode `#1C1408` on an amber background to use it.
- Keep the order app behaviour as-is (`--color-primary`); optionally apply the same derivation there for consistency.

### 2.3 F3 / F4 — Move fields to their right homes

- `menu_new_days`: change `group` from `Branding` to **`Menu`** in `config/content.php`. (This supersedes the earlier decision to pin it to Branding — that was registry-consistency over usability.)
- `og_image`: change `group` from `SEO` to **`Branding`**, and rename its label to **"Link preview image"**. It stays in `BRAND_SYNCED_KEYS` (already is).

---

## 3. Phase B — the "Brand Kit" UI

Replace the generic block list, **for the Branding group only**, with a dedicated card layout. All other groups keep the standard hub rendering.

### 3.1 Cards

Each card shows the asset **in the place it really appears**:

| Card | Key | In-context preview | New label |
|---|---|---|---|
| Logo | `logo` | on a mock white header bar | **Logo — for light backgrounds** |
| Dark logo | `logo_dark` | on a mock dark header bar | **Logo — for dark backgrounds** |
| Tab icon | `favicon` | inside a mock browser tab | **Browser tab icon** |
| Share image | `og_image` | as a mock WhatsApp/link-share card | **Link preview image** |
| Brand colour | `primary_color` | live on a mock button + badge | **Brand colour** |
| Item fallback | `default_item_image` | inside a mock circular menu card | **Fallback photo for items with no picture** |

### 3.2 Card anatomy

1. **Plain-English name** + one line of *where it shows* (e.g. "The small icon in the browser tab and on phone home screens").
2. **In-context preview** (above) — the whole point: the owner sees the effect, not a file path.
3. **One primary action**: a single click/drop zone — "Upload, or choose from library". The library picker is a secondary link inside the same zone. **Remove the raw `<input type="file">` and the `/storage/…` text box** from the default view.
4. **Requirements inline**: recommended dimensions, format, transparent-background note. E.g. favicon "square, at least 512×512, PNG".
5. **Status**: `✓ Set` or `Not set — using the default` (so an empty field never looks broken).
6. **Advanced disclosure** (collapsed): the raw URL field, the content key, and History. Keeps power/debug access without putting it in the owner's face.

### 3.3 Section furniture

- A short banner at the top: **"Branding is always identical on the website and the order app."** — explains the absent Same/Different control (fixes I7).
- A **brand-kit summary strip**: all six assets as thumbnails with ✓ / "not set" at a glance.
- Hide the `key · type · locale · app` metadata line (I3) behind the same Advanced disclosure used per card.

---

## 4. Tests

- **Phase A backend**
  - Website renders the dark logo under `[data-theme="dark"]` and falls back to `logo` when `logo_dark` is empty.
  - `primary_color` set → `layout.blade.php` emits overrides for `--amber`, `--amber-hover`, `--amber-light`, `--amber-glow` in both themes; **unset or invalid hex → emits nothing** and the hardcoded defaults remain.
  - `--amber-contrast` flips between dark and light text across a light vs dark brand colour.
  - `menu_new_days` resolves in group `Menu`; `og_image` in group `Branding`.
- **Phase A frontend (order app)**
  - Logo swaps with theme; falls back to `logo` when `logo_dark` unset.
- **Phase B frontend (admin)**
  - Branding group renders the Brand Kit cards, not generic blocks; other groups unchanged.
  - Each card exposes exactly one primary upload action; the raw URL field is only in Advanced.
  - Empty asset shows "Not set — using the default", not a broken image.
  - The "always identical" banner is present.

---

## 5. Acceptance criteria

- [ ] Uploading a dark logo visibly changes the site in dark mode; clearing it falls back to the main logo. (F1)
- [ ] Changing the brand colour restyles **both** the website and the order app, with hover/tint/glow shades derived — not flattened. (F2)
- [ ] An unset or invalid brand colour leaves the site exactly as it is today. (F2, non-breaking)
- [ ] Text on brand-coloured backgrounds stays readable for both a light and a dark brand colour. (F2 contrast guard)
- [ ] "New items window" is no longer under Branding; the link-preview image is. (F3, F4)
- [ ] Every brand asset is previewed **in context**, with a plain-English "where it shows" line and size/format guidance. (I1, I4, I5, I6)
- [ ] One primary way to set each asset; raw paths and content keys only under Advanced. (I2, I3)
- [ ] The panel explains that branding applies to both apps. (I7)
- [ ] Backend suite green against the baseline recorded at start; admin + order app builds green; committed bundles match fresh builds.

---

## 6. Out of scope

- Restyling the website beyond the four accent tokens (the neutral/surface palette stays hand-tuned).
- Per-app branding (branding stays deliberately synced across both apps).
- Logo swapping on the standalone `maintenance` / `order-gateway` / `prayer-times` pages.
- Uploading brand assets from anywhere other than the hub and the Media Library.
