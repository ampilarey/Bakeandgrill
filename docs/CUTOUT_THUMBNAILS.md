# Cut-out thumbnails

Built 2026-10-01 after the owner sent two ZUS Coffee screenshots: "there is a v
light color circle or oval background. And the item is placed above the background
and the item photo is without the background ... Can u add this for the thumbnail
pic only ... I add png without background of the item."

## What it is

A second picture per item, a **cut-out**: the dish with its background removed,
kept see-through. The small cards float it over a circle the app draws:

| Surface | Where | Circle | Falls back to |
|---|---|---|---|
| Website menu | `partials/menu-card.blade.php` | yes | the card photo |
| Order app menu | `components/menu/ProductCard.tsx` | yes | the photo slider |
| POS tiles | `components/MenuGrid.tsx` | no, the cut-out sits on the tile's own colour | the photo fill |

Owner, after seeing it on the till: "Pos should render without circle. Circle is
for both menu page." So the POS payload carries the cut-out URLs but no backdrop.

The opened item (item page, item sheet, offers, signage, social cards) never uses
the cut-out. Items without one look exactly as before.

## Where it is edited

Every picture of an item is on the item editor's **Photos & video** tab (owner,
2026-10-01: "move pic in edit page to picture button page"). The tab opens with a
"which picture shows where" table, then three numbered sections, each with a
"Shows on" line:

1. **Main photo** (part of the item form, saved with Save Item): POS tile and
   sheet, signage, offers, social cards, and the menu cards when nothing else exists.
2. **Thumbnail cut-out**: the two menu pages' cards over a circle; POS tile without.
3. **Gallery photos and video**: the slideshow on the opened item; the starred
   photo is the card photo when there is no cut-out and the shared-link picture.

A new item shows the tab too, with sections 2 and 3 waiting until it is saved.

## The circle (backdrop)

A backdrop is a **colour** and a **strength** (0 to 100, the circle's opacity). Each
can be set at four levels, and the most specific one that says something wins,
field by field:

| Level | Set where | Stored |
|---|---|---|
| Menu default | Business Details, Menu: "Thumbnail circle colour / strength" | `menu_cutout_backdrop_color`, `menu_cutout_backdrop_strength` |
| Top-level category | Category editor, "Thumbnail circle" | `categories.cutout_backdrop` |
| Subcategory | same | same |
| Item | Item editor, Photos tab, "Circle behind it" | `items.cutout_backdrop` |

Stored shape: `{"color": "#RRGGBB"|null, "strength": 0..100|null}`; a level with
nothing set is `null`. The resolver is `App\Domains\Catalog\Support\CutoutBackdrop`;
API payloads carry the resolved result as `cutout_backdrop: {color, strength, source}`
so the three clients never resolve it themselves. Default: `#F3EAE1` at 100.

## Files and processing

Upload accepts PNG or WebP. `App\Services\CutoutImageProcessor` keeps the alpha
channel, resizes to at most 800 px, writes PNG plus a WebP sidecar under
`storage/app/public/menu-cutouts/`, and **refuses a file with no transparent
pixel** (a flattened photo would sit in the circle as a square). The regular
photo pipeline (`MenuImageProcessor`) flattens onto white and writes JPEG, which is
why the Media Library cannot supply cut-outs: library uploads are already flat.

Endpoints (staff):

```
GET    /api/items/{id}/cutout            current file + own backdrop + effective
POST   /api/items/{id}/cutout            multipart "cutout"
PATCH  /api/items/{id}/cutout/backdrop   {"backdrop": {color?, strength?} | null}
DELETE /api/items/{id}/cutout
PATCH  /api/categories/{id}              cutout_backdrop in the body
```

## Rendering

The order app sets `--cutout-color` and `--cutout-alpha` on the circle frame via
`cutoutBackdropVars()` from `packages/shared/src/utils/cutout.ts`; the website
blade sets the same two properties inline. The POS only uses `hasCutout()`. The circle is drawn as a `::before`
inset 7% so the dish can overhang it; the image is `object-fit: contain` with a
soft drop shadow.

## Not built

- Automatic background removal (needs an outside service or a large model).
- Picking a cut-out from the Media Library (library files are flattened JPEGs).
- Bulk upload matched by file name. Worth adding if the owner has many PNGs.
