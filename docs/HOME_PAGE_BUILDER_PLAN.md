# Home Page Builder — Plan

Status: **Stages A–F built.** Stage F closed the legacy `HomeSectionOrder` / section-toggle path; `page_blocks` is the only home layout source. Empty layouts fall back to non-removable chrome + an admin banner. Seven generic block types from Stage E are live. Anything in the body still framed as “proposed, not yet built” is obsolete for A–F — re-check only work past F before treating it as open.

| Stage | State |
|---|---|
| A–C — `page_blocks` schema, APIs, migration gate | Built |
| D — Content → Home layout editor | Built (`HomeLayoutEditor`) |
| E — generic blocks (rich text, image, image+text, button band, divider, video, FAQ) | Built |
| F — retire `HomeSectionOrder` / `legacyOrderAppBlocks` / section toggles from render + content UI | Built |

> Rescued from branch `claude/home-page-builder-plan` (not written fresh on this branch).

---

Owner's requirement, in their words: admin should be able to **add**, **turn on/off**, and
**rearrange** every component on the home page of **both** apps, with each component's content
controlled either **independently per app** or **shared between them** (as hero slides already
are), plus the ability to **add new components** like a page builder.

---

## 1. What already exists — build on it, do not duplicate

The content foundations are strong. This plan adds a *layout* model on top; it does not
replace the *content* model.

| Capability | Where | State |
|---|---|---|
| Two-app content scoping | `ContentRegistry::APPS = ['website','order_app']`, `SCOPES = ['shared','website','order_app']` | **Built.** Shared-vs-separate already exists at key level. |
| Draft preview with tokens | `ContentDraftStore` (15-min TTL, never public without token) | **Built.** Reuse for block previews. |
| Revision history | `content_revisions` table (key, scope, locale, value, user, timestamp) | **Built.** Gives per-key undo. |
| Scheduled content | `content_schedules` table | **Built.** |
| Hero slides as shared structured content | `HeroSlides` | **Built** — the precedent for shared-content blocks. |
| Section ordering | `HomeSectionOrder` (6 ids: specials, featured, categories, proof, cta, location) | **Built for the website only.** See §2. |
| Admin content editor | `ContentHub` + `blockHelpers.ts` (~160 registered keys) | **Built.** Keys are presented as "blocks" but are key/value pairs, not layout instances. |
| Brand kit, media library, palette | `BrandPalette`, `MediaLibraryService` | **Built.** |

**Crucially:** content today is **key/value rows in `site_settings`**, not structured blocks.
Sections are hardcoded components; the CMS controls their *text* and one fixed order list.
There is no concept of a block *instance*. That is the gap this plan fills.

---

## 2. What is actually broken today (verified)

| Finding | Detail |
|---|---|
| Order app honours only 2 of 6 ordered sections | `HomePage.tsx` lines 317, 324 handle `specials` and `categories`. `featured`, `proof`, `cta`, `location` fall through and are silently ignored. Dragging them in the order-app editor does nothing. |
| Website honours all 6 | `HomeSectionOrder::DEFAULT` + `home.blade.php` line 1208. This half works correctly. |
| Order app has 7 sections with no control at all | Greeting, prayer bar, opening status, mode cards, reorder strip, promo carousel, brand footer — cannot be toggled or moved. |
| Reviews positioned by hardcoded rules | `HomePage.tsx` `insertReviews()` — after specials if specials is on, else after categories. Not in the order list. |
| Hero cannot be moved in either app | Toggleable, but fixed at top. |
| 24 keys claim "both apps" but render only on the website | Prior audit on `claude/content-app-scope-audit-plan`. Re-verify; the numbers predate recent work. |

---

## 3. The model

### 3.1 A `page_blocks` table — layout instances, separate per app

| Column | Purpose |
|---|---|
| `id` | |
| `app` | `website` \| `order_app`. **Each app owns its own arrangement.** |
| `page` | `home` for now; the column exists so other pages can follow without a migration. |
| `block_type` | Which component this is — see §3.2. |
| `position` | Integer sort within the app+page. |
| `is_enabled` | On/off without deleting. |
| `content_mode` | `shared` \| `own`. See §3.3. |
| `settings` | JSON, per-instance configuration validated against the block type's schema. |
| `created_at` / `updated_at` | |

A block appearing in both apps is **two rows**, one per app. That is deliberate: the two homes
have genuinely different jobs, and forcing one arrangement across both is what produced the
current mess.

### 3.2 A block type registry — in code, not in the database

Each type declares: label and description in plain owner language, which apps it may appear in,
its settings schema, whether it supports shared content, and whether it is **removable**.

Types must live in code because each needs a React component (order app) and/or a Blade partial
(website) to render it. The database stores *instances*; code owns *what a type is*.

**Existing components become block types**: hero, specials, featured, categories, social proof,
CTA band, location, reviews, trust strip, mode cards, reorder strip, promo carousel, greeting,
prayer bar, opening status, brand footer.

**New generic types** (the "page builder" part): rich text, image with caption, image + text,
button/link band, spacer/divider, embedded video, FAQ list.

### 3.3 Shared or separate content, per block

Two modes:

- **`shared`** — the block reads a shared content record, so editing it changes both apps. This
  is how hero slides already behave and is the owner's stated model.
- **`own`** — the block's content lives in its own `settings`, independent per app.

The owner picks per block instance. Switching from shared to own **copies** the current shared
values in as a starting point, so nothing appears to vanish.

### 3.4 Required blocks — a page builder must not let the owner break the shop

Some blocks are structural, not decorative. These are marked non-removable in the registry:

- **Mode cards (order app)** — the only route into ordering. Removing them removes checkout.
- **Brand footer (both)** — carries legal and contact information.

They may be **reordered**, and their content edited. They may not be deleted or disabled. The
admin UI must explain why rather than silently refusing.

This is the single most important safety rule in this plan. A page builder that can remove the
Order button will eventually remove the Order button.

---

## 4. The build

### Stage A — layout model and registry
Migration for `page_blocks`; the block type registry; server-side validation that a block's
`settings` match its type's schema and that its type is permitted in that app.

### Stage B — migrate today's layout into blocks
Convert the current hardcoded arrangement of BOTH homes into `page_blocks` rows so that **on the
day this ships, nothing looks different**. Derive the website's order from `HomeSectionOrder` and
existing `section_*_enabled` flags; derive the order app's from its actual render order.

This is the highest-risk stage. It must be idempotent and reversible, and there must be a test
asserting that the rendered order for each app after migration equals the order before.

### Stage C — render from blocks
Both apps render their home page by walking their block list instead of hardcoded JSX/Blade.
Unknown block types render **nothing** and are reported in admin — a type removed from code must
never white-screen a live home page.

### Stage D — the admin builder
One editor per app, side by side: add a block, drag to reorder, toggle on/off, edit content,
choose shared or own. Reuse `ContentDraftStore` for preview before publishing.

Wording throughout must suit a non-technical owner — "Specials carousel", not `specials_block`.

### Stage E — new generic block types
Rich text, image, image + text, button band, divider, video, FAQ. These are what make it a
builder rather than a rearranger.

### Stage F — retire the old mechanisms
Remove `HomeSectionOrder` and the `section_*_enabled` flags once blocks own layout, and correct
the 24 mis-scoped keys from the prior audit. Do not leave two systems that can disagree.

---

## 5. Risks

1. **Migration changing the live homepage.** Highest risk. Both homes must render identically
   the day this ships. Test the before/after order explicitly.
2. **Owner removing checkout.** Mitigated by non-removable blocks (§3.4). Do not weaken this.
3. **Two systems of record.** Until Stage F, `HomeSectionOrder`/`section_*_enabled` and
   `page_blocks` both exist. Blocks must be authoritative from Stage C; the old flags must not
   also be consulted, or they will disagree silently.
4. **Unknown block types after a code change.** Must degrade to nothing, never an error.
5. **Preview leaking publicly.** `ContentDraftStore` is token-based and short-lived — keep it so.
6. **Performance.** The website home is server-rendered Blade; block resolution must not add a
   query per block. Load a page's blocks in one query and cache.
7. **Scope creep into other pages.** `page` column exists for later. v1 is the home page of both
   apps and nothing else.

---

## 6. Test plan

- After migration, each app's rendered section order and enabled set match exactly what they were
  before. This is the gate for Stage B.
- Reordering blocks in one app does not change the other.
- A `shared` block edited once changes both apps; an `own` block changes only its app.
- Switching shared → own copies current values rather than emptying the block.
- A non-removable block cannot be deleted or disabled via the API, not merely hidden in the UI.
- An unknown block type renders nothing and is reported in admin.
- Draft preview shows unpublished layout only with a valid token; the public page is unchanged.
- A block type not permitted in an app cannot be added to it.
- Home pages render with one query for blocks, not one per block.

---

## 7. Sequencing and honest sizing

A → B → C must land together: the model, the migration and the rendering are one change, because
a half-migrated home page is a broken home page. D follows, E after that, F last.

This is **substantially larger than anything else attempted in this project so far** — it
replaces how two home pages are constructed. It should not be built in the same window as
payment testing or the launch checklist, and it should not be the last thing changed before
opening. Land it in a quiet period, with the ability to roll back.
