# Admin panel layout — audit

**Date:** 2026-09-03
**Asked:** "Many pages in admin panel doesn't follow standard layout. Can u audit
each and every page, sub page, pop ups in admin panel desktop and mobile"
**Scope:** every page, sub-page, tab and overlay in `apps/admin-dashboard`, at
desktop and phone widths. Audited read-only; **A1 and A4 were fixed on
2026-09-04** on the owner's go-ahead — each says so under its own heading. The
rest stand as written.

**Counted:** 114 page and sub-page files across 73 routes, 11 overlay surfaces,
23 tabbed pages, 5,819 lines of `index.css`.

---

## What "the standard" is, as the code defines it

There *is* a standard, it is written down in components, and most pages follow it.

| Layer | The primitive | Where |
|---|---|---|
| Page frame | `PageShell` — 1400px max, centred, fade-in | `SharedUI.tsx` |
| Page heading | `PageHeader` — `section › title`, subtitle, right-hand action | `SharedUI.tsx` |
| Surfaces | `Card`, `TableCard`, `StatCard`, `Badge` | `SharedUI.tsx` |
| Controls | `Btn`, `Input`, `Select`, `Toggle` | `SharedUI.tsx` |
| Dialogs | `Modal` + `ModalActions`, `ConfirmDialog` | `SharedUI.tsx` |
| Wide content | `TableCard` / `ResponsiveTable` / `ScrollX` | `SharedUI.tsx` |
| Colour | 10 CSS variables on `:root`, flipped under `[data-theme="dark"]` | `index.css` |
| Phone collapse | `.form-grid-2` and `[data-responsive-grid]` | `index.css` |
| Chrome | rail + section bar on desktop; top bar + tab bar + section sheet on phones | `AppShell.tsx` |

The chrome is in good shape. `AppShell` is class-driven, publishes its own
measured height as `--admin-tabbar-h`, and `main.admin-shell-main--mobile`
reserves that height so no page has to think about the tab bar. Breakpoints are
consistent where it matters: 767/768 for phone, 1023/1024 for tablet.

**Adoption of the page frame is high.** 65 of 65 routed page components use
`PageShell` *and* `PageHeader`. 61 of those also pass `section`. Tables are
almost all wrapped: of 58 files with a `<table>`, only two have no horizontal
scroller.

So the frame is not the problem. The drift is one level down — inside the page
body, in the dialogs, and in colour.

---

## Findings

| | Finding | Severity | Status |
|---|---|---|---|
| A1 | 41 hardcoded text colours are invisible in dark mode | **High** | **FIXED 2026-09-04** |
| A2 | 164 distinct hex colours against a 10-token palette | **High** | Partly — see A1 |
| A3 | Ten of eleven overlays are missing dialog behaviour | **Medium** | **FIXED 2026-09-04** |
| A4 | `ConfirmDialog` — 20 pages, no Escape, no scroll cap | **Medium** | **FIXED 2026-09-04** |
| A5 | Two component libraries; the deprecated one is the popular one | **Medium** | Open |
| A6 | 23 tabbed pages, 5 tab shapes, 2 users of the shared component | **Medium** | Open |
| A7 | `ui/Modal` is silently unstyled — and unused | Low | **Premise wrong** — it IS used; behaviour fixed under A3, styling folded into A5 |
| A8 | The z-index scale is decorative | Low | Open |
| A9 | 20 grids stay two columns on a 390px phone | Low | Open |
| A10 | Four pages render no breadcrumb | Low | Open |
| A11 | `TestChecklistPage` overrides the shell width | Informational | Open |

---

### A1 — 41 hardcoded text colours are invisible in dark mode (high) — **FIXED**

**Fixed 2026-09-04.** All 41 replaced with the token that carries the same role,
plus the two the heuristic had missed (`MediaLibraryPage:260`,
`MediaPicker:235`) — 42 in all, each read in context first rather than
find-and-replaced. Measured again in Chromium against the rebuilt stylesheet:

| | Before (dark) | After (dark) |
|---|---|---|
| Body text and headings | 1.01 – 1.70 : 1 | **14.68 : 1** |
| Supporting text | 2.19 – 2.79 : 1 | **8.77 : 1** |
| Warning text | 2.40 : 1 | **12.18 : 1** |
| Danger text | 1.75 : 1 | **9.25 : 1** |

Light mode is unchanged in role and still passes: 18.21:1 for body text,
6.36–7.09:1 for the supporting and status shades. Everything now clears WCAG
AA's 4.5:1 in **both** themes, where before four of those rows were invisible in
one of them.

Four new shades needed no new tokens after all — `#3D2B1F` and its relatives
were standing in for `--color-text`, the browns below it for
`--color-text-secondary`, and the orange and red for `--color-warning-strong`
and `--color-danger-strong`, which already flip correctly.

The one place left alone is `SeoSnippetPreview` — it mocks a Google search
result and its own code says "must not follow admin theme". It sets its own
light card, so its blue, green and grey stay self-consistent in both themes.
That is correct, and the same reasoning as the QR plate and the toggle knob.

The ESLint baseline went from **529 entries across 85 files to 445 across 78**.
It was pruned rather than regenerated: regenerating would have absorbed 51
violations that were previously visible warnings, so the rule can only ever
shrink from here.

---

#### The finding as first written

Dark mode is a real, shipped feature: a toggle in `AppShell.tsx:160`, persisted
to `localStorage.bg_theme`, with a pre-paint bootstrap in `public/theme-init.js`
so there is no light flash. Anyone who turns it on gets the full dark palette.

Text written as `color: 'var(--color-text)'` flips with it. Text written as
`color: '#3D2B1F'` does not — and **an inline style cannot be patched from CSS**.
The stylesheet already knows this; the comment at `index.css:1391` says so:

> Make white card surfaces dark (Tailwind `bg-white` class only — React
> serialises inline styles as `rgb()`, so attribute selectors never matched)

So the `[data-theme="dark"] .bg-white` rescue reaches Tailwind classes and
nothing else.

**Measured in Chromium against the built stylesheet**, same markup, theme
toggled:

| Element | Light | Dark |
|---|---|---|
| `color: var(--color-text)` | 18.21 : 1 | **14.68 : 1** |
| Settings section heading `#3D2B1F` | 13.43 : 1 | **1.31 : 1** |
| Review body text `#3D2B1F` | 13.43 : 1 | **1.31 : 1** |
| Webhooks form label `#374151` | 10.31 : 1 | **1.70 : 1** |
| Checklist section title `#111827` | 17.74 : 1 | **1.01 : 1** |

WCAG AA wants 4.5:1. 1.01:1 is text the same brightness as the card behind it.

**41 occurrences across 23 files.** Not every hardcoded colour is a fault: text
on a chip that hardcodes *its own* background stays self-consistent in both
themes, and 33 of the 74 candidates are that. Those are excluded here.

| File | Lines | Colour |
|---|---|---|
| `SettingsPage.tsx` | 243, 278, 324 | `#3D2B1F` |
| `WebhooksPage.tsx` | 117, 121, 125 | `#374151` |
| `DeliveryPage.tsx` | 321, 427, 603 | `#374151` |
| `PrintCardModal.tsx` | 158, 167, 178 | `#475569` |
| `ForecastPage.tsx` | 1359, 1442, 2036 | `#374151`, `#9a3412`, `#1e293b` |
| `SeoSnippetPreview.tsx` | 75, 78 | `#006621`, `#545454` |
| `DiscountControlsPage.tsx` | 591, 595 | `#3D2B1F` |
| `CateringDetailPage.tsx` | 489, 564 | `#5C4E3E` |
| `OnlineOrderingPage/orderingControlUi.tsx` | 383, 584 | `#3D2B1F` |
| `DeliverySettingsPage.tsx` | 349, 403 | `#4A3728`, `#3D2B1F` |
| `SettingsPage/PermissionsSettingsSubPage.tsx` | 342, 394 | `#6B5E4E` |
| `SettingsPage/SmsNotificationRow.tsx` | 76, 182 | `#6B5A4E`, `#3D2B1F` |
| `MenuPage/MenuItemEditorModal.tsx` | 78, 102 | `#3D2B1F` |
| `App.tsx` | 129 | `#1C1408` |
| `CustomerCreditSection.tsx` | 496 | `#7F1D1D` |
| `TestChecklistPage.tsx` | 748 | `#111827` |
| `CustomerGrowthPage.tsx` | 463 | `#5C4E3E` |
| `ReviewsPage.tsx` | 114 | `#3D2B1F` |
| `MediaLibraryPage.tsx` | 1405 | `#3D2B1F` |
| `PurchaseRequestsPage.tsx` | 319 | `#3D2B1F` |
| `SignagePage.tsx` | 1949 | `#9A3412` |
| `SmsPage/RecipientsTab.tsx` | 409 | `#1e293b` |
| `DashboardPage.tsx` | 1026 | `#9a3412` |

**On the method, and its limits.** The chip test looks at the element's own style
object and the five lines above it. That is a heuristic, so 41 is a floor rather
than an exact figure — `MediaLibraryPage.tsx:260` and `MediaPicker.tsx:235`, for
instance, are excluded because a *sibling* thumbnail sets `#EDE8E2` just above
them, but the text itself sits on the card surface and does fail. Read it as
"at least 41, in at least 23 files". Each one wants an eye on it before the
change, not a find-and-replace.

Two hardcoded colours that look like this but are **correct**, and should be left
alone: the white QR plate in `TwoFactorCard.tsx:252` (a QR code on a dark ground
will not scan — the code says so) and the white toggle knob in
`SettingsPage.tsx:318` (white on a coloured track in both themes). The white
signature card in `CounterSignModal.tsx` is the same case — it is printed.

### A2 — 164 distinct hex colours against a ten-token palette (high)

CLAUDE.md names ten canonical colours and their variables. The admin TSX
contains **164 distinct hex literals in 714 occurrences**, of which only 35
occurrences are one of the ten. `eslint-baselines/no-hex-in-inline-style.json`
carries 529 grandfathered exceptions across 85 files.

The problem is not only that they are hardcoded — it is that they are *nearly
the same colour as each other*, so the panel has no single warm neutral:

`#faf7f3` · `#f5f0eb` · `#f5f0ea` · `#f0eae3` · `#e8ddd0` — five off-whites, none
of which is `--color-bg` (`#f8f6f3`) or `--color-border-light` (`#f0ebe5`).

And a **second, colder palette** has been mixed in — the Tailwind greys —
against a warm brand palette: `#374151` (14 uses), `#6b7280` (13), `#e5e7eb`
(13), `#f3f4f6` (9), `#111827`, `#9ca3af`, `#4b5563`, `#d1d5db`. They read as
slightly blue next to the browns, which is most visible on Delivery, Forecast,
Webhooks, Tables and the Test Checklist.

Then there is `#3D2B1F` — used **20 times as a text colour** and not in the
mapping table at all. It is a seventh brown that grew into a de-facto token
without becoming one. Alongside it: `#1C1408` (21), `#8B7355` (22), `#9C8575`
(20), `#6B5D4F` (7), `#5C4E3E` (3), `#4A3728` (2), `#6B5A4E` (2), `#6B5E4E` (2),
`#3B2A1A` (2), `#2A1E0C` (2).

`#8B7355` and `#9C8575` are within a couple of points of `--color-text-secondary`
(`#6b5d4f`) and `--color-text-muted` (`#9c8e7e`) but not equal to them, so
secondary text is a slightly different brown from page to page.

The ESLint rule that would stop this exists and is wired into `npm run lint`. It
only guards *new* literals; the 529 in the baseline are the backlog.

### A3 — Ten of eleven overlays are missing dialog behaviour (medium) — **FIXED**

A dialog needs five things: Escape to close, a focus trap, focus restored on
close, the body scroll locked behind it, and a portal to `document.body` so
`position: fixed` is not captured by a transformed ancestor. `SharedUI.Modal`
does all five and is the one to copy.

| Overlay | Esc | Scroll lock | Focus trap | Portal | `aria-modal` |
|---|:--:|:--:|:--:|:--:|:--:|
| `SharedUI.Modal` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `ContentItemEditor` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `MobileSectionSheet` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `MobileActionSheet` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `ScanSheet` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `ui/Modal` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `MenuPage/ImageCropModal` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `MediaPicker` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `SharedUI.ConfirmDialog` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `MediaLibraryPage` detail drawer | ✅¹ | ✅¹ | ✅¹ | n/a | ✅¹ |
| `Customer360Drawer` | ✅ | ✅ | ✅ | ✅ | ✅ |

¹ On a phone, where the drawer covers the page. On a desktop the same panel is
a sticky sidebar beside the grid, and trapping focus or locking the page scroll
in a sidebar would be a bug rather than a fix — `useDialogChrome` takes an
`active` flag for exactly this.

`ServiceAvailabilityPage` was listed here as an inline overlay and is not one:
its dialogs are `SharedUI.Modal`, and its only other `position: fixed` element
is a `role="status"` toast. Nothing to fix; the row is withdrawn.

**Fixed 2026-09-04.** `useDialogChrome` — the hook the A4 work pulled out of
`Modal` — was exported and applied to every row above, replacing five different
hand-rolled subsets. Two sheets that stack (`ContentItemEditor`,
`MobileActionSheet`) keep their own Escape handling, because a nested sheet has
to stop Escape propagating rather than close every layer above it; they take
the scroll lock and the focus trap. Gated overlays were split into a gate and a
panel so the hook can run unconditionally.

**`Customer360Drawer` had none of them.** It is the full customer record — the
drawer someone opens mid-conversation at the counter. Escape does not close it,
the page scrolls behind it on a phone, tab walks out of it into the page
underneath, and it is not announced as a dialog.

None of this is a layout break you can see in a screenshot. It is what the
panel feels like to use with a keyboard, and on a phone where scroll-behind is
the difference between a sheet and a floating rectangle.

### A4 — `ConfirmDialog`: 20 pages, no Escape, nothing capping its height (medium) — **FIXED**

**Fixed 2026-09-04.** The five behaviours `Modal` already had were pulled out
into a `useDialogChrome` hook, and both dialogs now use it — so there is one
implementation of "what a dialog owes you" rather than one good one and one
that had none of it. `ConfirmDialog` gained Escape, a focus trap, focus
restore, a body scroll lock and a portal to `document.body`.

Two decisions worth recording:

- **Focus starts on Cancel**, not Confirm. When the question is "delete this?",
  the safe option should be the one a stray Enter or Space lands on.
- **The buttons sit outside the scroll region.** The panel is a flex column
  capped at `min(85dvh, 640px)`; the message scrolls, the actions never move.
  That is what stops a long question stranding someone mid-delete on a phone.

Nine tests pin it — Escape, scroll lock and its release, the portal, the
initial focus, Tab and Shift+Tab wrapping, the ARIA wiring, the height cap with
the actions outside it, and the backdrop closing only on the backdrop.

---

#### The finding as first written

`useConfirmDialog` is used by 20 pages — it is how the panel asks "are you
sure" before a delete. `SharedUI.tsx:660`:

- **No Escape handler.** Every other dialog in the app closes on Escape.
- No focus trap, no focus restore, no scroll lock, no portal.
- `maxWidth: 400, width: '90%'` and **no `maxHeight`, no `overflow`**.

That last one is the phone defect. It carries `className="modal-container"`,
which looks like it inherits the modal shell — but every `.modal-container` rule
in the stylesheet is scoped `.modal-backdrop .modal-container`, and
`ConfirmDialog` renders no `.modal-backdrop`. So it gets neither the desktop
`max-height: 90vh` nor the phone bottom-sheet treatment. A long confirmation
message on a phone in landscape grows past the viewport and pushes **Cancel and
Confirm off the bottom of the screen, with nothing to scroll** — the same shape
of fault as the POS Charge column fixed on 2026-09-02.

### A5 — Two component libraries, and the deprecated one is the popular one (medium)

`components/SharedUI.tsx` and `components/ui/*` both export `Card`, `Button`/
`Btn`, `Badge`, `Input`, `Modal`. `components/Layout.tsx` is a re-export of
`SharedUI` marked `@deprecated`.

| Barrel | Files importing it |
|---|---|
| `components/Layout` (deprecated alias) | 47 |
| `components/SharedUI` | 48 |
| `components/ui` | 22 |

The 22 are mostly `useToast` and `Toggle`, which exist only in `ui` — that part
is fine. But **seven files take `Card` and `Button` from `ui`**: every Settings
sub-page (`CreditAccountSettings`, `StockSettings`, `PaymentCommissionSettings`,
`ServiceChargeSettings`, `PermissionsSettingsSubPage`) plus `GstPage` and
`MyAccountPage`. Everything else takes them from `SharedUI`.

Visually the two are close — same 14px radius, same shadow, 20px padding either
way — so this is drift rather than a break today. The cost is that a change to
"the Card" has to be made twice, and a new page has a coin-flip about which one
it inherits. It is also why the two newest settings pages, written this week,
already differ from the rest of the panel in their imports.

The `@deprecated` marker points the wrong way: it is on the alias 47 files use.

### A6 — 23 tabbed pages, five tab shapes, two users of the shared component (medium)

`components/ui/Tabs.tsx` exports `Tabs` / `TabList` / `Tab` / `TabPanel`. Two
pages use it: `GstPage` and `KitchenProductionPage`. The other 21 hand-roll a
tab strip, in five different shapes:

| Shape | Pages |
|---|---|
| **Underline** — 2px primary border under the active tab | the shared component, `SmsPage`, `ReportsPage`, `WasteLogsPage` |
| **Filled pill** — `borderRadius: 8`, primary fill, floating | `InventoryPage` (20px pad), `LoyaltyPage` (20px), `CustomerGrowthPage` (18px), `ShiftsPage` (16px), `WholesaleReportsPage` (14px) |
| **Pills in a tray** — pills on a `#F5F0EB` panel | `TimeClockPage:98` |
| **Outlined pill** — `borderRadius: 10` with a border | `DeliveryPage:112` |
| **Joined segmented control** — one bordered box, dividers inside | `TablesPage:151` |

So moving between Inventory, Delivery, Tables, Time Clock and Reports changes
the shape of the tab control five times — and even inside the one "filled pill"
family the horizontal padding is 14, 16, 18 or 20px depending on the page, so
the tabs are a different width for the same words. This is the most likely thing
behind "doesn't follow standard layout": it is the control your eye lands on
first on every tabbed page.

Worth noting that `WasteLogsPage:157` is a byte-for-byte copy of `ui/Tab`'s
style block — padding `10px 20px`, size 14, weight 700/500, 2px underline. It is
not divergence, it is a copy that will not receive the next fix.

`TimeClockPage:98` hardcodes the tray background as `#F5F0EB`, so that one tab
strip also stays light in dark mode (see A1/A2).

### A7 — `ui/Modal` gets none of the modal styling, and nothing uses it (low) — **CORRECTED**

**The premise is wrong, found 2026-09-04 while fixing A3.** `VideoStudioModal`
imports `Modal` from the `components/ui` barrel rather than by path, which is
what this finding's search missed. Deleting it, as proposed below, breaks the
video studio. It was given the full dialog behaviour under A3 instead, and the
styling half of this finding is folded into A5.

Original finding follows.

`components/ui/Modal.tsx` renders `<div class="modal-container">` inside
`<div class="fixed inset-0 z-[60] …">`. Its own comment says:

> `modal-container` is the hook our global mobile `@media` rule targets so the
> dialog snaps to a full-width bottom sheet on phones

It does not. Every `.modal-container` rule — the desktop shell at
`index.css:1325` and the phone bottom sheet at `index.css:696` — is scoped
`.modal-backdrop .modal-container`, and this component renders no
`.modal-backdrop`. The stylesheet is explicit about it: *"Modal: full-width
bottom sheet on mobile (scoped to SharedUI Modal only)"*. So `ui/Modal` would get
no surface background, no header/body/footer flex column, **no `max-height`**,
and no bottom sheet. It also has no scroll lock, no focus trap, no focus
restore and no portal.

**Nothing imports it** — every `<Modal>` in the app resolves to `SharedUI.Modal`
through the `Layout` alias. So this is a loaded trap rather than a live fault:
it is exported from the `ui` barrel, it is the obvious thing to reach for, and
the first page that uses it will get a dialog that runs off the bottom of a
phone. Either delete it or give it the `modal-backdrop` class and the four
missing behaviours.

### A8 — The z-index scale is decorative (low)

`index.css:1317` defines the scale: sidebar 30, overlay 40, dropdown 45, modal
50, toast 60. What is actually on screen:

| Surface | z-index | Source |
|---|---|---|
| Mobile tab bar | 40 | `var(--z-overlay)` |
| `SharedUI.Modal` | 50 | `var(--z-modal)` ✅ |
| `Customer360Drawer` | 55 / 56 | hardcoded |
| `SharedUI.ConfirmDialog` | 60 | hardcoded |
| `ui/Modal` | 60 | `z-[60]` |
| `MediaPicker` | 70 | hardcoded |
| `hero-preview-dock` | 200 | hardcoded |
| `ScanSheet` | 1200 | hardcoded |
| `Toast` | 9999 | `z-[9999]` |
| Command palette | 9999 | hardcoded |

`--z-toast: 60` is referenced by **nothing** — the Toast provider uses
`z-[9999]`. `index.css:5492` writes `var(--z-overlay, 20)`, a fallback that
disagrees with the real value of 40.

Nothing is broken right now: every overlay happens to clear the tab bar at 40,
and the toast at 9999 happens to clear every dialog. But that is arithmetic
luck across nine hardcoded numbers, not a rule, and the next overlay is as
likely to land at 45 as at 5000.

### A9 — 20 grids stay two columns on a 390px phone (low)

Of 81 fixed multi-column inline grids (`1fr 1fr`, `repeat(N, 1fr)`), **61 carry
a phone rule** — `.form-grid-2` or `[data-responsive-grid]`, both of which
collapse to one column under 767px. The escape hatches work and are widely used.

The remaining 20, in 14 files, have neither:

`DiscountCardsPage` (3) · `PromotionsPage` (3) · `MediaLibraryPage` (2) ·
`PurchaseRequestsPage` (2) · `PrintCardModal` · `VideoStudioModal` ·
`CustomerCreditSection` · `CustomerDepositSection` · `ShoppingListsPage` ·
`CustomersPage` · `WebhooksPage` · `SmsPage/AutomationsTab` ·
`MenuPage/MenuItemEditorModal` · `MenuPage.tsx`

Most are two form fields side by side, which at 390px gives roughly 180px each —
cramped rather than broken. Adding `data-responsive-grid` to the 20 is a
one-attribute fix each.

### A10 — Four pages render no breadcrumb (low)

61 of 65 pages pass `section` to `PageHeader` and show "Section › Page" above
the title. These four do not:

- `BusinessDetailsPage`
- `ComplaintsPage`
- `SignagePage` (TV Signage)
- `SocialHubPage`

The header is a line shorter on those four, so the title and the whole page
below it sit ~20px higher than on every neighbouring page. Navigating between
them makes the content jump.

Thirteen further pages pass no `subtitle` — `TablesPage`, `TimeClockPage`,
`RefundsPage`, `ShoppingListsPage`, `ReviewsPage`, `PurchaseRequestsPage`,
`SmsControlCenterPage`, `DevicesPage`, `GiftCardsPage`, `SpecialsPage`,
`ReservationsPage`, `WasteLogsPage`, `ShiftsPage`. That is a smaller jump and
arguably a choice, but it is not a consistent one.

### A11 — `TestChecklistPage` overrides the shell width (informational)

`TestChecklistPage.tsx:649` passes `style={{ maxWidth: 900, margin: '0 auto',
padding: '24px 16px 80px' }}` to `PageShell`, which already sets `max-width:
1400px; margin: 0 auto`. It is the only page that re-declares the shell's own
job. It is a reading-width page so the narrower measure is defensible — but it
should be a modifier class on the shell, not a style override, or the next page
that wants a reading width will invent a third number.

---

## Checked and correct

Worth recording, because these are the parts that *are* consistent:

- **Every routed page uses `PageShell` + `PageHeader`.** 65 of 65. The frame is
  not the problem.
- **Tables are wrapped.** 56 of 58 files with a `<table>` put it inside
  `TableCard`, `ResponsiveTable` or `ScrollX`, and `.admin-shell-main` sets
  `overflow-x: hidden` so a wide table scrolls inside itself instead of
  scrolling the page. The two exceptions (`RecipeEditorModal`, `QuickEditGrid`)
  manage their own scrolling.
- **The mobile tab bar reserves its own space.** `MobileTabBar` measures itself
  with a `ResizeObserver` and publishes `--admin-tabbar-h`;
  `main.admin-shell-main--mobile` pads by it. No page has to know the number,
  and the sticky bars that need to clear it (`content-studio`, `signage-designer`)
  read the same variable.
- **Touch targets are enforced globally** — `button, a[role="button"],
  [data-touch-target] { min-height: 44px }` under 767px, with deliberate,
  commented exceptions for close icons (40px) and toggle switches.
- **Inputs are 16px on phones**, which stops iOS zooming on focus.
- **Breakpoints agree** where they matter: 767/768 phone, 1023/1024 tablet.
- **`PageHeader` already handles its own mobile case** — it stacks and releases
  `flex-shrink` under 767px, with a comment naming the overflow it fixed.
- **`SharedUI.Modal` is a correct dialog** — portal, focus trap, focus restore,
  scroll lock, Escape, `aria-modal`, `aria-labelledby`, and a phone bottom sheet
  with safe-area padding and full-width footer buttons.
- **Dark mode is properly bootstrapped** — a pre-paint external script (the CSP
  forbids inline), so there is no light flash before React mounts.

---

## If these get fixed

A1 and A2 are one job, not two: both are "put the colour in a variable". Fixing
A1 fixes the visible half of A2, and the ESLint rule already in `npm run lint`
stops it coming back once the baseline shrinks. The 41 in A1 need reading one at
a time — the heuristic that found them cannot tell a chip from a card — but the
near-duplicate browns and the stray Tailwind greys in A2 are safe to map in bulk
once four new tokens exist for the shades that have none (`#3D2B1F`, `#8B7355`,
`#9C8575` and the off-white family).

A6 is the most visible on a normal working day and is mechanical — 21 tab strips
onto one component.

A3 is the one a keyboard or a phone finds, not the eye. `ConfirmDialog` (A4) is
done; the rest of the overlay table still is not, and `Customer360Drawer` — with
none of the five — is the one to take next. `useDialogChrome` now exists for it
to use.

A7 is five minutes and stops a future page inheriting a broken dialog.
