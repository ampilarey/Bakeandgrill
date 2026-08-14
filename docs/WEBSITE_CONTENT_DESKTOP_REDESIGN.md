# Website Content — Desktop Layout Redesign

Status: **shipped** (Stages A–D) on branch `claude/service-availability-maintenance-zj4whc`.

Scope: **`/content/website` on desktop only.** Not the Order App destination, not mobile, not the
rest of the admin. Mobile and Order App follow only after the owner has seen and approved this.

Owner: *"I want you to redesign completely. I want a fresh new layout. First I want to see the
changes in website content desktop view only."*

Stage 4 regrouped the settings and that work was real — 12 storage groups became 7 page-first
sections and the misnamed groups are gone. But the owner is still not satisfied, and after reading
the whole page I think he is right. Regrouping fixed the *labels*. It did not fix the *shape*.

---

## 1. What is on the page today

Desktop render tree (`ContentHubPage.tsx:1191–1240`):

```
PageShell
  PageHeader  (System · Website Content · subtitle · header actions)
  schedules banner  (conditional)
  ScopeMismatchNotices
  .hub-desktop-shell   ← flex row
      HubSectionList     240px sticky rail
      .hub-editor-area   flex: 1     → HubSectionContent  OR  HubSurfaceLanding
      HubPreviewHost     column, only when ≥1200 AND toggled on
```

### The core problem: three maps of the same territory, stacked

**Map 1 — the left rail.** 7 page sections:

| Section | Blocks |
|---|---|
| Home | 52 |
| Everywhere | 41 |
| Legal | 22 |
| Contact page | 19 |
| Hours page | 13 |
| Menu page | 1 |
| Signage | 1 |

**Map 2 — surface cards** on the landing (`SurfaceBuilderLanding.tsx`). 7 cards for Website:
Desktop Header, Desktop Home, Desktop Footer, Mobile Header, Mobile Home, Mobile Footer, Mobile
Bottom navigation.

**Map 3 — "Brand & pages" task cards.** 13 cards visible on Website: `brand_profile`, `hero`,
`announcement`, `website_footer`, `website_header`, `seo`, `legal`, `opening_hours`,
`contact_map`, `catering_events`, `history`, `schedule`, `import_export`.

**That is 27 entry points on one screen, and they describe the same content three different
ways.** The overlaps are not subtle:

| Thing | Reachable as |
|---|---|
| Home | rail section · Desktop Home card · Mobile Home card |
| Footer | inside Everywhere · Desktop Footer card · Mobile Footer card · `website_footer` card |
| Hero | inside Home · `hero` card |
| Header | inside Everywhere · Desktop Header card · Mobile Header card · `website_header` card |
| Legal | rail section · `legal` card |
| Contact | rail section · `contact_map` card |
| Hours | rail section · `opening_hours` card |
| SEO | inside Everywhere · `seo` card |

Nothing tells you which route is the "real" one, so every visit starts with a decision that has no
right answer. That is the feeling the owner is reporting.

### Four more concrete faults

1. **The desktop page shows mobile surfaces.** Four of the seven surface cards are Mobile Header,
   Mobile Home, Mobile Footer, Mobile Bottom navigation — on the screen he uses on a desktop.
2. **Tools are filed as content.** `history`, `schedule` and `import_export` sit in the same card
   grid as Hero and Footer. They are not content.
3. **The card grid is a single column.** `.hub-task-grid` is `flex-direction: column`
   (`index.css:4038`). On a 1400px monitor that is a narrow ribbon of 13 wide cards with a large
   empty right-hand side.
4. **The preview is off by default** and only exists at ≥1200. The one thing that would tell him
   what a setting does is hidden behind a toggle.

### What is genuinely good and must survive

- The page-first rail order — Home, Menu page, Contact page, Hours page, Legal, Everywhere.
- `canonicalCatalog.ts` as the single source for counts and lists.
- Ops-owned keys rendering read-only with a "Managed in …" link.
- Per-app isolation: Website publish never touches Order App.
- The integrity banner and its safe keep/hide resolution.

---

## 2. The redesign

**One idea: one map, list on the left, what you are editing on the right.**

**Owner decision (2026-08-14): no live preview column.** Revision 1 of this document made an
always-on preview the centrepiece. The owner asked for it to be removed, and the design is better
for it — the 340px it occupied goes to a proper editing pane, and the performance risk of a
constantly re-minting preview iframe disappears with it.

The reason the preview was proposed still stands and must be answered another way: **166 of 173
blocks are a label and a text box.** With no preview, the *summary line* on each component row
carries that job and becomes load-bearing — it must show what the setting currently **says**, not
what it is called. `home_proof_eyebrow` is meaningless; *"What we're known for"* is not. A
**View live site ↗** button in the header opens the real page in a tab, one click, when the
summary is not enough.

### 2.1 Two zones, and the work area changes mode

**Revision 3 (2026-08-14). Owner: *"there is no place to edit hero banner."* He is right, and the
fault was mine.** Revision 2 put a fixed third column on the right for editing. The hero does not
fit in a column. Per slide it carries **over 20 controls**:

| Group | Controls |
|---|---|
| Picture | `image`, `image_alt`, `image_focal_x`, `image_focal_y`, crop, `video`, `video_poster`, video editor |
| Words | eyebrow tag, title (HTML), subtitle, Button 1 text + URL, Button 2 text + URL |
| Look | photo brightness, text background, text position, per-element background (None / Dark / Light / Amber / Brand dark / Glass) |
| Timing | `showing`, `show_from`, `show_until`, duplicate, delete |

Times three or more slides. That is not a component row with a few fields — it is an editor in its
own right, and `HeroSlidesEditor.tsx` is 1,143 lines for exactly that reason.

**So: two zones, not three. The work area takes the whole screen and changes mode.**

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Website Content     [ Desktop | Mobile ]  EN  View live site ↗  ⋯  Publish│
├────────────┬──────────────────────────────────────────────────────────────┤
│  ★ Hero    │  Home  ›  Hero                                    ← Back     │
│            │  ┌────────┬────────┬────────┬─────────┐                      │
│  PAGES     │  │Slide 1 │Slide 2 │Slide 3 │ + Add   │  ← slide strip       │
│  ▸ Home    │  └────────┴────────┴────────┴─────────┘                      │
│    Menu    │  ┌──────────────┬──────────────┬──────────────┐              │
│    Contact │  │  PICTURE     │  WORDS       │  LOOK        │              │
│    Hours   │  │  image       │  eyebrow     │  brightness  │              │
│    Events  │  │  focal point │  title       │  text bg     │              │
│    Legal   │  │  alt text    │  subtitle    │  position    │              │
│  ────────  │  │  video       │  button 1    │  colours     │              │
│  Site-wide │  │              │  button 2    │  showing     │              │
│            │  └──────────────┴──────────────┴──────────────┘              │
│  208px     │  everything else — the full width                            │
└────────────┴──────────────────────────────────────────────────────────────┘
```

**Zone 1 — the rail, with Hero pinned at the top.** The owner's own answer to "what do you usually
change?" was *"usually hero"*. So it is the first thing in the list, above Pages, reachable in one
click from anywhere. Then the pages in site order, then a divider, then Site-wide.

**Zone 2 — one work area with two modes.**

- **Page mode** — the component list for the selected page, in `page_blocks` render order, each row
  showing what it currently says. Wider than revision 2's 340px strip, so summaries are not
  truncated.
- **Component mode** — the selected component takes the *entire* work area. A breadcrumb
  (`Home › Hero`) and a Back control are the only chrome.

This is list-then-detail, not list-beside-detail. It is why the hero finally has somewhere to live.

### 2.1b The hero editor, specifically

Full work-area width, three groups that match how a person thinks about a slide:

- **Slide strip across the top.** Real thumbnails, the slide's actual title on each, Showing or
  Hidden, drag to reorder, and Add slide. Selecting a card loads it below. This replaces the nested
  slide sheets entirely.
- **Picture** — the image with its focal point set visually, alt text, replace/crop, and the video
  path where one is attached.
- **Words** — eyebrow, title, subtitle, both buttons with their links.
- **Look** — photo brightness, text background, text position, the per-element background swatches,
  and showing with its optional start/end dates.

Three columns of about 300px each fit comfortably in the freed width. Nothing is nested, nothing is
in a sheet, and the whole slide is visible at once.

### 2.2 Desktop / Mobile becomes a filter, not a place

Desktop and Mobile are a property of a component, not separate destinations. Replace the seven
surface cards with **one Desktop | Mobile toggle in the page header**. It filters which components
the work area lists in page mode. Same page, same rail, same components — one switch.

That removes four mobile cards from a desktop screen and three desktop cards that duplicated the
rail, and it makes "what does this look like on a phone?" a single click instead of a different
screen.

### 2.3 Tools leave the content area

`history`, `schedule`, `import_export` and Media Library move into the header's ⋯ menu. They are
tools. The integrity warning stays but only as a slim banner when something is actually wrong.

### 2.4 What the numbers become

| | Today | After |
|---|---|---|
| Entry points on screen | 27 | 10 rail sections + 1 Desktop/Mobile toggle |
| Ways to reach the footer | 4 | 1 |
| Mobile surfaces on a desktop screen | 4 | 0 (behind the toggle) |
| Preview | off by default, ≥1200 only | removed — **View live site ↗** in the header |
| Clicks from landing to editing the hero | 2–3 depending on route | 1 |
| Width given to the editor | shared with a 440px preview | the entire work area |
| Room for the hero's 20+ controls | a narrow sheet | three columns, full width |

---

## 3. What must not change

- No block key renamed, no value rewritten, no scope changed. This is layout only. The
  620-combination resolver snapshot must pass untouched.
- No change to the Order App destination in this pass.
- No change to mobile in this pass. The existing mobile sheets keep working exactly as they do.
- No change to any public customer page.
- `canonicalCatalog.ts` stays the single source for counts and lists — the redesign must not
  introduce a second counter.
- Ops-owned keys stay read-only with their owner link.
- Website publish/draft/preview stays isolated from the Order App.

---

## 4. Risks

1. **Deleting a route someone uses.** The 13 task cards are being removed as *duplicate routes*,
   not as features — every destination they point at must still be reachable from the rail. A test
   should assert that.
2. **The summary line is now load-bearing.** With no preview, a row that reads only
   `home_proof_eyebrow` leaves the owner exactly where he started. Every component row must show
   its current value. A row that cannot produce a meaningful summary is a bug, not a cosmetic gap.
3. **Home is 52 blocks.** Render order helps, but the centre column still needs the subgroups that
   already exist — Order buttons, Specials, Featured — as headings within the list, not as
   separate destinations.
4. **Breaking the mobile path while changing desktop.** Both render from `HubSectionContent`. The
   desktop redesign must not alter the mobile branch; the existing mobile tests are the guard.
5. **Doing this before go-live.** This changes screens the go-live checklist covers. It is the
   owner's call, and he has asked for it — but the manual tests already completed on these screens
   should be re-run afterwards.

---

## 5. Stages

**Stage A — the rail becomes the only map.** Remove the surface cards and the 13 task cards from
the Website desktop landing. Selecting a page from the rail loads it directly; no landing screen.
Tools move to the ⋯ menu. Assert every removed route is still reachable.

**Stage B — the centre column becomes the page in render order.** Component rows with a summary
line, showing/hidden state and Edit. Hero first via `page_blocks` order. Existing subgroups become
headings.

**Stage C — the hero editor, full width.** The work area's component mode, built hero-first:
slide strip on top, then Picture / Words / Look in three columns. **View live site ↗** goes in the
header. This is the stage the owner is waiting for — do not defer it behind the others.

**Stage D — Desktop | Mobile filter** in the header, driving the component list.

Stage A alone removes most of the confusion. Stage B is what makes the settings comprehensible,
now that there is no preview to lean on.

---

## 6. What shipped (2026-08-14)

Commits on this branch (after the plan docs):

| Stage | What landed |
|---|---|
| **A** | Website desktop opens Home immediately (no landing). Surface cards + Brand & pages task cards removed as duplicate routes. History / Schedule / Import-Export in header ⋯. Integrity banner only when it has issues. Rail site-wide divider. Contract map + reachability test: `websiteDesktopLandingRoutes.ts`, `ContentHub.websiteDesktopStageA.test.tsx`. |
| **B** | Middle column `WebsiteDesktopPageList` with load-bearing summaries (`summarizeBlockValue.ts`). Workspace: rail \| page list \| editor. Subgroups as headings. List stays while the right pane edits. |
| **C** | Website desktop: no Preview column/sheet (Order App + mobile sheets keep `HubPreviewHost`). **View live site ↗**. Zones ~208 / 340 / flex. Hero `wideLayout`: slide cards across the top, fields in two columns. Draft status duplicated in the editor pane. Preview token mint skipped on Website desktop. |
| **D** | Header **Desktop \| Mobile** filter (default Desktop). Filters device-named keys in the page list; syncs Home surface to `website.{device}.home`. |

### Guardrail results

- Admin suite after each stage: **0 failures** (final: 536 passed).
- Backend full suite: **0 failures** (2585 passed, 3 skipped). Resolver snapshot + ops-ownership unchanged.
- Mobile test files: **not edited**.
- Prove-can-fail: Stage A forced landing on; Stage B broke summaries to key names; Stage C nulled `liveSiteUrl`; Stage D forced `deviceFilter = 'desktop'` — each caught by the matching Stage test, then restored.

### Summary-line notes

Meaningful summaries for hero (title), trust (first + count), categories (first + count), proof, booleans, plain text, empty arrays → Empty/Hidden, ops-owned → current value + Managed elsewhere. Generic JSON objects without a title/label field summarize as **"Configured"** (acceptable, not the raw key). Hero slides with no title text report `weak: true` and fall back to a slide count only.
