# Security Audit — 2026-08-24

Scope: the access boundary. Three money audits asked "can someone pay less or
take more?" — none asked "can someone **see** or **do** what they shouldn't?"
This pass covers:

- Token abilities, auth guards, and the staff/customer/driver/board boundaries
- IDOR on customer-facing endpoints
- Permission coverage on staff/admin routes, and privilege escalation
- What unauthenticated endpoints return
- Upload handling, throttling, CSRF, and secrets

Audited against `main` at `ed183bf5f`. Read-only — **nothing in this report has
been changed.** Traced by reading, with route middleware enumerated from
`route:list` rather than eyeballed, but **not** by running an attack against a
live system. The distinction matters most for S1, where whether the finding is
critical or theoretical depends on the web server's configuration, not on the
code. That should be checked on the actual host before anything else.

The previous security document (`SECURITY_AUDIT_AND_IMPLEMENTATION_GUIDE.md`,
March 2026) predates the board tokens, catering quotes, customer deposits,
trade accounts and the content hub. This supersedes it for those areas.

## Bottom line

The auth architecture is in good shape and clearly deliberate: four separate
token abilities with dedicated middleware for each, session and bearer paths
both handled, customer records consistently scoped through the owning
relationship rather than by trusting an id in the URL. There is a real
`tests/Feature/Security/` suite already — route-surface regression, privilege
escalation, inactive-token rejection, trusted proxies. That is a better
starting position than most.

Four findings. One is potentially serious and needs a five-minute check on the
server to settle: **the media library takes the file extension from the
uploader**, so a manager-level account may be able to write a `.php` file into
the public web root. The other three are a device-approval control that any
staff token can bypass, and two endpoints that return more than they mean to.

---

## Findings

### S1 — Media uploads take their file extension from the client, into the web root
**Severity: High if PHP executes under `public/storage`, otherwise Low** ·
`app/Services/MenuImageProcessor.php:119-125` (`storeRaw`),
`app/Domains/Media/Services/MediaLibraryService.php:542`

`storeBinary` derives the stored extension from the **uploader**:

```php
$ext = strtolower($file->getClientOriginalExtension() ?: ($type === 'document' ? 'pdf' : 'mp3'));
$path = $this->images->storeRaw($file, $dir, $ext);
```

and `storeRaw` uses it verbatim — `Str::uuid() . '.' . $ext` — with no
allowlist and no sanitisation. The filename is a UUID, so there is no path
traversal, but **the extension is attacker-chosen**.

The content check does not save you here. `mediaTypeFromMime` sniffs the real
MIME with `finfo` (not the client's `Content-Type`), and rejects anything
outside images, three video types, three audio types, and `application/pdf` —
so a plain PHP script is refused. But `finfo` identifies a PDF by the leading
`%PDF-` bytes, and a PDF is tolerant of arbitrary trailing content. A file
that begins `%PDF-1.4` and contains `<?php … ?>` further down:

1. sniffs as `application/pdf` → accepted as a document,
2. is stored as `<uuid>.php` because the client named it `invoice.php`,
3. lands in `storage/app/public/library/documents/`, which `storage:link`
   exposes at `public/storage/...` — inside the docroot.

If the web server executes `.php` under that path — the default on most
cPanel/LiteSpeed setups unless explicitly disabled — that is remote code
execution from a **manager** account. `media.manage` is in `managerSlugs()`,
not owner-only, so this crosses a trust boundary the permission system exists
to enforce.

**Settle it first, before writing any code.** On the server:

```bash
cd /home/bakeandgrill/public_html/backend
printf '<?php echo "EXEC-TEST-OK";' > storage/app/public/exec-probe.php
curl -s https://bakeandgrill.mv/storage/exec-probe.php; echo
rm storage/app/public/exec-probe.php
```

If that prints `EXEC-TEST-OK`, the finding is live and High. If it prints the
PHP source, or 403s, PHP does not execute there and this drops to Low —
still worth fixing, because that configuration can change under you.

The fix either way is small: allowlist the extension from the *detected* MIME
type rather than accepting the client's, so a `application/pdf` always lands
as `.pdf`. Add `.htaccess` deny rules under the storage directory as
defence in depth.

The image path is **not** affected — `storeImage` re-encodes through a
jpeg/png/webp allowlist and rejects SVG, which also closes the stored-XSS
route.

**Fixed 2026-08-24, application-side only.** `storeRaw()` refuses any extension
outside `SAFE_EXTENSIONS`; `storeBinary()` derives the extension from the
sniffed MIME type rather than the filename. Both are tested
(`UploadExtensionHardeningTest`).

A web-server layer was tried and withdrawn. A rewrite block denying executable
extensions under `/storage` was added to `backend/public/.htaccess`, then
removed after the site went down — and the removal turned out to be the wrong
inference: the site later served 200 with the block present, so it was never
the cause. It stays out anyway, deliberately. It is a second layer on a
control that already holds, it cannot be verified from a development machine
against this host (cPanel/LiteSpeed, not Apache), and the cost of getting
production web-server config wrong is a full outage. If it is ever wanted, the
sequence is: add it, write a probe `.php` under `storage/app/public`, confirm
the request returns 403 instead of executing, then remove the probe.

Found while testing this: `storeRaw()` already registers the path in the media
catalog and `media_assets.path` is unique, so `storeBinary()`'s plain insert
threw a constraint violation — every PDF and audio upload to the media library
had been failing with a 500. Now an `updateOrCreate` on the path.

### S2 — Any staff token can approve a device, bypassing `devices.approve`
**Severity: Medium** · `app/Http/Controllers/Api/Auth/DeviceController.php:66-108`,
`routes/domains/devices.php:29,35`

Device approval is a deliberate control with its own permission:

```php
Route::patch('/{id}/approve', [DeviceController::class, 'approve'])
    ->middleware('permission:devices.approve');
```

But `POST /api/devices/self-register` sits beside it with **no permission
middleware at all** — only `staff.token` and a rate limit — and it approves
outright:

- an unknown identifier creates a device with `'is_active' => true,
  'status' => 'approved'`;
- a **pending** device is flipped to `approved` + `is_active` on sight.

So any authenticated staff user — a cashier — can register a new terminal, or
promote one an owner deliberately left pending, without holding
`devices.approve`. Since `EnsureActiveDevice` / `EnsureStaffActiveDevice` gate
POS access on device approval, this defeats a second factor that is meant to
bind sessions to known hardware.

Two things suggest this is a bug rather than a decision. `selfStatus` right
below it is documented as *"Check own device status (called by POS while
waiting for approval)"* — polling for an approval that `selfRegister` has
already granted makes no sense. And the permission exists and is enforced on
the other route.

Mitigating: it is audit-logged (`device.self_registered`), so it is detectable
after the fact, and the caller must already hold valid staff credentials.

**Verify before fixing** — if POS terminals genuinely self-onboard in the
field with no admin present, making this create a `pending` device will break
that flow until someone approves. That is a question about how you actually
set up a new till.

### S3 — The public receipt endpoint returns the whole order row, unthrottled
**Severity: Medium** · `app/Http/Controllers/Api/ReceiptController.php:111-122`,
`routes/api.php:114`, `app/Models/Order.php:105`

```php
return response()->json([
    'receipt' => $receipt,
    'order'   => $receipt->order,
    …
]);
```

No field whitelist, and `Order` sets `protected $hidden = []` explicitly — so
everything on the row goes out to anyone holding the receipt token: internal
staff `notes`, `user_id`, `shift_id`, `device_id`, every discount column, and
the order's `tracking_token`. Compare `OrderTrackingController`, which builds
an explicit array for exactly this reason.

The route is also the **only** public token endpoint with no throttle
(`['api']` and nothing else — verified against `route:list`; the other eight
unthrottled public routes are cheap catalog reads). The 48-character token
makes brute force infeasible, so this is about payload, not guessing — but the
missing limiter is inconsistent with every sibling route and `PublicEndpointThrottleTest`
does not cover it.

Nothing here is a credential and the token holder is the customer, so this is
over-exposure rather than a breach: internal staff notes about an order are
not something you would choose to hand to the customer.

### S4 — Order tracking leaks delivery PII while its docblock says it does not
**Severity: Low** · `app/Http/Controllers/Api/Orders/OrderTrackingController.php:13-49`

The method is documented *"Only exposes status and items, not customer PII"*
and then returns `delivery_address_line1`, `delivery_island`,
`delivery_contact_name` and `delivery_contact_phone`. The inline comment
("customer already knows their own address") is the real reasoning and it is
defensible for a capability URL — but tracking links travel: forwarded SMS,
shared screenshots, browser history, referrer headers. Name, phone and address
in a link that gets forwarded is a different exposure from an order status.

The mismatch between the docblock and the code is the actual problem: the next
person to add a field will trust the docblock and add PII believing there is
none. Either correct the docblock or drop the contact fields — but they should
agree.

---

## Checked and found sound (no action)

- **Token abilities.** Four distinct abilities (`staff`, `customer`, `driver`,
  `board`), each with dedicated middleware, all TTL-bounded from config. Every
  one checks the *tokenable model class*, not just the ability, so a customer
  bearer cannot reach a staff route and vice versa. `EnsureCustomerToken`
  deliberately prefers an explicit bearer so a concurrent staff web session
  cannot shadow customer access — a subtle case, handled.
- **Customer IDOR.** Consistently scoped through the owning relationship:
  `$customer->orders()->findOrFail($id)`, `$customer->addresses()->whereKey($id)`,
  trade endpoints filtered by the customer's own trade account. Not one
  customer-facing controller trusts an id from the URL. `cancelOrder`
  re-checks `customer_id` explicitly on top.
- **Route permission coverage.** 33 staff routes carry no permission
  middleware; every one I sampled enforces it in the controller instead
  (`SmsControlCenterController` checks `sms.settings.manage`/`sms.logs.view`
  before anything else). `AdminRoutePermissionsSnapshotTest` pins the whole
  route→permission map to a committed fixture, so a silently dropped gate
  fails the build. The one genuine gap is S2.
- **Customer auth moved to sessions.** Bearer tokens named `customer-%` are
  actively revoked on password reset; auth is cookie/session based through the
  `customer` guard, which is why CSRF and `statefulApi()` matter more here
  than token TTLs.
- **CSRF exceptions** are four narrow families (staff auth, deploy webhook,
  document-token complaint forms, board pairing), each with a written
  justification. The board-pairing reasoning — "there is no session to ride,
  and both routes are rate limited" — is correct.
- **Image uploads** re-encode through a jpeg/png/webp allowlist and reject
  SVG and HEIC explicitly, closing both stored-XSS and the polyglot route that
  makes S1 possible on the document path.
- **Security headers** set a CSP with per-request nonces and
  `frame-ancestors 'none'` except for the deliberate embeddable preview.
- **Existing security tests.** `tests/Feature/Security/` already covers route
  surface regression, staff route middleware, owner privilege escalation,
  inactive token rejection, trusted proxies, audit-log coverage and public
  endpoint throttling. BML log redaction has its own test.
- **Throttling.** Driver PIN login 5/min, customer login through
  `CustomerLoginThrottle`, OTP paths limited, order creation capped per 15 min.
  Only 9 of 81 public routes are unthrottled and eight are cheap catalog reads.
- **Public health** returns `status` plus a short commit hash — deliberate,
  and nothing else.

## What this pass did not do

No live attack, no authenticated session testing, no dependency CVE scan, and
no review of the frontend apps' handling of tokens in browser storage. S1's
severity is unresolved until the probe above is run on the real host. Payroll
does not exist in this codebase, and card data never touches it — BML and
Stripe are both redirect/gateway integrations — so PCI scope is limited to not
logging what comes back, which the redaction test covers.
