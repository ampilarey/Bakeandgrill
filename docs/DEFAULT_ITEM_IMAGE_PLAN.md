# Default Item Image — Implementation Plan

**Status:** Ready to build
**Goal:** Let admins set a **default item photo** that any item **without its own image** uses
automatically — everywhere (order app menu + offers, main website, desktop + mobile). Replaces the
current brand-logo placeholder (a black square that reads as a rectangle inside the circle) with a real
photo that fills the circle cleanly. Uploadable in **Settings → Website/Branding** and pickable in the
**Media Library** ("Use as → Default item image").

## 1. Audit — today
- Image-less items fall back to a brand-logo / "BG" monogram placeholder in each surface
  (order app `ProductCard`/`OfferCard`, website `home.blade.php` `.special-card`). The logo is a black
  square → looks like a rectangle in the circle.
- Brand images (`logo`, `logo_dark`, `favicon`, `og_image`) upload via
  `SiteSettingsController` (`directKeys`, multipart file+key) and are surfaced to apps by
  `SiteSettingsController::public()`.
- Order-app item media resolves in `apps/online-order-web/src/utils/itemMedia.ts` (`buildItemSlides`);
  the empty-slides placeholder is rendered by the card components.
- There is **no** Media Library "use-as" endpoint yet.

## 2. Build

### 2.1 Setting + upload (backend)
- New SiteSetting key **`default_item_image`** (URL string, nullable).
- Add `default_item_image` to `SiteSettingsController` **`directKeys`** so it uploads through the
  existing brand-image flow (multipart `file` + `key=default_item_image`). Process via the standard
  image pipeline (reuse `MenuImageProcessor` if brand uploads do; store on the public disk).
- Add `default_item_image` to the **public settings payload** (`SiteSettingsController::public()`) so
  all apps receive it.

### 2.2 Media Library "Use as" (backend + admin)
- Add endpoint `POST /admin/media/{id}/use-as` `{ key }` where `key ∈ ['default_item_image','favicon',
  'logo','logo_dark','og_image']` (gated by `media.manage`/`website.manage`). It sets the SiteSetting to
  the asset's URL. Audit-logged. (Primary use here: `default_item_image`; include the brand keys since
  it's the same mechanism.)
- Media Library detail drawer (`MediaLibraryPage.tsx`): add a **"Use as"** control (image assets only)
  with a **Default item image** option (+ the brand options) calling the endpoint; success toast
  ("Set as default item image").

### 2.3 Admin Website/Branding uploader
- `apps/admin-dashboard/src/pages/SettingsPage/WebsiteSettingsSubPage.tsx`: add a **"Default item photo"**
  uploader next to Logo/Favicon/OG (reuse the existing brand-image upload component; key
  `default_item_image`). Show the current image with a Replace/Remove control and a one-line helper:
  "Shown for menu items that don't have their own photo."

### 2.4 Consume everywhere (the fallback chain)
Order of precedence for an item's card image: **item photo/thumb → `default_item_image` → brand
logo/monogram placeholder** (keep the logo/monogram only as the last resort when no default is set).
- **Order app:** thread `default_item_image` from the public-settings context into `buildItemSlides`
  (or the card placeholder) so image-less items produce a slide using the default photo (rendered with
  `object-fit: cover` to fill the circle). Update `ProductCard` and `OfferCard` placeholders.
- **Main website (`home.blade.php`):** in the `.special-card` (and menu item cards) placeholder branch,
  if `SiteSetting::get('default_item_image')` is set, render it as `<img>` filling the circle
  (`object-fit: cover; border-radius:50%`); else the current logo/monogram. Applies to Offers + Today's
  Specials sections.
- A default photo fills the circle edge-to-edge, so image-less items look like real photos, not a black
  square.

## 3. Testing
- **Backend:** uploading `default_item_image` persists + appears in the public settings payload;
  `use-as` sets the setting to the asset URL (default_item_image + a brand key), gated by permission,
  audited.
- **Admin (Vitest):** Website/Branding shows the Default item photo uploader and saves; Media Library
  drawer "Use as → Default item image" calls the endpoint.
- **Order app (Vitest):** an item with no image + a set `default_item_image` renders that image (cover)
  in the card/offer circle; with no default set, falls back to the logo/monogram placeholder.
- **Website:** Blade renders the default image in the special-card placeholder when the setting is set;
  logo/monogram when not.

## 4. Deploy / rollback
Additive + non-breaking: new setting defaults empty → current logo/monogram placeholder stays until an
admin uploads a default. `php artisan migrate` (if a settings seed row is added) / no schema change
(SiteSetting is key/value). Rebuild admin + order bundles → `backend/public/admin`,
`backend/public/order` (bump order SW `CACHE_VERSION`); `view:clear` for Blade.
