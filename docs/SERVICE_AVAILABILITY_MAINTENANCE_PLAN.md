# Service Availability & Maintenance — Implementation Plan

**Repository:** `ampilarey/Bakeandgrill`
**Branch:** `claude/service-availability-maintenance-zj4whc`
**Status:** Plan only — no feature code written yet.
**Author's note:** This document separates **VERIFIED repository findings** (files actually read) from **RECOMMENDATIONS**. Every path in §2 was opened and read. Proposed new paths are marked **(new)**.

---

## 0. TL;DR for Cursor

- The repo **already has** a mature, well-tested availability layer: three `*GateService` classes (`OnlineOrderingGateService`, `DeliveryGateService`, `CateringOrderingGateService`), each a three-layer (override → master switch → schedule) evaluator over `SiteSetting`, asserted at exactly the customer write endpoints, exposed publicly at `GET /api/ordering/status`. **Do not rebuild these. Extend them.**
- Add a thin **maintenance overlay** (`ServiceAvailabilityService` + `service_states` table) that (a) composes the existing gates for pickup/delivery/catering, and (b) adds the genuinely new switches the gates don't cover: **online_checkout, online_payment, customer_registration, marketing_site**, plus Phase-4 internal/emergency locks.
- Add **restoration SMS signup** reusing `SmsService` / `MaldivesPhone` / the queued-job pattern — never synchronous, never marketing.
- **Close a real defect discovered:** the existing admin ordering toggles (`OnlineOrderingController`) write `SiteSetting` with **no audit-log entry**. This plan routes all availability changes through an audited service.
- Keep POS, KDS, delivery app, printing, admin, order tracking, payment callbacks/webhooks, and existing-order processing **always up** except under an explicit, separately-permissioned emergency lockdown.

---

## 1. Executive recommendation

### 1.1 Recommended service model (grouped, not dozens of flags)

**Public / customer services** (Phase 1–3):

| service_key | Backed by | New? | Effect when disabled |
|---|---|---|---|
| `online_ordering` | existing `online_ordering_enabled` | overlay only | Umbrella preset; disables pickup + delivery + checkout |
| `online_pickup` | existing online gate | adapter | Blocks `POST /api/customer/orders` (pickup) |
| `online_delivery` | existing delivery gate | adapter | Blocks customer delivery create |
| `online_checkout` | **new** | ✅ | Menu browsable, cart kept, order submission blocked (browse-only) |
| `online_payment` | **new** | ✅ | Blocks BML/Stripe **initiation**; COD/cash still offered; callbacks untouched |
| `catering_inquiry` | existing catering gate + public `POST /api/catering-requests` | adapter | Blocks new catering/event drafts + public catering form |
| `customer_registration` | **new** | ✅ | Blocks new account + guest-session creation; existing login stays |
| `marketing_site` | **new** | ✅ | Rare full Blade-site maintenance page (kept available by default) |

**Internal services** (Phase 4, default available, emergency only):

| service_key | New? | Effect |
|---|---|---|
| `pos_sales` | ✅ | Blocks new POS ticket creation only |
| `kds_operations` | ✅ | Blocks KDS state mutations |
| `delivery_operations` | ✅ | Blocks driver dispatch mutations |
| `emergency_write_lock` | ✅ | Master internal kill switch (all of the above) |

**Deliberately NOT switches** (must always work, or already covered):
`order_tracking`, `printing_operations`, `admin_operations`, `payment_callbacks/webhooks`, `queue processing` → never gated (always up). `online_menu` / `online_cart` → covered by `online_checkout` browse-only mode. `customer_login` → intentionally omitted (locking customers out of tracking their orders is harmful); registration is the only auth switch.

### 1.2 Recommended maintenance levels

- **Level 1 — Feature pause:** flip one `service_state` (e.g. `online_delivery` → `operational_pause`). This is the everyday path and reuses the existing per-channel gates.
- **Level 2 — Public transaction maintenance (preset):** one admin action sets `{online_checkout, online_payment, online_pickup, online_delivery, catering_inquiry}` → `unavailable`, leaves `marketing_site`, tracking, and all internal services up. Implemented as an atomic preset, not many clicks.
- **Level 3 — Emergency lockdown:** separate permission (`service_availability.emergency`), typed confirmation, mandatory reason, owner notification, plus an **env fallback** (`EMERGENCY_WRITE_LOCK`) that wins even if DB/admin is down. Disables `pos_sales`/`kds_operations`/`delivery_operations` write paths.

### 1.3 Recommended SMS notification model

One-time, incident-scoped, service-scoped restoration SMS. A `restoration_subscriptions` row binds `(normalized_mobile, service_key, service_incident_id)` uniquely. Sent **only** via queue after the admin explicitly confirms restoration and a light readiness check passes. Reuses `SmsService` (logging, idempotency, opt-out bypass for `transactional`), `MaldivesPhone` normalization, and the `SendSmsCampaignRecipientJob` retry pattern. Numbers are **not** added to `customers`/marketing.

### 1.4 What must NOT be built initially

Dependency graphs between services; automated health-check platform; incident analytics dashboards; multi-location; per-language SMS templates; customer self-unsubscribe portal; auto-send SMS on scheduled restore. All are "later, only if needed."

---

## 2. Repository findings (files actually inspected)

### Settings / source-of-truth
- `backend/app/Models/SiteSetting.php` — key/value store. `get()` caches raw value via `Cache::rememberForever("site_setting.{$key}")`; `set()` busts that key + `site_settings.public` + `site_settings.all`; preserves seeded `type/group/label/is_public` metadata on update. `allPublic()` cached.
- `backend/database/migrations/2026_03_15_003320_create_site_settings_table.php` — columns: `key` (unique), `value` (text null), `type`, `group`, `label`, `description`, `is_public`.
- `backend/database/migrations/2026_04_18_000002_seed_online_ordering_gate_settings.php` — seed pattern for gate settings via `DB::table('site_settings')->updateOrInsert(...)`; keys `online_ordering_enabled|schedule|override_until|closed_message`, `is_public: true`, so they auto-render in Admin → Settings.

### Existing availability gates (the reuse targets)
- `backend/app/Services/OnlineOrderingGateService.php` — three-layer: `overrideIsActive` → `masterSwitchOn` (`online_ordering_enabled`) → `parseSchedule` (`online_ordering_schedule`). API: `isOpen()`, `assertOpen()` (aborts 422), `closedMessage()`, `status()`. Uses `GateResult` value object.
- `backend/app/Services/DeliveryGateService.php` — layers: `delivery_override_until`, `delivery_accepting_orders`, `delivery_schedule`, `delivery_zones`, `delivery_max_active_orders`. `status()` returns `delivery_open`, `next_delivery_window`, capacity fields.
- `backend/app/Services/CateringOrderingGateService.php` — mirror of online gate over `catering_ordering_*`.
- `backend/app/Services/OpeningHoursService.php`, `ItemAvailabilityService.php` (Wave C engine — item flags → channel/ICA → online gate → prepared stock), `StockReservationService.php`, `PosMenuBuilder.php` (POS deliberately skips online gate).
- Docs: `docs/WAVE_B_ONLINE_ORDERING_GATE.md`, `docs/WAVE_C_AVAILABILITY.md`, `docs/WAVE_E_DELIVERY_DEPTH.md`.

### Enforcement points (where gates are asserted today)
- `backend/app/Http/Controllers/Api/Orders/OrderCreationController.php:291` — `storeCustomer()` calls `OnlineOrderingGateService::assertOpen()` (pickup). POS `store()` never gated.
- `backend/app/Http/Controllers/Api/DeliveryOrderController.php:53` — customer branch: online gate then `DeliveryGateService`. Staff branch bypasses.
- `backend/app/Http/Controllers/Api/EventOrderController.php:84` — `CateringOrderingGateService::assertOpen()`.
- `backend/app/Http/Controllers/Api/PaymentController.php:23` — `initiateOnline()` (BML). **No availability gate today.** Webhook path is `BmlWebhookController`.
- `backend/app/Http/Controllers/Api/CateringRequestController.php` — public `store()` (`POST /api/catering-requests`, throttle:10,1) — **no gate today.**

### Admin controls (today)
- `backend/app/Http/Controllers/Api/OnlineOrderingController.php` — `toggle/override/updateSchedule` + delivery + catering variants. Writes `SiteSetting::set(...)` directly. **DEFECT: no `AuditLogService` call anywhere** (verified by grep — zero matches).
- Routes: `backend/routes/domains/staff.php:35-46` — `admin/ordering/*` under `permission:settings.update`; `admin/delivery/*`, `admin/ops/*` likewise.
- Public status: `backend/routes/api.php:41-48` — `GET /ordering/status`, `/ordering/catering-status`, `/ordering/delivery-status` (throttle:120,1).

### Routes / middleware
- `backend/routes/api.php`, `backend/routes/domains/{orders,auth,payments,kitchen,staff,catalog}.php`.
- `backend/routes/domains/payments.php` — webhook `POST /payments/bml/webhook` (`withoutMiddleware` CSRF, throttle only), Stripe `POST /stripe/webhook`, customer `POST /orders/{orderId}/pay/bml`. **Webhooks must stay open.**
- `backend/app/Http/Middleware/RequirePermission.php` (alias `permission:`), `RequireAnyPermission.php` (`permission.any:`), `EnsureStaffToken.php`, `EnsureCustomerToken.php`, `VerifyBmlSignature.php`, `SecurityHeaders.php`.

### Permissions
- `backend/app/Domains/Permissions/PermissionCatalog.php` — single source of truth: `definitions()` (slug/name/group) + `SATISFIED_BY` legacy-alias map + role defaults. Existing relevant slugs: `settings.update`, `settings.manage`, `website.manage`, `roles_permissions.manage`.
- `backend/app/Domains/Permissions/PermissionCatalogSync.php`, `Providers/PermissionsServiceProvider.php`, `Services/PermissionService.php` (real impl; `app/Services/PermissionService.php` is a deprecated shim).

### Audit
- `backend/app/Services/AuditLogService.php` — `log(action, modelType, modelId, old, new, meta, ?request)`. Only logs `user_id` for `User` (not `Customer`).
- `backend/app/Models/AuditLog.php`; table `2026_01_27_193017_create_audit_logs_table.php` — `user_id`, `action`, `model_type`, `model_id`, `old_values` json, `new_values` json, `meta` json, `ip_address`, `user_agent`, indexed on `action`, `model_type`, `created_at`.

### SMS / phone
- `backend/app/Domains/Notifications/Services/SmsService.php` — `send(SmsMessage): SmsLog`. Normalizes via `MaldivesPhone`; logs every attempt to `sms_logs`; 24h idempotency window on `idempotency_key`; `NON_SUPPRESSIBLE_TYPES = ['otp','transactional']` bypass opt-out; others honor `customers.sms_opt_out`; GSM7/UCS2 segment + cost estimation.
- `backend/app/Domains/Notifications/DTOs/SmsMessage.php` — `to, message, type, customerId?, campaignId?, referenceType?, referenceId?, idempotencyKey?`.
- `backend/app/Domains/Notifications/Contracts/SmsProviderInterface.php`; `Providers/DhiraaguSmsProvider.php`.
- `backend/app/Domains/Notifications/Jobs/SendSmsCampaignRecipientJob.php` — queued send template: `tries=3, backoff=60, timeout=60`, marks recipient sent/failed, `failed()` → Sentry.
- `backend/app/Support/PhoneNormalizer.php` → `backend/app/Rules/MaldivesPhone.php` — accepts `7XXXXXX` / `960XXXXXXX` / `+9607XXXXXX`, normalizes to `+960XXXXXXX`, throws on invalid. Mobile prefixes `[3679]`.
- `backend/app/Models/SmsLog.php` — `message, to, type, status(queued|sent|failed|suppressed|demo), encoding, segments, cost_estimate_mvr, gateway_response, error_message, provider, customer_id, campaign_id, reference_type, reference_id, idempotency_key, sent_at`.
- Staff-alert reuse: `backend/app/Domains/Sms/Services/StaffNotificationDispatcher.php`, `StaffNotificationLog.php`, `StaffNotificationPref.php`.

### Scheduler / queue
- `backend/routes/console.php` — `Schedule::command/job` with `withoutOverlapping()`, `onFailure($alertOnFailure)` (Log::critical + Sentry) and `after($trackSuccess)` (`SchedulerRunTracker`). Existing minute cadence: `sms:dispatch-scheduled` (every minute), `orders:cancel-stale` (5 min), `webhooks:check-failed`, `jobs:alert-failed`.
- `backend/app/Domains/System/Services/SchedulerRunTracker.php`, `SystemHealthService.php`.
- Queue: `backend/config/queue.php` default from `QUEUE_CONNECTION`; `.env.example` sets `QUEUE_CONNECTION=redis`, `CACHE_STORE=redis`, Horizon (`php artisan horizon`). Timezone `Indian/Maldives` (`backend/config/app.php:70`, UTC+5).

### Frontend — customer order app (`apps/online-order-web`)
- Served at `/order/*` (Blade catch-all in `backend/routes/web.php`). Marketing site is Blade: `HomeController` at `/`, `/contact`, `/hours`, `/terms`, `/refund`; `/menu` 301→`/order/menu`.
- `src/api/menu.ts` — `OnlineOrderingStatus` type, `fetchOnlineOrderingStatus()` → `/api/ordering/status`; `fetchPreorderStatus()`, `fetchDeliveryZoneStatus()`.
- `src/pages/MenuPage.tsx:180-184` — reads gate: `setIsOpen(gate.open)`, `setDeliveryAvailable(gate.delivery_available)`.
- `src/context/OrderModeContext.tsx` (pickup/delivery), `CartContext.tsx`, `AuthContext.tsx`, `SiteSettingsContext.tsx`.
- `src/pages/{MenuPage,CheckoutPage,CateringPage,ContactPage,OrderStatusPage,AccountPage}.tsx`; `src/components/{OpeningStatusBadge,OrderModeToggle,CartDrawer,CartSheet,Layout}.tsx`.
- **PWA:** hand-rolled `public/sw.js` — `CACHE_VERSION='bg-pwa-v8'`; **network-first** for `/api/ordering/status` (fresh online, stale only offline); network-only for non-cacheable APIs; registered in `apps/online-order-web/index.html:87-104` at `/order/sw.js` with update-on-controllerchange.

### Frontend — admin (`apps/admin-dashboard`)
- `src/pages/OnlineOrderingPage.tsx` (route `/online-ordering`, nav label "Ordering Control", `permission: settings.update`), `DeliverySettingsPage.tsx`.
- `src/components/navConfig.ts` — `NAV_GROUPS`; ordering controls live in the **Manage** group. `src/App.tsx` lazy routes (`OnlineOrderingPage` at line 56).
- `src/pages/SmsPage.tsx`, `SettingsPage/`, `SystemHealthPage.tsx`, `ActivityPage.tsx` (audit-log/POS-events viewer).

### Tests
- `backend/tests/Feature/` — `OnlineOrderingGateTest.php`, `DeliveryGateTest.php`, `DeliverySettingsTest.php`, `ItemAvailabilityServiceTest.php`, `SmsLoggingTest.php`, `OrderingThrottleTest.php`, plus `tests/Feature/Ordering/`, `tests/Feature/SmsModule/`. `RefreshDatabase`, Sanctum, `Tests\Concerns\PreparesPosApi`.

---

## 3. Current architecture & overlapping controls

**Behavioural summary:** availability is decided by per-channel gate services reading `SiteSetting`, asserted only on **customer** write endpoints; POS/staff always bypass. The order app treats `/api/ordering/status` as SSOT for its banners. Item-level 86ing is separate (`KitchenMenuState`, `ItemChannelAvailability`, `KDS /kds/items/{id}/86`).

**Overlap map & resolution (no second source of truth):**

| Existing control | Setting keys | Decision |
|---|---|---|
| Online ordering master/schedule/override | `online_ordering_*` | **Keep as SSOT.** New `online_pickup`/`online_ordering` states are an **overlay adapter** — resolver reads the legacy gate AND the overlay; unavailable if either says so. |
| Delivery accept/schedule/zones/capacity/override | `delivery_*` | **Keep as SSOT.** `online_delivery` overlay adds maintenance reason + incident/subscription only. |
| Catering accept/schedule/override | `catering_ordering_*` | **Keep as SSOT.** `catering_inquiry` overlay adds maintenance + gates the public `catering-requests` form (currently ungated). |
| Opening hours | `OpeningHoursService` | Untouched (café hours ≠ service maintenance). |
| Item/channel availability, 86 | `ItemAvailabilityService`, KDS 86 | Untouched (item scope ≠ service scope). |
| Payment method switches | payment settings | `online_payment` state is the new authoritative switch for **initiation**; existing per-method config unchanged. |
| Global Laravel maintenance mode | `php artisan down` | **Not used** for public maintenance (violates "keep marketing site up"). Reserved conceptually for total outage only. |

**Compatibility layer required:** yes — `ServiceAvailabilityService` composes legacy gates + overlay so admins get one page while legacy settings and the order app's existing `/ordering/status` keep working unchanged.

---

## 4. Proposed architecture

- **Source of truth:** DB table `service_states` (one row per `service_key`) for the maintenance overlay + genuinely-new switches. Legacy `SiteSetting` gate keys remain SSOT for pickup/delivery/catering scheduling. `ServiceAvailabilityService` is the single resolver that merges them.
- **Service keys:** as §1.1 (seeded, default `available`).
- **Status model (enum `status`):** `available`, `operational_pause`, `scheduled_maintenance`, `unavailable` (technical), `emergency_disabled`. Only these five — each changes behaviour or copy.
- **Reason model (enum `reason_type`):** `technical_maintenance`, `operational_pause`, `payment_issue`, `emergency`, `scheduled`. Drives the reason category surfaced to reporting and (softly) the customer message.
- **Incident model:** `service_incidents` append-only episode per unavailable window (opened on available→unavailable, closed on restore). Carries `public_message` snapshot and links `restoration_subscriptions`. Doubles as history + reporting; audit-log also records each transition.
- **Caching:** DB is SSOT; `ServiceAvailabilityService` caches the resolved snapshot in Redis under `service_availability.snapshot` with **short TTL (30 s)** AND explicit bust on every admin write. Rationale: bust makes disables effective immediately; 30 s TTL bounds staleness if a bust is ever missed and survives brief DB blips. **Never** cache "available" long enough to keep checkout open after a disable. If cache store is unavailable, resolver falls back to a direct DB read; if DB is unavailable, resolver treats **public transactional** services as **unavailable** (fail-safe) while leaving read/tracking paths open, and honors the env emergency flag.
- **Backend guards:** a central resolver + explicit action-level `assertAvailable(key)` calls at write endpoints (mirroring today's `assertOpen()`), plus a small route middleware `service.available:{key}` for whole-route cases (public forms). **No single global middleware** — that would risk webhooks/queues/tracking.
- **Public status API:** extend the existing `GET /api/ordering/status` response with a `services` map (additive, non-breaking) and add `GET /api/service-status` as the canonical multi-surface endpoint (order app + Blade site both read it).
- **Admin controls:** new `ServiceAvailabilityController` (`/api/admin/service-availability/*`) writing through `ServiceAvailabilityService` (audited). The existing `OnlineOrderingController` toggles are refactored to delegate to the same service so both paths stay consistent and audited.
- **Emergency fallback:** env `EMERGENCY_WRITE_LOCK` / `PUBLIC_TRANSACTIONS_DISABLED` read by the resolver.
- **Precedence (highest first):** `1)` env emergency flags → `2)` `emergency_disabled` state / emergency_write_lock → `3)` explicit `service_states` overlay (unavailable/paused/scheduled) → `4)` legacy gate result (schedule/capacity/master) → `5)` available. Admin/staff **bypass** only applies at levels 3–4 for permitted roles, **never** at levels 1–2.

---

## 5. Data model

### 5.1 `service_states` (new) — enforcement SSOT, one row per key

| Field | Type | Null | Default | Index | Purpose |
|---|---|---|---|---|---|
| id | bigint PK | no | auto | PK | — |
| service_key | string(64) | no | — | **unique** | e.g. `online_checkout` |
| group | string(32) | no | `public` | index | `public` \| `internal` |
| status | string(32) | no | `available` | index | enum §4 |
| reason_type | string(32) | yes | null | — | enum §4 |
| public_message | string(500) | yes | null | — | customer copy (plain text, escaped) |
| internal_note | string(500) | yes | null | — | staff-only note |
| alternatives | json | yes | null | — | e.g. `["pickup","cash"]` for message hints |
| allow_existing_operations | boolean | no | true | — | existing orders keep flowing |
| allow_admin_bypass | boolean | no | true | — | staff/admin can still act |
| starts_at | datetime | yes | null | index | scheduled activation |
| ends_at | datetime | yes | null | index | scheduled auto-restore |
| current_incident_id | bigint FK | yes | null | index | open incident when unavailable |
| notify_enabled | boolean | no | true | — | show "notify me" for this outage |
| changed_by | bigint FK(users) | yes | null | — | last actor |
| created_at/updated_at | timestamps | — | — | — | — |

### 5.2 `service_incidents` (new) — episodes for subscriptions + history

| Field | Type | Null | Default | Index | Purpose |
|---|---|---|---|---|---|
| id | bigint PK | no | auto | PK | — |
| service_key | string(64) | no | — | index | — |
| incident_type | string(32) | no | — | — | mirrors reason_type at open |
| status | string(16) | no | `open` | index | `open` \| `restored` |
| public_message | string(500) | yes | null | — | snapshot of copy shown |
| internal_note | string(500) | yes | null | — | — |
| started_at | datetime | no | now | index | — |
| scheduled_end_at | datetime | yes | null | — | if scheduled |
| restored_at | datetime | yes | null | — | close time |
| created_by | bigint FK(users) | yes | null | — | — |
| restored_by | bigint FK(users) | yes | null | — | — |
| notified_count | int | no | 0 | — | subscribers messaged at restore |
| created_at/updated_at | timestamps | — | — | — | — |

Partial-unique intent: **at most one `open` incident per `service_key`** (enforce in service logic; DB can't easily express partial-unique on MySQL without generated column — document as invariant + covered by test).

### 5.3 `restoration_subscriptions` (new)

| Field | Type | Null | Default | Index | Purpose |
|---|---|---|---|---|---|
| id | bigint PK | no | auto | PK | — |
| service_key | string(64) | no | — | index | — |
| service_incident_id | bigint FK | yes | null | index | binds to the outage |
| normalized_mobile | string(20) | no | — | part of unique | `+960XXXXXXX` |
| status | string(16) | no | `pending` | index | `pending`\|`notified`\|`failed`\|`cancelled` |
| consent_text_version | string(16) | no | — | — | e.g. `v1` |
| requested_at | datetime | no | now | — | — |
| notified_at | datetime | yes | null | — | — |
| failed_at | datetime | yes | null | — | — |
| attempts | tinyint | no | 0 | — | send attempts |
| sms_log_id | bigint FK(sms_logs) | yes | null | — | delivery record |
| request_ip_hash | string(64) | yes | null | — | abuse forensics (hashed) |
| created_at/updated_at | timestamps | — | — | — | — |

**Unique:** `(service_incident_id, normalized_mobile)` — one active signup per number per incident. Fallback unique `(service_key, normalized_mobile)` when `service_incident_id` is null (rare).

**Lifecycle:** `pending` → (restore + queue) → `notified` (on `sent`) or `failed` (after retries). On new incident for same key, prior rows stay historical; new signups bind to the new `service_incident_id` → no stale reuse. **Retention:** anonymize `normalized_mobile` (null it, keep hash) 30 days after `notified_at`/`failed_at` via a scheduled prune command; never copy into `customers`.

**Models (new):** `App\Models\ServiceState`, `App\Models\ServiceIncident`, `App\Models\RestorationSubscription`.

---

## 6. Backend changes

> Convention: services in `app/Services` or `app/Domains/System/Services`; controllers in `app/Http/Controllers/Api`; form requests in `app/Http/Requests`; API resources in `app/Http/Resources`.

### New

- **`app/Domains/System/Services/ServiceAvailabilityService.php` (new)** — the resolver & write hub.
  - `resolve(): array` — merged snapshot of every key (cached 30 s + bust).
  - `state(string $key): ServiceState`, `isAvailable(string $key): bool`.
  - `assertAvailable(string $key, array $ctx = []): void` — throws `ServiceUnavailableException` (structured, §12) mirroring current `abort(422)` ergonomics.
  - `setState(string $key, array $attrs, User $actor, ?Request $req): ServiceState` — writes `service_states`, opens/closes `service_incidents`, audits, busts cache, fires staff notification, emits event.
  - `applyPreset(string $preset, User $actor, ...)` — Level-2 / delivery-only / lockdown presets atomically (`DB::transaction`).
  - Composition helpers delegating to `OnlineOrderingGateService`, `DeliveryGateService`, `CateringOrderingGateService` for pickup/delivery/catering keys.
  - Env precedence: reads `config('service_availability.emergency_write_lock')`, `...public_transactions_disabled')`.
  - **Integrates:** `SiteSetting`, the three gate services, `AuditLogService`, `StaffNotificationDispatcher`. **Risk:** must not double-count — for adapter keys, legacy gate remains authoritative for schedule; overlay only *adds* restrictions (logical OR of "closed").
- **`app/Exceptions/ServiceUnavailableException.php` (new)** — carries `service_key`, `public_message`, `alternatives`, `retry_at`, `notify_enabled`; rendered to the §12 JSON shape (HTTP 503 for maintenance, see §12 rationale).
- **`app/Http/Middleware/EnsureServiceAvailable.php` (new)** — alias `service.available:{key}`; calls `assertAvailable`. For whole-route public forms (catering, registration). Registered in `bootstrap/app.php`.
- **`app/Http/Controllers/Api/ServiceAvailabilityController.php` (new)** — admin CRUD + presets + restore + notify (endpoints §12). Permission-gated.
- **`app/Http/Controllers/Api/ServiceStatusController.php` (new)** — public `GET /api/service-status` (throttled).
- **`app/Http/Controllers/Api/RestorationSubscriptionController.php` (new)** — public `POST /api/service-status/notify-me` (throttled, generic success).
- **`app/Http/Requests/StoreRestorationSubscriptionRequest.php` (new)** — `service_key` in allowed public keys, `mobile` validated by `MaldivesPhone`, optional `incident_id`.
- **`app/Http/Requests/UpdateServiceStateRequest.php` (new)** — validates status/reason enums, message length, schedule, typed confirmation for high-impact keys.
- **`app/Http/Resources/ServiceStateResource.php`, `ServiceStatusResource.php` (new)**.
- **`app/Jobs/SendRestorationSmsJob.php` (new)** — queued (`tries=3, backoff=60`), one subscription per job, builds message via a small `RestorationSmsBuilder`, calls `SmsService::send(new SmsMessage(type:'transactional', idempotencyKey:"restore:{incident}:{sub}"))`, marks `notified`/`failed`, increments `service_incidents.notified_count`. Mirrors `SendSmsCampaignRecipientJob`.
- **`app/Support/RestorationSmsBuilder.php` (new)** — per-service copy + one short link (reuse `OrderTrackingUrl`/short-link helper style).
- **`app/Console/Commands/ActivateScheduledServiceStates.php` (new)** — idempotent; applies `starts_at`/`ends_at` transitions.
- **`app/Console/Commands/PruneRestorationSubscriptions.php` (new)** — anonymize old rows.
- **`config/service_availability.php` (new)** — key catalog, presets, env flags, consent text + version, cache TTL.
- **`database/seeders/ServiceStateSeeder.php` (new)** — seed all keys `available` (idempotent `updateOrInsert`).
- **Events (new):** `app/Domains/System/Events/ServiceStateChanged.php`, `ServiceRestored.php` (+ optional staff-notify listener).

### Modified

- **`app/Http/Controllers/Api/OnlineOrderingController.php`** — refactor `toggle/override/*` to delegate to `ServiceAvailabilityService::setState(...)` so they become **audited** (closes the discovered defect) and stay consistent. Keep response shapes identical. **Risk:** behaviour must be byte-compatible for the existing admin page & order app; guard with regression tests.
- **`app/Http/Controllers/Api/Orders/OrderCreationController.php`** — in `storeCustomer()` add `assertAvailable('online_checkout')` (and keep existing `OnlineOrderingGateService::assertOpen()` — now also covered by `online_pickup` adapter). Order: checkout first, then pickup/slot.
- **`app/Http/Controllers/Api/DeliveryOrderController.php`** — customer branch: `assertAvailable('online_checkout')` + `online_delivery` (delegated). Staff branch unchanged.
- **`app/Http/Controllers/Api/PaymentController.php`** — `initiateOnline()` / `initiatePartial()`: add `assertAvailable('online_payment')` **before** gateway call. **Do not** touch `bmlReturn`, `BmlWebhookController`, `StripeController::webhook`.
- **`app/Http/Controllers/Api/EventOrderController.php`** — add `assertAvailable('catering_inquiry')` alongside existing catering gate.
- **`app/Http/Controllers/Api/CateringRequestController.php`** — gate public `store()` with `service.available:catering_inquiry`.
- **Registration/guest paths** (`CustomerAuthController::guestSession`, and the account-creation path) — add `assertAvailable('customer_registration')`. **Do not** gate OTP request/verify/login/check.
- **`app/Http/Controllers/Api/OnlineOrderingController.php@status`** — append `services` map to the existing `/ordering/status` response (additive).
- **`routes/api.php`** — register `GET /service-status`, `POST /service-status/notify-me` (public, throttled).
- **`routes/domains/staff.php`** — add `admin/service-availability/*` group under new permissions.
- **`routes/console.php`** — schedule `ActivateScheduledServiceStates` (every minute, `withoutOverlapping`, `onFailure`/`after` like siblings) and `PruneRestorationSubscriptions` (daily).
- **`bootstrap/app.php`** — register `service.available` middleware alias; ensure `payments/bml/webhook` & health remain outside any availability middleware.
- **`app/Domains/Permissions/PermissionCatalog.php`** — add permission slugs (§13) + role defaults + `SATISFIED_BY` (`service_availability.emergency` satisfied by nothing weaker; `service_availability.manage_public` satisfied by `settings.update` for back-comfort — **decide explicitly**, see §17).

---

## 7. Public website (Blade marketing site) changes

- **Controller:** `app/Http/Controllers/HomeController.php` — inject `ServiceAvailabilityService`; pass a `$serviceBanner` (for `online_checkout`/`online_ordering` maintenance) and `$marketingSiteState` to views.
- **Layout/partial (new):** `resources/views/partials/service-banner.blade.php` — a reusable, mobile-first, accessible (`role="status"`, aria-live polite) banner. Included in the main layout (`resources/views/layouts/*` — confirm exact layout during impl) so it shows on `/`, `/contact`, `/hours`.
- **Behaviour:**
  - `marketing_site = unavailable` → `HomeController` returns a dedicated `resources/views/maintenance.blade.php` (**not** `php artisan down`) with brand, hours, phone, address, socials, and (if enabled) the notify-me form. Rare path.
  - Online ordering/checkout down → site fully browsable; banner reads e.g. "Online ordering is temporarily unavailable — call us at {phone} or visit us." with alternatives from `alternatives`.
  - `/menu` already 301→`/order/menu`; the order app owns the deep maintenance UX.
- **Data source:** Blade reads server-side via the injected service (no extra client fetch needed); the notify-me form posts to `POST /api/service-status/notify-me`.

---

## 8. React order-app (`apps/online-order-web`) changes

- **API client:** extend `src/api/menu.ts` (or new `src/api/serviceStatus.ts`) — `fetchServiceStatus()` → `GET /api/service-status`; extend `OnlineOrderingStatus` with optional `services` map (back-compatible with older servers).
- **Hook (new):** `src/hooks/useServiceStatus.ts` — fetches on mount, refetches on window focus + a short interval (e.g. 60 s) and after any 503 `SERVICE_UNAVAILABLE` response; exposes `isAvailable(key)`, messages, `retryAt`, `notifyEnabled`.
- **Context (new/optional):** `src/context/ServiceStatusContext.tsx` — provider so banner + gating share one fetch.
- **Banner:** reuse/extend `src/components/OpeningStatusBadge.tsx` or add `src/components/ServiceBanner.tsx` — appears early in `Layout.tsx`; per-service copy + alternatives; mobile-first, `aria-live`.
- **Disabled states / checkpoints** (backend remains authoritative):
  - `MenuPage.tsx` — when `online_checkout` down → **browse-only**: items visible, cart preserved, add-to-cart shows maintenance affordance, checkout CTA disabled with message. This is the **default** for public order maintenance.
  - `OrderModeToggle.tsx` — disable `delivery`/`pickup` per `online_delivery`/`online_pickup`.
  - `CheckoutPage.tsx` — re-check before submit; disable "Place order" when `online_checkout`/relevant type down; show modal, not silent failure.
  - Payment step — before BML/Stripe initiation, check `online_payment`; if down, hide online-pay and steer to COD/cash; show message.
  - `CateringPage.tsx` — gate submit on `catering_inquiry`.
  - Account/guest creation — gate on `customer_registration`; keep login/tracking working.
- **Modal / drawer (new):** `src/components/ServiceUnavailableModal.tsx` — identifies the service, lists alternatives (Order pickup instead / Call / Return to menu / Track existing order), and hosts the notify-me form.
- **Notify-me form (new):** `src/components/NotifyMeForm.tsx` — mobile input (client-side MV format hint, server authoritative), consent line, posts to `/api/service-status/notify-me`; renders generic success + "already registered" identically (no enumeration).
- **Backend error handling:** central API layer maps HTTP 503 + `code: SERVICE_UNAVAILABLE` to a typed error that opens the modal and refreshes status — so **stale PWA/older bundles** that attempt a disabled action get a graceful, correct UX instead of a raw failure.
- **PWA (`public/sw.js`):** bump `CACHE_VERSION` to `bg-pwa-v9` on release. `/api/service-status` must be **network-first with a very short cache** (add to `CACHEABLE_API_PATTERNS` only if offline browse is desired) — but never allow a cached "available" to enable a write; since all writes are network-only and the backend rejects disabled actions, the SW change is low-risk. Document: client cache is UX-only; **backend is authoritative**.

---

## 9. Admin panel (`apps/admin-dashboard`) changes

- **New page:** `src/pages/ServiceAvailabilityPage.tsx` — name **"Service Availability"** (fits existing "…Settings/Control" terminology; distinct from "Ordering Control" which stays as the schedule/fees page and links here).
- **Nav:** add to `src/components/navConfig.ts` **System & Team** group (internal/emergency) with a shortcut card in **Manage**; permission `service_availability.view`. Register lazy route in `src/App.tsx` (`/service-availability`).
- **Layout:**
  - **Status cards** grouped Public vs Internal; each shows current status chip, reason, public message, schedule window, waiting-subscriber count, last changed by/at.
  - **Presets** row: "Pause all online ordering", "Pause delivery only", "Public maintenance mode", "Emergency lockdown" — each opens a **preview** of exactly which keys change before confirm.
  - **Edit drawer** per service: status, reason category, public message (with **live customer preview**), internal note, alternatives, `starts_at`/`ends_at`, admin-bypass toggle.
  - **Restore flow:** for a down service, show waiting count + proposed SMS text + "Restore & review notifications" → restore first, then a separate explicit "Send N notifications" button (queued).
  - **Audit history:** per-service change list (reads `audit_logs` filtered by model_type/key) — reuse `ActivityPage` patterns.
- **Safeguards:** confirmation dialog + mandatory reason on any disable; **stronger typed confirmation** ("EMERGENCY LOCKDOWN", "DISABLE POS") for internal/emergency keys, enforced client- and server-side; warning banner listing affected apps.
- **Mobile admin:** cards stack; presets and confirmations remain reachable (owner may act from phone during an incident).
- **API client:** `src/api/serviceAvailability.ts` — typed calls to the admin endpoints.

---

## 10. SMS restoration workflow (full lifecycle)

1. **Submission:** customer submits mobile + consent on `NotifyMeForm` → `POST /api/service-status/notify-me` `{service_key, mobile, incident_id?}` (throttled per-IP and per-phone).
2. **Validation:** `MaldivesPhone` rule; `service_key` must be a currently-`notify_enabled` public key.
3. **Normalization:** `MaldivesPhone::normalize()` → `+960XXXXXXX`.
4. **Incident association:** resolve the current **open** `service_incidents` row for the key; bind `service_incident_id`. If none open, bind by `service_key` with null incident (edge case).
5. **Deduplication:** `firstOrCreate` on `(service_incident_id, normalized_mobile)`. Duplicate → return the same generic success (no "you already signed up" leak beyond a soft UI hint).
6. **Consent storage:** persist `consent_text_version` from `config/service_availability.php`.
7. **Admin restoration:** admin sets state back to `available` → `ServiceAvailabilityService` closes the incident (`restored_at`, `restored_by`).
8. **Readiness check (light):** before dispatch, verify resolved status is truly `available` for that key (and, for `online_payment`, that a payment method is enabled; for `online_checkout`, pickup/delivery reachable). No health-monitoring platform — a single guard + **mandatory admin confirm**.
9. **Queue dispatch:** admin clicks "Send N notifications" → chunked dispatch of `SendRestorationSmsJob` per pending subscription (never synchronous).
10. **Sending:** job calls `SmsService::send(SmsMessage type:'transactional', idempotencyKey:"restore:{incident}:{sub}")` → one SMS, logged in `sms_logs`, opt-out bypassed (transactional), duplicate-safe.
11. **Retry:** `tries=3, backoff=60`; `failed()` → mark `failed`, record `failed_at`, Sentry. No uncontrolled resend.
12. **Completion:** on `sent` → `status=notified`, `notified_at`, `sms_log_id`; increment `service_incidents.notified_count`.
13. **Retention:** `PruneRestorationSubscriptions` anonymizes `normalized_mobile` 30 days post-terminal; numbers never enter `customers`/marketing.

**SMS copy (config-driven):** e.g. `"Bake & Grill online ordering is back. Order pickup or delivery: {link}"` — identifies brand, names restored service, one link, no promo.

---

## 11. Service behaviour matrix

Legend: ✅ available/works · ⛔ blocked (new actions) · ▶️ continues (existing/in-flight) · 🔔 notify-me offered.

| Surface / action | Normal | Delivery paused | Pickup paused | Checkout maint. | Payment maint. | Public txn maint. (L2) | Marketing-site maint. | Emergency lockdown (L3) |
|---|---|---|---|---|---|---|---|---|
| Marketing website | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⛔(maint page) | ✅ |
| Menu browsing (order app) | ✅ | ✅ | ✅ | ✅(browse-only) | ✅ | ✅(browse-only) | ✅ | ✅ |
| Cart (kept) | ✅ | ✅ | ✅ | ▶️ kept | ✅ | ▶️ kept | ✅ | ▶️ kept |
| Checkout submit | ✅ | ✅(pickup) | ✅(delivery) | ⛔🔔 | ✅(COD) | ⛔🔔 | ✅ | ⛔ |
| Pickup order create | ✅ | ✅ | ⛔🔔 | ⛔ | ✅ | ⛔🔔 | ✅ | ⛔ |
| Delivery order create | ✅ | ⛔🔔 | ✅ | ⛔ | ✅ | ⛔🔔 | ✅ | ⛔ |
| Online payment initiation | ✅ | ✅ | ✅ | ⛔ | ⛔🔔(→COD) | ⛔ | ✅ | ⛔ |
| Payment callbacks / webhooks | ▶️ | ▶️ | ▶️ | ▶️ | ▶️ | ▶️ | ▶️ | ▶️ |
| Catering inquiry submit | ✅ | ✅ | ✅ | ✅ | ✅ | ⛔🔔 | ✅ | ⛔ |
| Customer registration/guest | ✅ | ✅ | ✅ | ✅ | ✅ | ⛔(login ✅) | ✅ | ⛔ |
| Order tracking | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| POS sales | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⛔ |
| KDS operations | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⛔(read ✅) |
| Delivery app (drivers) | ✅ | ✅(existing ▶️) | ✅ | ✅ | ✅ | ✅ | ✅ | ⛔ dispatch (▶️ in-flight) |
| Printing | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Admin panel | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Queues | ▶️ | ▶️ | ▶️ | ▶️ | ▶️ | ▶️ | ▶️ | ▶️ |
| Existing confirmed orders | ▶️ | ▶️ | ▶️ | ▶️ | ▶️ | ▶️ | ▶️ | ▶️ (read/settle) |
| Restoration notifications | — | 🔔 | 🔔 | 🔔 | 🔔 | 🔔 | 🔔(if enabled) | usually off |

**Payment nuance (documented):** disabling `online_payment` blocks **new** initiation only. In-flight redirects, BML/Stripe **callbacks**, and reconciliation of already-initiated payments are never blocked and valid payments are never marked failed.

---

## 12. API contract

All responses follow the repo's existing JSON conventions (`response()->json`). New/changed endpoints:

**Public — `GET /api/service-status`** (throttle:120,1)
```
{ "services": { "online_checkout": { "available": false, "status": "unavailable",
  "reason_type": "technical_maintenance", "public_message": "…",
  "alternatives": ["pickup","call"], "retry_at": "2026-07-21T03:00:00+05:00",
  "notify_enabled": true, "incident_id": 42 }, "online_delivery": { "available": true, … } },
  "generated_at": "…" }
```
**Extended — `GET /api/ordering/status`** — unchanged keys + additive `"services": {…}` (older clients ignore it).

**Public — `POST /api/service-status/notify-me`** (throttle:5,1 per IP + per-phone limiter) → always:
```
200 { "ok": true, "message": "We'll text you once when {service} is back." }
```
(identical for new, duplicate, or existing-customer numbers — no enumeration).
Validation error → `422 { "message": "…", "errors": { "mobile": ["Please enter a valid Maldivian phone number…"] } }`.

**Disabled-service error (any gated write)** → `503`:
```
{ "code": "SERVICE_UNAVAILABLE", "service_key": "online_checkout",
  "message": "Online ordering is temporarily unavailable. Please call us or order pickup.",
  "alternatives": ["pickup","call"], "retry_at": "…", "notify_enabled": true }
```
*Rationale:* 503 (not 422) is semantically correct for "temporarily unavailable", is retriable, and won't be mistaken for a validation error by existing frontends. **Exception:** the existing customer order/catering endpoints already `abort(422)` via the gate services — to avoid breaking the current order-app error handling, keep **422** for the three legacy gate paths and use **503** only for the new `online_checkout`/`online_payment`/`customer_registration` guards. (Decision flagged in §17.)

**Admin** (all under `permission:service_availability.*`):
- `GET /api/admin/service-availability` — list states + waiting counts + open incidents.
- `PATCH /api/admin/service-availability/{key}` — update state (audited).
- `POST /api/admin/service-availability/preset/{preset}` — apply preset (preview via `?dry_run=1`).
- `POST /api/admin/service-availability/{key}/restore` — restore + close incident.
- `POST /api/admin/service-availability/{key}/notify` — dispatch queued restoration SMS.
- `GET /api/admin/service-availability/{key}/history` — audit + incident history.

---

## 13. Security & privacy

- **Permissions (new slugs in `PermissionCatalog`):** `service_availability.view`, `service_availability.manage_public`, `service_availability.schedule`, `service_availability.restore`, `service_availability.notify`, `service_availability.manage_internal`, `service_availability.emergency`. Owner/super-admin get all; managers get public + schedule + restore + notify; **emergency and internal are owner-only**.
- **Enumeration:** notify-me returns a constant generic response; never reveal customer existence or prior signup beyond a soft, non-authoritative UI hint.
- **Abuse / SMS cost:** route throttle + per-phone `RateLimiter` (reuse the CustomerAuth per-phone pattern), unique-per-incident dedupe, `notified_count` cap awareness. CAPTCHA only if abuse observed (not initially). No OTP initially.
- **CSRF/auth:** admin endpoints require staff Sanctum token + permission; webhooks stay CSRF-exempt and ungated. Notify-me is public, CSRF-exempt API, throttled.
- **XSS:** `public_message`/`internal_note` are plain text; escape on render (Blade `{{ }}`, React text nodes — never `dangerouslySetInnerHTML`); strip HTML server-side on save. Length-capped (500).
- **PII/logging:** store only normalized number; hash IP; OTP-style redaction not needed (transactional), but do not log full numbers at info level. Retention/anonymization per §5.3. Numbers never enter marketing tables.

---

## 14. Testing plan

Stack: PHPUnit + `RefreshDatabase` + Sanctum (backend); Vitest + Testing Library (frontend). Suggested paths:

**Backend feature/unit**
- `tests/Feature/ServiceAvailability/ServiceAvailabilityResolverTest.php` — precedence, cache bust, env-flag override, adapter OR-composition with legacy gates.
- `tests/Feature/ServiceAvailability/ServiceGuardsTest.php` — checkout/payment/registration/catering blocked when disabled; **POS/KDS/delivery/tracking/webhooks unaffected**; existing-order actions unaffected.
- `tests/Feature/ServiceAvailability/PaymentAvailabilityTest.php` — `online_payment` blocks initiation; **BML/Stripe webhooks + reconciliation still process**; valid payments not failed.
- `tests/Feature/ServiceAvailability/EmergencyLockdownTest.php` — internal writes blocked, reads OK, permission enforcement, typed confirmation, env fallback wins over DB.
- `tests/Feature/ServiceAvailability/RestorationSubscriptionTest.php` — valid/invalid number, dedupe, rate limit, incident binding, generic response/no enumeration.
- `tests/Feature/ServiceAvailability/RestorationSmsJobTest.php` — only pending notified, each once, failure recorded, retry-safe/idempotent, old-incident rows not notified.
- `tests/Feature/ServiceAvailability/ServiceSchedulingTest.php` — activation/restore at window, missed-run recovery (idempotent), MV timezone, no duplicate notifications.
- `tests/Feature/ServiceAvailability/ServiceAvailabilityAuthTest.php` — unauthorized cannot change; public manager cannot trigger emergency; audit rows created.
- **Regression:** run existing `OnlineOrderingGateTest`, `DeliveryGateTest`, `DeliverySettingsTest`, `ItemAvailabilityServiceTest`, `SmsLoggingTest`, `OrderingThrottleTest`, catering/order/POS suites — all must stay green (esp. the refactored `OnlineOrderingController`).

**Frontend (`apps/online-order-web/src/**/*.test.tsx`)**
- Banner renders per service; disabled action → correct message + alternatives; notify form success + already-subscribed identical; stale/503 handled gracefully; mobile + a11y (`aria-live`, focus) basics.

**Admin (`apps/admin-dashboard/src/__tests__/`)**
- Preset preview lists affected keys; typed confirmation required for POS/emergency; restore→notify two-step.

---

## 15. Migration & rollout plan

**Phase 1 — Core public controls**
- DB: create `service_states`, `service_incidents`; `ServiceStateSeeder` seeds all keys **available** (must not disable live ordering).
- Backend: `ServiceAvailabilityService`, `ServiceUnavailableException`, guards in checkout/payment/catering/registration, `EnsureServiceAvailable` middleware, public `GET /service-status`, refactor `OnlineOrderingController` to audited delegate, `config/service_availability.php`, permissions.
- Frontend: order-app `useServiceStatus`, banner, browse-only checkout, disabled modals; Blade banner partial + injection.
- Admin: `ServiceAvailabilityPage` (states + edit + audit), nav + route.
- Tests: resolver, guards, payment, auth, regressions.
- Deploy order: migrate + seed → deploy backend → deploy admin → deploy order app (bump SW `v9`) → deploy Blade.
- Verify: all keys `available`; place a pickup + delivery + payment successfully; disable `online_checkout` → order app browse-only + backend 503; POS/KDS/tracking unaffected; audit row present.
- Rollback: feature-flag `service_availability.enforcement_enabled` (config) → resolver returns `available` for all keys (guards become no-ops) without dropping tables.

**Phase 2 — Restoration SMS**
- DB: `restoration_subscriptions`.
- Backend: `RestorationSubscriptionController`, `SendRestorationSmsJob`, `RestorationSmsBuilder`, notify endpoints, waiting counts, prune command.
- Frontend/Admin: notify-me form; admin waiting count + restore→notify two-step.
- Tests: subscription, job, dedupe, retention.
- Verify: signup during outage → restore → queued single SMS → `notified`; duplicate safe; old incident not notified.
- Rollback: hide notify UI + disable notify endpoints (config); no data loss.

**Phase 3 — Scheduling & presets**
- Backend: `ActivateScheduledServiceStates` + scheduler entries; presets in service + controller.
- Admin: schedule fields, advance-warning banner, preset previews.
- Tests: scheduling suite.
- Verify: schedule a 2–3 AM checkout window; confirm activate/restore; missed-run idempotency; restore does **not** auto-send SMS (admin confirm required).

**Phase 4 — Emergency/internal**
- Backend: internal keys guards on POS/KDS/delivery **create/mutate** paths, `emergency_write_lock`, env fallback (`config/service_availability.php` reads env), owner notifications.
- Admin: emergency preset + typed confirmation + strong warnings.
- Docs: recovery runbook (how to clear env flag, DB row).
- Tests: emergency suite.
- Verify: lockdown blocks new POS ticket but existing-order settle/print works; env flag overrides DB; owner alerted; admin never locked out.

---

## 16. File-by-file implementation checklist

**Migrations**
- [ ] `backend/database/migrations/xxxx_create_service_states_table.php` (new)
- [ ] `backend/database/migrations/xxxx_create_service_incidents_table.php` (new)
- [ ] `backend/database/migrations/xxxx_create_restoration_subscriptions_table.php` (new)

**Models**
- [ ] `backend/app/Models/ServiceState.php` (new)
- [ ] `backend/app/Models/ServiceIncident.php` (new)
- [ ] `backend/app/Models/RestorationSubscription.php` (new)

**Services / Support**
- [ ] `backend/app/Domains/System/Services/ServiceAvailabilityService.php` (new)
- [ ] `backend/app/Support/RestorationSmsBuilder.php` (new)
- [ ] `backend/app/Exceptions/ServiceUnavailableException.php` (new)

**Middleware**
- [ ] `backend/app/Http/Middleware/EnsureServiceAvailable.php` (new)

**Controllers**
- [ ] `backend/app/Http/Controllers/Api/ServiceAvailabilityController.php` (new)
- [ ] `backend/app/Http/Controllers/Api/ServiceStatusController.php` (new)
- [ ] `backend/app/Http/Controllers/Api/RestorationSubscriptionController.php` (new)
- [ ] `backend/app/Http/Controllers/Api/OnlineOrderingController.php` (modify — audited delegate)
- [ ] `backend/app/Http/Controllers/Api/Orders/OrderCreationController.php` (modify)
- [ ] `backend/app/Http/Controllers/Api/DeliveryOrderController.php` (modify)
- [ ] `backend/app/Http/Controllers/Api/PaymentController.php` (modify)
- [ ] `backend/app/Http/Controllers/Api/EventOrderController.php` (modify)
- [ ] `backend/app/Http/Controllers/Api/CateringRequestController.php` (modify)
- [ ] `backend/app/Http/Controllers/Api/Auth/CustomerAuthController.php` (modify — registration/guest guard)

**Requests / Resources**
- [ ] `backend/app/Http/Requests/StoreRestorationSubscriptionRequest.php` (new)
- [ ] `backend/app/Http/Requests/UpdateServiceStateRequest.php` (new)
- [ ] `backend/app/Http/Resources/ServiceStateResource.php` (new)
- [ ] `backend/app/Http/Resources/ServiceStatusResource.php` (new)

**Jobs / Commands / Events**
- [ ] `backend/app/Jobs/SendRestorationSmsJob.php` (new)
- [ ] `backend/app/Console/Commands/ActivateScheduledServiceStates.php` (new)
- [ ] `backend/app/Console/Commands/PruneRestorationSubscriptions.php` (new)
- [ ] `backend/app/Domains/System/Events/ServiceStateChanged.php`, `ServiceRestored.php` (new)

**Routes / Config / Seeder / Permissions**
- [ ] `backend/routes/api.php` (modify — public status + notify)
- [ ] `backend/routes/domains/staff.php` (modify — admin group)
- [ ] `backend/routes/console.php` (modify — schedule commands)
- [ ] `backend/bootstrap/app.php` (modify — middleware alias)
- [ ] `backend/config/service_availability.php` (new)
- [ ] `backend/database/seeders/ServiceStateSeeder.php` (new)
- [ ] `backend/app/Domains/Permissions/PermissionCatalog.php` (modify — slugs + defaults)

**Website UI (Blade)**
- [ ] `backend/resources/views/partials/service-banner.blade.php` (new)
- [ ] `backend/resources/views/maintenance.blade.php` (new)
- [ ] `backend/app/Http/Controllers/HomeController.php` (modify)
- [ ] main layout include (path to confirm during impl — **uncertain**, likely `backend/resources/views/layouts/app.blade.php`)

**Order-app UI (`apps/online-order-web/src`)**
- [ ] `api/serviceStatus.ts` (new) + `api/menu.ts` (modify types)
- [ ] `hooks/useServiceStatus.ts` (new)
- [ ] `context/ServiceStatusContext.tsx` (new)
- [ ] `components/ServiceBanner.tsx` (new) / `OpeningStatusBadge.tsx` (modify)
- [ ] `components/ServiceUnavailableModal.tsx` (new)
- [ ] `components/NotifyMeForm.tsx` (new)
- [ ] `pages/{MenuPage,CheckoutPage,CateringPage}.tsx`, `components/OrderModeToggle.tsx` (modify)
- [ ] `public/sw.js` (modify — bump `CACHE_VERSION` to `bg-pwa-v9`)

**Admin UI (`apps/admin-dashboard/src`)**
- [ ] `pages/ServiceAvailabilityPage.tsx` (new)
- [ ] `api/serviceAvailability.ts` (new)
- [ ] `components/navConfig.ts`, `App.tsx` (modify — nav + route)

**Tests** — as listed in §14 (backend `tests/Feature/ServiceAvailability/*`, frontend `*.test.tsx`).

**Docs**
- [ ] `docs/SERVICE_AVAILABILITY_MAINTENANCE_PLAN.md` (this file)
- [ ] `docs/SERVICE_AVAILABILITY_RUNBOOK.md` (new — Phase 4 recovery)

---

## 17. Risks & decisions

**Blockers / must-verify before coding**
- Exact Blade main layout include point for the banner (confirm `resources/views/layouts/*`).
- Confirm `CustomerAuthController` account-creation vs guest-session methods to place the `customer_registration` guard precisely (must not gate login/OTP/tracking).

**High-risk areas**
- Refactoring `OnlineOrderingController` to delegate must be **byte-compatible** with the order app and existing tests (it currently drives the live banner). Guard with regression tests before/after.
- Payment guard must sit **only** on initiation; never on `bmlReturn`, `BmlWebhookController`, `StripeController::webhook`, or reconciliation.
- Cache: a missed bust could keep checkout open after disable → the 30 s TTL + explicit bust + fail-safe DB fallback mitigate; test the bust path.
- Emergency env fallback must not lock admins out — admin panel and auth are never gated by `emergency_write_lock`.

**Minor risks**
- SW cache of `/service-status` could briefly show stale banner offline (UX-only; backend authoritative).
- Two HTTP codes (422 legacy gates vs 503 new guards) — see decision below.

**Decisions Cursor must NOT improvise (resolve with owner if unsure)**
1. **HTTP code split (422 vs 503):** plan recommends keeping 422 on the three legacy gate paths and 503 on new guards to avoid breaking the current order-app error handling. Do not unify to 503 without updating/verifying order-app + tests.
2. **`SATISFIED_BY` for `service_availability.manage_public`:** whether `settings.update` should satisfy it (smoother migration) or require the new explicit slug. Recommend requiring the explicit slug for internal/emergency; public-manage may alias `settings.update`. Confirm before seeding roles.
3. **3 tables vs collapse:** plan uses `service_states` + `service_incidents` + `restoration_subscriptions`. Do not collapse `service_incidents` into audit history — subscription binding + waiting counts depend on it.
4. **Do not** replace the existing gate services or `/ordering/status` shape; only compose/extend.

**Leave unchanged**
- `OnlineOrderingGateService`, `DeliveryGateService`, `CateringOrderingGateService` internals; `ItemAvailabilityService`; POS bypass; `SmsService`; `MaldivesPhone`; webhook controllers; opening-hours; item-86 flows.

---

## 18. Acceptance criteria

1. With all services seeded `available`, current pickup/delivery/payment/catering flows behave **exactly** as before (regression suites green).
2. Disabling `online_checkout` makes the order app **browse-only** (menu visible, cart preserved) and the backend returns `503 SERVICE_UNAVAILABLE` for order submission; POS, KDS, delivery app, printing, admin, and order tracking are unaffected.
3. Disabling `online_delivery` blocks new customer delivery orders with a delivery-specific message offering pickup; pickup still works; existing delivery jobs and drivers continue.
4. Disabling `online_payment` blocks new BML/Stripe initiation and steers to COD; **BML/Stripe callbacks and reconciliation still process**; valid existing payments are never marked failed.
5. Every availability change writes an `audit_logs` row (previous→new state, reason, actor, message) — including via the refactored `OnlineOrderingController`.
6. A customer can request a restoration SMS; duplicate requests and existing-customer numbers return an identical generic success; no enumeration.
7. On admin-confirmed restoration, each waiting subscriber for that incident+service receives **exactly one** queued SMS; failures are recorded and not resent uncontrollably; subscribers from a previous incident are not notified.
8. Restoration SMS is never sent synchronously and never adds numbers to marketing.
9. Scheduled maintenance activates/restores idempotently at the window in `Indian/Maldives` time; a missed cron run recovers without duplicate notifications; auto-restore does **not** auto-send SMS.
10. Emergency lockdown requires `service_availability.emergency`, typed confirmation, and a reason; blocks new internal writes while existing-order settle/print/tracking continue; the env fallback overrides DB and never locks out admin/auth.
11. Public/marketing website remains available during all public maintenance except an explicit `marketing_site` disable (which serves a branded maintenance page, not `php artisan down`).
12. No stale cache keeps a disabled action enabled beyond the 30 s TTL, and an explicit admin change takes effect immediately.

---

## 19. Cursor execution sequence (small, reviewable stages)

**Stage 1 — Data + resolver core**
- Goal: tables, models, seeder, `ServiceAvailabilityService` (read + resolve + cache + env precedence), `config/service_availability.php`.
- Files: migrations ×3, models ×3, seeder, service, config.
- Tests: `ServiceAvailabilityResolverTest`.
- Manual: `tinker` resolve snapshot; all keys available.
- Commit: "service-availability: schema + resolver core (all available)".

**Stage 2 — Public status endpoint + order-app read**
- Goal: `GET /service-status`, resources; order-app `useServiceStatus` + banner (read-only, no gating yet).
- Files: `ServiceStatusController`, resources, route; order-app api/hook/banner.
- Tests: status feature test; banner render test.
- Manual: banner reflects a manually-flipped DB row.
- Commit: "service-availability: public status API + order-app banner".

**Stage 3 — Backend guards (public writes)**
- Goal: `assertAvailable` + `ServiceUnavailableException` + `EnsureServiceAvailable`; wire checkout/payment/catering/registration; refactor `OnlineOrderingController` to audited delegate.
- Files: exception, middleware, 6 controllers, `bootstrap/app.php`, `AuditLogService` usage.
- Tests: `ServiceGuardsTest`, `PaymentAvailabilityTest`, `ServiceAvailabilityAuthTest`, all regressions.
- Manual: disable checkout → 503 on submit; POS/webhooks unaffected; audit row present.
- Commit: "service-availability: backend enforcement + audited toggles".

**Stage 4 — Admin page (states + edit + audit)**
- Goal: `ServiceAvailabilityController` (list/patch/history) + admin page + nav/route + permissions.
- Files: controller, requests/resources, `staff.php`, `PermissionCatalog`, admin page/api/nav/App.
- Tests: auth/permission tests; admin preset preview test (dry-run).
- Manual: flip a service from admin; audit history shows it.
- Commit: "service-availability: admin controls + permissions".

**Stage 5 — Order-app gating UX + Blade banner + SW**
- Goal: browse-only checkout, disabled modals, mode toggle, 503 handling; Blade banner + maintenance view; bump SW `v9`.
- Files: order-app pages/components/sw.js; Blade partial/view/HomeController.
- Tests: order-app disabled/notify UX tests.
- Manual: end-to-end disable → browse-only + graceful errors on stale bundle.
- Commit: "service-availability: order-app + website maintenance UX".

**Stage 6 — Restoration SMS (Phase 2)**
- Goal: `restoration_subscriptions`, notify endpoint + form, `SendRestorationSmsJob`, builder, waiting counts, restore→notify two-step, prune command.
- Files: migration, model, controller, request, job, builder, admin restore UI, prune command + schedule.
- Tests: `RestorationSubscriptionTest`, `RestorationSmsJobTest`.
- Manual: signup → restore → single queued SMS → `notified`.
- Commit: "service-availability: one-time restoration SMS".

**Stage 7 — Scheduling & presets (Phase 3)**
- Goal: `ActivateScheduledServiceStates` + scheduler, presets (service + controller + admin previews), advance-warning banner.
- Files: command, `console.php`, service preset methods, admin preset UI.
- Tests: `ServiceSchedulingTest`.
- Manual: schedule a window; verify activate/restore + no auto-SMS.
- Commit: "service-availability: scheduling + presets".

**Stage 8 — Emergency/internal (Phase 4)**
- Goal: internal-key guards on POS/KDS/delivery write paths, `emergency_write_lock` + env fallback, typed confirmation, owner notifications, runbook.
- Files: guards, config env reads, admin emergency UI, `SERVICE_AVAILABILITY_RUNBOOK.md`.
- Tests: `EmergencyLockdownTest`.
- Manual: lockdown blocks new POS ticket; existing-order settle/print OK; env flag overrides DB; admin not locked out.
- Commit: "service-availability: emergency lockdown + env fallback".

## Implementation notes

- Blade layout path: main marketing layout is `backend/resources/views/layout.blade.php` (not `layouts/app`); the service banner partial is included between the existing announcement banner and the main content, and re-uses the amber warning palette used by `.site-announcement--warning`.
- Banner + maintenance short-circuit: `App\Http\Middleware\ShareServiceAvailability` (alias `service.banner`) is applied to the public marketing route group in `routes/web.php` — it (a) shares `$serviceBanner` with the layout, and (b) returns the branded `maintenance.blade.php` view with HTTP 503 + `Retry-After` when `marketing_site` is disabled. Choice: middleware over View Composer so we can short-circuit the response, and applied at the route-group level so admin/order/API/webhooks/receipts remain reachable.
- CustomerAuthController gating (§7): route-level `service.available:customer_registration` middleware is applied only to `POST /auth/customer/guest-session` (Stage 3). Existing customer login, OTP request/verify, `check`, forgot/reset password, and order tracking remain ungated so returning customers can still sign in and track orders during a new-registration outage.
- Central 503 handling in the order app: `ApiRequestError` bodies with `code: SERVICE_UNAVAILABLE` are normalised into a typed `ServiceUnavailableError` inside `apps/online-order-web/src/api/client.ts`, then a global `service_unavailable` window event triggers `ServiceStatusProvider` to open `ServiceUnavailableModal` and refresh status — so even stale PWA bundles fail gracefully.
- ServiceStatusProvider was hoisted to `main.tsx` so it wraps `CheckoutPage` (which lives outside `AppShell`); `AppShell` no longer double-wraps the provider.

## Build log

Recorded on branch `claude/service-availability-maintenance-zj4whc`. Stages 1–4 (base plan, resolver, backend enforcement, admin) landed prior to this build; Stages 5–8 completed in this run.

### Stages and commit SHAs

| Stage | Commit | Summary |
|---|---|---|
| 5 | `6b5d403f` | Order-app UX (browse-only checkout, ServiceUnavailableModal, NotifyMeForm, 503 mapping, SW `v9`) + Blade banner + branded maintenance view + View Composer via `ShareServiceAvailability` middleware |
| 6 | `11e1a0e5` | Public `POST /service-status/notify-me`, `RestorationSubscriptionController`, `SendRestorationSmsJob`, `RestorationSmsBuilder`, admin `POST /{key}/notify` + waiting-count UI, `PruneRestorationSubscriptions` command scheduled daily |
| 7 | `2dc7946f` | `ActivateScheduledServiceStates` command scheduled every minute — activates + restores on `starts_at` / `ends_at`, never fires SMS |
| 8 | `845b4729` | POS `pos_sales` / KDS `kds_operations` / delivery-ops `delivery_operations` route guards; `SERVICE_AVAILABILITY_RUNBOOK.md`; emergency + env override tests |

### Test results per stage

All values are from `php artisan test` (backend), `apps/online-order-web && npm test -- --run`, and `apps/admin-dashboard && npm test -- --run`.

| Stage | Backend | Online-order-web | Admin dashboard |
|---|---|---|---|
| 5 | 1413 passed, 2 skipped | 75 passed | 66 passed |
| 6 | 1425 passed, 2 skipped | 75 passed | 66 passed |
| 7 | 1430 passed, 2 skipped | 75 passed | 66 passed |
| 8 | 1437 passed, 2 skipped | 75 passed | 66 passed |

New feature-specific test files added:

- Stage 5 backend: `MarketingMaintenanceTest` (5 tests).
- Stage 5 frontend: `serviceUnavailable.test.ts`, `NotifyMeForm.test.tsx`, `OrderModeToggle.test.tsx`, `ServiceUnavailableModal.test.tsx` (16 tests).
- Stage 6 backend: `RestorationSubscriptionTest` (7), `RestorationSmsJobTest` (3), `PruneRestorationSubscriptionsTest` (2).
- Stage 7 backend: `ServiceSchedulingTest` (5).
- Stage 8 backend: `EmergencyLockdownTest` (7).

### Autonomous decisions

1. **Middleware over View Composer** for the Blade banner + maintenance short-circuit. A `ShareServiceAvailability` middleware (alias `service.banner`) applied to the public marketing route group both shares `$serviceBanner` with the layout AND returns the branded `maintenance.blade.php` view (503 + `Retry-After`) when `marketing_site` is disabled. This lets us keep admin, order SPA, receipts, webhooks, and API on separate execution paths that never touch the maintenance page.
2. **Hoisted `ServiceStatusProvider` to `main.tsx`** so `CheckoutPage` (outside `AppShell`) participates in the same 503 → modal flow. `AppShell` no longer double-wraps the provider.
3. **Central 503 handling in `api/client.ts`** normalises `ApiRequestError` bodies with `code: SERVICE_UNAVAILABLE` into a typed `ServiceUnavailableError`, and broadcasts a global `service_unavailable` window event. This means even stale PWA bundles (already-loaded pages after the operator disables checkout) still degrade to the modal on the next mutating write.
4. **`NotifyMeForm` degrades gracefully on 404**: Stage 5 ships the form before Stage 6 ships the endpoint, so a 404 renders a friendly "not available yet" message instead of throwing.
5. **Restoration SMS opt-in is dedupe-per-incident**: `RestorationSubscription` unique index `(service_incident_id, normalized_mobile)`. A single number can subscribe again in a new incident without ambiguity, but never receives two SMS for the same restore.
6. **Two-step restore in the admin panel**: `POST /{key}/restore` only flips the switch. The `Send N SMS` button under the Restore action calls the separate `POST /{key}/notify` endpoint, which is behind `service_availability.notify`. This prevents accidental notification blasts and lets the operator visually verify the incident window.
7. **Env `EMERGENCY_WRITE_LOCK` is master over DB**: the resolver reads env at highest precedence, so if the DB or admin panel is unreachable, ops can toggle `.env` + `artisan config:cache` and lockdown is total.
8. **Scheduled restore never auto-fires SMS** (plan §14). The scheduler activator command clears `starts_at` / `ends_at` on restore so the next tick does not re-activate, but explicitly does NOT dispatch `SendRestorationSmsJob`. Operators must click Send N SMS if they want it.
9. **Route-model-binding order in Stage 8 tests**: for KDS `{id}` (plain param, no binding) we can assert the 503 without a real Order row. For delivery ops, we picked `POST /delivery/drivers` (no `{order}` param) so the tests never depend on route-model-binding succeeding.

### Deviations from the plan

- Plan §11 mentioned guarding `assign-driver` for `delivery_operations`. All four delivery-ops mutation routes (drivers CRUD + assign-driver) are gated in this build; only reads (`GET /delivery/drivers`) stay open, per the "read is never blocked" rule.
- Plan §8 mentioned an "advance-warning banner" for approaching scheduled windows. This build ships the activator + admin UI showing `starts_at` / `ends_at` but does not add a distinct pre-window banner; the existing service banner covers all disabled-state messaging. Follow-up work if operators want proactive lead-time nudges.

### Anything unfinished

None — every task in Stages 5–8 landed with tests. The admin dist and order-app dist have been rebuilt and synced into `backend/public/{admin,order}/` so the branch is deploy-ready.
