# Catering & Events Ordering System — Implementation Plan

> Date: 2026-07-20 · Status: approved design, ready for implementation
> Implementation is executed **phase by phase** — each phase below is a self-contained prompt for a coding agent (Cursor). Do not start a later phase before the earlier one is merged and green.

---

## 1. Why (current state, from the completed audit)

- **Catering today is an inquiry funnel only.** `CateringRequest` (statuses `new → contacted → quoted → confirmed → completed/cancelled`) stores contact info, event date, headcount, and a free-form list of "interested items". Staff type a `quoted_amount` manually and revenue is rung **manually through POS with a manual discount** (`apps/admin-dashboard/src/pages/CateringPage.tsx` even instructs this). No pricing engine, no payment, no customer notifications.
- **The `catering` sales channel already exists** on every item (`item_channel_availability`, seeded `is_enabled=false` per item) but is **display-only**: `KitchenMenuResolver::ORDERING_CHANNELS` deliberately excludes `catering` and `channelForOrderType()` never maps to it.
- **Pre-orders are deprecated and half-dismantled**: the SPA route `/order/pre-order` renders the catering form; `PreOrderPage.tsx` (a complete 4-step wizard) is orphaned/unrouted; `PreOrderApiController::store` is unrouted dead code; and the old web confirmation `/pre-order/{id}/confirmation` is an **unauthenticated sequential-ID IDOR** exposing historical customers' names/phones/items/totals.
- Payment infrastructure that already works and must be reused: BML gateway (`PaymentService`, `GiftCardPurchaseService::start` creates a payable `type=gift_card` order → BML redirect → `OrderPaid` listener issues the card), online orders start `payment_pending` with kitchen print suppressed until `OrderPaid`, partial payments are supported, SMS via `SmsService` with idempotency keys, and secure random-token public pages (e-receipts, gift-card 48h view token).

## 2. Agreed product design

### Two menus, one catalog
Catering/event items are **separate item records** (their own price, size, packaging options, tax code, prep characteristics), gated to the **existing `catering` channel** and organized under dedicated catering categories. **No per-channel price overrides** — a catering tray is a different product, not a different price.

- **POS + online ordering:** show main-channel items by default, plus an expandable **"Event & catering items"** section. When a catering item is explicitly added, it orders through the normal flow (normal pricing/tax/packaging machinery — untouched).
- **Event/catering flow:** catering items by default, regular menu available too, **plus custom free-text lines** ("item name + qty + note", unpriced until staff quote them).
- **Prices are visible** on catering items everywhere (user decision).

### Event order lifecycle
1. **Customer builds an event order** in a wizard (reuse the orphaned `PreOrderPage` UI as the starting point): catering-first item picker, regular-menu section, custom lines, event date/details, OTP auth at confirm → saved as a **draft event order** attached to the catering pipeline.
2. **Staff review/edit in admin:** add/remove/edit lines, price custom lines, set fulfillment details, choose **the payment amount for this quote — full total or a specific deposit amount (staff decide per event)** → "Send to customer". **Each resend invalidates the previous link** (exactly one live quote version).
3. **Customer gets an SMS** with a secure random-token link → itemized quote page → **Approve & Pay**.
4. **On approve:** create a real `Order` in `payment_pending` → BML redirect (same pattern as gift-card purchase). On `OrderPaid`: event flips to confirmed, customer + staff notified, revenue flows through the normal orders/GST/reports pipeline. Deposit case: the order records the deposit as a partial payment; the balance is settled later via POS (partial payment already exists).
5. **Quote expiry is configurable** (site setting, e.g. "quote valid X days", and auto-invalidate at/near the event date). Expired links show "quote expired — contact us".

### Retirements folded in
Remove the pre-order IDOR page (or token-protect it), the orphaned wizard route ambiguity, unrouted `PreOrderApiController::store`, and dead corporate-inquiry API clients.

## 3. Cross-phase constraints (apply to every prompt)

- Money in **integer laari** (1 MVR = 100 laari) with rounding at boundaries; server is the **only price authority** — clients send item/option IDs and quantities, never prices. The single exception: **staff** pricing custom lines in the admin editor (permission-gated, like manual discounts).
- Public links use **random tokens** (≥32 chars, `Str::random`), never sequential IDs. SMS sends carry idempotency keys.
- **Do not modify:** `OrderTotalsCalculator` totals pipeline, `EffectiveDiscount`, gift-card tender logic, loyalty/promotions, packaging-fee math. New order lines must flow through the existing creation path (`OrderCreationService`) so all of that continues to apply automatically.
- Every phase: backend `vendor/bin/phpunit` fully green (new feature tests included), `npx vitest run` green in `apps/pos-web` and `apps/online-order-web`. If API item payloads change shape, regenerate contract snapshots deliberately (`UPDATE_SNAPSHOTS=true`, APP_URL=http://localhost:8000) and commit them.

---

## PHASE 1 — Catering menu foundation

```
Bake & Grill monorepo (Laravel backend in backend/, React apps in apps/pos-web, apps/online-order-web, apps/admin-dashboard). Read docs/CATERING-EVENTS-PLAN.md sections 1–3 for full context. This phase makes catering items real, orderable products shown as an optional section in POS and online ordering.

Current mechanics you build on:
- Every item has channel rows in item_channel_availability; the catering channel exists but is_enabled=false by default (ItemController ~line 350, Item.php ~line 206) and KitchenMenuResolver (backend/app/Domains/Kitchen/Services/KitchenMenuResolver.php) excludes 'catering' from ORDERING_CHANNELS (~line 25) and never maps an order type to it (channelForOrderType ~line 31).

TASKS:
1. Orderability: keep the catering channel out of channelForOrderType (order types still map to dine_in/takeaway/online_pickup/delivery), but ensure an item that is catering-enabled AND explicitly added to a cart passes availability checks in OrderCreationService/KitchenMenuResolver::assertLineItemsAllowedForOrderType. Smallest correct change wins — e.g. treat "enabled for catering" as satisfying line-item channel checks for any ordering channel, OR require catering items to also carry the ordering channel flag and have the admin toggle set both. Document the choice in a code comment. Menu LISTINGS stay channel-pure (catering items must NOT appear in default menus).
2. Admin curation (apps/admin-dashboard MenuPage): make the existing per-item catering-channel toggle prominent (a "Catering menu" badge/filter in the item list, filter dropdown "Catering items only"). No new editor — catering items are normal items with the catering channel enabled.
3. POS (apps/pos-web): in MenuGrid/menu source (src/api/menu.ts, PosMenuBuilder backend side), add a collapsed "Event & catering" section listing catering-enabled items (fetch via existing menu payloads extended with a catering flag, or a channel=catering query). Cashier expands it and adds items like any other; cart/pricing/packaging logic unchanged. Include catering items in the offline cached menu.
4. Online ordering (apps/online-order-web): same pattern — a collapsed "Event & catering menu" section on the menu page (visible only when at least one catering item exists), items show prices, add-to-cart works through the normal flow (ItemSheet, variants, packaging options all apply).
5. Backend menu payloads: extend PosMenuBuilder and the public menu/category serializers with the item's catering flag (e.g. channels: ['takeaway','catering'] or is_catering: true) so clients can filter. Regenerate contract snapshots.

TESTS: feature tests — catering-enabled item is orderable when explicitly in a payload for each order type; catering-only item does NOT appear in default channel menu listings; admin toggle round-trips. Vitest: POS menu section renders/filters catering items; cart math unchanged for catering items. Full suites green.

DO NOT: change any pricing/tax/packaging/discount logic; catering items must behave identically to normal items once in a cart.
```

## PHASE 2 — Event order builder (customer wizard → draft)

```
Bake & Grill monorepo. Read docs/CATERING-EVENTS-PLAN.md sections 1–3. Phase 1 (catering menu foundation) is merged: catering items are orderable, flagged in menu payloads. This phase gives customers an event-order wizard that saves a structured DRAFT into the catering pipeline, and retires the dead pre-order remnants.

Current mechanics:
- CateringRequest (backend/app/Models/CateringRequest.php): statuses new/contacted/quoted/confirmed/completed/cancelled; created via POST /api/catering-requests (CateringRequestController::store — honeypot, lead-time from catering_min_lead_hours setting, throttle 10/min); staff SMS via CateringRequestSubmitted event.
- Orphaned wizard UI: apps/online-order-web/src/pages/PreOrderPage.tsx (4-step: items → details → confirm-with-OTP → done) — unrouted; /order/pre-order currently renders CateringPage (src/main.tsx ~line 95).
- IDOR: GET /pre-order/{id}/confirmation (routes/web.php ~line 80, PreOrderController::confirmation) is unauthenticated + sequential id.

TASKS:
1. Migration: `catering_request_lines` — id, catering_request_id FK cascade, item_id nullable FK (null = custom line), variant_id nullable, name (snapshot or custom text, ≤160), quantity int ≥1, unit_price decimal(10,2) nullable (null until priced; catalog lines get server-resolved price snapshots), notes ≤500, is_custom bool, sort_order, timestamps. Add to catering_requests: `event_type` string nullable, `fulfillment_time` time nullable, plus keep all existing columns.
2. New statuses: extend CateringRequest::STATUSES with `draft` and `awaiting_customer` (full set: draft, new, contacted, quoted, awaiting_customer, confirmed, completed, cancelled). Existing rows/statuses untouched.
3. Endpoint POST /api/customer/event-orders (auth:sanctum + customer.token, throttle 10/min): payload = contact fields, occasion/event_type, event_date (validate against catering_min_lead_hours), headcount, notes, lines[] where each line is {item_id, variant_id?, quantity, notes?} OR {custom_name, quantity, notes?}. Server resolves catalog line names/prices from the DB (unit price = same effective-price resolution the order flow uses; snapshot it), custom lines stored with unit_price = null. Creates CateringRequest status `draft` + lines, fires CateringRequestSubmitted (staff SMS). Return a reference number (e.g. EV-YYYYMMDD-XXXX stored on the request) shown to the customer.
4. Wizard (apps/online-order-web): resurrect PreOrderPage.tsx as EventOrderPage at route /order/events (also point /order/pre-order there): step 1 item picker with CATERING items shown by default + expandable regular-menu section + "Add a custom item" (name/qty/note) rows; step 2 event details (date honoring the lead-time min, time, occasion, headcount, notes); step 3 OTP-authenticated confirm showing an itemized summary — catalog lines with prices, custom lines marked "to be quoted", and copy that staff will confirm the final quote; step 4 done screen with the reference number and "we'll SMS you the quote". Keep the existing CateringPage simple-inquiry form reachable (link from the wizard: "just want a callback?").
5. Retirements: delete the unrouted PreOrderApiController::store method; remove the IDOR route GET /pre-order/{id}/confirmation + PreOrderController::confirmation + its blade (historical pre-orders were already imported into catering_requests); remove dead corporate-inquiry API clients (apps/online-order-web submitCorporateInquiry in src/api/menu.ts, apps/admin-dashboard fetchCorporateInquiries/updateCorporateInquiryStatus in src/api/customer-growth.ts). Keep the backend legacy /api/corporate-inquiries POST alias (old clients).
6. Admin: CateringPage list must render draft rows (status filter includes draft) showing line count + custom-line count; full editing arrives in Phase 3 — read-only line display is enough here (GET /admin/customers/catering-requests/{id} returns lines).

TESTS: feature — draft creation with mixed catalog+custom lines (prices resolved server-side, client-sent prices ignored/rejected), lead-time validation, reference number uniqueness, IDOR route now 404s, legacy corporate alias still accepts. Vitest — wizard step flow, custom-line add/remove, catering-default item source. Full suites green.

DO NOT: touch Order/OrderItem creation, totals, or payment code in this phase — drafts live entirely in catering_request_lines.
```

## PHASE 3 — Staff quote editor + send for approval

```
Bake & Grill monorepo. Read docs/CATERING-EVENTS-PLAN.md sections 1–3. Phases 1–2 merged: catering menu live; customers create draft event orders with catalog + custom lines (catering_request_lines); admin sees drafts read-only. This phase lets staff edit/price/quote an event order and send it to the customer for approval.

Current mechanics: admin catering UI apps/admin-dashboard/src/pages/CateringPage.tsx + src/api/catering.ts (PATCH /admin/customers/catering-requests/{id}, permission customers.manage); SMS via SmsService with idempotency keys; token patterns in GiftCardController (view token) and ReceiptController.

TASKS:
1. Migration: add to catering_requests — `quote_token` (64, unique, nullable), `quote_sent_at`, `quote_expires_at`, `quote_payment_laar` bigInteger nullable (the amount the customer must pay online for THIS quote), `quote_is_deposit` bool default false, `quote_version` int default 1. Site settings: `catering_quote_valid_days` (default 7), `catering_quote_min_hours_before_event` (default 24).
2. Line editing endpoints (staff, permission customers.manage): PUT /admin/customers/catering-requests/{id}/lines — replaces the line set (add/remove/edit qty/notes; catalog lines re-resolve price server-side on item/variant change; custom lines accept a staff-entered unit_price ≥0 — this is the ONLY place a human-entered price is accepted, gated by the staff permission). Recompute and store a quote subtotal: sum(unit_price × qty) in laari over all lines; block sending while any custom line has null price. GST: quote display shows the same tax math an order of these lines would get — reuse a preview via the existing calculators, do NOT persist order totals here.
3. Send/resend: POST /admin/customers/catering-requests/{id}/send-quote with {payment_amount_mvr, is_deposit} — validates 0 < payment ≤ quote total (deposit) or equals total (full), regenerates quote_token (Str::random(48)), sets quote_sent_at=now, quote_expires_at=min(now + catering_quote_valid_days, event_date − catering_quote_min_hours_before_event), increments quote_version, sets status awaiting_customer, and SMSes the customer a link https://{app}/order/quote/{token} (SmsService, idempotency catering_quote:{id}:{version}). Any subsequent edit to lines invalidates: clears token + reverts status to quoted.
4. Admin UI (CateringPage or a detail drawer/page): line editor (qty steppers, remove, add catalog item via item search, price inputs enabled only on custom lines), quote summary (subtotal, tax preview, total), payment amount input + "deposit" toggle with validation, Send/Resend button showing version + expiry, and a status timeline. Keep all existing pipeline fields (staff_notes, pos_order_id, handled_by) working.
5. Public quote read endpoint: GET /api/event-quotes/{token} (public, throttle 30/min) → itemized quote (lines, totals, payment amount, deposit flag, expiry, status). 404 on unknown/cleared token; 410-style expired payload after quote_expires_at. No sequential IDs anywhere.

TESTS: feature — line replace re-resolves catalog prices (client prices ignored), custom price requires permission, send blocked with unpriced custom lines, deposit bounds validation, resend rotates token + old token dies, expiry computation (both min branches), public endpoint token/expiry behavior. Vitest — admin editor interactions. Full suites green.

DO NOT: create Orders or payments yet (Phase 4); do not touch OrderTotalsCalculator/discount/gift-card code.
```

## PHASE 4 — Customer approval, payment, confirmation

```
Bake & Grill monorepo. Read docs/CATERING-EVENTS-PLAN.md sections 1–3. Phases 1–3 merged: staff send tokened quotes (quote_token, quote_payment_laar, quote_is_deposit, quote_expires_at, status awaiting_customer). This phase completes the loop: customer approves and pays online; payment confirms the event.

Current mechanics to REUSE (this is the critical part):
- Gift-card purchase pattern: GiftCardPurchaseService::start creates a payable Order (type gift_card) → BML checkout URL → on OrderPaid a listener performs the domain action, idempotently. Mirror this exactly.
- Online orders: OrderCreationService::createFromPayload creates payment_pending orders with kitchen print suppressed until OrderPaid; BML flow in PaymentService (confirmPayment) marks paid and fires events; partial payment is supported (PartialPaymentTest).
- Order types: dine_in/takeaway/online_pickup/delivery/gift_card. KitchenMenuResolver::channelForOrderType maps catering-ish types to online_pickup for menu checks.

TASKS:
1. Quote page (apps/online-order-web, route /order/quote/{token}, public): renders the Phase-3 GET /api/event-quotes/{token} — itemized lines, tax, total, "Pay now: MVR X (deposit)" or full, expiry countdown, Approve & Pay button; expired/invalid states with a contact link.
2. Approval endpoint: POST /api/event-quotes/{token}/approve (public, throttle 10/min). Server-side, atomically (row lock on the catering request): validate token live + not expired + status awaiting_customer; create an Order via OrderCreationService with a new type `catering` (add to order-type enums/validation; channelForOrderType('catering') already maps to online_pickup — keep that): catalog lines as normal order items (server re-resolves prices; assert they match the quoted snapshots within 1 laar — on mismatch, 409 "quote outdated, ask staff to resend"), custom lines as order items with a designated "Custom catering item" placeholder item (create one seeded inactive item, is_active=false so it never appears in menus; unit_price from the staff-priced line — permitted because it comes from the persisted staff-priced quote, not the client). Order starts payment_pending, kitchen print suppressed. Store order_id on the catering request (pos_order_id), set status confirmed=false yet — keep awaiting_customer until paid. Then create the BML payment for quote_payment_laar (NOT necessarily the order total — deposit case) via the same PaymentService path gift cards use, and return the payment_url for redirect.
3. On OrderPaid for a catering-type order (new listener, afterCommit, idempotent per order): set catering request status=confirmed (stamp confirmed_at), SMS customer "Event confirmed — ref {reference}, paid MVR X{, balance MVR Y due on delivery}" and SMS staff notify phone. Deposit case: order remains partially_paid/partial per existing payment-status logic; balance is settled later via the normal POS addPayments flow (no new code — verify with a test).
4. Expiry sweep: scheduled command (hourly) that flips awaiting_customer requests past quote_expires_at back to quoted and clears the token (so the page shows expired even if opened later). Follow the AutoCancelNoShowReservations job/schedule pattern in routes/console.php.
5. Edge handling: approving twice (idempotent — second call returns the existing payment_url if still payment_pending), BML failure/abandon (order stays payment_pending; staff can resend quote which cancels the stale pending order via existing cancellation flow), staff editing after approval-but-unpaid (blocked while a live payment_pending order exists unless staff explicitly cancel it — enforce + test).

TESTS: feature — approve creates catering order with correct lines/prices and 1-laar snapshot guard; custom placeholder item never menu-visible; deposit payment leaves partial status and POS can settle balance; OrderPaid confirms + notifies idempotently; expired/rotated token rejected; double-approve idempotent; staff edit blocked while pending payment exists. Vitest — quote page states (live/expired/paid). Full backend + frontend suites green; regenerate contract snapshots if order payloads changed.

DO NOT: modify OrderTotalsCalculator/EffectiveDiscount/gift-card tender/loyalty logic. The catering order must flow through the existing pipeline untouched — that is the point of this design.
```

---

## Rollout notes

- Phases ship independently; each is valuable alone (1: catering upsell in POS/online; 2: structured event intake replacing free-text; 3: professional quoting; 4: online payment).
- After Phase 4, retire the "ring through POS with a manual discount" instruction from the admin catering page.
- GST: catering orders inherit standard item tax automatically. Confirm with the accountant that catering trays use the intended tax codes when creating the catering item records (data task, not code).
- Reservation-system fixes (settings-shape mismatch, overbooking guard) are a separate, unrelated backlog — deliberately not bundled here.
