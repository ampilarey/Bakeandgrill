# POS Discount Controls — Implementation Plan

**Status:** Ready to build
**Goal:** Give admins one place to control **everything** about manual POS discounts — a global
on/off switch, who may discount, the maximum allowed (percentage and/or fixed, optionally per role),
a manager-override step for anything above the cap, a required reason (admin-editable preset list +
optional note), and a full audit trail of every discount.

Section 1 is a **verified audit** of today's behaviour (file/line references). Section 2 is the
**gap analysis**. Sections 3–8 are the **build**. Section 9 is tests. Section 10 is deploy/rollback.

---

## 1. Verified audit — how discounts work today

### 1.1 Entry (POS UI)
- The order cart has a single **"Discount"** field — a free-form decimal input where the cashier types
  a **flat MVR amount** (not a %). `apps/pos-web/src/components/OrderCart.tsx:1019-1037`
  (`p.discountAmount` / `p.setDiscountAmount`, `inputMode="decimal"`).
- The field is shown only when `p.canApplyDiscount !== false`
  (`OrderCart.tsx:1019`). That flag derives from the `promotions.discounts` permission
  (`apps/pos-web/src/hooks/usePosPermissions.ts`).
- Client parses it as `Math.max(0, Number.parseFloat(discountAmount) || 0)`
  (`apps/pos-web/src/hooks/useOrderCreation.ts:420, 654, 1384`) — floored at 0, **no upper bound**.
- Sent to the backend as `discount_amount`.

### 1.2 Backend — authoritative (good) but uncapped
- **Order create:** `app/Domains/Orders/Services/OrderCreationService.php:168-179`
  - `$discountLaar = max(0, min((int) round($discountAmount * 100), $subtotalLaar));`
  - Permission enforced **server-side**: if `$discountLaar > 0` and the actor lacks
    `promotions.discounts` → `abort(403, 'You do not have permission to apply manual discounts.')`.
  - Stored as `manual_discount_laar`; totals recomputed by `OrderTotalsCalculator` (single source of
    truth — client totals are never trusted).
- **Order edit:** `app/Http/Controllers/Api/Orders/OrderItemController.php:156-171` — identical
  clamp + identical 403 permission gate.
- **Validation rule:** `'discount_amount' => 'nullable|numeric|min:0'` (`OrderItemController.php:66`) —
  **no `max`**.
- **Only ceiling is the subtotal:** `EffectiveDiscount::effectiveTotalLaar` uses
  `min($subtotalLaar, max(0, array_sum($parts)))` (`app/Domains/Orders/Support/EffectiveDiscount.php:79`)
  — a discount can zero an order but never make it negative.

### 1.3 What does NOT exist today
- ❌ No maximum discount percentage.
- ❌ No maximum discount amount (fixed ceiling).
- ❌ No manager-approval threshold / override.
- ❌ No per-role differentiation — `promotions.discounts` is **binary and unlimited**: a junior
  cashier granted it can zero any order, same as a manager.
- ❌ No reason capture (no `discount_reason` column on `orders`).
- ❌ No dedicated audit trail for manual discounts (searched `app/` — no discount-specific
  `AuditLogService` call). The amount is stored on the order and shows in reports, but there is no
  "who/why/when/approved-by" record.
- ❌ No global switch to turn manual discounting off.

### 1.4 Reusable mechanisms already in the codebase
- **SiteSetting** key/value store + the admin Settings UI pattern (see the SMS Control Center work:
  `SettingsPage` + row components).
- **Staff PIN login:** `POST /auth/pin-login` → `StaffAuthController::pinLogin`
  (`backend/routes/domains/auth.php:25`). Reuse its PIN verification for the **manager override**
  step-up (validate a manager's PIN without a full re-login).
- **PermissionCatalog** (`app/Domains/Permissions/PermissionCatalog.php`) with `SATISFIED_BY` aliases
  and role defaults; existing `promotions.discounts` at line 141.
- **AuditLogService** (used across settings/SMS writes).
- **Central-gate lesson from SMS:** put enforcement in ONE service both write paths call, so nothing
  bypasses it.

---

## 2. Gap analysis vs. the goal ("admin controls everything")

| Capability | Today | To build |
|---|---|---|
| Global on/off | none | `discount_manual_enabled` kill switch |
| Who can discount | `promotions.discounts` (binary) | keep it; add `promotions.discount_override` for approvers; optional per-role caps |
| Max amount | none (subtotal only) | global max % and/or fixed MVR; optional per-role tiers |
| Above-cap flow | none | manager override via PIN step-up |
| Reason | none | required toggle + admin-editable preset list + optional note; new order columns |
| Audit | none (discount-specific) | log every manual discount + every override |

**Owner decisions locked:** include **all** of the above as **admin-configurable settings** (global
switch, who, max, per-role, override, reasons). Reasons = **preset list + optional note**.

---

## 3. Target architecture

One **central policy service** enforces every rule; **one admin page** configures them; **one audit
call** records the outcome.

### 3.1 Settings (SiteSetting keys — all admin-editable)
| Key | Type | Default | Meaning |
|---|---|---|---|
| `discount_manual_enabled` | bool | `true` | Global switch. Off → manual discounts blocked for everyone. |
| `discount_max_percent` | int (0–100) | `100` | Global max discount as % of subtotal (100 = today's behaviour). |
| `discount_max_fixed_mvr` | decimal | `0` (=off) | Optional absolute MVR ceiling; 0 disables the fixed cap. |
| `discount_role_caps` | JSON | `{}` | Optional per-role overrides, e.g. `{"cashier":{"percent":10},"supervisor":{"percent":25}}`. Empty = global cap applies to all. |
| `discount_require_override_above_cap` | bool | `true` | Above the effective cap → require a manager override (PIN). If false, above-cap is simply rejected. |
| `discount_reason_required` | bool | `true` | Require a reason on every manual discount. |
| `discount_reasons` | JSON list | seeded set | Admin-editable preset reasons (e.g. Loyal customer, Complaint/service recovery, Staff meal, Manager comp, Damaged item, Price match). |

All read through a small `DiscountSettings` support class (mirror
`SmsTypeRegistry`/`SmsNotificationSettings`) with typed getters + `settingIsTruthy` reuse.

### 3.2 New permissions (PermissionCatalog)
| Slug | Meaning |
|---|---|
| `promotions.discounts` | **(existing)** apply a manual discount up to the cap. |
| `promotions.discount_override` | Approve a discount **above** the cap (manager). |
| `discounts.settings.manage` | Configure the Discount Controls admin page. |

Add role defaults (owner/manager get `discount_override` + `settings.manage`). No `SATISFIED_BY`
change is required for back-compat since `promotions.discounts` keeps its current meaning; a fresh
resync migration seeds the two new slugs (pattern: `2026_06_01_100000_resync_role_permissions.php`).

### 3.3 New order columns (migration)
- `manual_discount_reason` (string, nullable) — the chosen preset.
- `manual_discount_reason_note` (string, nullable) — optional free text.
- `manual_discount_approved_by` (FK users.id, nullable) — the override approver, when used.

### 3.4 Central policy: `ManualDiscountPolicy`
`app/Domains/Orders/Services/ManualDiscountPolicy.php` — the single choke point. Both
`OrderCreationService` and `OrderItemController` call it **before** persisting `manual_discount_laar`.

```
authorizeAndClamp(
    User $actor,
    int $subtotalLaar,
    int $requestedDiscountLaar,
    ?string $reason,
    ?string $reasonNote,
    ?string $overridePin,          // manager PIN when above cap
): DiscountDecision   // { discountLaar, reason, reasonNote, approvedByUserId }
```

Rules, in order (throw `abort(4xx, ...)` on failure — never silently clamp away a violation the
cashier should see):
1. If `requested <= 0` → return zero decision (no checks).
2. **Global switch** off → `abort(403, 'Manual discounts are currently disabled.')`.
3. Actor lacks `promotions.discounts` → `abort(403, ...)` (unchanged message).
4. **Reason** required but missing/not in `discount_reasons` → `abort(422, 'A discount reason is required.')`.
5. Compute **effective cap** for the actor = min of applicable global caps and this actor's role cap
   (percent → laar of subtotal; fixed → laar). Also never exceed subtotal.
6. If `requested <= cap` → OK, `approvedBy = null`.
7. If `requested > cap`:
   - If `discount_require_override_above_cap` is **false** → `abort(422, 'Discount exceeds the
     maximum allowed (X%).')`.
   - Else require `overridePin`: verify it belongs to a **different** active user holding
     `promotions.discount_override` (reuse `pinLogin` verification logic; do not create a session).
     On success set `approvedBy = that user id`; on failure `abort(403, 'Manager approval required /
     invalid PIN.')`. Still clamp to subtotal.
8. Return the decision. **Always** write an `AuditLogService` entry: actor, order, subtotal, discount
   laar + %, reason, note, `approvedBy`, and whether an override was used.

> The policy is authoritative and server-side. The POS UI mirrors the rules for good UX, but the
> server re-checks everything — a tampered client cannot exceed the cap or skip the reason/override.

### 3.5 Wire the two write paths
- `OrderCreationService.php:168-179` and `OrderItemController.php:156-171` — replace the inline
  `max(0,min(...))` + permission check with a `ManualDiscountPolicy::authorizeAndClamp(...)` call and
  persist the returned `discountLaar` + reason columns. Accept new request fields:
  `discount_reason`, `discount_reason_note`, `discount_override_pin`.
- Extend validation: `discount_amount` stays `numeric|min:0` (the cap is a policy concern, not a
  static rule, because it depends on subtotal + role); add
  `discount_reason` `nullable|string`, `discount_reason_note` `nullable|string|max:255`,
  `discount_override_pin` `nullable|string`.

---

## 4. Backend API (admin config)

New controller `App\Http\Controllers\Api\DiscountControlsController`, routes under
`admin/discounts` gated by `permission:discounts.settings.manage`:
- `GET  /admin/discounts/controls` → all settings above + resolved role caps + the reason list.
- `PATCH /admin/discounts/controls` → validate + persist each setting (booleans, `0<=percent<=100`,
  `fixed>=0`, well-formed `role_caps` JSON, non-empty reason labels). Audit-logged.

Plus a tiny **public-to-POS** read so the cart can enforce/prefill: extend the existing POS bootstrap
(`PosBootstrapController`) to include the effective discount config for the logged-in actor
(their cap %, fixed cap, whether reasons are required, the reason list, whether override is possible)
— never trust it for enforcement, only for UX.

---

## 5. POS UX (pos-web)
- Keep the Discount field, but drive it from the bootstrap config:
  - Hidden entirely if `discount_manual_enabled` is false or actor lacks `promotions.discounts`.
  - Show the actor's cap inline ("max 10%").
  - On blur / at charge, if the amount exceeds the cap:
    - If override allowed → open a small **Manager approval** modal (manager PIN) — reuse the PIN pad
      pattern; send the PIN as `discount_override_pin`.
    - Else → inline error "Exceeds max discount (X%)".
  - If `discount_reason_required` → a **reason picker** (preset chips from the config + optional note
    field) must be filled before the discount is accepted; send `discount_reason` / `_note`.
- All of this is best-effort UX; the server is the gate. Show server 4xx messages verbatim.

## 6. Admin UI — "Discount Controls"
New page `apps/admin-dashboard/src/pages/DiscountControlsPage.tsx` (+ route + nav under Marketing or
System). Sections:
- **Global switch** (enable/disable all manual discounts).
- **Maximum discount** — percent slider (0–100) + optional fixed MVR.
- **Per-role caps** — optional table (role → percent/fixed); empty means global applies.
- **Manager override** — toggle "require approval above cap".
- **Reasons** — required toggle + editable list (add/remove/reorder preset reasons).
- Read-only note showing which roles hold `promotions.discounts` and `promotions.discount_override`
  (link to Roles & Permissions).
Gate controls behind `discounts.settings.manage`.

## 7. Reporting (small add)
Surface reason + approver in the existing discount report
(`ReportsController` discount section) so managers can see *why* discounts were given and who approved
overrides. (Read-only; no new report page required.)

---

## 8. Build order
1. Migration: order columns + settings defaults + permission catalog additions + resync migration.
2. `DiscountSettings` support + `ManualDiscountPolicy` service (fully unit-tested).
3. Wire `OrderCreationService` + `OrderItemController` through the policy.
4. `DiscountControlsController` + routes + bootstrap config.
5. pos-web: config-driven field, override modal, reason picker.
6. admin-dashboard: Discount Controls page.
7. Reporting fields.

**Invariants:**
- Server is authoritative; the cap/permission/reason/override cannot be bypassed by the client.
- Defaults reproduce **today's behaviour** (`enabled=true`, `max_percent=100`, `fixed=0`,
  `reason_required`… see note below) so nothing breaks on deploy until an admin tightens it.
- A discount can still never exceed the subtotal.
- Every manual discount (and every override) writes exactly one audit entry.

> **Deploy-neutrality vs. reason-required:** defaulting `discount_reason_required=true` would change
> behaviour on day one (existing flows send no reason). Choose ONE: (a) default it **false** and let
> the admin turn it on, or (b) default **true** but seed the POS to send a default "Unspecified"
> reason until updated. Recommend (a) for a clean, non-breaking deploy; the admin enables it when
> ready.

---

## 9. Testing
**Backend (PHPUnit, sqlite, RefreshDatabase):**
- `ManualDiscountPolicyTest`: global switch off → 403; no permission → 403; within cap → OK; above
  cap with override disabled → 422; above cap with valid manager PIN → OK + `approvedBy` set; above
  cap with invalid/self PIN → 403; reason required + missing → 422; per-role cap beats global; never
  exceeds subtotal; audit entry written each time.
- `OrderCreationDiscountTest` / `OrderItemDiscountTest`: end-to-end create + edit go through the
  policy; reason columns persisted; totals correct after clamp.
- `DiscountControlsControllerTest`: GET returns config; PATCH validates + persists + audits; gated by
  `discounts.settings.manage`.
- Back-compat: with default settings, an actor with `promotions.discounts` can still apply any amount
  up to subtotal (today's behaviour) — proving deploy-neutrality.

**Frontend:** pos-web override modal + reason picker interaction and cap error; admin page renders and
saves. Run pos-web + admin-dashboard vitest from **repo root** (`npm ci`) then per-app
`npm test -- --run && npm run build`.

Backend: `cd backend && php artisan test`.

---

## 10. Deploy / rollback
**Deploy (cPanel):**
- `php artisan migrate --force` (columns + settings + permissions).
- `php artisan db:seed` for the reason list + resync (idempotent).
- `php artisan config:cache`.
- Rebuild + sync `backend/public/pos` and `backend/public/admin`; bump pos SW `CACHE_VERSION`.

**Safety:** all new settings default to today's behaviour (see §8), new permissions are additive,
new columns are nullable → deploy is behaviour-neutral until an admin configures caps/reasons.
Rollback = revert the release; SiteSetting rows and nullable columns are harmless if left.

---

## Appendix — default preset reasons (seed)
Loyal customer · Service recovery / complaint · Staff meal · Manager comp · Damaged / quality issue ·
Price match · Promotional (ad-hoc) · Other (note required).
