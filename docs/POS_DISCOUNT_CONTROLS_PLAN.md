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
| Approval flow | none | **SMS one-time-code approval** (see §3A) — every manual discount, code to admin-managed approvers |
| Reason | none | required toggle + admin-editable preset list + optional note; new order columns |
| Audit | none (discount-specific) | log every manual discount + every override |

**Owner decisions locked:** include **all** of the above as **admin-configurable settings** (global
switch, who, max, per-role, override, reasons). Reasons = **preset list + optional note**.

> **UPDATE (supersedes the static-PIN override below):** the override mechanism is an **SMS one-time
> code**, not a manager typing their own PIN at the terminal. See **Section 3A** — it is the primary
> approval flow and replaces §3.4's static-PIN step. Owner decisions for it:
> - **Fresh one-time code per request** (random 4-digit, ~10-min expiry, bound to that exact order +
> amount, attempt-limited).
> - **Every manual discount requires approval** (not just above-cap) — gated by a master toggle that
> defaults **off** for a non-breaking deploy; admin turns it on.
> - **Admin-managed approver list** — the specific people who receive codes.
>
> Where §3.2/§3.4/§5 mention a static override PIN, read them through Section 3A. The caps, reasons,
> audit, and central-policy design all still apply.

---

## 3A. SMS one-time-code approval (primary override mechanism)

### 3A.1 Flow
1. Cashier enters a manual discount (+ reason if required) and taps apply/charge.
2. POS calls **request-approval**. The server (via `ManualDiscountPolicy`) validates: global switch on,
 actor has `promotions.discounts`, reason present if required, and the amount is within the effective
 cap (percent/fixed/role). If any fail → 4xx, no code sent.
3. Server creates a **pending approval record**, generates a random **4-digit code**, stores only its
 **hash** with `expires_at` (~10 min), `attempts = 0`, and the exact `order_id + discount_laar`
 it authorizes. It sends the code by SMS to **every approver on the admin list**, then returns an
 `approval_id` (no code) to POS.
4. POS shows an **"Enter approval code"** popup.
5. Approver relays the code; cashier types it. POS calls **confirm** with `approval_id + code`.
6. Server verifies: not expired, `attempts < max` (e.g. 5), hash matches, and the pending record's
 amount/order still match the current request. On success → mark approved, set `approved_by` to the
 approver whose list membership sent it (or the first approver; see 3A.4), apply the discount via the
 normal `ManualDiscountPolicy` path, write the audit entry, return the updated order. On failure →
 increment `attempts`; after max, invalidate the record (a fresh request is required).

### 3A.2 Settings (add to §3.1)
| Key | Type | Default | Meaning |
|---|---|---|---|
| `discount_approval_required` | bool | `false` | Master toggle for the whole SMS-OTP flow. **Default off = deploy-neutral.** When on, **every** manual discount needs an approval code. |
| `discount_approval_approvers` | JSON list | `[]` | Admin-managed approvers: `[{user_id?, phone, label}]`. Codes are SMS'd to each. |
| `discount_approval_code_ttl_minutes` | int | `10` | Code lifetime. |
| `discount_approval_max_attempts` | int | `5` | Wrong-code tries before the code is invalidated. |

> The per-role caps + global max % / fixed from §3.1 remain the **hard ceiling**: an approval code can
> authorize a discount only **up to** the cap. Codes never let anyone exceed the configured maximum —
> approval controls *who signs off*, caps control *how big it can be*.

### 3A.3 Storage (new table `discount_approvals`)
`id, order_id (nullable, FK), requested_by (FK users), subtotal_laar, discount_laar, discount_percent,
reason, reason_note, code_hash, expires_at, attempts, status (pending|approved|expired|failed),
approved_by (nullable FK users), created_at`. Never store the plaintext code. Index `(status,
expires_at)` for cleanup.

### 3A.4 The approval SMS is a first-class SMS type
Register a new type in the **SMS Control Center registry** (`SmsTypeRegistry`), so its wording is
admin-editable and it flows through the audited `SmsService`:
```
'discount_approval_otp' → category 'system', always_on true (never suppressed by marketing opt-out),
template slug 'discount_approval_otp', send via SmsService. Body redacted in sms_logs (like auth OTP).
```
Default template: `"Bake & Grill: approval code {code} for a {percent}% ({amount}) discount on order
{order}. Expires in {minutes} min. Do not share."` Variables: `code, percent, amount, order, minutes`.
- Because it is `always_on` it ignores per-type marketing toggles, **but** the SMS **global kill
 switch** still blocks it — document that turning off all SMS also blocks discount approvals (and
 therefore discounts, when `discount_approval_required` is on). That coupling is intended.
- `approved_by`: if multiple approvers are texted the same code, attribute the approval to the first
 approver on the list (all received the same code); record the full approver set in the audit meta.

### 3A.5 Security requirements (must implement)
- Code is **4 random digits**, compared by hash, **expires**, and is **attempt-limited** — a bare
 4-digit code is brute-forceable without these.
- Code is **bound to the exact `order_id + discount_laar`**: confirm re-checks the pending record's
 amount against the current request so a code for a 5% discount can't approve a 50% one.
- Rate-limit `request-approval` (throttle) to stop SMS-bombing approvers.
- The confirm endpoint is the authoritative gate; POS is never trusted.

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
- `GET /admin/discounts/controls` → all settings above + resolved role caps + the reason list.
- `PATCH /admin/discounts/controls` → validate + persist each setting (booleans, `0<=percent<=100`,
 `fixed>=0`, well-formed `role_caps` JSON, non-empty reason labels). Audit-logged.

Plus a tiny **public-to-POS** read so the cart can enforce/prefill: extend the existing POS bootstrap
(`PosBootstrapController`) to include the effective discount config for the logged-in actor
(their cap %, fixed cap, whether reasons are required, the reason list, whether SMS approval is
required) — never trust it for enforcement, only for UX.

**Approval endpoints (§3A):**
- `POST /orders/{order}/discount/request-approval` → `permission:promotions.discounts`,
 `throttle:5,1`. Body `{ discount_amount, reason, reason_note }`. Runs the policy pre-checks, creates
 the pending `discount_approvals` record, sends the OTP SMS to approvers, returns `{ approval_id }`
 (never the code). If `discount_approval_required` is off, this step is skipped by POS entirely and
 the discount applies through the normal path.
- `POST /orders/{order}/discount/confirm` → `permission:promotions.discounts`, `throttle:10,1`.
 Body `{ approval_id, code }`. Verifies + applies (§3A.1 step 6), returns the updated order or a 4xx
 (`expired`, `too many attempts`, `invalid code`, `amount changed`).

---

## 5. POS UX (pos-web)
- Keep the Discount field, but drive it from the bootstrap config:
 - Hidden entirely if `discount_manual_enabled` is false or actor lacks `promotions.discounts`.
 - Show the actor's cap inline ("max 10%"); reject above-cap client-side with the server message.
 - If `discount_reason_required` → a **reason picker** (preset chips + optional note) must be filled
 first; send `discount_reason` / `_note`.
- **When `discount_approval_required` is on** (every manual discount):
 1. On apply/charge, POS calls `request-approval`. On success it opens an **"Enter approval code"**
 modal (a 4-digit code entry — reuse the PIN-pad component) showing "Code sent to the manager."
 2. Cashier types the code the approver received; POS calls `confirm`.
 3. On success the discount lands and the order proceeds; on 4xx show the server message
 ("expired", "invalid code", "too many attempts" → offer **Resend** which re-requests a new code).
 - Provide a **Cancel** that abandons the pending approval (server record just expires).
- **When approval is off**, the discount applies through the normal order create/update path (today's
 single call) with the reason attached.
- All client behaviour is best-effort UX; the server (`confirm` + `ManualDiscountPolicy`) is the gate.
 Show server 4xx messages verbatim.

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
 cap → 422 (cap is a hard ceiling); reason required + missing → 422; per-role cap beats global; never
 exceeds subtotal; audit entry written each time.
- `DiscountApprovalOtpTest` (§3A): request-approval creates a pending record + sends one
 `discount_approval_otp` SMS per approver (assert via SmsLog); confirm with the right code applies the
 discount + sets `approved_by` + audits; wrong code increments attempts and after max invalidates;
 expired code → 4xx; a code issued for amount A cannot confirm a changed amount B; request-approval is
 rate-limited; when `discount_approval_required` is off the flow is skipped and discounts apply
 directly; the SMS global kill switch blocks the approval SMS (documented coupling).
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
