# Content Editor Redesign — Website Content and Order App Content

Status: proposed, nothing built.

Scope: the two admin destinations `/content/website` and `/content/order-app`, and everything
they are built from. **Nothing else in the admin.** The wider navigation audit is in
`docs/LAYOUT_REDESIGN_PLAN.md` and is explicitly out of scope here.

Owner's ask, after the website/order-app separation shipped: *"inside the admin app 2 parts,
website content and order app content, all related to these two."*

Separating the two apps removed the *decisions* (Same in both / Different per app). It did not
make either screen smaller. This is about the screens themselves.

---

## 1. What is on those two screens

| | Website Content | Order App Content |
|---|---|---|
| Blocks shown | **148** | **88** |
| Groups | 12 | 14 |
| Largest group | Pages — **44** | Order App — 18 |

Website Content, by group: Pages 44, Homepage 32, Contact 19, Footer 16, Order App 10, General 6,
Branding 6, SEO 5, Announcements 4, Legal 4, Hero 1, Menu 1.

Order App Content, by group: Order App 18, Footer 15, Homepage 11, Pages 10, Contact 7, General 6,
Branding 5, Announcements 4, Status banners 4, About 2, Menu 2, SEO 2, Hero 1, Legal 1.

Registry totals: **169 non-deprecated blocks**, of which **67 appear in both destinations** (up
from 155 and 41 before the separation work — the registry grew during it).

What kind of thing each block is:

| | Count |
|---|---|
| Plain editor — a label and a box | **163 of 169** |
| Purpose-built editor | 6 (hero, categories, proof, trust, about values, footer links) |
| Field type `text` (one line) | 136 |
| `textarea` | 17 · `json` 6 · `image` 5 · `boolean` 4 · `color` 1 |

Code behind it: `ContentHubPage.tsx` is **2,046 lines**; the whole content editing surface is
**7,405 lines** across ~30 components. `HeroSlidesEditor.tsx` alone is **1,143 lines**.

---

## 2. Why it is difficult — four findings

### 2.1 It is organised by where a setting is *stored*, not by what the customer *sees*

This is the main one.

The groups are storage categories. To change the words on the homepage, the wording is spread
across **six different groups**: Homepage (32), Hero (1), Announcements (4), Footer (16),
General (6), Branding (6). Nothing tells you that. You have to already know.

The owner's mental model is a page. The screen's model is a filing cabinet.

### 2.2 "Pages" is a dumping ground — 44 blocks with nothing in common

44 of the website's 148 blocks are in one group called Pages. Contact page copy, hours page copy,
privacy titles, homepage categories, the trust strip. They are grouped by *not being clearly
something else*.

### 2.3 A group called "Order App" appears inside Website Content

Ten blocks — `order_mode_delivery_hint`, `order_mode_pickup_info`, `order_mode_status_available`
and seven more — are tagged `group: "Order App"` but target both apps, because the website's
homepage mode-cards use them.

They are on the right screen. The **label** is wrong: inside Website Content, a section headed
"Order App" reads as a mistake. Anyone would skip it, then wonder why the delivery hint on their
homepage will not change.

### 2.4 148 text boxes, and no picture of what any of them changes

163 of 169 blocks render as a label and an input. There is a `VisualBlockPreview` component and a
`PreviewPane`, so the raw material exists — but the primary experience is still a long list of
named boxes. `home_proof_eyebrow` is not a thing anyone can picture.

And on a phone it is deep. To change one line of hero text: section card → editor sheet → hero
editor sheet → slide overview → slide editor sheet. **Five levels.** The preview is a sixth sheet.

---

## 3. The redesign

One idea, applied consistently: **organise by page, in the order the page renders, and show what
each thing looks like.**

### 3.1 Replace 12 storage groups with the pages that actually exist

For Website Content:

- **Home** — every block that appears on the homepage, top to bottom
- **Menu page**
- **Contact page**
- **Hours page**
- **Events & Catering**
- **Legal** — privacy, terms, refund
- **Everywhere** — header, footer, announcement bar, branding, SEO

For Order App Content: **Home**, **Menu**, **Ordering** (the mode cards, hours and status
banners), **Order history**, **Gift cards**, **Everywhere**.

Same blocks, same keys, same values. Only the shelving changes.

**The homepage ordering already exists and should be reused.** The `page_blocks` table plus
`HomeLayoutMigrator` already know the real top-to-bottom order of the 28 homepage partials. The
content editor should read that order rather than inventing an alphabetical one, so the list on
screen matches the page in the browser. When a block moves in the page builder, its position in
the content editor moves with it. Two screens, one truth.

### 3.2 Rename the groups that are named after the code

`Order App` inside Website Content becomes **Order buttons** or **Ordering section** — whatever
describes where it appears on the homepage. Same for `Status banners`, `General` and `Pages`,
which are all engineering words.

Rule: a group name should answer *"where on my site is this?"* — never *"what part of the system
stores it?"*

### 3.3 Show what the block is, not what it is called

Every block should carry a small picture or a real example. `VisualBlockPreview` already exists —
extend it rather than starting over. Where an image is impractical, show the current value in
context: not `home_proof_eyebrow`, but the words as they appear, in the style they appear in.

### 3.4 Cut the depth on a phone from five levels to two

Target: **section → edit**. Everything else collapses.

The hero is the worst case and the right test — it is currently five deep and its editor is 1,143
lines. A slide should be editable in one sheet with the fields grouped and collapsed, not in three
nested sheets.

### 3.5 Preview beside the editor, not behind a sixth sheet

`PreviewPane`, `LivePreviewFrame` and `createContentPreviewToken` already exist. On desktop the
preview should be permanently visible next to the fields. On a phone it should be one tap, and
tapping a thing *in* the preview should open that block's editor — the shortest path there is,
and the machinery for it is largely built.

This is the most valuable item and the most work. It is Stage 4 for that reason, not Stage 1.

---

## 4. What not to do

- **Do not change any block key, value or scope.** The separation work just moved 620
  key/app/locale combinations with a test proving nothing changed. This redesign must not touch
  data at all — it is presentation only, and that is what keeps it safe.
- **Do not merge the two destinations back together.** They were just separated, deliberately.
- **Do not delete blocks** because a group looks too long. If a setting is genuinely unused, that
  is a separate decision with the owner, not a side effect of tidying.
- **Do not rebuild the six custom editors** (hero, categories, proof, trust, about values, footer
  links). They work. Only the hero needs restructuring, and for depth, not for function.
- **Do not add a WYSIWYG page editor.** The page builder already exists (`page_blocks`,
  `HomeLayoutEditor`). Reuse its ordering; do not build a second one.
- **Do not start before go-live.** Same reason as the wider layout plan: the go-live checklist
  covers these screens.

---

## 5. Risks

1. **Losing a block during regrouping.** 148 + 88 blocks moved by hand will lose one. The test
   that prevents it: assert every non-deprecated registry key targeting an app appears exactly
   once in that app's new grouping. Mechanical, and it cannot be argued with.
2. **The 2,046-line page file.** `ContentHubPage.tsx` is large enough that a regroup risks
   unrelated breakage. Split it before restructuring it, not after — and split it in its own
   commit so a regression bisects to the split rather than to the redesign.
3. **Drafts and autosave.** There is a draft store, an autosave path and a publish path, and the
   difference between "saved draft" and "live" was a real bug once already. Any restructuring must
   keep the draft status visible at every level, including inside sheets.
4. **Permissions.** Both destinations sit behind `website.manage`. Regrouping must not create a
   path to a block a user could not previously reach.
5. **Regrouping without renaming.** Doing §3.1 but skipping §3.2 leaves a section called "Order
   App" inside Website Content. Half the change is worse than none — it moves things without
   making them findable.

---

## 6. Stages

**Stage 0 — Go live first.**

**Stage 1 — Split `ContentHubPage.tsx`.** Pure refactor, no visible change. Makes everything after
it safe. Ship alone.

**Stage 2 — Regroup and rename.** §3.1 and §3.2 together, never apart. Reuse the `page_blocks`
order for the homepage. Guarded by the every-key-appears-once test. This is most of the relief and
carries almost no risk, because no data moves.

**Stage 3 — Cut the phone depth to two levels.** §3.4, starting with the hero because it is the
worst and the most used.

**Stage 4 — Preview beside the editor, click-to-edit.** §3.5 and §3.3 together. The biggest change
and the biggest payoff. Only after 1–3 have settled.

Stages 1 and 2 are worth more than 3 and 4 combined for the effort involved. If only one stage
ever happens, make it Stage 2.

---

## 7. What I need from you before Stage 2

**When you open Website Content, what are you usually trying to change?** If it is nearly always
the hero and the homepage words, the grouping should put those first and push Legal and SEO to the
bottom. If you spend your time on the contact page, that changes.

I can group these 148 blocks in a way that is *logical*. Grouping them in the order **you** reach
for them needs one sentence from you.
