# Settings That Should Move to Business Details

Owner's ask: *"check the settings that can be moved to business details section that are common on
both websites and order app."*

Audited against `claude/service-availability-maintenance-zj4whc`. 67 settings currently appear in
**both** Website Content and Order App Content. This document says which of them are the same fact
about the business rather than two pieces of marketing copy, and should therefore live once in
Business Details instead of twice.

---

## 1. A bug found on the way — three settings already have two editable homes

`BusinessDetailsKeys` (what the Business Details screen writes) and `OpsOwnedContent` (what Content
Hub refuses to let you edit) **do not agree**.

`OpsOwnedContent::BUSINESS_DETAILS_KEYS` blocks 13 keys, plus `delivery_threshold` — 14 in total.
The Business Details screen also edits **`logo`, `primary_color` and `site_tagline`**, and those
three are **not** in the blocked list.

So today you can change your logo in Business Details, and change it again — to something different
— in Website Content, and again in Order App Content. Three editable copies of one logo, with no
warning. `logo` and `primary_color` are the two that appear on your **invoices** (`DocumentBrandView.php`
lines 15 and 26), so the copy that reaches a customer's invoice can silently differ from the one on
your website.

There is a second, quieter version of the same thing: Media Library's "use as" action already
describes `favicon` and `og_image` as *"Set as … (Business Details)"*
(`MediaLibraryController.php:302-303`) — but Content Hub still edits both per app.

**This is worth fixing regardless of what else you decide.** One value, one place.

---

## 2. What should move — 13 settings

These are facts about the business or its identity. They are not marketing copy, and there is no
sensible reason for the website and the order app to disagree about them.

### Brand identity — 6

| Setting | Why it belongs in Business Details |
|---|---|
| `logo` | Also printed on invoices and receipts. Already half-owned by Business Details. |
| `logo_dark` | The same logo, dark background version. Splitting it from `logo` makes no sense. |
| `favicon` | The little icon in the browser tab. One business, one icon. Media Library already calls it a Business Details setting. |
| `og_image` | The picture shown when someone shares a link. Media Library already calls it a Business Details setting. |
| `primary_color` | Your brand colour. Also printed on invoices. |
| `default_item_image` | The stand-in photo for a food item with no picture. One fallback, used by the menu everywhere. |

### Identity wording — 1

| Setting | Why |
|---|---|
| `site_tagline` | The line under your name. It is who you are, not a page headline. Already editable in Business Details today. |

### Your social accounts — 4

| Setting | Why |
|---|---|
| `show_social_links` | One decision. |
| `social_instagram` | You have one Instagram account. |
| `social_facebook` | One Facebook page. |
| `social_tiktok` | One TikTok. |

### Tracking — 2

| Setting | Why |
|---|---|
| `google_analytics_id` | Usually one property for the whole business. |
| `google_tag_manager_id` | Same. |

**One caveat on tracking:** some businesses deliberately run a separate analytics property for the
shop and the website so they can measure them apart. If you ever want that, these two are the pair
to leave per-app. Everything else on this list has no such argument.

---

## 3. Two more that should move, but not to Business Details

| Setting | Belongs in | Why |
|---|---|---|
| `delivery_time` | **Delivery Settings** | It is a promise about your service, alongside `delivery_threshold`, which already lives there. Splitting the two is how "30–45 min" and "free over MVR 300" end up disagreeing. |
| `menu_new_days` | **Menu settings** | How many days an item is flagged as new. An operational rule, not page copy. |

---

## 4. What should stay separate — and why

The remaining 52 dual-app settings are genuinely two different things wearing one name. The website
speaks to someone deciding whether to visit; the order app speaks to someone already buying.

- **Hero** (`hero_slides`) — the most obvious case. Different audience, different message.
- **Announcement bar** (4) — you may well want to tell website visitors and app users different
  things, or announce on one and not the other.
- **Footer** (11) — the website's footer is a full site footer; the order app's is not the same thing.
- **Homepage wording** — specials, categories, offers, proof, trust items, delivery tagline.
- **Order buttons** (10 `order_mode_*`) — the wording differs by where someone is standing.
- **Page titles** — contact, hours, privacy.
- **Legal body text**, `nav_order_cta_text`, `home_chat_label`, `language_switcher_enabled`.

---

## 5. What this changes

| | Now | After |
|---|---|---|
| Settings you must edit twice | 67 | **52** |
| Settings with two or three editable homes | **3** (`logo`, `primary_color`, `site_tagline`) | 0 |
| Settings owned once by Business Details | 14 | **27** |
| Places to change your logo | 3 | 1 |
| Places to change your brand colour | 3 | 1 |

Fifteen settings stop being your problem twice over, and three stop being able to disagree with
themselves.

---

## 6. What it costs

**You lose the ability to give the order app a different logo.** That is the trade. If you ever
wanted a different brand colour in the app than on the website, this removes it. My reading is that
you never will, and that the cost of them silently drifting apart is much higher — but it is your
call and it is the only real downside.

**The values must not change on the day this ships.** Each of these keys currently has up to three
stored copies. Whichever one wins has to be chosen deliberately, not alphabetically. My
recommendation: **the value currently on the Website wins**, since that is the one you have been
editing, and Business Details should be pre-filled with it. Any order-app copy that differs should
be reported before it is overwritten, never silently dropped.

**Content Hub must then show them read-only**, with a "Managed in Business Details" link — exactly
as the 14 existing ops-owned keys already behave. The machinery for this is built; these keys just
need adding to it.

---

## 7. Decision needed

1. Move all 13 to Business Details, or hold back the two analytics IDs?
2. Confirm the Website copy wins when three copies disagree.

Answer those two and the prompt writes itself.
