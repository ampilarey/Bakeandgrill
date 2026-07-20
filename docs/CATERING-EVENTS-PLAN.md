# Catering & Events Ordering System — Implementation Plan

> Date: 2026-07-20 (rev 4: menu / channel / workflow decoupled into an explicit architecture rule) · Status: approved design, ready for implementation
> Implementation is executed **phase by phase** — each phase below is a self-contained prompt for a coding agent (Cursor). Do not start a later phase before the earlier one is merged and green.

---

## 1. Why (current state, from the completed audit)

- **Catering today is an inquiry funnel only.** `CateringRequest` (statuses `new → contacted → quoted → confirmed → completed/cancelled`) stores contact info, event date, headcount, and a free-form list of "interested items". Staff type a `quoted_amount` manually and revenue is rung **manually through POS with a manual discount** (`apps/admin-dashboard/src/pages/CateringPage.tsx` even instructs this). No pricing engine, no payment, no customer notifications.
- **The `catering` sales channel already exists** on every item (`item_channel_availability`, seeded `is_enabled=false` per item) but is **display-only**: `KitchenMenuResolver::ORDERING_CHANNELS` deliberately excludes `catering` and `channelForOrderType()` never maps to it.
- **Pre-orders are deprecated and half-dismantled**: the SPA route `/order/pre-order` renders the catering form; `PreOrderPage.tsx` (a complete 4-step wizard) is orphaned/unrouted; `PreOrderApiController::store` is unrouted dead code; and the old web confirmation `/pre-order/{id}/confirmation` is an **unauthenticated sequential-ID IDOR** exposing historical customers' names/phones/items/totals.
- Payment infrastructure that already works and must be reused: BML gateway (`PaymentService`, `GiftCardPurchaseService::start` creates a payable `type=gift_card` order → BML redirect → `OrderPaid` listener issues the card), online orders start `payment_pending` with kitchen print suppressed until `OrderPaid`, partial payments are supported, SMS via `SmsService` with idempotency keys, and secure random-token public pages (e-receipts, gift-card 48h view token).

## 2. Agreed product design

### ARCHITECTURE RULE — three independent concepts (do not couple them, ever)

| Concept | Answers | Mechanism (already exists) |
|---|---|---|
| **Menu** | *Where is the product displayed?* (Main Menu, Event Menu, later Ramadan/Breakfast Menu…) | Categories / menu-groups — presentation only |
| **Channel availability** | *Where can it be ordered?* | `item_channel_availability` per-item flags: `dine_in`, `takeaway`, `online_pickup`, `delivery`, `catering` — an independent ✓/✗ matrix |
| **Order workflow** | *Which validation rules apply?* | Order type. Immediate orders: today's stock/kitchen/delivery checks. Event orders: lead time + quote/deposit workflow; **today's stock is NOT checked** (validated at fire-to-kitchen on the event day) |

Menu membership must never imply orderability, and channel flags must never imply menu placement. Concretely:

- A **Fried Rice Tray** (Event Menu category) with `takeaway`+`delivery`+`catering` flags: appears in the POS/online "Events & Catering" section for immediate sale AND in the event wizard.
- A **Buffet Package** (Event Menu category) with only `catering` flagged: appears ONLY in the event wizard — never orderable immediately. No special-casing; the flags express it.
- A regular **Fried Rice** (Main Menu) without the `catering` flag: never appears in the event wizard's catering tab (still reachable via the wizard's "Regular menu" tab, which lists immediate-channel items).

### Two menus, one catalog
Catering/event items are **separate item records** (their own price, size, packaging options, tax code, prep characteristics), placed in dedicated Event-Menu categories and flagged for the **existing `catering` channel** (plus any immediate channels the owner wants). **No per-channel price overrides** — a catering tray is a different product, not a different price.

- **POS + online ordering:** show immediate-channel items by default, plus an expandable **"Event & catering items"** section containing items that are catering-flagged **AND** enabled for that surface's immediate channel. Adding one orders through the completely normal flow (pricing/tax/packaging machinery untouched, availability checks unchanged).
- **Event/catering flow:** all catering-flagged items by default, regular menu available too, **plus custom free-text lines** ("item name + qty + note", unpriced until staff quote them).
- **Prices are visible** on catering items everywhere (user decision).

### Event order lifecycle
1. **Customer builds an event order** in a wizard (reuse the orphaned `PreOrderPage` UI as the starting point): catering-first item picker, regular-menu section, custom lines, event date/details, OTP auth at confirm → saved as a **draft event order** attached to the catering pipeline.
2. **Staff review/edit in admin:** add/remove/edit lines, price custom lines, set fulfillment details, choose **the payment amount for this quote — full total or a specific deposit amount (staff decide per event)** → "Send to customer". **Each resend invalidates the previous link** (exactly one live quote version).
3. **Customer gets an SMS** with a secure random-token link → itemized quote page → **Approve & Pay**.
4. **On approve:** create a real `Order` in `payment_pending` → BML redirect (same pattern as gift-card purchase). On `OrderPaid`: event flips to confirmed, customer + staff notified, revenue flows through the normal orders/GST/reports pipeline. Deposit case: the order records the deposit as a partial payment; the balance is settled later via POS (partial payment already exists).
5. **Quote expiry is configurable** (site setting, e.g. "quote valid X days", and auto-invalidate at/near the event date). Expired links show "quote expired — contact us".

### Notifications & verification (applies across phases)
- **Every lifecycle transition notifies by SMS + email**: event created, quote sent/resent, approved & paid (confirmed), quote expired, event edited, cancelled — plus an optional day-before reminder. Customer: SMS always, email when an address is on file. Staff: owner/admin **plus staff appointed by the admin**.
- **"Appointed staff" = a new `events.manage` permission** assigned through the existing roles/permissions system. Notify targets are all users holding `events.manage` (their phone/email) plus fallback site settings `catering_notify_phone` and (new) `catering_notify_email`. This also fixes the audit gap where catering admin was gated by the unrelated `customers.manage` permission — the new event endpoints use `events.manage`.
- Reuse existing infrastructure only: `SmsService` with idempotency keys (`event:{id}:{version}:{type}`), mailables following the `emails/order_confirmation` pattern. No new notification framework.
- **Customer verification**: the wizard's confirm step requires phone verification via the existing customer SMS OTP; add an **optional email OTP channel** (`channel: email` on the OTP request when an email is provided; SMS remains the default). **Already-authenticated customers skip verification entirely** (sanctum customer token).

### Event orders inside the POS (design decision)
Event orders are deliberately **NOT mixed into Active Orders**. Active Orders is a live-service feed; events are future-dated and would pollute it. Instead:
- A dedicated **"Events" tab in the POS**: upcoming events grouped by fulfillment date (Today pinned/highlighted), status chips (awaiting payment / confirmed / in prep / completed), **visible read-only to ALL staff at all times, across shift opens/closes**.
- **Actions are gated by `events.manage`**: fire to kitchen on the event day, settle the balance, cancel. Everyone can see; only appointed staff can act. The admin decides who by granting the permission.
- **Shift interplay (verified in code)**: `ShiftController::close` reconciles cash only and never blocks on open orders — so event orders can never block a shift close; no special-casing is needed. A balance collected at the POS attaches to the collecting cashier's open shift via the existing `payments.shift_id`, so each shift's cash reconciles correctly. Online (BML) event payments carry no shift, like all online payments.
- **Event-day flow**: kitchen print/KDS stays suppressed until an appointed staff member taps **"Send to kitchen"** on the Events tab. (Auto-fire at a configurable `preparation_start` time is a later nice-to-have, not in scope.)

### Menu selection & display (explicit UI spec)
- **POS**: "Events & Catering" is a distinct, visually badged category tab at the END of MenuGrid (channel-filtered), de-emphasized by default; catering items carry a small badge on their cart lines. The normal menu remains the default view.
- **Online ordering**: the menu page gets a collapsed "Event & catering menu" section (prices visible), hidden entirely when no catering items exist.
- **Event wizard (the emphasis inverts)**: the item picker is tabbed — **Catering menu (default) | Regular menu | + Custom item**.

### Retirements folded in
Remove the pre-order IDOR page (or token-protect it), the orphaned wizard route ambiguity, unrouted `PreOrderApiController::store`, and dead corporate-inquiry API clients.

## 3. Cross-phase constraints (apply to every prompt)

- Money in **integer laari** (1 MVR = 100 laari) with rounding at boundaries; server is the **only price authority** — clients send item/option IDs and quantities, never prices. The single exception: **staff** pricing custom lines in the admin editor (permission-gated, like manual discounts).
- Public links use **random tokens** (≥32 chars, `Str::random`), never sequential IDs. SMS sends carry idempotency keys.
- **Do not modify:** `OrderTotalsCalculator` totals pipeline, `EffectiveDiscount`, gift-card tender logic, loyalty/promotions, packaging-fee math. New order lines must flow through the existing creation path (`OrderCreationService`) so all of that continues to apply automatically.
- Every phase: backend `vendor/bin/phpunit` fully green (new feature tests included), `npx vitest run` green in `apps/pos-web` and `apps/online-order-web`. If API item payloads change shape, regenerate contract snapshots deliberately (`UPDATE_SNAPSHOTS=true`, APP_URL=http://localhost:8000) and commit them.

## 4. Adoption maps — every surface that changes

### 4A. Admin app (`apps/admin-dashboard`)
| Change | Where | Phase |
|---|---|---|
| Nav entry renamed "Events & Catering", description "Event orders, quotes & catering pipeline", gated `permissions: ['events.manage', 'customers.manage']` (any-of, so existing staff keep access until roles are updated); update `src/__tests__/navConfig.test.ts` | `src/components/navConfig.ts` (~line 84) | 3 |
| New route `/catering/:id` — event detail / quote editor page (lazy import + permission-gate pattern of sibling routes); pipeline list rows link to it | `src/App.tsx` | 3 |
| `events.manage` appears in the roles/permissions editor (auto once seeded backend-side; if the frontend keeps a hardcoded permission catalog, add slug + friendly label) | roles/staff pages | 3 |
| New "Catering & Events" settings card: `catering_notify_phone` (existing), `catering_notify_email` (new), `catering_min_lead_hours` (existing, not yet UI-editable), `catering_quote_valid_days`, `catering_quote_min_hours_before_event` — follow whichever settings surface hosts sibling site-setting groups | settings pages | 3 |
| `catering_reminder_enabled` toggle added to that card | settings pages | 4 |
| Orders page: `catering` order-type label + type filter (pattern: existing `preorder` label, `OrdersPage.tsx` ~52) | `src/pages/OrdersPage.tsx` | 4 |
| Menu page: catering badge + "Catering items only" filter | `src/pages/MenuPage/` | 1 |
| Pipeline list: `draft`/`awaiting_customer` status chips; quote version, expiry, paid state (deposit/balance) columns; link to detail page | `src/pages/CateringPage.tsx` | 2–3 |
| Optional: "Upcoming events (7 days)" dashboard widget, visible with `events.manage` | `src/pages/DashboardPage` | 5 (optional) |
| Remove "ring through POS with a manual discount" hint | `src/pages/CateringPage.tsx` | 4 |

### 4B. Main website (Blade, `backend/resources/views`)
| Change | Where | Phase |
|---|---|---|
| "Catering & Events" nav link points to the wizard `/order/events` (optionally keep `/order/catering` as a secondary "quick inquiry" link) | `layout.blade.php` | 2 |
| Lightweight "Events & Catering" home section — blurb + CTAs "Browse catering menu" and "Plan your event" (→ `/order/events`); copy via the existing CMS site-settings pattern | `home.blade.php` | 2 |
| "Planning an event?" CTA | `contact.blade.php` | 2 |
| Reservations untouched (separate backlog) | — | — |

### 4C. Order app (`apps/online-order-web`)
| Change | Where | Phase |
|---|---|---|
| Collapsed "Event & catering menu" section on the menu page | MenuPage components | 1 |
| `/order/events` wizard (+ `/order/pre-order` pointing there); app navigation entry "Events" | `src/main.tsx`, nav components | 2 |
| HomePage office-catering block: retitle "Events & catering", CTA → `/order/events` (keep `officeOrdersEnabled` gating) | `src/pages/HomePage.tsx` (~309-371) | 2 |
| Public quote page `/order/quote/{token}` | new page | 4 |
| AccountPage "My events": customer's event orders (reference, date, status, paid/balance), rows link to the live quote page when awaiting payment; backed by `GET /api/customer/event-orders` (list variant of the create endpoint); replaces old pre-order history links | `src/pages/AccountPage.tsx` | 4 |

---

## PHASE 1 — Catering menu foundation

```
Bake & Grill monorepo (Laravel backend in backend/, React apps in apps/pos-web, apps/online-order-web, apps/admin-dashboard). Read docs/CATERING-EVENTS-PLAN.md sections 1–4 (the adoption maps in section 4 list every surface change per phase) for full context. This phase makes catering items real, orderable products shown as an optional section in POS and online ordering.

Current mechanics you build on:
- Every item has channel rows in item_channel_availability; the catering channel exists but is_enabled=false by default (ItemController ~line 350, Item.php ~line 206) and KitchenMenuResolver (backend/app/Domains/Kitchen/Services/KitchenMenuResolver.php) excludes 'catering' from ORDERING_CHANNELS (~line 25) and never maps an order type to it (channelForOrderType ~line 31).

TASKS:
1. ARCHITECTURE RULE (read section 2 "three independent concepts" — this is binding): make NO changes to ordering/availability logic. channelForOrderType and ORDERING_CHANNELS stay exactly as they are; KitchenMenuResolver::assertLineItemsAllowedForOrderType is NOT loosened. An item is immediately orderable purely by its own dine_in/takeaway/online_pickup/delivery flags, as today. The catering flag by itself NEVER makes an item orderable in immediate flows, and menu/category membership never implies orderability. Add a code comment on ORDERING_CHANNELS stating this principle so future devs don't couple them.
2. Admin curation (apps/admin-dashboard MenuPage): surface the FULL per-item channel matrix clearly in the item editor (all five checkboxes: dine-in / takeaway / pickup / delivery / catering) so the owner can express e.g. tray = takeaway+delivery+catering, buffet package = catering only. Add a "Catering menu" badge in the item list + a "Catering items only" filter. No new editor beyond this — catering items are normal items.
3. POS (apps/pos-web): in MenuGrid/menu source (src/api/menu.ts, PosMenuBuilder backend side), add "Events & Catering" as a DISTINCT, visually badged category tab at the END of the category strip, de-emphasized styling. It lists items that are catering-flagged AND enabled for the POS's current immediate channel (so catering-only items like a buffet package never appear here). Cashier taps and adds items like any other; catering items get a small badge on their cart lines; cart/pricing/packaging/availability logic unchanged. Include these items in the offline cached menu.
4. Online ordering (apps/online-order-web): a collapsed "Event & catering menu" section on the menu page listing items catering-flagged AND enabled for the current online channel (hidden entirely when none exist), items show prices, add-to-cart works through the normal flow (ItemSheet, variants, packaging options all apply).
5. Backend menu payloads: extend PosMenuBuilder and the public menu/category serializers with the item's catering flag (e.g. channels: ['takeaway','catering'] or is_catering: true) so clients can filter. Regenerate contract snapshots.

TESTS: feature tests — item with catering+takeaway flags is orderable via takeaway and appears in the POS/online catering section; item with ONLY the catering flag is NOT orderable in any immediate flow (rejected by existing availability checks) and does NOT appear in POS/online sections or default menus; catering-only item absent from default channel listings; admin channel-matrix round-trips. Vitest: POS catering tab filters by catering∧immediate-channel; cart math unchanged for catering items. Full suites green.

DO NOT: change any ordering/availability/pricing/tax/packaging/discount logic; catering items must behave identically to normal items once in a cart. The ONLY backend changes in this phase are menu-payload serialization (catering flag) and admin item-editor channel-matrix exposure.
```

## PHASE 2 — Event order builder (customer wizard → draft)

```
Bake & Grill monorepo. Read docs/CATERING-EVENTS-PLAN.md sections 1–4 (the adoption maps in section 4 list every surface change per phase). Phase 1 (catering menu foundation) is merged: catering items are orderable, flagged in menu payloads. This phase gives customers an event-order wizard that saves a structured DRAFT into the catering pipeline, and retires the dead pre-order remnants.

Current mechanics:
- CateringRequest (backend/app/Models/CateringRequest.php): statuses new/contacted/quoted/confirmed/completed/cancelled; created via POST /api/catering-requests (CateringRequestController::store — honeypot, lead-time from catering_min_lead_hours setting, throttle 10/min); staff SMS via CateringRequestSubmitted event.
- Orphaned wizard UI: apps/online-order-web/src/pages/PreOrderPage.tsx (4-step: items → details → confirm-with-OTP → done) — unrouted; /order/pre-order currently renders CateringPage (src/main.tsx ~line 95).
- IDOR: GET /pre-order/{id}/confirmation (routes/web.php ~line 80, PreOrderController::confirmation) is unauthenticated + sequential id.

TASKS:
1. Migration: `catering_request_lines` — id, catering_request_id FK cascade, item_id nullable FK (null = custom line), variant_id nullable, name (snapshot or custom text, ≤160), quantity int ≥1, unit_price decimal(10,2) nullable (null until priced; catalog lines get server-resolved price snapshots), notes ≤500, is_custom bool, sort_order, timestamps. Add to catering_requests: `event_type` string nullable, `fulfillment_time` time nullable, plus keep all existing columns.
2. New statuses: extend CateringRequest::STATUSES with `draft` and `awaiting_customer` (full set: draft, new, contacted, quoted, awaiting_customer, confirmed, completed, cancelled). Existing rows/statuses untouched.
3. Endpoint POST /api/customer/event-orders (auth:sanctum + customer.token, throttle 10/min): payload = contact fields, occasion/event_type, event_date (validate against catering_min_lead_hours), headcount, notes, lines[] where each line is {item_id, variant_id?, quantity, notes?} OR {custom_name, quantity, notes?}. Server resolves catalog line names/prices from the DB (unit price = same effective-price resolution the order flow uses; snapshot it), custom lines stored with unit_price = null. Creates CateringRequest status `draft` + lines. Return a reference number (e.g. EV-YYYYMMDD-XXXX stored on the request) shown to the customer.
4. "Event created" notifications (extend CateringRequestSubmitted handling): customer gets SMS "Event request {reference} received — we'll send your quote soon" plus an email when an address is on file (mailable following the emails/order_confirmation pattern); staff notification goes to every user holding the `events.manage` permission (phone + email; the permission itself is introduced in Phase 3 — in this phase, fall back to the existing catering_notify_phone setting plus a new catering_notify_email setting, and structure the notifier so Phase 3 can plug in the permission-based recipient list). All sends via SmsService/Mail with idempotency keys event:{id}:1:created.
5. OTP channels: wizard confirm uses the existing customer SMS OTP; ADD an optional email OTP channel — the OTP request endpoint accepts channel: 'email' (only when an email is provided; SMS stays the default; same throttles and code lifetime). Already-authenticated customers (sanctum customer token) skip verification entirely — assert this explicitly in a test.
6. Wizard (apps/online-order-web): resurrect PreOrderPage.tsx as EventOrderPage at route /order/events (also point /order/pre-order there): step 1 item picker with THREE TABS — "Catering menu" (default), "Regular menu", "+ Custom item" (name/qty/note rows) — so catering leads and the regular menu is one tap away (inverse of the main ordering app); step 2 event details (date honoring the lead-time min, time, occasion, headcount, notes); step 3 OTP-or-authenticated confirm showing an itemized summary — catalog lines with prices, custom lines marked "to be quoted", and copy that staff will confirm the final quote; step 4 done screen with the reference number and "we'll SMS/email you the quote". Keep the existing CateringPage simple-inquiry form reachable (link from the wizard: "just want a callback?").
7. Retirements: delete the unrouted PreOrderApiController::store method; remove the IDOR route GET /pre-order/{id}/confirmation + PreOrderController::confirmation + its blade (historical pre-orders were already imported into catering_requests); remove dead corporate-inquiry API clients (apps/online-order-web submitCorporateInquiry in src/api/menu.ts, apps/admin-dashboard fetchCorporateInquiries/updateCorporateInquiryStatus in src/api/customer-growth.ts). Keep the backend legacy /api/corporate-inquiries POST alias (old clients).
8. Admin: CateringPage list must render draft rows (status filter includes draft) showing line count + custom-line count; full editing arrives in Phase 3 — read-only line display is enough here (GET /admin/customers/catering-requests/{id} returns lines).
9. Entry points (adoption map 4B/4C): main website — layout.blade.php "Catering & Events" nav link → /order/events; home.blade.php gets a lightweight "Events & Catering" section (blurb + "Browse catering menu" and "Plan your event" CTAs, copy via the existing CMS site-settings pattern); contact.blade.php gets a "Planning an event?" CTA. Order app — HomePage office-catering block retitled "Events & catering" with CTA → /order/events (keep officeOrdersEnabled gating); add an "Events" entry to the app navigation alongside Reservations/Catering links.

TESTS: feature — draft creation with mixed catalog+custom lines (prices resolved server-side, client-sent prices ignored/rejected), lead-time validation, reference number uniqueness, created-notification SMS+email dispatched idempotently, email-OTP channel works and SMS stays default, authenticated customers skip OTP, IDOR route now 404s, legacy corporate alias still accepts. Vitest — wizard tabbed item picker (catering default), custom-line add/remove, step flow. Full suites green.

DO NOT: touch Order/OrderItem creation, totals, or payment code in this phase — drafts live entirely in catering_request_lines.
```

## PHASE 3 — Staff quote editor + send for approval

```
Bake & Grill monorepo. Read docs/CATERING-EVENTS-PLAN.md sections 1–4 (the adoption maps in section 4 list every surface change per phase). Phases 1–2 merged: catering menu live; customers create draft event orders with catalog + custom lines (catering_request_lines); admin sees drafts read-only. This phase lets staff edit/price/quote an event order and send it to the customer for approval.

Current mechanics: admin catering UI apps/admin-dashboard/src/pages/CateringPage.tsx + src/api/catering.ts (PATCH /admin/customers/catering-requests/{id}, permission customers.manage); SMS via SmsService with idempotency keys; token patterns in GiftCardController (view token) and ReceiptController.

TASKS:
1. Migration: add to catering_requests — `quote_token` (64, unique, nullable), `quote_sent_at`, `quote_expires_at`, `quote_payment_laar` bigInteger nullable (the amount the customer must pay online for THIS quote), `quote_is_deposit` bool default false, `quote_version` int default 1. Site settings: `catering_quote_valid_days` (default 7), `catering_quote_min_hours_before_event` (default 24).
2. NEW PERMISSION `events.manage`: add to the permissions seeder/catalog alongside existing slugs (reservations.manage etc.), assignable through the existing roles/permissions admin UI — this is how the admin "appoints" event staff. Gate ALL new endpoints in this phase (and later phases) with events.manage instead of customers.manage (existing catering list/update endpoints keep their current gate for backward compatibility). Recipient helper: a small service returning notify targets = all active users holding events.manage (phone + email) plus fallback site settings catering_notify_phone / catering_notify_email — refactor the Phase 2 notifier to use it.
3. Line editing endpoints (staff, permission events.manage): PUT /admin/customers/catering-requests/{id}/lines — replaces the line set (add/remove/edit qty/notes; catalog lines re-resolve price server-side on item/variant change; custom lines accept a staff-entered unit_price ≥0 — this is the ONLY place a human-entered price is accepted, gated by the staff permission). Recompute and store a quote subtotal: sum(unit_price × qty) in laari over all lines; block sending while any custom line has null price. GST: quote display shows the same tax math an order of these lines would get — reuse a preview via the existing calculators, do NOT persist order totals here. Editing an event notifies the customer only when staff resend (no per-keystroke spam).
4. Send/resend: POST /admin/customers/catering-requests/{id}/send-quote with {payment_amount_mvr, is_deposit} (permission events.manage) — validates 0 < payment ≤ quote total (deposit) or equals total (full), regenerates quote_token (Str::random(48)), sets quote_sent_at=now, quote_expires_at=min(now + catering_quote_valid_days, event_date − catering_quote_min_hours_before_event), increments quote_version, sets status awaiting_customer. Notify: customer SMS with the link https://{app}/order/quote/{token} + email when on file (mailable with the itemized quote); staff targets (recipient helper) get a brief "quote v{n} sent for {reference}" SMS/email. Idempotency event:{id}:{version}:quote_sent. Any subsequent edit to lines invalidates: clears token + reverts status to quoted.
5. Admin UI (CateringPage or a detail drawer/page): line editor (qty steppers, remove, add catalog item via item search, price inputs enabled only on custom lines), quote summary (subtotal, tax preview, total), payment amount input + "deposit" toggle with validation, Send/Resend button showing version + expiry, and a status timeline. Keep all existing pipeline fields (staff_notes, pos_order_id, handled_by) working.
6. Public quote read endpoint: GET /api/event-quotes/{token} (public, throttle 30/min) → itemized quote (lines, totals, payment amount, deposit flag, expiry, status). 404 on unknown/cleared token; 410-style expired payload after quote_expires_at. No sequential IDs anywhere.
7. Admin adoption (map 4A): navConfig.ts entry renamed "Events & Catering" (description "Event orders, quotes & catering pipeline") gated permissions: ['events.manage','customers.manage'] any-of + update navConfig.test.ts; new App.tsx route /catering/:id for the detail/quote editor (lazy import + sibling permission-gate pattern), list rows link to it; ensure events.manage shows in the roles/permissions editor (add slug + friendly label to any hardcoded frontend permission catalog); new "Catering & Events" settings card (in whichever settings surface hosts sibling site-setting groups) editing catering_notify_phone, catering_notify_email, catering_min_lead_hours, catering_quote_valid_days, catering_quote_min_hours_before_event.

TESTS: feature — line replace re-resolves catalog prices (client prices ignored), custom price requires events.manage, send blocked with unpriced custom lines, deposit bounds validation, resend rotates token + old token dies + notifies customer and events.manage holders (SMS + email, idempotent), expiry computation (both min branches), public endpoint token/expiry behavior, events.manage permission gating (403 without it). Vitest — admin editor interactions. Full suites green.

DO NOT: create Orders or payments yet (Phase 4); do not touch OrderTotalsCalculator/discount/gift-card code.
```

## PHASE 4 — Customer approval, payment, confirmation

```
Bake & Grill monorepo. Read docs/CATERING-EVENTS-PLAN.md sections 1–4 (the adoption maps in section 4 list every surface change per phase). Phases 1–3 merged: staff send tokened quotes (quote_token, quote_payment_laar, quote_is_deposit, quote_expires_at, status awaiting_customer). This phase completes the loop: customer approves and pays online; payment confirms the event.

Current mechanics to REUSE (this is the critical part):
- Gift-card purchase pattern: GiftCardPurchaseService::start creates a payable Order (type gift_card) → BML checkout URL → on OrderPaid a listener performs the domain action, idempotently. Mirror this exactly.
- Online orders: OrderCreationService::createFromPayload creates payment_pending orders with kitchen print suppressed until OrderPaid; BML flow in PaymentService (confirmPayment) marks paid and fires events; partial payment is supported (PartialPaymentTest).
- Order types: dine_in/takeaway/online_pickup/delivery/gift_card. KitchenMenuResolver::channelForOrderType maps catering-ish types to online_pickup for menu checks.

TASKS:
1. Quote page (apps/online-order-web, route /order/quote/{token}, public): renders the Phase-3 GET /api/event-quotes/{token} — itemized lines, tax, total, "Pay now: MVR X (deposit)" or full, expiry countdown, Approve & Pay button; expired/invalid states with a contact link.
2. Approval endpoint: POST /api/event-quotes/{token}/approve (public, throttle 10/min). Server-side, atomically (row lock on the catering request): validate token live + not expired + status awaiting_customer; create an Order via OrderCreationService with a new type `catering` (add to order-type enums/validation; channelForOrderType('catering') already maps to online_pickup — keep that): catalog lines as normal order items (server re-resolves prices; assert they match the quoted snapshots within 1 laar — on mismatch, 409 "quote outdated, ask staff to resend"), custom lines as order items with a designated "Custom catering item" placeholder item (create one seeded inactive item, is_active=false so it never appears in menus; unit_price from the staff-priced line — permitted because it comes from the persisted staff-priced quote, not the client). WORKFLOW RULE (section 2): this is a FUTURE-DATED event order — SKIP today's stock/86/kitchen-capacity validation for its lines (86-snoozed or stock_out today must not block an event weeks away; items must still exist and be active or be the placeholder). Do NOT deduct stock at approval. Stock is dealt with at fire-to-kitchen on the event day (Phase 5). Lead-time/quote validation is what applies here. Order starts payment_pending, kitchen print suppressed. Store order_id on the catering request (pos_order_id), keep status awaiting_customer until paid. Then create the BML payment for quote_payment_laar (NOT necessarily the order total — deposit case) via the same PaymentService path gift cards use, and return the payment_url for redirect.
3. Event confirmation trigger — IMPORTANT, this is NOT OrderPaid: for a deposit, the order stays partially paid and OrderPaid never fires. Confirm the event when the BML payment for quote_payment_laar is CONFIRMED — listen on the payment-confirmed path (PaymentConfirmed event / PaymentService::confirmPayment) for the catering order and check confirmed-paid-sum ≥ quote_payment_laar. Idempotent per event (event:{id}:{version}:confirmed). On confirmation: set catering request status=confirmed (stamp confirmed_at), notify customer by SMS + email "Event confirmed — ref {reference}, paid MVR X{, balance MVR Y due on the day}", notify events.manage holders (recipient helper from Phase 3). The full-payment case behaves identically under this rule (OrderPaid also fires then — the listener must not double-notify). Deposit case: order remains partial per existing payment-status logic; balance is settled later via the normal POS addPayments flow (no new code — verify with a test).
4. Expiry sweep: scheduled command (hourly) that flips awaiting_customer requests past quote_expires_at back to quoted and clears the token (so the page shows expired even if opened later). Notify customer (SMS + email, "your quote expired — contact us to renew") and events.manage holders, idempotent per version. Follow the AutoCancelNoShowReservations job/schedule pattern in routes/console.php. Also add an OPTIONAL day-before-event reminder (site-setting toggle catering_reminder_enabled, default on): daily job reminds customer + events.manage holders of tomorrow's confirmed events.
5. Cancellation notifications: when staff cancel an event (existing status change to cancelled), notify customer SMS + email + events.manage holders, idempotent.
6. Edge handling: approving twice (idempotent — second call returns the existing payment_url if still payment_pending), BML failure/abandon (order stays payment_pending; staff can resend quote which cancels the stale pending order via existing cancellation flow), staff editing after approval-but-unpaid (blocked while a live payment_pending order exists unless staff explicitly cancel it — enforce + test).
7. Adoption (maps 4A/4C): admin OrdersPage gains a 'catering' order-type label + type filter (pattern: existing preorder label ~line 52); add the catering_reminder_enabled toggle to the Phase-3 settings card; remove the "ring through POS with a manual discount" hint from CateringPage. Order app: GET /api/customer/event-orders (list, customer token — own requests with reference/date/status/paid+balance laari) and an AccountPage "My events" section listing them, each row linking to /order/quote/{token} while awaiting_customer; replace the old pre-order history links/empty-states with it.

TESTS: feature — approve creates catering order with correct lines/prices and 1-laar snapshot guard; custom placeholder item never menu-visible; DEPOSIT payment confirmation (not OrderPaid) confirms the event exactly once and leaves the order partial; full payment confirms exactly once (no double-notify from PaymentConfirmed + OrderPaid); POS can settle the balance; expiry sweep notifies + reverts idempotently; reminder job; cancellation notifications; expired/rotated token rejected; double-approve idempotent; staff edit blocked while pending payment exists. Vitest — quote page states (live/expired/paid). Full backend + frontend suites green; regenerate contract snapshots if order payloads changed.

DO NOT: modify OrderTotalsCalculator/EffectiveDiscount/gift-card tender/loyalty logic. The catering order must flow through the existing pipeline untouched — that is the point of this design.
```

## PHASE 5 — POS Events tab (dedicated, not mixed with Active Orders)

```
Bake & Grill monorepo. Read docs/CATERING-EVENTS-PLAN.md sections 1–4 (the adoption maps in section 4 list every surface change per phase) (especially "Event orders inside the POS"). Phases 1–4 merged: events are quoted, approved, and paid online; confirmed events have a linked catering-type Order (payment_pending → partial/paid) and kitchen print is suppressed until fired. This phase gives the POS a dedicated Events surface. Design decision (do not revisit): event orders are NOT part of the Active Orders feed.

Current mechanics: POS Active Orders feed + tabs live in apps/pos-web (OrderCart.tsx, usePosApp.ts, the Active Orders components); shifts are cash-reconciliation only (backend/app/Http/Controllers/Api/ShiftController.php::close never blocks on open orders — do NOT add such blocking); payments carry shift_id of the collecting cashier automatically; permissions surface via hasPosPermission (apps/pos-web/src/hooks/usePosPermissions.ts, slugs from the login payload).

TASKS:
1. Backend endpoint GET /api/pos/events (auth staff, device.active): upcoming + recent catering requests with structured lines and their linked order's payment state (paid / partial with balance laari / pending), filterable by date range and status. Read-only; visible to ALL staff (no events.manage needed to view).
2. POS "Events" tab alongside Active Orders: events grouped by fulfillment date, Today pinned/highlighted, status chips (awaiting payment / confirmed / in prep / completed / cancelled), each card showing reference, customer, headcount, line summary, paid vs balance amounts. Visible to all staff at all times — independent of shift state (opening/closing a shift must not affect it).
3. Actions on an event card, gated by events.manage (hidden without the permission):
   a. "Send to kitchen" (event day): fires the linked order to kitchen via the existing fire/print path (same mechanism the POS uses for held orders) — KDS/chit only from this action, never earlier. THIS is where stock/capacity is validated (per the section-2 workflow rule — approval skipped it): run the normal stock deduction/availability path now; if any line is short, show the appointed staff a clear warning listing the short items but allow proceeding with an explicit confirm (events must not hard-fail on the day). Idempotent (re-tap does not duplicate chits or double-deduct stock — reuse the cart-fingerprint/reprint guard pattern).
   b. "Settle balance": opens the existing charge/tender flow against the linked order's remaining balance (existing addPayments — the payment attaches to the collecting cashier's open shift via payments.shift_id automatically; requires an open shift like any cash collection).
   c. "Cancel event": existing cancellation flow + Phase 4 notifications.
4. Shifts: NO code changes to shift logic. Add a test asserting a shift closes normally while confirmed events exist (they are not "open orders" of any cashier and must never block).
5. Events must NOT appear in the Active Orders feed, X-report open-order noise, or KDS until fired — assert in tests.
6. OPTIONAL (map 4A): admin dashboard "Upcoming events (7 days)" widget, visible only with events.manage — skip if the dashboard layout makes it awkward; note the decision in the PR description.

TESTS: feature — pos/events endpoint shape + visibility without events.manage; fire-to-kitchen idempotent + gated (403 without permission); balance settle attaches shift_id of the collector and flips order to paid; shift close unaffected by pending events; events absent from Active Orders feed. Vitest — Events tab rendering/grouping, permission-gated action visibility. Full suites green.

DO NOT: mix events into Active Orders; block shift close on events; change shift/cash logic; touch totals/discount/gift-card code.
```

---

## Rollout notes

- Phases ship independently; each is valuable alone (1: catering upsell in POS/online; 2: structured event intake replacing free-text; 3: professional quoting; 4: online payment; 5: POS event operations).
- Staff appointment: after Phase 3 lands, the admin grants the new `events.manage` permission to the staff who should handle events — that single permission controls quote editing, notifications, and (from Phase 5) POS event actions.
- After Phase 4, retire the "ring through POS with a manual discount" instruction from the admin catering page.
- GST: catering orders inherit standard item tax automatically. Confirm with the accountant that catering trays use the intended tax codes when creating the catering item records (data task, not code).
- Reservation-system fixes (settings-shape mismatch, overbooking guard) are a separate, unrelated backlog — deliberately not bundled here.
