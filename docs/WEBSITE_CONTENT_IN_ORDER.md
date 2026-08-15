# Website Content, In Order — Desktop and Mobile

What is on the website, top to bottom, and which settings control each part. Built from the actual
renderers (`home.blade.php`, `layout.blade.php`, `partials/home/*`, `ModeEntryCardsPresenter`), not
from the `group` labels in `content.php` — those have already proved unreliable.

**Order App is not in this document.** It follows later.

**One caveat that matters.** The homepage order lives in the database (`page_blocks`), so the order
below is the frozen default from `LegacyHomeLayout::WEBSITE_DEFAULT` plus every other section that
can be placed on Home. If the layout has been reordered in the admin, the real order differs — the
*sections* and *their settings* are correct either way.

Desktop and mobile run the **same list**. What differs is per-section visibility flags
(`show_desktop` / `show_mobile`) and placement (`placement_desktop` / `placement_mobile`), so a
section can be on one device and not the other. Mobile has one extra surface, the bottom navigation
bar, which the desktop does not have.

---

## 1. Every page on the website

| Page | URL | Real page? |
|---|---|---|
| Home | `/` | Yes |
| Contact | `/contact` | Yes |
| Hours | `/hours` | Yes |
| Terms | `/terms` | Yes |
| Refund | `/refund` | Yes |
| Menu | `/menu` | **No — redirects to `/order/menu`** |
| Privacy | `/privacy` | **No — redirects to `/order/privacy`** |
| Events & Catering | `/pre-order` | **No — redirects to `/order/events`** |

So the website is **five real pages**, plus the chrome that wraps all of them. Events & Catering
has no page of its own — its wording only appears in the Events band on the homepage.

---

## 2. Home page, top to bottom

Default order. Each section is one component in the page builder; each can be shown or hidden per
device and moved.

### 1 · Prayer times bar
Placed above the hero on mobile by default. No content settings of its own — it reads prayer times.

### 2 · Greeting
`site_name`

### 3 · Hero banner *(the big picture and headline)*
`hero_slides` — the whole carousel. Per slide: picture, focal point, description, video, poster,
small line above, title, line underneath, Button 1 text and link, Button 2 text and link, photo
brightness, text background, where the words sit, background colours, showing, start and end dates.
Also reads: `site_name`, `site_tagline`, `home_open_badge_text`, `home_closed_badge_text`

### 4 · Announcement bar
`announcement_enabled`, `announcement_text`, `announcement_style`, `announcement_url`

### 5 · Opening status / Service availability
No wording of its own — reads live opening hours and the service switches.

### 6 · Order buttons *(Delivery · Pickup · Eat here)*
`order_mode_delivery_hint`, `order_mode_delivery_info`,
`order_mode_pickup_hint`, `order_mode_pickup_info`,
`order_mode_dine_in_hint`, `order_mode_dine_in_info`,
`order_mode_status_available`, `order_mode_status_unavailable`,
`order_mode_status_unavailable_opens`, `order_mode_learn_more`

### 7 · Today's Specials
`home_specials_title`, `home_specials_eyebrow`, `offers_headline`, `offers_subtext`,
`default_item_image`, `logo`

### 8 · Featured items
`home_featured_title_bestseller`, `home_featured_title_handpicked`,
`home_featured_eyebrow_bestseller`, `home_featured_eyebrow_handpicked`,
`home_featured_subtitle`

### 9 · Categories *(what we're known for)*
`homepage_categories` — the category list itself.
`home_categories_title`, `home_categories_eyebrow`, `home_categories_subtitle`

### 10 · Trust strip
`trust_items`

### 11 · Proof *(the numbers)*
`proof_details`, `proof_stat`, `proof_label`, `home_proof_eyebrow`

### 12 · Stat chips
`proof_stat`, `proof_label`

### 13 · Reviews
`order_home_reviews_title`, `home_proof_eyebrow`

### 14 · CTA band
`cta_band_headline`, `cta_band_subtext`

### 15 · Location & delivery *(the biggest section — 22 settings)*
`home_location_title`, `home_location_eyebrow`, `home_location_subtitle`,
`home_visit_card_title`, `home_delivery_card_title`,
`home_delivery_tagline`, `home_delivery_subtitle`, `home_delivery_quality_line`,
`home_delivery_payment_line`,
`home_open_badge_text`, `home_closed_badge_text`,
`home_directions_cta`, `home_call_cta`, `home_chat_label`,
plus these, which are **read-only here** — they belong to Business Details or Delivery Settings:
`business_address`, `business_landmark`, `business_maps_url`, `business_phone`,
`business_whatsapp`, `business_viber`, `delivery_time`, `delivery_threshold`

### 16 · Events & Catering band
`events_section_headline`, `events_section_blurb`,
`events_section_plan_cta`, `events_section_browse_cta`

### 17 · Office orders
`office_orders_enabled`, `office_orders_headline`, `office_orders_subtext`

### 18 · Reorder strip
No wording of its own.

### 19 · Brand footer *(inside the homepage, not the site footer)*
`footer_text`, `footer_thanks`, `home_chat_label`, `logo`, `site_name`,
`business_whatsapp`, `business_viber`

**Free-form blocks** that can be added anywhere on Home, as many as you like: custom text, image,
image with text, video, FAQ list, button band, divider.

---

## 3. Every other page

### Contact — `/contact`
Page title and subtitle, the contact form wording, and the map. Reads the business phone, email,
address, landmark, maps link, WhatsApp and Viber — **all read-only**, owned by Business Details.

### Hours — `/hours`
Page title plus the opening-hours table, which is generated from the real opening-hours system.

### Terms — `/terms`  ·  Refund — `/refund`
Page title and body text.

---

## 4. The chrome — on every page

### Header
`logo`, `logo_dark`, `site_name`, `nav_order_cta_text`, `language_switcher_enabled`

### Announcement bar
The same four settings as section 4 above — it is one bar, controlled once.

### Site footer *(different from the Brand footer inside the homepage)*
`footer_text`, `footer_thanks`, `footer_rights_suffix`,
`footer_contact_heading`, `footer_hours_heading`, `footer_location_heading`,
`footer_quick_links_heading`, `footer_delivery_text`, `footer_payments_text`,
`footer_ramadan_note`, `footer_links`,
`show_social_links`, `social_facebook`, `social_instagram`, `social_tiktok`,
plus the business contact details, read-only.

### Behind the scenes — never seen on the page
`meta_title`, `meta_description`, `meta_keywords`, `og_image`, `favicon`, `primary_color`,
`google_tag_manager_id`, `google_analytics_id`

---

## 5. Desktop vs mobile

Same sections, same settings. Three differences:

1. **Any section can be on for one device and off for the other.** That is a per-section switch
   (`show_desktop` / `show_mobile`), not a different list of content.
2. **A section can sit in a different place on each device** — for example the prayer bar sits at
   the very top on a phone.
3. **Mobile has a bottom navigation bar.** Desktop does not. It is the only surface that exists on
   one device and not the other.

Everything else — every word, every picture, every link — is the same list on both.

---

## 6. The count, honestly

| | Count |
|---|---|
| Real pages | 5 |
| Sections that can sit on Home | 19 named, plus unlimited free-form blocks |
| Settings on Home | 52 |
| Settings in the chrome (header, footer, announcement, SEO) | 41 |
| Settings on Contact | 19 |
| Settings on Hours | 13 |
| Settings on Terms + Refund | 22 |
| **Total website settings** | **149** |

Of the 149, **21 are read-only** in Content — the business phone, email, address, landmark, maps
link, WhatsApp, Viber, delivery time and free-delivery threshold. They are owned by Business
Details and Delivery Settings, and shown here only so you know what the page will say.

The two biggest things on the whole website are the **Hero** (over 20 settings per slide) and
**Location & delivery** (22 settings). Any layout has to hold those two comfortably or it will feel
wrong, whatever else it gets right.
