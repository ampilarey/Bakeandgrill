# Layout Redesign — Admin, Website, Order App

Status: proposed, nothing built.

Owner's ask: *"can u audit and redesign the admin app, website, order app layout, its v difficult,
i need a complete redesign."*

**Short answer: one of the three genuinely needs it, one needs something different from what it
sounds like, and one should be left alone.** Redesigning all three at once, weeks before go-live,
is the most expensive and highest-risk version of this — and it would throw away the 46 automated
go-live tests along with the layouts they check.

Boundary with the existing plan: `docs/ADMIN_THEMING_MOBILE_PLAN.md` covers **colours, dark mode
and mobile modals**. This document covers **where things live and how screens are laid out**. They
do not overlap and neither supersedes the other.

---

## 1. What is actually there

| | Admin | Website | Order app |
|---|---|---|---|
| Page files | 112 | 15 Blade pages | 53 |
| Total components | 228 `.tsx` | 28 homepage block partials | 181 `.tsx` |
| Routes / destinations | **62 nav items** | ~5 header links | 37 routes |
| Top-level navigation | 6 groups | 1 flat header | 5 bottom tabs |
| Largest single file | — | `layout.blade.php` **2,388 lines** | — |
| Second largest | — | `home.blade.php` **1,293 lines** | — |

The admin's 62 destinations, by group:

| Group | Items |
|---|---|
| monitor | 7 — Dashboard, Orders, Kitchen Display, Tables, Delivery Orders, Kitchen Handover, POS Activity |
| manage | 13 — Menu Items, Daily Specials, Inventory, Purchase Requests, Shopping Lists, Purchase Orders, Suppliers, Waste Tracking, Reservations, Ordering Control, Wholesale shops, Wholesale deliveries, Wholesale invoicing |
| customers-marketing | 13 — Customers, Customer Growth, Events & Catering, Loyalty, Gift Cards, Discount Cards, Referrals, Reviews, Promotions, Discount Controls, SMS & Messaging, SMS Control Center, TV Signage |
| analyze | 11 — Reports, Wholesale reports, Analytics, Forecasts, Procurement, GST, Profit & Loss, Invoices, Expenses, Refunds, Complaints |
| system | 14 — Website Content, Order App Content, Business Details, Media Library, Roles & Permissions, Notifications, Charges & Fees, Currency Photos, Devices, Print Queue, Webhooks, Xero, System Health, Service Availability |
| team | 4 — Staff, Shifts & Cash, Time Clock, My Account |

---

## 2. Diagnosis — the three apps have three different problems

### 2.1 Admin: the navigation is sorted by what things *are*, not by how often you need them

This is the real defect, and it is measurable.

Sort those 62 destinations by how often a restaurant owner actually opens them:

| How often | Count | Examples |
|---|---|---|
| **Every day** | ~10 | Dashboard, Orders, Kitchen Display, Delivery Orders, POS Activity, Tables, Shifts & Cash, Service Availability, Ordering Control, Daily Specials |
| **Every week** | ~11 | Menu Items, Inventory, Purchase Requests, Shopping Lists, Reports, Complaints, Reviews, Customers, Refunds, Waste Tracking, Reservations |
| **Monthly or per season** | ~15 | Purchase Orders, Suppliers, GST, Profit & Loss, Invoices, Expenses, Analytics, Forecasts, Procurement, Customer Growth, the four Wholesale screens, Staff, Time Clock |
| **Set once, then almost never** | ~25 | Website Content, Order App Content, Business Details, Media Library, Roles & Permissions, Notifications, Charges & Fees, Currency Photos, Devices, Print Queue, Webhooks, Xero, System Health, Loyalty, Gift Cards, Discount Cards, Referrals, Promotions, Discount Controls, SMS & Messaging, SMS Control Center, TV Signage, Events & Catering, Kitchen Handover, My Account |

**Roughly 40% of the admin's navigation is configuration you will touch a handful of times in the
life of the business — and it sits at the same level, competing for the same space, as the ten
screens you open before breakfast.**

That is why it feels difficult. Not the colours, not the spacing. Every morning you scan past
twenty-five settings screens to find Orders.

The current groups make this worse rather than better, because they sort by category:

- **Service Availability** — the switch you flip when the kitchen is slammed — is filed under
  *system*, next to Webhooks and Xero.
- **Ordering Control** — a daily operational switch — is under *manage*, next to Suppliers.
- **Complaints** and **Refunds** — things that need answering today — are under *analyze*, next to
  Forecasts.
- **Loyalty, Gift Cards, Discount Cards, Referrals, Promotions, Discount Controls** — six separate
  destinations that are all "ways of giving a customer a better price" — are six separate items.

### 2.2 Website: the difficulty is in editing it, not in using it

The website's navigation is five links. A customer arriving at the homepage is not lost.

The difficulty is structural. `layout.blade.php` is **2,388 lines** and `home.blade.php` is
**1,293 lines** — 3,681 lines in two files, most of it CSS embedded in the template. Every
homepage change means editing a file that also contains the hero CSS, the footer, the header, the
prayer banner and the meta tags.

That is a real problem, but it is a *maintenance* problem, not a layout problem. Splitting those
two files changes nothing a customer sees. It should be done, and it should not be called a
redesign.

There is one genuine layout gap: the homepage already has a **28-block page builder**
(`partials/home/`), so the homepage is composable — but the other pages (contact, hours, privacy,
terms, refund) are hand-written Blade with no blocks. Those five are inconsistent with the
homepage and with each other.

### 2.3 Order app: this one is fine — leave it alone

Five bottom tabs (Home, Menu, Order History, Events, Gift Cards) over 37 routes. That is a
conventional, working mobile commerce shell. The recent hero and mobile work went into this app.

It is also the only one of the three that **customers** use, which makes it the one where a
redesign carries revenue risk. A confusing admin costs you time. A confused customer costs you an
order.

**Recommendation: no redesign. If something specific is wrong with a screen in it, fix that
screen.**

---

## 3. Proposed admin structure

From 62 top-level destinations to about 30 in the daily path, by moving set-once configuration out
of the way rather than by deleting anything.

**Today** — one screen, not a group. What is happening right now: live orders, kitchen state,
today's money, anything needing attention (open complaints, failed prints, low stock). The screen
you land on. Replaces the habit of checking four screens each morning.

**Orders** — Orders, Kitchen Display, Delivery Orders, Tables, POS Activity, Reservations.
Everything about food going out today.

**Food** — Menu Items, Daily Specials, Inventory, Purchase Requests, Shopping Lists, Purchase
Orders, Suppliers, Waste Tracking.

**Money** — Reports, GST, Profit & Loss, Invoices, Expenses, Refunds, Shifts & Cash, Analytics,
Forecasts, Procurement.

**Customers** — Customers, Customer Growth, Complaints, Reviews, and a single **Offers &
Rewards** destination absorbing the six that are all the same idea: Loyalty, Gift Cards, Discount
Cards, Referrals, Promotions, Discount Controls.

**Wholesale** — shops, deliveries, invoicing, reports. Already coherent; keep it as its own thing.

**Staff** — Staff, Shifts, Time Clock.

**Setup** — one destination holding all ~25 set-once screens, organised inside, out of the daily
path entirely: both Content sections, Business Details, Media Library, Roles & Permissions,
Notifications, Charges & Fees, Currency Photos, Devices, Print Queue, Webhooks, Xero, System
Health, TV Signage, SMS setup, Events & Catering, Kitchen Handover.

**Two switches get promoted out of Setup and into the header**, always visible, one tap:
**Ordering Control** and **Service Availability**. These are the two things you reach for when
something is going wrong, and right now they are buried next to Webhooks.

Three principles behind the above, worth stating because they are what stop it drifting back:

1. **Frequency beats category.** If you touch it daily it is top level. If you set it once it is in
   Setup. Not "is it a setting" — "how often do you need it".
2. **Six destinations that do one job are one destination.** Offers & Rewards is the clearest case.
3. **Nothing is deleted.** Every one of the 62 screens still exists and is still reachable. This is
   a rearrangement, and that is what makes it low-risk and reversible.

---

## 4. What not to do

- **Do not redesign all three apps at once.** Three simultaneous redesigns means no working
  reference to compare against when something looks wrong.
- **Do not redesign anything before go-live.** There are 46 automated go-live tests and ~22 manual
  ones, and the manual list is partly done. A layout change invalidates the automated ones and
  makes the completed manual ones worthless. Finish going live on the layout you have.
- **Do not touch the order app.** §2.3.
- **Do not delete screens** as part of this. Rearranging is reversible; deleting is not, and it is
  impossible to know which of the 62 someone depends on until it is gone.
- **Do not rebuild `PageShell` / `PageHeader`.** 55 of 55 pages use PageShell and 54 use
  PageHeader. That uniformity is the one thing making a navigation change tractable — every page
  will inherit it.
- **Do not merge this with the theming work.** Dark mode and modals are a separate plan with its
  own staging. Doing both at once means a broken screen has two possible causes.

---

## 5. Risks

1. **Muscle memory.** Every rearrangement makes an experienced user slower for a week. Only worth
   paying once — which is an argument for doing it properly, not repeatedly.
2. **Permissions.** Nav items carry `permission` / `permissions` slugs and there is a parity
   fixture (`permission_satisfied_by_parity.json`) tying the frontend `PERM_ALIASES` to the backend
   `PermissionCatalog::SATISFIED_BY`. Regrouping must move the slugs with the items. A staff member
   must not gain a screen because it moved groups — this is the one way a navigation change can
   become a security change.
3. **Deep links and bookmarks.** Paths should not change. Regroup the menu, keep the URLs. If any
   path must change, redirect the old one — the Content Hub already has redirects at
   `App.tsx:369–384` doing exactly this.
4. **`BOTTOM_TABS` is dead code.** Marked `@deprecated` in `navConfig.ts:271`, superseded by the
   section-based MobileTabBar, still exported. Remove it during this work or it will be mistaken
   for the live mobile navigation by whoever does the next change.
5. **Testing the wrong thing.** `navConfig.test.ts` exists. Any regrouping must extend it, and the
   assertions worth having are structural — every route reachable, every item carries a permission,
   no duplicates — not "group 3 contains item 5".

---

## 6. Stages

**Stage 0 — Go live first.** Nothing in this document starts until the go-live checklist is done.
This is the most valuable line in the plan.

**Stage 1 — Admin navigation only.** Regroup the 62 into the structure in §3. No page contents
change, no URLs change, no styling changes. One commit per group so a mistake bisects. This alone
is most of the relief.

**Stage 2 — The Today screen.** The one genuinely new screen. Built from data already on the
Dashboard plus counts already available. Ship it as a new destination first, make it the landing
page only once it has earned it.

**Stage 3 — Offers & Rewards.** Collapse the six into one destination with sections. The only
stage that changes URLs, so it needs redirects.

**Stage 4 — Website template split.** Break up the 2,388-line layout and 1,293-line homepage.
Invisible to customers, pure maintainability. Can run in parallel with 1–3 since it touches no
shared code.

**Stage 5 — Website page consistency.** Bring contact, hours, privacy, terms and refund onto the
same block system the homepage already uses. Optional, and only if those pages are actually being
edited.

**Order app: no stage.** Deliberately.

---

## 7. What I need from you before Stage 1

Two things, and only two.

**Which screens do you actually open every day?** My list in §2.1 is inference from what a
restaurant does, not from what you do. If you never open Tables and you live in Purchase Requests,
the grouping changes. Ten minutes of your answer is worth more than any amount of my guessing.

**Is the "difficult" you mean finding things, or reading them once you are there?** If it is
finding things, §3 fixes it. If screens feel cramped and cluttered once you arrive, that is a
different job — density and spacing per screen — and I would plan it separately rather than
pretend one change does both.
