# SMS Control Center — Implementation Plan

**Status:** Ready to build
**Goal:** Give admins one place to control **everything** about SMS — the wording of every
message, who is allowed to send each type, and whether each type (or all SMS) is switched on.

This plan is grounded in the current codebase. Section 1 is a **verified audit** of what exists
today (file-level references). Section 2 is the **gap analysis** against the three goals. Sections
3–8 are the **build**. Section 9 is testing. Section 10 is the deploy/rollback checklist.

---

## 1. Verified audit — what exists today

### 1.1 The send path (single choke point — good)
- **`app/Domains/Notifications/Services/SmsService.php`** — every SMS in the system goes through
  `SmsService::send(SmsMessage $sms)`. It:
  - Logs **every** attempt to `sms_logs` with a `status` of `sent | failed | demo | suppressed |
    queued` (`app/Models/SmsLog.php`).
  - Normalises phone numbers (`App\Rules\MaldivesPhone`).
  - De-dupes via `idempotency_key` (24h window).
  - Honours **customer opt-out** — but only for marketing-class messages. See
    `NON_SUPPRESSIBLE_TYPES = ['otp', 'transactional']` (line 33): OTP and transactional always send.
  - **Does NOT currently check any per-type "enabled" flag.** Per-type on/off lives in the callers
    (see 1.4), so the central service cannot enforce it — a new caller can silently bypass a toggle.
- **`SmsMessage` DTO** (`app/Domains/Notifications/DTOs/SmsMessage.php`) carries a free-form
  `string $type` (comment says `otp | promotion | campaign | transactional`) plus `customerId`,
  `campaignId`, `referenceType/Id`, `idempotencyKey`. The `type` today is only a **suppression
  class**, not a fine-grained catalog key.
- **Carrier:** `app/Domains/Notifications/Providers/DhiraaguSmsProvider.php`, behind
  `SmsProviderInterface`. Has a **demo mode** (log-only; returns `[false, 'demo', null]`) gated by
  env/config — there is **no admin-facing demo/kill switch**.

### 1.2 Wording sources (mixed — this is a gap)
- **Template system:** `app/Models/SmsTemplate.php` (slug + body + variables + `is_system`),
  rendered by `app/Domains/Sms/Services/SmsTemplateRenderer.php`. Seeded by
  `database/seeders/SmsTemplateSeeder.php` and various migrations
  (e.g. `2026_05_27_130000_seed_pos_customer_sms_settings_and_templates.php`).
- **Customer transactional wordings — editable templates** via
  `app/Domains/Notifications/Services/CustomerSmsMessageBuilder.php` (slugs:
  `customer_payment_confirmed_pos/_online`, `customer_completion_receipt`, `customer_send_bill`,
  `customer_send_pay_link`, `customer_fire_to_kitchen`, `customer_receipt_resend`,
  `customer_order_preparing`, `customer_order_ready_pickup/_delivery`, `customer_order_on_the_way`).
  `build($slug, $vars, $fallback)` uses the template if present, else a hardcoded fallback.
- **Staff notification wordings — editable templates** via
  `app/Domains/Sms/Services/StaffNotificationDispatcher.php` (`EVENT_TEMPLATE_MAP`: `new_order →
  order_new`, `order_ready`, `order_out_for_delivery`, `no_staff_found`).
- **Marketing automation wordings — settings strings** in
  `app/Domains/Marketing/Services/MarketingAutomationService.php`
  (`marketing_abandoned_cart_sms_template`, etc.).
- **HARDCODED IN PHP (not admin-editable):**
  - **OTP:** `app/Http/Controllers/Api/Auth/CustomerAuthController.php:85`
    (`"Your Bake & Grill verification code is {$otpCode}. Valid for 10 minutes. Do not share…"`) and
    `app/Http/Controllers/Api/Auth/StaffAuthController.php:205` (admin password reset).
  - **Catering:** `app/Domains/Catering/Services/CateringEventCreatedNotifier.php`
    (`"Event request {$ref} received. View details: {$viewUrl}"` + inline staff messages) and
    `CateringEventConfirmedNotifier.php` (customer + staff inline strings).
  - **Gift card:** `app/Domains/Payments/Services/GiftCardSmsDelivery.php` (`buildMessage(...)`).
  - **Restoration ("we're back"):** `app/Support/RestorationSmsBuilder.php` — editable **only via
    the `config/service_availability.php` config file** (`default_template` + `templates.<key>`),
    not through admin UI.

### 1.3 Who can send / manage (coarse — this is the biggest gap)
- **The entire admin SMS surface is behind one permission: `integrations.sms`.**
  `routes/domains/marketing.php` (`marketing.sms_admin` section, lines ~139–187) puts **all** of
  these behind `permission:integrations.sms`:
  - `GET admin/sms/logs`, `logs/stats`
  - Campaigns: `index/store/preview/show/{campaign}/send/{campaign}/cancel`
  - Contacts + contact groups (CRUD + members)
  - **Templates CRUD** (`admin/sms/templates …`)
  - Scheduled messages (CRUD + pause/resume)
  - Staff notification logs (+ resend)
  - SMS **promotions** block (`marketing.sms_promotions`) is also `permission:integrations.sms`.
- `PermissionCatalog.php`: `sms_marketing.view` and `sms_marketing.manage` both **alias to
  `integrations.sms`** via `SATISFIED_BY` (lines 34–35). Catalog label calls `integrations.sms`
  "SMS campaigns (legacy)".
- **POS** paths use their own permissions: `orders.send_sms_bill`, `orders.send_payment_link`.
- **Restoration** uses `service_availability.notify`.
- **Net effect:** one role that can view logs can also blast the entire customer base, edit every
  template, and manage contacts. No separation of duties.

### 1.4 On/off toggles today (partial + scattered — a gap)
- **Customer/POS (9):** `app/Domains/Notifications/Support/SmsNotificationSettings.php` — SiteSetting
  keys `sms_customer_payment_confirmed_enabled`, `sms_customer_completion_receipt_enabled`,
  `sms_pos_send_bill_enabled`, `sms_pos_send_pay_link_enabled`, `sms_pos_fire_to_kitchen_enabled`,
  `sms_pos_receipt_resend_enabled`, `sms_customer_preparing_enabled`, `sms_customer_ready_enabled`,
  `sms_customer_on_the_way_enabled`. Checked **inside each caller**
  (`OrderPaymentController`, `OrderStatusController`, `ReceiptController`, `PaymentConfirmationNotifier`,
  `SendOnlineOrderCompletionReceiptSmsListener`, surfaced to POS via `PosBootstrapController`).
- **Staff (5):** `StaffNotificationDispatcher.php` `EVENT_ENABLED_MAP` — `staff_sms_new_order_enabled`,
  `staff_sms_order_confirmed_enabled`, `staff_sms_order_ready_enabled`,
  `staff_sms_order_out_for_delivery_enabled`, `staff_sms_no_staff_found_enabled` (default `'1'`).
  (Also referenced: `staff_sms_new_customer_enabled`, `staff_sms_schedule_assigned_enabled`,
  `staff_sms_shift_reminder_enabled`.)
- **Marketing (3):** `MarketingAutomationService.php` — `marketing_birthday_enabled`,
  `marketing_abandoned_cart_enabled`, `marketing_tier_milestone_enabled`.
- **No toggle at all:** OTP (intentional), **catering** (customer + staff), **gift card**,
  **campaigns/promotions master**, order-cancelled.
- **No global master kill switch.**

### 1.5 Admin UI today
- `apps/admin-dashboard/src/pages/SmsPage.tsx` (campaigns/logs/contacts/templates/scheduled),
  `apps/admin-dashboard/src/api/sms-module.ts`.
- `apps/admin-dashboard/src/pages/SettingsPage.tsx` + `SettingsPage/SmsNotificationRow.tsx` — the 9
  customer/POS rows, each pairing a **toggle + inline template body editor + preview**. This row
  component is the UX pattern to reuse for the Control Center.

---

## 2. Gap analysis vs. the three goals

| Goal | Today | Gap to close |
|---|---|---|
| **Control all wordings** | Customer/POS/staff = editable templates; marketing = settings | OTP, catering, gift card hardcoded; restoration config-only. Wordings scattered across 4 UIs. |
| **Who can send each type** | One permission (`integrations.sms`) gates everything | No separation: view-logs role can also mass-send + edit templates. |
| **Allow/disallow a specific SMS** | 17 scattered toggles; enforced in callers | Central service doesn't enforce → bypassable. Catering/gift-card/campaign have no toggle. No global kill switch. |

**Decisions locked with the owner:**
- Permissions: **full granular split** (with legacy alias so nobody loses access).
- Global kill switch: **yes, true stop-all including OTP** (with a loud UI warning that it blocks
  logins while active).

---

## 3. Target architecture

Introduce **one registry** that every SMS type is declared in, make the **central service enforce**
the registry's on/off + permission, and **migrate all hardcoded wordings** into templates. Then
build **one admin page** over the registry.

### 3.1 SMS Type Registry (new single source of truth)
`app/Domains/Notifications/Support/SmsTypeRegistry.php` — a static catalog. Each entry:

```
'key'                => 'customer_order_ready',      // stable machine key (also SmsMessage type)
'label'              => 'Order ready',               // admin-facing
'category'           => 'transactional',             // auth|transactional|marketing|staff|system
'default_enabled'    => true,
'suppressible'       => false,                       // honours customer opt-out? (marketing = true)
'template_slug'      => 'customer_order_ready_pickup',// nullable (e.g. OTP if kept fixed)
'enabled_setting'    => 'sms_customer_ready_enabled',// SiteSetting key (back-compat with existing)
'send_permission'    => 'sms.transactional.manage',  // who may trigger/allow it
'always_on'          => false,                        // OTP-style types that ignore per-type toggle
```

Enumerate **every** type found in the audit (customer, POS, staff, marketing, catering, gift card,
restoration, OTP). Reuse the **existing** `enabled_setting` keys and `template_slug`s from 1.2/1.4 so
no data migration is needed for types that already have them; add new keys only for the currently
uncontrolled types (catering, gift card, OTP-optional).

> The registry maps `key → {enabled_setting, template_slug, send_permission, category, …}`. It is the
> only place these relationships live; UI, enforcement, and seeding all read from it.

### 3.2 Central enforcement (close the bypass)
In `SmsService::send()`, **before** hitting the provider, resolve the message's type against the
registry and apply, in order:
1. **Global kill switch** (`sms_global_kill_switch` SiteSetting, default off). If on → log a
   `disabled` row (new status) with `error_message = 'All SMS halted by admin master switch.'` and
   return. Applies to **all** types including OTP (per owner decision).
2. **Per-type enabled** — if the registry entry is not `always_on` and its `enabled_setting` is
   false → log `disabled` and return.
3. Existing opt-out logic (unchanged) using the registry's `suppressible` flag instead of the
   hardcoded `NON_SUPPRESSIBLE_TYPES` list.

Add `'disabled'` to the `sms_logs.status` enum/values and to admin log filters. Keep the existing
caller-side `SmsNotificationSettings::isEnabled` checks working (they now become a *redundant* early
exit, not the only gate) — or refactor callers to drop them in favour of the central gate (preferred;
see 6.3). **The central gate is authoritative.**

> Because `SmsMessage.type` is free-form today and callers pass values like `'transactional'`, add a
> resolution step: if `type` isn't a registry key, fall back to category-level rules (so legacy
> callers keep working) and log a warning to help migrate them. New/updated callers should pass the
> **registry key** as `type`.

### 3.3 Migrate hardcoded wordings into templates
For each currently-hardcoded type, add a system template (slug + variables + default body) to
`SmsTemplateSeeder.php` and route the caller through a builder that uses the template with the
current hardcoded string as the **fallback** (mirror `CustomerSmsMessageBuilder::build`):
- **OTP:** slugs `auth_customer_otp`, `auth_staff_password_reset`. Variables: `code`, `minutes`,
  `brand`. Keep them `always_on` (never blocked by per-type toggle) but **editable**. (Note: the
  global kill switch still blocks them — that's the owner's explicit choice.)
- **Catering:** `catering_request_received` (customer), `catering_request_staff` (staff),
  `catering_confirmed_customer`, `catering_confirmed_staff`. Variables: `reference`, `view_url`,
  `contact_name`, `paid`, `balance`, `event_date`.
- **Gift card:** `giftcard_delivery`. Variables: `sender`, `view_url`, `note`, `amount`.
- **Restoration:** keep `RestorationSmsBuilder`'s config default as the fallback, but also look up a
  `service_restoration` template so it's editable in the same UI.

Each migrated type also gets an `enabled_setting` (default `true`) so it appears in the Control
Center with an on/off — closing the "no toggle" gap.

### 3.4 Granular permissions (full split)
Add to `PermissionCatalog.php` (group **"SMS"**):

| New slug | Controls |
|---|---|
| `sms.logs.view` | View SMS logs + stats |
| `sms.templates.edit` | Edit wording of any SMS template |
| `sms.settings.manage` | Toggle types on/off + global kill switch |
| `sms.contacts.manage` | Contacts + contact groups |
| `sms.scheduled.manage` | Scheduled messages |
| `sms.campaigns.send` | Create/send bulk campaigns + promotions (**the risky one**) |
| `sms.transactional.manage` | Allow/trigger transactional + staff types |

**Back-compat:** in `SATISFIED_BY`, make **all** of the above satisfied by the legacy
`integrations.sms` (and `sms_marketing.manage`), so every existing holder keeps full access. New
roles can be granted the fine-grained subset. Update the route middleware in
`routes/domains/marketing.php` to use the specific new slug per route group (logs → `sms.logs.view`,
templates → `sms.templates.edit`, campaigns/promotions send → `sms.campaigns.send`, contacts →
`sms.contacts.manage`, scheduled → `sms.scheduled.manage`, the new settings endpoints →
`sms.settings.manage`). Run the catalog sync (`PermissionCatalogSync`) + a resync migration like the
existing `2026_06_01_100000_resync_role_permissions.php`.

Each registry entry's `send_permission` names one of these — that is the machine-readable answer to
"who can send this type," surfaced in the UI.

---

## 4. Backend API (new endpoints)

Under `admin/sms/` (new controller `App\Http\Controllers\Api\SmsControlCenterController`):

- `GET  /admin/sms/control-center` → `permission:sms.settings.manage` (read also allowed for
  `sms.logs.view`). Returns the registry joined with live state: for each type — key, label,
  category, `enabled`, `always_on`, `suppressible`, `send_permission`, resolved template
  (`slug`, `body`, `variables`), and last-30-day volume/cost from `sms_logs`. Plus top-level
  `global_kill_switch` and `demo_mode` (from provider/config).
- `PATCH /admin/sms/types/{key}` → `permission:sms.settings.manage`. Body: `{ enabled: bool }`.
  Writes the registry entry's `enabled_setting`. Rejects `always_on` types with 422. Audit-logged.
- `PATCH /admin/sms/global-kill-switch` → **owner-only** (`permission:sms.settings.manage` **and** an
  owner/role guard — reuse the pattern used by `service_availability` emergency lockdown). Body
  `{ enabled: bool }`. Audit-logged with actor.
- Template editing reuses the existing `PATCH /admin/sms/templates/{id}` but re-gate it to
  `sms.templates.edit`.

All writes go through `AuditLogService` (search existing usage for the signature). Validate booleans;
never trust the client for `always_on`/permission fields (those come from the registry, not the body).

---

## 5. Admin UI — "SMS Control Center"

New page `apps/admin-dashboard/src/pages/SmsControlCenterPage.tsx` (+ route + nav entry under the
Marketing or System section; reuse the nav pattern in the admin-layout redesign). API client in
`apps/admin-dashboard/src/api/sms-module.ts`.

Layout:
- **Header:** global kill switch (owner-only; a red, confirm-modal toggle with the explicit warning
  *"This halts ALL outbound SMS, including login OTP codes — customers and staff will not be able to
  receive verification codes while this is on."*). Demo-mode badge when the carrier is in demo.
- **Grouped table by category** (Auth / Transactional / Marketing / Staff / System). Each row:
  - **On/off toggle** (disabled + "Always on" pill for `always_on` types; disabled unless the user
    has `sms.settings.manage`).
  - **Wording:** expandable inline editor (reuse `SmsNotificationRow.tsx`'s body editor + char count
    `utils/smsCharCount.ts` + preview) — disabled unless `sms.templates.edit`.
  - **Who can send:** shows the `send_permission` label and which roles currently hold it (read-only
    link to Roles & Permissions).
  - **Last 30 days:** count + estimated cost (from the API).
- Respect permissions in the UI: viewers with only `sms.logs.view` see the table read-only.

Keep the existing 9 rows working during transition (the Settings→Notifications section can stay or
link to the new page). The Control Center is the superset.

---

## 6. Backend build steps (order of work)

1. **Registry** (3.1): `SmsTypeRegistry` with every type; unit-tested map.
2. **Migrations/seed:**
   - Add new SiteSetting defaults (`sms_global_kill_switch=false`, new `*_enabled` keys default
     `true`).
   - Extend `SmsTemplateSeeder` with the migrated slugs (OTP, catering, gift card, restoration).
   - Add `sms_logs.status` `'disabled'` (widen enum/validation; it's a string column — confirm).
   - Permission catalog additions + `SATISFIED_BY` aliases + resync migration.
3. **Central enforcement** in `SmsService::send()` (3.2). Replace `NON_SUPPRESSIBLE_TYPES` with a
   registry lookup; add kill-switch + per-type gate; new `disabled` log rows.
4. **Route re-gating** (3.4) in `routes/domains/marketing.php`.
5. **New controller + endpoints** (4).
6. **Caller migration** (3.3): route OTP/catering/gift-card/restoration through template builders with
   fallbacks; pass registry keys as `SmsMessage.type`. Keep behaviour identical when templates are
   unset (fallback == today's hardcoded string).
7. Wire `AuditLogService` on every settings/template write.

**Non-negotiable invariants:**
- No message is sent that today would be suppressed by opt-out (keep exact opt-out semantics).
- Types that are `always_on` are never blocked by a per-type toggle (only by the global switch).
- Every existing role keeps its current access (via `SATISFIED_BY`).
- Every send still produces exactly one `sms_logs` row (now possibly `disabled`).

---

## 7. Frontend build steps
1. API client methods (`getSmsControlCenter`, `updateSmsType`, `updateSmsGlobalKillSwitch`).
2. `SmsControlCenterPage.tsx` + route + nav item (permission-gated visibility).
3. Reuse `SmsNotificationRow` body editor; add category grouping + kill-switch header.
4. Permission-aware disabling of controls.

---

## 8. Out of scope (backlog)
- Per-recipient send-time throttling changes.
- New carrier providers.
- Per-type scheduling windows (quiet hours) — could reuse staff routing time windows later.

---

## 9. Testing

**Backend (PHPUnit, in-memory SQLite, `RefreshDatabase`):**
- `SmsTypeRegistryTest`: every registry key has a unique `enabled_setting`, a valid category, and
  (unless nullable) a template slug present in the seeder.
- `SmsServiceGateTest`:
  - Global kill switch on → any type (incl. OTP) logs `disabled`, provider not called.
  - Per-type disabled → that type logs `disabled`; a different enabled type still sends.
  - `always_on` type with its per-type setting false → still sends (only global switch blocks it).
  - Opt-out semantics preserved for `suppressible` types; unchanged for transactional/OTP.
  - Legacy caller passing `type:'transactional'` (not a registry key) still sends (category fallback).
- `SmsPermissionsTest`: a token with only `sms.logs.view` can GET logs but gets 403 on
  `campaigns/send`, `templates PATCH`, `types PATCH`, `global-kill-switch`. A token with legacy
  `integrations.sms` retains access to all (alias).
- `SmsControlCenterControllerTest`: GET returns all types + state; PATCH type toggles the setting +
  writes an audit row; PATCH `always_on` → 422; kill-switch PATCH is owner-gated + audited.
- Caller migration tests: OTP/catering/gift-card/restoration produce identical bodies when templates
  are unset (fallback), and use the template body when set.

**Frontend (Vitest):** Control Center renders grouped types, toggles call the API, kill-switch shows
the confirm+warning, controls disabled without the right permission.

Run backend: `cd backend && php artisan test`. Run frontend from **repo root** (`npm ci`) then
`cd apps/admin-dashboard && npm test -- --run && npm run build`.

---

## 10. Deploy / rollback

**Deploy (cPanel):**
- `php artisan migrate --force` (new settings/permission/template seeds + status widening).
- `php artisan db:seed --class=SmsTemplateSeeder --force` (idempotent updateOrCreate).
- `php artisan config:cache`.
- Rebuild admin bundle and sync `backend/public/admin`; bump the admin SW `CACHE_VERSION`.

**Safety / rollback:**
- The global kill switch defaults **off**; all new per-type toggles default **on**; every new
  permission is aliased from `integrations.sms` — so **behaviour is unchanged on deploy** until an
  admin actively changes something.
- Rollback = revert the release; SiteSetting rows are harmless if left. Templates are additive.

---

## Appendix A — full type inventory (seed from the audit)

| Key | Category | always_on | template slug | enabled_setting | send_permission |
|---|---|---|---|---|---|
| `auth_customer_otp` | auth | yes | `auth_customer_otp` | — | (system) |
| `auth_staff_password_reset` | auth | yes | `auth_staff_password_reset` | — | (system) |
| `customer_payment_confirmed_pos` | transactional | no | `customer_payment_confirmed_pos` | `sms_customer_payment_confirmed_enabled` | `sms.transactional.manage` |
| `customer_payment_confirmed_online` | transactional | no | `customer_payment_confirmed_online` | `sms_customer_payment_confirmed_enabled` | `sms.transactional.manage` |
| `customer_completion_receipt` | transactional | no | `customer_completion_receipt` | `sms_customer_completion_receipt_enabled` | `sms.transactional.manage` |
| `customer_order_preparing` | transactional | no | `customer_order_preparing` | `sms_customer_preparing_enabled` | `sms.transactional.manage` |
| `customer_order_ready` | transactional | no | `customer_order_ready_pickup`/`_delivery` | `sms_customer_ready_enabled` | `sms.transactional.manage` |
| `customer_order_on_the_way` | transactional | no | `customer_order_on_the_way` | `sms_customer_on_the_way_enabled` | `sms.transactional.manage` |
| `pos_send_bill` | transactional | no | `customer_send_bill` | `sms_pos_send_bill_enabled` | `orders.send_sms_bill` |
| `pos_send_pay_link` | transactional | no | `customer_send_pay_link` | `sms_pos_send_pay_link_enabled` | `orders.send_payment_link` |
| `pos_fire_to_kitchen` | transactional | no | `customer_fire_to_kitchen` | `sms_pos_fire_to_kitchen_enabled` | `sms.transactional.manage` |
| `pos_receipt_resend` | transactional | no | `customer_receipt_resend` | `sms_pos_receipt_resend_enabled` | `sms.transactional.manage` |
| `staff_new_order` | staff | no | `order_new` | `staff_sms_new_order_enabled` | `sms.transactional.manage` |
| `staff_order_ready` | staff | no | `order_ready` | `staff_sms_order_ready_enabled` | `sms.transactional.manage` |
| `staff_order_out_for_delivery` | staff | no | `order_out_for_delivery` | `staff_sms_order_out_for_delivery_enabled` | `sms.transactional.manage` |
| `staff_no_staff_found` | staff | no | `no_staff_found` | `staff_sms_no_staff_found_enabled` | `sms.transactional.manage` |
| `staff_new_customer` | staff | no | (existing) | `staff_sms_new_customer_enabled` | `sms.transactional.manage` |
| `marketing_campaign` | marketing | no | (per-campaign) | `sms_marketing_campaigns_enabled` (new) | `sms.campaigns.send` |
| `marketing_promotion` | marketing | no | (per-promo) | `sms_marketing_promotions_enabled` (new) | `sms.campaigns.send` |
| `marketing_abandoned_cart` | marketing | no | `marketing_abandoned_cart_sms_template` | `marketing_abandoned_cart_enabled` | `sms.campaigns.send` |
| `marketing_birthday` | marketing | no | (existing) | `marketing_birthday_enabled` | `sms.campaigns.send` |
| `marketing_tier_milestone` | marketing | no | (existing) | `marketing_tier_milestone_enabled` | `sms.campaigns.send` |
| `catering_request_received` | transactional | no | `catering_request_received` (new) | `sms_catering_enabled` (new) | `sms.transactional.manage` |
| `catering_request_staff` | staff | no | `catering_request_staff` (new) | `sms_catering_enabled` (new) | `sms.transactional.manage` |
| `catering_confirmed_customer` | transactional | no | `catering_confirmed_customer` (new) | `sms_catering_enabled` (new) | `sms.transactional.manage` |
| `catering_confirmed_staff` | staff | no | `catering_confirmed_staff` (new) | `sms_catering_enabled` (new) | `sms.transactional.manage` |
| `giftcard_delivery` | transactional | no | `giftcard_delivery` (new) | `sms_giftcard_enabled` (new) | `sms.transactional.manage` |
| `service_restoration` | marketing | no | `service_restoration` (new; config fallback) | `sms_restoration_enabled` (new) | `service_availability.notify` |

> Confirm each `enabled_setting`/`template_slug` against the code before wiring — the audit lists the
> exact source files. Where a slug is marked "(existing)", find the real slug in the seeder/builder.
