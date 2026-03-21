# Bake & Grill — Order, Invoice & Receipt Flow Overhaul

You are refactoring and extending the order/invoice/receipt system for a Maldivian café POS + online ordering platform. The codebase is a **Laravel 11 backend** (`backend/`) with multiple **React 18 + Vite** frontend apps (`apps/pos-web`, `apps/online-order-web`, `apps/admin-dashboard`).

**Currency:** MVR (Maldivian Rufiyaa). **Phone format:** +960XXXXXXX (7 digits after country code).

---

## PHASE 1: Remove Guest Order System

The guest order concept is being removed entirely. All orders must be tied to a `customer_id`. Online customers must log in (OTP or password) before ordering. Dine-in customers get linked by phone at the POS.

### 1.1 Remove guest fields from Order model and migration

**File: `backend/app/Models/Order.php`**
- Remove from `$fillable`: `guest_phone`, `guest_name`, `guest_email`, `guest_token`
- Remove from `$hidden`: `guest_token`

**Create migration:** `database/migrations/xxxx_remove_guest_fields_from_orders_table.php`
```php
// Drop columns: guest_phone, guest_name, guest_email, guest_token
// Before dropping, migrate any existing guest orders:
// UPDATE orders SET customer_id = (SELECT id FROM customers WHERE phone = orders.guest_phone LIMIT 1)
//   WHERE customer_id IS NULL AND guest_phone IS NOT NULL;
// This ensures no data loss — existing guest orders get linked to matching customers.
// Orders with guest_phone that don't match any customer: create a minimal customer record first.
```

### 1.2 Remove guest logic from OrderCreationService

**File: `backend/app/Services/OrderCreationService.php`**
- Remove from `Order::create()` payload: `guest_phone`, `guest_name`, `guest_email`, `guest_token`
- These fields should no longer appear in `$payload` — remove any references

### 1.3 Remove guest logic from StoreOrderRequest / StoreCustomerOrderRequest

**Files:**
- `backend/app/Http/Requests/StoreOrderRequest.php` — remove validation rules for `guest_phone`, `guest_name`, `guest_email`, `guest_token`
- `backend/app/Http/Requests/StoreCustomerOrderRequest.php` — same

### 1.4 Remove linkGuestOrders() from all controllers

**File: `backend/app/Http/Controllers/CustomerPortalController.php`**
- Delete the `linkGuestOrders()` method entirely
- Remove all calls to `$this->linkGuestOrders($customer)` from:
  - `verifyOtp()` (line ~223)
  - `passwordLogin()` (line ~268)
  - `resetPassword()` (line ~173)

**File: `backend/app/Http/Controllers/Api/Auth/CustomerAuthController.php`**
- Remove any `linkGuestOrders()` method and calls

### 1.5 Update notification listeners to remove guest fallbacks

**File: `backend/app/Domains/Notifications/Listeners/SendOrderConfirmationListener.php`**
- Change:
  ```php
  $phone = $order->customer?->phone ?? $order->guest_phone;
  $email = $order->customer?->email ?? $order->guest_email;
  $name  = $order->customer?->name  ?? $order->guest_name ?? 'Customer';
  ```
  To:
  ```php
  $phone = $order->customer?->phone;
  $email = $order->customer?->email;
  $name  = $order->customer?->name ?? 'Customer';
  ```
- Remove the `guest_token` URL logic. Use `tracking_token` exclusively:
  ```php
  $url = rtrim(config('app.url'), '/') . '/order/orders/' . $order->id . '?tok=' . $order->tracking_token;
  ```

**File: `backend/app/Domains/Notifications/Listeners/SendPaymentConfirmationListener.php`**
- Same changes — remove `guest_phone`, `guest_email`, `guest_name` fallbacks
- Only use `$order->customer?->phone`, `$order->customer?->email`, etc.

### 1.6 Remove guest_token from frontend OrderStatusPage

**File: `apps/online-order-web/src/pages/OrderStatusPage.tsx`**
- The `trackingToken` from `searchParams.get("tok")` stays (that's the `tracking_token`, not guest)
- Remove any reference to `guest_token` query param if present
- The page should work in two modes only:
  1. `?tok={tracking_token}` → public access via `getOrderByTrackingToken()`
  2. Authenticated user → `getOrderDetail(token, orderId)`

### 1.7 Search and clean up all remaining guest references

Run a project-wide search for these patterns and remove/update:
- `guest_phone`
- `guest_name`
- `guest_email`
- `guest_token`
- `linkGuestOrders`

Files likely affected (verify each):
- `backend/database/migrations/2026_03_20_200000_add_guest_fields_to_orders_table.php` — keep migration file but ensure the new drop-columns migration reverses it
- `backend/tests/` — update any tests referencing guest fields
- `apps/pos-web/src/` — remove guest phone/name inputs from order creation UI if any exist

---

## PHASE 2: Public Invoice Links (Pre-Payment Bill for Dine-In)

Currently, invoices are a back-office finance tool (`InvoiceController` requires `finance.invoices` permission). They have no public-facing link. We need to add token-based public access so dine-in customers can view their bill on their phone before paying.

### 2.1 Add `token` column to invoices table

**Create migration:** `database/migrations/xxxx_add_token_to_invoices_table.php`
```php
$table->string('token', 64)->nullable()->unique()->after('invoice_number');
```

**File: `backend/app/Models/Invoice.php`**
- Add `token` to `$fillable`
- Add `$hidden = ['token']` (don't leak in API list responses, only use in public URLs)
- Add auto-generation in `booted()`:
  ```php
  static::creating(function (Invoice $invoice) {
      if (empty($invoice->token)) {
          $invoice->token = Str::random(48);
      }
  });
  ```

### 2.2 Create public invoice Blade view

**Create: `backend/resources/views/invoice.blade.php`**
- Similar to `backend/resources/views/receipt.blade.php` but for invoices
- Show: business name, invoice number, issue date, line items with quantities and prices, subtotal, tax, total
- Show payment status: "UNPAID" or "PAID"
- Mobile-friendly responsive design matching the receipt page style
- Include the business logo, address, and contact info from site settings
- No login required — accessed via token

**Create: `backend/resources/views/invoice-pdf.blade.php`**
- PDF-optimized version of the invoice (similar to `receipt-pdf.blade.php`)

### 2.3 Create InvoicePageController (public, like ReceiptPageController)

**Create: `backend/app/Http/Controllers/InvoicePageController.php`**
```php
class InvoicePageController extends Controller
{
    public function show($token)
    {
        $invoice = Invoice::with(['items', 'order.items', 'customer'])
            ->where('token', $token)
            ->firstOrFail();

        return view('invoice', ['invoice' => $invoice]);
    }

    public function pdf($token)
    {
        $invoice = Invoice::with(['items', 'order.items', 'customer'])
            ->where('token', $token)
            ->firstOrFail();

        $pdf = Pdf::loadView('invoice-pdf', ['invoice' => $invoice]);
        return $pdf->stream('invoice-' . $invoice->invoice_number . '.pdf');
    }
}
```

### 2.4 Register public invoice routes

**File: `backend/routes/web.php`**
Add alongside the receipt routes:
```php
use App\Http\Controllers\InvoicePageController;

Route::get('/invoices/{token}', [InvoicePageController::class, 'show'])->name('invoices.show');
Route::get('/invoices/{token}/pdf', [InvoicePageController::class, 'pdf'])->name('invoices.pdf');
```

### 2.5 Add SMS send capability to InvoiceController

**File: `backend/app/Http/Controllers/Api/InvoiceController.php`**
Add new method:
```php
public function sendToCustomer(Request $request, int $id): JsonResponse
{
    $request->validate([
        'phone' => ['required', 'string', 'max:30'],
    ]);

    $invoice = Invoice::findOrFail($id);
    $phone = $this->normalizePhone($request->phone);
    $link = rtrim(config('app.url'), '/') . '/invoices/' . $invoice->token;

    $sms = app(SmsService::class);
    $sms->send(new SmsMessage(
        to: $phone,
        message: "Bake & Grill: Your bill #{$invoice->invoice_number} — MVR " . number_format((float) $invoice->total, 2) . ". View: {$link}",
        type: 'transactional',
        referenceType: 'invoice',
        referenceId: (string) $invoice->id,
        idempotencyKey: 'invoice:send:' . $invoice->id . ':' . $phone,
    ));

    // Update recipient info on invoice
    $invoice->update([
        'recipient_phone' => $phone,
        'status' => $invoice->status === 'draft' ? 'sent' : $invoice->status,
    ]);

    $this->audit->log('invoice.sent_to_customer', 'Invoice', $invoice->id, [], ['phone' => $phone], [], $request);

    return response()->json([
        'invoice' => $this->format($invoice->fresh()),
        'link' => $link,
    ]);
}
```

Add phone normalizer (same as CustomerPortalController):
```php
private function normalizePhone(string $phone): string
{
    $digitsOnly = preg_replace('/[^0-9]/', '', $phone);
    if (str_starts_with($digitsOnly, '960') && strlen($digitsOnly) === 10) {
        return '+' . $digitsOnly;
    }
    if (strlen($digitsOnly) === 7) {
        return '+960' . $digitsOnly;
    }
    return '+960' . substr($digitsOnly, -7);
}
```

**File: `backend/routes/api_finance.php`**
Add route inside the invoices group:
```php
Route::post('/{id}/send', [InvoiceController::class, 'sendToCustomer']);
```

---

## PHASE 3: One-Step "Send Bill" from POS for Dine-In

The cashier needs a single action: enter phone → customer gets invoice link. This combines: (1) linking customer to order, (2) creating invoice from order, (3) sending SMS.

### 3.1 Create a combined "send bill" endpoint

**File: `backend/app/Http/Controllers/Api/OrderController.php`**
Add new method:
```php
/**
 * POST /api/orders/{id}/send-bill
 *
 * Cashier enters phone number → system links customer, creates invoice, sends SMS.
 * Used for dine-in orders before payment.
 */
public function sendBill(Request $request, int $id): JsonResponse
{
    if (! $request->user()?->tokenCan('staff')) {
        return response()->json(['message' => 'Forbidden'], 403);
    }

    $request->validate([
        'phone' => ['required', 'string', 'max:30'],
    ]);

    $order = Order::with(['items.item', 'customer'])->findOrFail($id);
    $phone = $this->normalizePhone($request->phone);

    // 1. Link customer to order (find or create by phone)
    $customer = Customer::firstOrCreate(
        ['phone' => $phone],
        ['loyalty_points' => 0, 'tier' => 'bronze']
    );
    if (! $order->customer_id) {
        $order->update(['customer_id' => $customer->id]);
    }

    // 2. Create invoice from order (reuse existing if already created)
    $invoice = Invoice::where('order_id', $order->id)->where('type', 'sale')->first();
    if (! $invoice) {
        $invoice = app(InvoiceController::class)->createFromOrderInternal($order, $request->user());
    }

    // 3. Send SMS with invoice link
    $link = rtrim(config('app.url'), '/') . '/invoices/' . $invoice->token;
    app(SmsService::class)->send(new SmsMessage(
        to: $phone,
        message: "Bake & Grill: Your bill #{$invoice->invoice_number} — MVR " . number_format((float) $invoice->total, 2) . ". View: {$link}",
        type: 'transactional',
        referenceType: 'invoice',
        referenceId: (string) $invoice->id,
        idempotencyKey: 'invoice:bill:' . $invoice->id,
    ));

    $invoice->update([
        'recipient_phone' => $phone,
        'status' => 'sent',
    ]);

    app(AuditLogService::class)->log('order.bill_sent', 'Order', $order->id, [], ['phone' => $phone, 'invoice_id' => $invoice->id], [], $request);

    return response()->json([
        'order' => $order->fresh('customer'),
        'invoice' => $invoice,
        'link' => $link,
    ]);
}
```

Consider extracting `createFromOrderInternal` as a public method on InvoiceController (or a service) that returns an Invoice without wrapping in JsonResponse, so it can be reused from sendBill.

### 3.2 Register the route

**File: `backend/routes/api.php`**
Add inside the staff-authenticated group (near other order routes):
```php
Route::post('/orders/{id}/send-bill', [OrderController::class, 'sendBill']);
```

### 3.3 Add phone normalizer to OrderController

Add the same `normalizePhone()` helper method to OrderController (or extract to a shared trait/helper used by both CustomerPortalController and OrderController).

Consider creating `app/Support/PhoneNormalizer.php`:
```php
class PhoneNormalizer
{
    public static function normalize(string $phone): string
    {
        $digitsOnly = preg_replace('/[^0-9]/', '', $phone);
        if (str_starts_with($digitsOnly, '960') && strlen($digitsOnly) === 10) {
            return '+' . $digitsOnly;
        }
        if (strlen($digitsOnly) === 7) {
            return '+960' . $digitsOnly;
        }
        return '+960' . substr($digitsOnly, -7);
    }
}
```
Then replace all inline `normalizePhone()` methods in CustomerPortalController, CustomerAuthController, OrderController, InvoiceController with `PhoneNormalizer::normalize()`.

---

## PHASE 4: Auto-Send Receipt After Dine-In Payment

Currently `SendPaymentConfirmationListener` only handles online order types (`online_pickup`, `online_delivery`). Dine-in customers with a phone number should also get a receipt link automatically.

### 4.1 Extend SendPaymentConfirmationListener

**File: `backend/app/Domains/Notifications/Listeners/SendPaymentConfirmationListener.php`**

Change the listener to handle ALL order types that have a customer with a phone:

```php
public function handle(OrderPaid $event): void
{
    $order = Order::with(['items.item', 'customer'])->find($event->data->orderId);
    if (! $order) return;

    $phone = $order->customer?->phone;
    if (! $phone) return;

    $email = $order->customer?->email;
    $name  = $order->customer?->name ?? 'Customer';

    // Build appropriate tracking URL
    $url = rtrim(config('app.url'), '/') . '/order/orders/' . $order->id . '?tok=' . $order->tracking_token;

    // Determine message based on order type
    if (in_array($order->type, ['dine_in', 'takeaway'])) {
        $message = "Bake & Grill: Thanks for dining with us! Receipt for order #{$order->order_number}: {$url}";
    } else {
        $message = "Bake & Grill: Payment received! Order #{$order->order_number} is confirmed. Track: {$url}";
    }

    // SMS
    try {
        $this->sms->send(new SmsMessage(
            to: $phone,
            message: $message,
            type: 'transactional',
            customerId: $event->data->customerId,
            referenceType: 'order',
            referenceId: (string) $order->id,
            idempotencyKey: 'order:paid:confirm:' . $order->id,
        ));
    } catch (\Throwable $e) {
        Log::error('SendPaymentConfirmationListener: SMS failed', [
            'order_id' => $order->id, 'error' => $e->getMessage(),
        ]);
    }

    // Email (optional)
    if ($email) {
        try {
            Mail::to($email)->send(new OrderConfirmationMail($order, $url, $name));
        } catch (\Throwable $e) {
            Log::error('SendPaymentConfirmationListener: email failed', [
                'order_id' => $order->id, 'error' => $e->getMessage(),
            ]);
        }
    }
}
```

Remove the `ONLINE_TYPES` filter. The only guard is: does the order have a customer with a phone?

### 4.2 Also auto-create Receipt record for dine-in

**File: `backend/app/Domains/Notifications/Listeners/SendPaymentConfirmationListener.php`**
Or create a new listener on `OrderPaid`:

After sending SMS, also create a Receipt record (so the customer has a permanent receipt link):
```php
$receipt = Receipt::firstOrNew(['order_id' => $order->id]);
if (! $receipt->exists) {
    $receipt->token = Str::random(48);
}
$receipt->fill([
    'customer_id' => $order->customer_id,
    'channel' => 'sms',
    'recipient' => $phone,
    'sent_at' => now(),
    'last_sent_at' => now(),
    'resend_count' => 1,
]);
$receipt->save();
```

Then include receipt link in the SMS instead of (or in addition to) tracking URL:
```php
$receiptLink = rtrim(config('app.url'), '/') . '/receipts/' . $receipt->token;
```

For dine-in, the receipt link is more useful than the tracking link. Consider:
- **Online orders** → send tracking URL (order status matters while waiting)
- **Dine-in orders** → send receipt link (customer already left, just needs proof of payment)

---

## PHASE 5: Unify Tracking URL Format

Two listeners currently use different URL patterns. Standardize to one format.

### 5.1 Fix SendOrderConfirmationListener

**File: `backend/app/Domains/Notifications/Listeners/SendOrderConfirmationListener.php`**

Change:
```php
$base = rtrim(config('app.url'), '/') . '/order/status/' . $order->id;
$url  = $order->guest_token
    ? $base . '?guest_token=' . $order->guest_token
    : $base;
```

To:
```php
$url = rtrim(config('app.url'), '/') . '/order/orders/' . $order->id . '?tok=' . $order->tracking_token;
```

This uses the same format as `SendPaymentConfirmationListener`. The `tracking_token` is auto-generated on every order (see `Order::booted()`), so it's always available.

### 5.2 Clean up frontend

**File: `apps/online-order-web/src/pages/OrderStatusPage.tsx`**
- Remove any `guest_token` query parameter handling
- Ensure `tok` query parameter (tracking_token) is the only public access method
- Two access modes: (1) `?tok=xxx` for public, (2) authenticated user

---

## PHASE 6: POS UI — "Send Bill" Button

### 6.1 Add Send Bill UI to POS payment flow

**File: `apps/pos-web/src/` (identify the payment/checkout component)**

Add a "Send Bill" button/section that appears for dine-in orders before payment:
- Shows a phone input field (numeric, 7 digits, auto-prefixes +960)
- "Send Bill" button calls `POST /api/orders/{id}/send-bill` with the phone
- Shows success toast: "Bill sent to +960XXXXXXX"
- Shows the invoice link for reference
- The phone field should remember recently used numbers (localStorage) for repeat customers

### 6.2 Add to POS API client

**File: `apps/pos-web/src/api.ts`**
Add:
```typescript
export async function sendBill(token: string, orderId: number, phone: string) {
  const res = await fetch(`${API_BASE}/api/orders/${orderId}/send-bill`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ phone }),
  });
  if (!res.ok) throw new Error('Failed to send bill');
  return res.json();
}
```

---

## PHASE 7: Admin Dashboard — Invoice Management Updates

### 7.1 Add "Send to Customer" button in invoice detail view

**File: `apps/admin-dashboard/src/` (find the invoice detail/list page)**

- Add a "Send SMS" button on each invoice
- Opens a modal with phone input
- Calls `POST /api/invoices/{id}/send`
- Shows success with the public link

### 7.2 Show public link on invoice detail

- Display the public invoice URL: `{app_url}/invoices/{token}`
- Add a "Copy Link" button
- Show send history (if recipient_phone is set, show "Sent to +960XXXXXXX")

---

## IMPLEMENTATION ORDER

Execute phases in this order:

1. **Phase 1** (Remove guest orders) — do this first as it simplifies everything
2. **Phase 5** (Unify tracking URLs) — quick fix, removes confusion
3. **Phase 2** (Public invoice links) — backend infrastructure
4. **Phase 3** (Send bill endpoint) — depends on Phase 2
5. **Phase 4** (Auto-send receipt) — independent of Phase 2/3
6. **Phase 6** (POS UI) — depends on Phase 3
7. **Phase 7** (Admin UI) — depends on Phase 2

---

## KEY FILES REFERENCE

### Backend — Models
- `backend/app/Models/Order.php` — Order model, has `tracking_token` auto-generation
- `backend/app/Models/Invoice.php` — Invoice model (needs `token` column)
- `backend/app/Models/Receipt.php` — Receipt model (has `token`, public access pattern to follow)
- `backend/app/Models/Customer.php` — Customer model, phone-based identity

### Backend — Controllers
- `backend/app/Http/Controllers/Api/OrderController.php` — order CRUD, add `sendBill()`
- `backend/app/Http/Controllers/Api/InvoiceController.php` — invoice CRUD, add `sendToCustomer()`
- `backend/app/Http/Controllers/Api/ReceiptController.php` — receipt pattern to follow
- `backend/app/Http/Controllers/ReceiptPageController.php` — public receipt page pattern to follow
- `backend/app/Http/Controllers/CustomerPortalController.php` — remove `linkGuestOrders()`
- `backend/app/Http/Controllers/Api/Auth/CustomerAuthController.php` — remove guest linking

### Backend — Services & Events
- `backend/app/Services/OrderCreationService.php` — remove guest fields
- `backend/app/Domains/Notifications/Listeners/SendOrderConfirmationListener.php` — remove guest fallbacks, fix URL
- `backend/app/Domains/Notifications/Listeners/SendPaymentConfirmationListener.php` — extend to all order types
- `backend/app/Domains/Notifications/Services/SmsService.php` — SMS sending service

### Backend — Routes
- `backend/routes/api.php` — add `send-bill` route
- `backend/routes/api_finance.php` — add invoice `send` route
- `backend/routes/web.php` — add public invoice routes

### Frontend — Online Order App
- `apps/online-order-web/src/pages/OrderStatusPage.tsx` — clean up guest_token refs
- `apps/online-order-web/src/pages/OrderHistoryPage.tsx` — no changes needed

### Frontend — POS App
- `apps/pos-web/src/api.ts` — add `sendBill()` API call
- `apps/pos-web/src/hooks/useOrderCreation.ts` — remove guest fields from order payload
- `apps/pos-web/src/components/` — add Send Bill UI component

### Frontend — Admin Dashboard
- `apps/admin-dashboard/src/` — add Send SMS button to invoice views

---

## TESTING CHECKLIST

After implementation, verify:

- [ ] Creating an order without `customer_id` from POS still works (customer gets linked via send-bill)
- [ ] Online order flow: login → order → payment → SMS with tracking link → view without login
- [ ] Dine-in flow: POS order → cashier sends bill → customer views invoice (no login) → payment → auto receipt SMS → customer views receipt (no login)
- [ ] Same customer dine-in + online: both orders appear in order history after login
- [ ] Invoice public page renders correctly on mobile
- [ ] Invoice PDF downloads correctly
- [ ] Receipt auto-send fires for dine-in orders with customer phone
- [ ] Receipt auto-send does NOT fire for orders without customer phone
- [ ] No remaining references to `guest_phone`, `guest_name`, `guest_email`, `guest_token` in codebase
- [ ] Existing tests pass (update any that reference guest fields)
- [ ] Phone normalization works: `7654321` → `+9607654321`, `9607654321` → `+9607654321`

---

## IMPORTANT CONSTRAINTS

- **Do NOT break existing online ordering** — the OTP → login → order → track flow must keep working
- **Do NOT remove the `tracking_token`** on Order — it's used for public order tracking and must stay
- **Invoices are dual-purpose** — they remain a finance/accounting tool AND become customer-facing. Don't remove any existing invoice functionality
- **SMS costs money** — only send when explicitly triggered (send-bill) or on payment (auto-receipt). Never send unsolicited
- **Phone normalization** — always normalize to +960XXXXXXX format before storing or comparing
- **Idempotency** — all SMS sends must have idempotency keys to prevent duplicate sends on queue retry
