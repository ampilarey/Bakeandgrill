# TV Signage — Stage 4 plan

Three independent items shipped together.

## A — Brand idle slide (`brand_card`)

When a screen has no slides (or an empty rotation), the player used a hardcoded
site-name string. Replace with a real `brand_card` template (logo → name → phone
→ website) rendered through `SlideCanvas`.

- Template lives in `SignageTemplateFactory` and the admin template catalog so
  owners can also add it deliberately.
- Board background is dark → use `logo_dark ?? logo`.
- Add `business_website` site setting (no hardcoded domain).
- Expose `business_phone` and `business_website` via `SignageResolver::variables()`.
- Split loading vs empty: quiet loading while config is null; brand card once
  config is loaded but no slide is available.

## B — Multi-banner

`signage_banner` becomes a master toggle + `banners[]`. Old single-object shape
is normalized on read into one legacy banner entry. Each banner supports
`fields`, optional `custom_text` (with `{{variables}}`), `speed_seconds`, and
`duration_seconds` for rotation. Player cycles enabled banners; admin Banner tab
edits the list.

## C — Mobile footer clearance

Designer sticky Cancel/Apply sat under the admin `MobileTabBar` (both `bottom: 0`).
Offset the sticky bar by the tab bar height and pad the designer so content is
not covered.
