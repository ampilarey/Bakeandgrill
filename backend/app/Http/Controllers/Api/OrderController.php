<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Orders\DTOs\OrderPaidData;
use App\Domains\Orders\Events\OrderPaid;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCustomerOrderRequest;
use App\Http\Requests\StoreOrderBatchRequest;
use App\Http\Requests\StoreOrderPaymentsRequest;
use App\Http\Requests\StoreOrderRequest;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Payment;
use App\Services\AuditLogService;
use App\Services\OnlineOrderingGateService;
use App\Services\OrderCreationService;
use App\Services\OrderStatusMachine;
use App\Support\PhoneNormalizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class OrderController extends Controller
{
    /**
     * GET /api/orders — staff order list with filters.
     */
    public function index(Request $request): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $query = Order::with(['customer:id,name,phone', 'items:id,order_id,item_name,quantity,unit_price,total_price'])
            ->orderBy('created_at', 'desc');

        if ($request->filled('status')) {
            $statuses = explode(',', $request->input('status'));
            $validStatuses = ['pending', 'paid', 'payment_pending', 'confirmed', 'preparing', 'ready', 'delivered', 'completed', 'cancelled', 'partial', 'refunded', 'held'];
            $filtered = array_intersect($statuses, $validStatuses);
            if (!empty($filtered)) {
                count($filtered) === 1
                    ? $query->where('status', reset($filtered))
                    : $query->whereIn('status', $filtered);
            }
        }

        if ($request->filled('type')) {
            $query->where('type', $request->input('type'));
        }

        if ($request->filled('date')) {
            $query->whereDate('created_at', $request->input('date'));
        }

        if ($request->filled('date_from')) {
            $query->whereDate('created_at', '>=', $request->input('date_from'));
        }
        if ($request->filled('date_to')) {
            $query->whereDate('created_at', '<=', $request->input('date_to'));
        }

        // POS receipts panel — restrict to one device or one shift.
        if ($request->filled('device_id')) {
            $query->where('device_id', (int) $request->input('device_id'));
        }
        if ($request->filled('device_identifier')) {
            $query->whereHas('device', fn ($q) => $q->where('identifier', $request->input('device_identifier')));
        }
        if ($request->filled('shift_id')) {
            $query->where('shift_id', (int) $request->input('shift_id'));
        }
        if ($request->filled('current_shift') && $request->boolean('current_shift')) {
            $openShiftId = \App\Models\Shift::where('user_id', $request->user()->id)
                ->whereNull('closed_at')
                ->value('id');
            $query->where('shift_id', $openShiftId ?? 0);
        }

        // Open-tickets feed for the POS — only orders the cashier has parked.
        if ($request->filled('held_only') && $request->boolean('held_only')) {
            $query->where('status', 'held');
        }

        // Receipt search: order number, ticket name, customer phone, customer name.
        if ($request->filled('q')) {
            $q = trim((string) $request->input('q'));
            $query->where(function ($w) use ($q) {
                $w->where('order_number', 'like', "%{$q}%")
                  ->orWhere('ticket_name', 'like', "%{$q}%")
                  ->orWhereHas('customer', function ($c) use ($q) {
                      $c->where('name', 'like', "%{$q}%")->orWhere('phone', 'like', "%{$q}%");
                  });
            });
        }

        $perPage = min(100, max(10, (int) $request->input('per_page', 30)));
        $orders = $query->paginate($perPage);

        return response()->json($orders);
    }

    public function store(StoreOrderRequest $request): JsonResponse
    {
        if (!$request->user()->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $order = app(OrderCreationService::class)->createFromPayload(
            $request->validated(),
            $request->user(),
        );

        app(AuditLogService::class)->log('order.created', 'Order', $order->id, [], $order->toArray(), [], $request);

        return response()->json(['order' => $order], 201);
    }

    public function storeCustomer(StoreCustomerOrderRequest $request): JsonResponse
    {
        if (!$request->user()->tokenCan('customer')) {
            return response()->json(['message' => 'Forbidden - customer access only'], 403);
        }

        $customer = $request->user();
        if (!$customer instanceof Customer) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        // Gate: online ordering must be open (master switch + schedule + override)
        app(OnlineOrderingGateService::class)->assertOpen();

        $payload = $request->validated();
        $payload['customer_id'] = $customer->id;
        $payload['type'] = $payload['type'] ?? 'online_pickup';

        $order = app(OrderCreationService::class)->createFromPayload($payload, null);
        $customer->update(['last_order_at' => now()]);

        app(AuditLogService::class)->log('order.created', 'Order', $order->id, [], $order->toArray(), ['source' => 'customer'], $request);

        return response()->json(['order' => $order], 201);
    }

    public function sync(StoreOrderBatchRequest $request): JsonResponse
    {
        $payloads = $request->validated()['orders'];
        $user = $request->user();
        $processed = 0;
        $failed = [];

        // Intentional partial-success: each order is processed individually so
        // a single failure (e.g. duplicate idempotency key) does not block all
        // other orders in the batch. The caller inspects `failed` to retry.
        foreach ($payloads as $index => $payload) {
            try {
                $order = app(OrderCreationService::class)->createFromPayload($payload, $user);
                app(AuditLogService::class)->log('order.created', 'Order', $order->id, [], $order->toArray(), ['source' => 'sync', 'index' => $index], $request);
                $processed++;
            } catch (\Throwable $error) {
                logger()->error('Order sync failed', [
                    'index' => $index,
                    'error' => $error->getMessage(),
                    'trace' => $error->getTraceAsString(),
                ]);
                $failed[] = ['index' => $index, 'error' => 'Order could not be processed.'];
            }
        }

        return response()->json(['processed' => $processed, 'failed' => $failed]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        // Only staff (User model) may use this endpoint.
        // Customers must use the customer-scoped endpoint which enforces ownership.
        if (!$request->user() instanceof \App\Models\User) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $order = Order::with(['items.modifiers', 'payments', 'customer', 'table'])
            ->findOrFail($id);

        return response()->json(['order' => $order]);
    }

    public function hold(Request $request, int $id): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $payload = $request->validate([
            'ticket_name' => 'nullable|string|max:80',
            'ticket_note' => 'nullable|string|max:255',
        ]);

        $order = DB::transaction(function () use ($id, $request, $payload) {
            $order = Order::lockForUpdate()->findOrFail($id);
            app(OrderStatusMachine::class)->assertTransitionAllowed($order, 'held');
            $oldStatus = $order->status;
            $update = ['status' => 'held', 'held_at' => now()];
            if (array_key_exists('ticket_name', $payload)) {
                $update['ticket_name'] = $payload['ticket_name'] ?: null;
            }
            if (array_key_exists('ticket_note', $payload)) {
                $update['ticket_note'] = $payload['ticket_note'] ?: null;
            }
            $order->update($update);
            app(AuditLogService::class)->log('order.held', 'Order', $order->id, ['status' => $oldStatus], ['status' => 'held', 'ticket_name' => $order->ticket_name], [], $request);

            return $order;
        });

        return response()->json(['order' => $order]);
    }

    public function resume(Request $request, int $id): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $order = DB::transaction(function () use ($id, $request) {
            $order = Order::lockForUpdate()->findOrFail($id);
            app(OrderStatusMachine::class)->assertTransitionAllowed($order, 'pending');
            $oldStatus = $order->status;
            $order->update(['status' => 'pending', 'held_at' => null]);
            app(AuditLogService::class)->log('order.resumed', 'Order', $order->id, ['status' => $oldStatus], ['status' => 'pending'], [], $request);

            return $order;
        });

        return response()->json(['order' => $order]);
    }

    public function addPayments(StoreOrderPaymentsRequest $request, int $id): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $validated = $request->validated();
        $printReceipt = !array_key_exists('print_receipt', $validated) || $validated['print_receipt'] === true;

        // Single transaction with row-lock to prevent concurrent split-payment race conditions
        // where two requests both read paidTotal < total and both set status = 'partial'.
        [$order, $paidTotal] = DB::transaction(function () use ($id, $validated, $request, $printReceipt): array {
            $order = Order::with('payments')->lockForUpdate()->findOrFail($id);

            // Guard: payments cannot be added to terminal or already-paid orders
            $machine = app(OrderStatusMachine::class);
            $terminalStatuses = ['cancelled', 'refunded', 'paid', 'completed'];
            if (in_array($order->status, $terminalStatuses, true)) {
                abort(422, "Cannot add payments to a {$order->status} order.");
            }

            $oldStatus = $order->status;

            foreach ($validated['payments'] as $paymentPayload) {
                // Online/gateway methods require async confirmation; all other methods (cash, card POS, etc.)
                // are treated as immediately paid. Staff cannot arbitrarily set status.
                $gatewayMethods = ['bml_pay', 'bml', 'online'];
                $paymentStatus = in_array($paymentPayload['method'], $gatewayMethods, true) ? 'pending' : 'paid';

                $payment = Payment::create([
                    'order_id' => $order->id,
                    'method' => $paymentPayload['method'],
                    'amount' => $paymentPayload['amount'],
                    'status' => $paymentStatus,
                    'reference_number' => $paymentPayload['reference_number'] ?? null,
                    'processed_at' => now(),
                ]);

                app(AuditLogService::class)->log('payment.created', 'Payment', $payment->id, [], $payment->toArray(), ['order_id' => $order->id], $request);
            }

            // Re-sum inside the lock so we see all newly inserted payments.
            // Use integer laari to avoid float precision issues (COALESCE covers legacy
            // POS payments that may only have 'amount' populated, not 'amount_laar').
            $paidTotalLaar = (int) $order->payments()
                ->whereIn('status', ['paid', 'completed', 'confirmed'])
                ->selectRaw('COALESCE(SUM(amount_laar), SUM(ROUND(amount * 100))) as total_laar')
                ->value('total_laar');

            $orderTotalLaar = $order->total_laar ?? (int) round($order->total * 100);
            $paidTotal = round($paidTotalLaar / 100, 2);

            if ($paidTotalLaar >= $orderTotalLaar) {
                $order->update(['status' => 'paid', 'paid_at' => now()]);

                app(AuditLogService::class)->log('order.paid', 'Order', $order->id, ['status' => $oldStatus], ['status' => 'paid'], ['paid_total' => $paidTotal], $request);

                DB::afterCommit(function () use ($order, $printReceipt): void {
                    OrderPaid::dispatch(OrderPaidData::fromOrder($order->fresh(), $printReceipt));
                });
            } else {
                $order->update(['status' => 'partial']);

                app(AuditLogService::class)->log('order.partial', 'Order', $order->id, ['status' => $oldStatus], ['status' => 'partial'], ['paid_total' => $paidTotal], $request);
            }

            return [$order, $paidTotal];
        });

        return response()->json([
            'order' => $order->fresh('payments'),
            'paid_total' => $paidTotal,
        ]);
    }

    /**
     * GET /api/orders/track/{token}
     *
     * Public order tracking — no authentication required.
     * Only exposes status and items, not customer PII.
     */
    public function trackByToken(string $token): JsonResponse
    {
        $order = Order::with(['items'])
            ->where('tracking_token', $token)
            ->first();

        if (!$order) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        return response()->json([
            'order' => [
                'id' => $order->id,
                'order_number' => $order->order_number,
                'status' => $order->status,
                'type' => $order->type,
                'total' => $order->total,
                'paid_at' => $order->paid_at,
                'estimated_wait_minutes' => $order->estimated_wait_minutes,
                // Delivery info (customer already knows their own address)
                'delivery_address_line1' => $order->delivery_address_line1,
                'delivery_island' => $order->delivery_island,
                'delivery_contact_name' => $order->delivery_contact_name,
                'delivery_contact_phone' => $order->delivery_contact_phone,
                'items' => $order->items,
            ],
        ]);
    }

    /**
     * POST /api/orders/{id}/send-bill
     *
     * Cashier wants to surface the bill to the customer before payment.
     *
     * Two modes (single endpoint so we don't fan out to ensure-invoice +
     * send-invoice):
     *   - phone provided  → link the customer (firstOrCreate by phone),
     *                       create the invoice, SMS the public view link.
     *   - phone omitted   → ensure an invoice exists, return the link
     *                       only. Used by the POS "Print bill" button so
     *                       the cashier can pop /invoices/{token} in a
     *                       new tab and print without spamming an SMS.
     *
     * Invoice creation is idempotent (createFromOrderInternal returns the
     * existing row if one was already minted), so calling this multiple
     * times is safe.
     */
    public function sendBill(Request $request, int $id): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $request->validate([
            // Same shape check as CustomerController@quickCreate — phone
            // must be at least 5 digits when provided. PhoneNormalizer is
            // permissive and would otherwise happily turn "!!!" into "+960".
            'phone' => ['nullable', 'string', 'max:30', 'regex:/^\+?[\d\s\-]{5,}$/'],
        ]);

        $order = Order::with(['items.item', 'customer'])->findOrFail($id);
        $rawPhone = $request->input('phone');
        $phone = null;
        if ($rawPhone !== null && trim((string) $rawPhone) !== '') {
            try {
                $phone = PhoneNormalizer::normalize($rawPhone);
            } catch (\Throwable $e) {
                return response()->json(['message' => 'Invalid phone number.'], 422);
            }

            // Phone provided → link the customer if the order isn't already
            // attached to one. We never overwrite an existing customer link
            // (cashier already chose who the order belongs to).
            $customer = Customer::firstOrCreate(
                ['phone' => $phone],
                ['loyalty_points' => 0, 'tier' => 'bronze'],
            );
            if (!$order->customer_id) {
                $order->update(['customer_id' => $customer->id]);
                $order->setRelation('customer', $customer);
            }
        } else {
            // No phone — fall back to the order's existing customer phone
            // if any, so loyalty/SMS log relations stay consistent.
            $phone = $order->customer?->phone;
        }

        // Idempotent: returns existing invoice if already minted.
        $invoice = app(InvoiceController::class)->createFromOrderInternal($order, $request->user());

        $link = rtrim(config('app.url'), '/') . '/invoices/' . $invoice->token;

        // SMS only fires when the caller explicitly passed a phone — keeps
        // the "Print bill" silent and prevents accidental double-SMS when
        // the cashier prints first and sends later.
        if (!empty($request->input('phone'))) {
            app(SmsService::class)->send(new SmsMessage(
                to: $phone,
                message: 'Bake & Grill: Your bill #' . $invoice->invoice_number . ' — MVR ' . number_format((float) $invoice->total, 2) . '. View: ' . $link,
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
        }

        return response()->json([
            'order' => $order->fresh('customer'),
            'invoice' => $invoice->fresh('items'),
            'link' => $link,
        ]);
    }
}
