# Per-Item Menu Card Display Fields — Implementation Plan

**Status:** Ready to build
**Goal:** Let admins control **exactly** what the mobile menu card shows for each item — the card name,
a short one-line detail, and a price note — instead of the app auto-truncating the full description.
Includes a **live card preview** in the item editor. Pairs with the ZUS-style compact card
(`MOBILE_MENU_FOOTER_PLAN.md`).

## 1. Audit — today
- `items` has `name`, `name_dv` (Dhivehi), `description` (text). **No card-specific fields.**
  (`Item.php` fillable; items migrations.)
- The order-app card derives its detail line by truncating the full description —
  `ProductCard.tsx:52` `cardDescriptionPreview(item.description, 140)` — and uses raw `item.name`.
  Price comes from `base_price` / variants / specials.
- Admin item editor: `apps/admin-dashboard/src/pages/MenuPage/MenuItemEditorModal.tsx` +
  `menuItemForm.ts` (form state) + `menuFormPrimitives.tsx` (field inputs).
- **Gap:** no way to set the card's little-detail line separately, shorten the name just for the card,
  or add a price note; and no preview of how the card will look.

## 2. New item fields (migration `add_menu_card_fields_to_items`)
All nullable; empty = fall back to today's behaviour (non-breaking):
| Column | Type | Purpose |
|---|---|---|
| `card_name` | string(120) null | Short name shown on the card (EN). Falls back to `name`. |
| `card_name_dv` | string(120) null | Card name (Dhivehi). Falls back to `name_dv` → `name`. |
| `short_description` | string(140) null | The card's one-line "little detail" (EN). Falls back to `cardDescriptionPreview(description)`. |
| `short_description_dv` | string(140) null | Short detail (Dhivehi). Falls back to Dhivehi description if present. |
| `price_note` | string(40) null | Small caption by the price, e.g. "from", "per box", "per dozen". Price value stays automatic. |

Add all to `Item::$fillable`. (No `hide_price` — not requested.)

## 3. API
- Expose the five fields wherever items are serialized for **both** the public/order menu and the admin
  editor (item show/list transformers / controller `toArray`). Keep existing fields untouched.
- Validation on the admin update endpoint: each new field `nullable|string` with the max length above.

## 4. Admin editor — "Menu card display" section (MenuItemEditorModal.tsx)
- New collapsible **"Menu card display"** section with inputs (reuse `menuFormPrimitives`):
  - Card name (EN) + Card name (Dhivehi) — placeholders show the current `name`/`name_dv` as the
    fallback.
  - Short description (EN) + Short description (Dhivehi) — character counter (≤140), helper: "Shown as
    the little detail line on the mobile menu card."
  - Price note — short input (≤40), helper/examples ("from", "per box").
  - Wire into `menuItemForm.ts` state + save payload.
- **Live card preview (§ owner-approved):** render a **mini ZUS-style card** beside the fields that
  updates as you type — circular image (item's primary media or placeholder), `card_name || name`,
  `short_description || truncated description`, and `price_note + price`. Reuse the order-app card's
  look (a small shared preview component or a faithful mock) so it matches what customers see.

## 5. Order app — consume the fields (ProductCard.tsx)
- Name: `card_name` (or `card_name_dv` when language = DV) → else `name`/`name_dv`.
- Detail line: `short_description` (or `_dv`) → else the current `cardDescriptionPreview(description)`.
- Price: unchanged value; prepend/append `price_note` when set (e.g. "from MVR 12.00" / "MVR 12.00 /box").
- All fallbacks preserve today's output when the new fields are empty.

## 6. Tests
- **Backend:** migration adds columns; item update persists the five fields; validation rejects
  over-length; API item payload includes them.
- **Admin (Vitest):** the editor renders the new section, edits update form state + save payload, and
  the live preview reflects `card_name`/`short_description`/`price_note` with correct fallbacks.
- **Order app (Vitest):** ProductCard shows `card_name`/`short_description`/`price_note` when set and
  falls back to name/truncated-description/plain-price when empty; DV variants used when language=DV.

## 7. Deploy / rollback
- Additive nullable columns + new editor section + additive API fields → **behaviour unchanged until an
  admin fills a field**. `php artisan migrate --force`; rebuild admin + order bundles
  (`backend/public/admin`, `backend/public/order`, bump order SW `CACHE_VERSION`). Rollback = revert;
  columns are harmless if left.

> Build this on the same branch as the ZUS menu-card redesign (`claude/mobile-menu-footer`) so
> `ProductCard` consumes these fields in one coherent change, or as a follow-up branch that rebases on
> it.
