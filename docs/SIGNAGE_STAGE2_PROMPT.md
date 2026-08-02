# Signage Stage 2 — Automatic menu slides

Build the automatic menu board: slides that generate themselves from the live menu,
with no manual slide authoring per dish.

Stage 1 (screens, groups, playlists, campaigns, emergency/prayer override, device
heartbeat, designer) is merged and verified. This stage builds on it and changes no
Stage 1 behaviour.

## The design rule

**An item earns its own full-screen slide if it has something to show. Everything
else appears as a row in a category slide.**

An item qualifies for a showcase slide when any of these is true:

1. it has an image (`image_url`)
2. it has an active special / discount (`special` is non-null)
3. it is flagged as promoted (see `is_signage_promoted` below)

Everything else — plain items with no photo and no offer — is listed on a category
slide, name and price per row.

Rationale: at ~10s a slide, a 60-item menu is a 10-minute loop and most customers
never see most of it. This rule keeps the loop at roughly 8–15 slides (~2 minutes),
so a customer waiting at the counter sees the whole board and sees the specials
twice. It also means a full-screen slide is only ever spent on an item that has a
photo or an offer to fill it — a plain name and price at 8vmin reads as a
placeholder.

Do not implement a "one slide per item, all items" mode. It is explicitly out of
scope.

## Where the expansion happens: client-side

This is the important architectural constraint — read before designing anything.

The player already loads the menu itself. `apps/online-order-web/src/pages/SignagePage.tsx`
fetches `fetchItems('online_pickup')` and passes the result into `SlideCanvas`, which
resolves element bindings against it via `resolveBoundItems` (`packages/shared/src/signage/bindMenu.ts`).
The server config payload from `SignageResolver` carries slides, theme and
variables — **not** the item list (only an 8-item `bestsellers` array).

So auto-slide expansion belongs in the shared package, client-side, running over the
items the player already has. Do **not** make `SignageResolver` load the full menu to
generate slides server-side: its output is cached for 30s under a key shared by every
screen, and stuffing the menu into it would bloat that cache, duplicate the item
payload the player already fetches, and desync from the item list actually being
rendered.

The server's job this stage is only to expose the two new item flags.

## Work

### 1. Backend — item flags

Migration adding two columns to `items`:

- `show_on_signage` boolean, default `true`, indexed — hard exclude from the board.
- `is_signage_promoted` boolean, default `false` — force an item to earn a showcase
  slide even with no photo and no discount.

Both nullable-safe on read: treat `null` as the default. Add to `Item::$fillable` and
`$casts`, expose on whatever resource/serialisation feeds `fetchItems`, and surface
both as checkboxes on the admin item form next to the existing availability toggles.

Guard the filtering with `Schema::hasColumn` where it runs before migration in tests,
matching the existing style in `SignageResolver::bestsellers()`.

### 2. Shared — `MenuItemLite` and the expander

Add to `MenuItemLite` in `packages/shared/src/signage/types.ts`:

```ts
thumb_url?: string | null;
show_on_signage?: boolean;
is_signage_promoted?: boolean;
```

New module `packages/shared/src/signage/autoSlides.ts`:

```ts
export function expandAutoSlides(
  slide: SignageSlide,
  items: MenuItemLite[],
  categories: SignageCategoryLite[],
  loopIndex?: number,
): SignageSlide[]
```

As built this takes no `SignageConfig`: the expander partitions and groups items
but never resolves a binding, so it needs nothing from the config, and both apps
compile with `noUnusedParameters`. `expandPlaylist(...)` wraps it for a whole
slide list.

Behaviour:

- If `slide.template_origin !== 'auto_menu'`, return `[slide]` unchanged. Every
  existing slide must pass through untouched — this is the compatibility guarantee.
- Drop items where `show_on_signage === false`.
- Partition the rest: **showcase** = has `image_url` or `special` or
  `is_signage_promoted`; **listed** = everything else.
- Showcase slides: one `item_card` slide per qualifying item, built through
  `SignageTemplateFactory`-equivalent shapes so they render identically to
  hand-authored slides. Cap at `slide.binding?.showcase_cap ?? 12` per loop.
- Rotation when showcase count exceeds the cap: window the sorted list by
  `(loopIndex * cap) % total` so successive loops feature different dishes and every
  item comes round. Deterministic given `loopIndex` — no `Math.random()`, because the
  admin designer preview and the TV must agree.
- Order showcase items: specials and promoted first, then by `sales_30d` desc, then
  by name. Stable sort, and stable across renders with equal inputs.
- Give every generated slide `weight: 1`. If weight varied with the featured set,
  the weighted rotation would change length between loops and the loop counter
  would drift.
- Listed slides: one `menu_list` slide per category that has listed items, titled with
  the category name, paginated at ~14 rows per slide so a large category splits rather
  than overflowing.
- Interleave: alternate showcase and category slides rather than emitting all of one
  then all of the other, so the board doesn't run six text slides back to back.

Export from `packages/shared/src/signage/index.ts`.

### 3. Player and designer wiring

In `apps/online-order-web/src/pages/SignagePage.tsx`:

- Extend `toLite` to carry the three new fields.
- Fetch categories for the slide titles — `fetchCategories()` is already imported and
  its result currently discarded on line ~147; use it instead of throwing it away, and
  keep the existing `.catch(() => null)` fallback so a category failure degrades to
  "Menu" titles rather than a blank board.
- Run `expandAutoSlides` over the resolved slide list before the rotation order is
  applied, incrementing `loopIndex` each time the playlist wraps.
- Include the expanded items in the existing localStorage cache blob so the offline
  path still shows a full board.

Mirror the same expansion in the admin designer preview
(`apps/admin-dashboard/src/pages/signage/SignageDesigner.tsx`) so what the admin sees
matches the TV. The existing `signageRenderParity` tests exist to protect exactly this
— keep them passing.

### 4. Two fixes to fold in

Both are in `packages/shared/src/signage/SlideCanvas.tsx` and both matter because this
stage is about showing discounts:

- `item_card` (line ~157) and `price_row` (line ~169) render `item.base_price` and
  ignore `special.effective_price`. `menu_list` honours it. Make all three consistent:
  show the effective price, and on `item_card` show the original struck through with
  the discount badge when `special` is present. Without this, a showcase slide for a
  discounted dish displays the undiscounted price — which is worse than not showing it.
- `menu_list` rows render name and price only. Add an optional leading thumbnail
  (`thumb_url ?? image_url`) behind a `style.showThumbs` flag, default off so existing
  slides are unchanged.

### 5. Admin

- A default `auto_menu` playlist entry in `SignageTemplateFactory::defaultPlaylistSlides()`
  and a `['key' => 'auto_menu', 'label' => 'Auto · Full menu']` entry in
  `templateCatalog()`.
- Expose `showcase_cap` and seconds-per-slide on the slide's binding so the cap is
  tunable without a deploy.

### 6. Tests

Note on placement: `packages/shared` has no test runner of its own and the app
vitest projects root at the app directory, so shared-logic tests live in an app
suite (`apps/admin-dashboard/src/__tests__/`) and import through `@shared/signage`.

- Unit tests for `expandAutoSlides`: partition rule, cap, rotation windowing across
  successive `loopIndex` values (every item eventually features, none dropped),
  category pagination, `show_on_signage === false` exclusion, and the pass-through
  guarantee for non-`auto_menu` slides.
- A test that a 60-item menu with 10 photographed items produces a loop of ≤15 slides.
- Backend test that the new columns default correctly and appear in the items payload.
- Extend `signageRenderParity` to cover an expanded auto slide.
- Regression test for the special-pricing fix on `item_card` and `price_row`.

## Constraints

- Branch `claude/service-availability-maintenance-zj4whc`. The signage work currently
  sits on `audit-sig2` — confirm which branch this should land on before pushing if
  they have not been reconciled.
- No hex literals in admin `style={{…}}` objects; use the tokens in `CLAUDE.md`. Do
  not regenerate the baseline to accommodate new hex.
- `npm run lint` must stay at its current 2 baseline warnings, `tsc` at 0 errors, and
  the admin suite at 212+ passing.
- Video is Stage 4. There is no video column on `items` — do not add one here. Design
  the showcase slide so a media field can slot in later without reshaping it.
- Do not open a PR unless asked.
