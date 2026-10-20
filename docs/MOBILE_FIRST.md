# Mobile first

Owner, 2026-10-20: "I want change everything mobile 1st rule. Not now. Slowly."

Every screen is written for the phone first and widened for bigger screens. New screens are
built that way from the start; existing ones are converted a little at a time, never in one
big rewrite.

## The rule

1. **Phone first.** The plain styles are the phone layout (390 px). Wider screens add to it
   with `@media (min-width: …)`. A tablet band (`(min-width: 768px) and (max-width: 1023px)`)
   is fine; a bare `@media (max-width: …)` that squeezes a computer layout down is not.
2. **Prefer layouts that size themselves** over breakpoints: one column that grows into more
   (`grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr))`), rows that
   `flex-wrap`, and `minmax(0, 1fr)` on a grid column that holds long text or a table.
3. **Same controls everywhere.** A phone gets every control a computer has, changed in shape,
   never hidden (CLAUDE.md, admin layout). Never gate a control on `isMobile` alone.
4. **Touch sizes.** Inputs and selects 44 px tall with 16 px text (no iPhone zoom); buttons
   follow CLAUDE.md (`Btn` 38 px, `Btn small` 32 px).
5. **Nothing scrolls sideways** at 390, 768, 1024 or 1366 px.

The model to copy: `apps/admin-dashboard/src/pages/ClockMachinePanel.tsx` (no media queries at
all; fluid grids, wrapping rows, cards instead of a wide table).

## The guard

`node scripts/check-mobile-first.mjs` (CI: "Mobile-first guard") counts desktop-first rules,
`@media` with `max-width` and no `min-width`, in the apps, the shared package and the website
views. Each file keeps at most the count it had in `scripts/mobile-first-baseline.json`; a new
file has none. After converting a file, run `node scripts/check-mobile-first.mjs --update` so
the lower count becomes the new ceiling. The script only reads CSS; a width check in script
(`useIsMobile`, `matchMedia('(max-width…')`) is reviewed by hand.

## How a desktop-first block is turned round

Learned converting the admin stylesheet (2026-10-20):

- The phone rules come out of `@media (max-width: …)` and stay **where the block was**, so
  the cascade on a phone is unchanged; a `@media (min-width: …)` block right after puts the
  computer back.
- The computer value is the stylesheet's own base rule for that selector, written out. Where
  there is none (the phone rule only added something), use **`revert-layer`, never
  `revert`**: Tailwind 4 keeps its reset and utilities (`flex`, `gap-2`, `p-5`) in cascade
  layers, and `revert-layer` from unlayered CSS falls back to them, while `revert` skips them
  (a `<p>` got 16px margin back instead of Tailwind's 0). Both still skip other unlayered
  rules, so a base written under another selector (`.page-header--embedded`,
  `.admin-mobile-header`'s padding) is written out by hand.
- Several tiers (phone, tablet up to 1024, computer) become one sequence: the phone rule,
  then `min-width: 768px`, then `min-width: 1025px`, in that order.
- A class drawn only on a phone (`PhonePreviewBar`, the phone header, the Content Studio
  publish bar) needs no query at all.
- An inline style beats every stylesheet rule, so a phone rule that used `!important` to
  override the page's own `style={{…}}` needs the page changed. `revert-layer` cannot help: it
  skips inline styles (tried, 2026-10-20). Two ways, both pixel for pixel:
  - **One element, one page:** move the property into the stylesheet, under the element's
    class (the Posters grid, the home layout header, the Ordering tab buttons).
  - **Many elements, each its own value:** the page hands the stylesheet its computer value
    as a custom property and the stylesheet picks per width:
    `style={{ display: 'grid', '--cols': '1fr 1fr' }}` with
    `.form-grid-2 { grid-template-columns: 1fr }` and, from 768px,
    `grid-template-columns: var(--cols, none)`. When the page may set nothing, the fallback is
    `var(--x, revert-layer)`, which behaves as `revert-layer`. React writes a custom property
    as given, so a length needs its unit (`px()` in `utils/cssVars.ts`); `css-vars.d.ts` lets
    `style={{…}}` take `--*` keys without a cast. In use: `--card-pad` (SharedUI `Card`),
    `--ce-flex` / `--ce-min` / `--ce-w` (content editor rows, `rowSize.ts`).
- Check with screenshots of every page at 390, 767, 768, 1023, 1024, 1199, 1200 and 1440
  px before and after; the conversion must change nothing.

## Converting slowly

Never convert as a project of its own. When a change touches a screen anyway:

1. Rewrite that file's `max-width` rules as the phone default plus `min-width` additions (or
   remove them in favour of fluid grids).
2. Check it at 390, 768, 1024 and 1366 px (the e2e phone-width spec covers 390).
3. Run the guard with `--update` and say in the commit that the file went mobile first.

Order, when there is a choice: the screens customers and staff use most on a phone first, the
order app, then the till, then the admin's daily pages, then the website, then the rest.

### On the website (Blade views)

The website's CSS is plain and unlayered, so `revert` and `revert-layer` both fall back to the
browser's own style, past every rule in the file. A restore is the page's own value written
out; `revert` only where no rule anywhere sets that property for the element. Two traps found
by screenshot (2026-10-20):

- A restore block comes after every rule above it, so it can now beat a rule of the same
  weight that used to win on a computer (`.toolbar a` over `.toolbar__group a` on the menu
  print page). Write that rule back inside the restore block too.
- A phone rule that overrode a base `!important` (`display: none !important`) needs
  `revert !important` or the base value with `!important` in its restore.

The printable menu keeps its phone rules inside `@unless ($forPdf)`, as `@media screen { … }`
then `@media screen and (min-width: 701px) { … }`, because dompdf reads screen rules and
ignores width conditions. **Emails stay desktop first** (`emails/layout.blade.php`): many mail
apps drop `@media` altogether, so the plain rules must be the computer layout there.

### In the order app

Tailwind 3 compiles without cascade layers, so the order app's stylesheet has the same
`revert` trap as the website. Three more things found turning it round (2026-10-20):

- A phone block that sat *above* its own base rule (the header bar, the category rail) only
  ever won where the base said nothing; its restore stays in the same place so that order
  holds.
- A base made of several rules (the opening-hours badge and its two-line `.has-tomorrow`
  form, the cart button and back-to-top corners with the rail on the right) is written back
  rule by rule, each at its own weight.
- A phone `!important` that only beat an inline style (the header logo, wordmark and gap in
  `BrandedHeader.tsx`) became a stylesheet value: the inline property moved into the class.

### In the till and the kitchen screen

- A class the code sets only on a phone needs no query (the docked cart and its sheet,
  `pos-cart--dock` / `--sheet`, which `OrderCart.tsx` sets only at 840px or less and over
  500px tall).
- A short-screen band that also caps the height, the till's phone landscape
  `(max-width: 900px) and (max-height: 500px)`, is not desktop first: no computer layout
  is squeezed by it, and the guard lets it be.
- The layout tokens on `:root` are the phone's, with one `min-width` tier per step (841,
  901, 1101, 1400px).

## Where it stands

Baseline written 2026-10-20: 123 desktop-first rules in 24 files. The same day the admin
stylesheet was turned round wherever the stylesheet alone decides (37 blocks to 14,
screenshots of every admin page at eight widths unchanged); what is left there beats styles
written in the page code (`!important`, marked "Page batch") and goes page by page, about
ten pages at a time, as each page moves those styles into classes. The page header block
(`.page-header-actions`) waits for its own batch: its broad selectors reach into every
page's own button rows.

Admin page batch 1 (2026-10-20): Posters, Content Studio (editor rows, header Publish),
Specials, the home layout header, Labels' action row, the item editor's card preview,
Notifications → Rules, Service Availability, and SharedUI `Card` and `StatCard`; 15 to 6.
Batch 2: every grid whose columns a page chooses (`form-grid-2/3`, `stat-grid`,
`data-responsive-grid`, `kds-grid`, the signage designer; 107 elements, now `--cols`),
Ordering Control and Delivery, SharedUI `Modal` (`--modal-align` / `--modal-pad` /
`--modal-max`), `MediaPicker`, the Orders filter panel and Reports filters; 6 to 3.
Batch 3: inputs keep 16px on a phone through one rule; every input, select and textarea
style goes through `inputFont()` (`utils/cssVars.ts`), which hands its `fontSize` over as
`--fs` (SharedUI and ui `Input` / `Select` / `DateInput` do it themselves), and a stylesheet
rule that sizes an input's text does so from 768px. A spanning table cell's alignment is
`--ta`; the page header and its action rows are phone first, with the hub's own controls
written back from 768px. The admin stylesheet has no desktop-first rule left.

Website (2026-10-20): every public page, the customer sign-in pages, the pack page, the
maintenance page, the document layout (terms, refund, privacy) and the printable menu; 46 to 1,
the email layout, which stays (above). Screenshots of 19 pages at 24 widths, either side of
every breakpoint, and the printable menu's six layouts at eight widths unchanged.

Order app (2026-10-20): `index.css` and the account hub; 24 to 0. Every element's computed
style on every route in `main.tsx`, signed out, signed in, with the rail on the right and with
a cart, at 14 widths either side of every breakpoint: unchanged.

Kitchen screen (2026-10-20): 3 to 0. Till, batch 1: the top bar shortcuts, the layout
tokens, the stacked cart (dock and sheet), Active orders, the item configure pop-up, the
discounts pop-up and the close-shift sheet; 12 to 2. Every element's computed style in
fourteen till states (sale, ticket, delivery, sheet, Charge, discounts, Active orders,
receipts, shift, shift history, operations, reports, close shift and its review) at 22
screen sizes, phone landscape included, and the kitchen board at nine: unchanged. 
Till, batch 2 (2026-10-20): the phone's Charge popup and the shift history and operations
panes; 2 to 0. `ChargeOverlay.tsx` no longer sets inline the values the phone and the
computer differ on (padding, type sizes, gaps, the summary's and breakdown's colours, the
Confirm button's flex); the stylesheet holds both, the phone's plain and the computer's from
841px. The small grey headings in the tender column carry `pos-charge-tiny-label`, so the
restore gives them their 6px and every other line there none. The operations panes' grids
hand their computer columns over as `--cols`, and Receipts needed nothing (it switches to one
column in its own code at the same 760px). Checked as before, with the Charge popup also on
Card, Transfer, QR, split with cash and a picked note, and every operations tab: unchanged.

| Area | Rules left |
|---|---|
| Website views (`backend/resources`) | 1 (emails, on purpose) |
| Admin (`apps/admin-dashboard`) | 0 |
| Order app (`apps/online-order-web`) | 0 |
| Till (`apps/pos-web`) | 0 |
| Kitchen screen (`apps/kds-web`) | 0 |

`scripts/mobile-first-baseline.json` has the per-file list. Already mobile first: the Clock
machine tab (`ClockMachinePanel.tsx`), the whole admin stylesheet (`index.css`) and every
website view but the email layout, the order app, the kitchen screen and the till.
