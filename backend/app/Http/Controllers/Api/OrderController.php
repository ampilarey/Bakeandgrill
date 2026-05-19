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

            // If the cashier has no open shift, return an empty result set
            // rather than collapsing on `shift_id = 0` (which would silently
            // match a legitimate Shift row with id 0 or — more commonly —
            // match orders that have shift_id NULL from the early-pos era).
            if ($openShiftId === null) {
                $query->whereRaw('1 = 0');
            } else {
                $query->where('shift_id', $openShiftId);
            }
        }

        // Open-tickets feed for the POS — only orders the cashier has parked.
        if ($request->filled('held_only') && $request->boolean('held_only')) {
            $query->where('status', 'held');
        }

        // Phone-call pickup workflow: surface orders that are cooking
        // but haven't been paid yet, so a manager can chase them. Returns
        // any non-terminal order with payment_status != paid.
        if ($request->filled('unpaid_only') && $request->boolean('unpaid_only')) {
            $query->whereIn('payment_status', ['unpaid', 'partial'])
                ->whereNotIn('status', ['cancelled', 'refunded', 'completed']);
        }

        // Unified Open Tickets feed for the POS — anything the cashier
        // still has work to do on. Two buckets:
        //   1. Classic held tickets (parked, kitchen never saw them).
        //   2. Any non-terminal unpaid ticket (fired or not). Covers
        //      fired-but-unpaid (phone-call pickup waiting on pay) AND
        //      the edge case where the cashier hit Save & Fire but the
        //      backend /fire-to-kitchen call failed half-way, leaving
        //      a pending+unpaid orphan we'd otherwise hide.
        // Excludes terminal states so refunded/cancelled tickets don't
        // reappear forever, and excludes paid orders (those belong in
        // Receipts, not Open Tickets).
        if ($request->filled('open_only') && $request->boolean('open_only')) {
            $query->where(function ($w) {
                $w->where('status', 'held')
                    ->orWhere(function ($w2) {
                        $w2->whereIn('payment_status', ['unpaid', 'partial'])
                            ->whereNotIn('status', ['cancelled', 'refunded', 'completed', 'paid', 'payment_pending']);
                    });
            });
        }

        // Active orders feed — superset of `open_only`. Returns every
        // ticket that is STILL IN FLIGHT regardless of payment state:
        //   - held tickets (parked, kitchen hasn't seen them)
        //   - cooking tickets (pending / in_progress / preparing)
        //   - ready tickets waiting for customer pickup
        //   - paid-but-not-completed tickets (cooked + paid, customer
        //     hasn't physically collected yet — phone-pickup customer
        //     who paid via BML link)
        // Excludes the terminal trio (cancelled / refunded / completed)
        // because those are done — they belong in Receipts.
        //
        // This is the new POS "Active orders" panel default. Old
        // `open_only` is kept for any caller that still wants the
        // narrower held+unpaid view.
        if ($request->filled('active_only') && $request->boolean('active_only')) {
            $query->whereNotIn('status', ['cancelled', 'refunded', 'completed', 'payment_pending']);
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

        // Optional flag — POS sets this true when the resumed ticket
        // changed (new items added since hold) so the kitchen prints the
        // updated chit. Default false because resuming a ticket immediately
        // back to charge shouldn't trigger a duplicate kitchen print.
        $reprintKitchen = (bool) $request->boolean('reprint_kitchen', false);

        $order = DB::transaction(function () use ($id, $request) {
            $order = Order::lockForUpdate()->findOrFail($id);
            app(OrderStatusMachine::class)->assertTransitionAllowed($order, 'pending');
            $oldStatus = $order->status;
            $order->update(['status' => 'pending', 'held_at' => null]);
            app(AuditLogService::class)->log('order.resumed', 'Order', $order->id, ['status' => $oldStatus], ['status' => 'pending'], [], $request);

            return $order;
        });

        // Kitchen reprint on resume — fires only when the caller asked for
        // it (e.g. POS detected line-item changes). Print job dispatch is
        // best-effort and idempotent at the queue level.
        if ($reprintKitchen) {
            try {
                app(\App\Services\PrintJobService::class)
                    ->enqueueKitchen($order->fresh(), reason: 'resume_reprint');
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::warning('Kitchen reprint on resume failed', [
                    'order_id' => $order->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return response()->json(['order' => $order]);
    }

    /**
     * POST /api/orders/{id}/fire-to-kitchen
     *
     * Sends a held / pending ticket to the kitchen without taking
     * payment. Powers the "Save & Fire" branch of the new POS Save
     * modal: cashier rings up a phone-call pickup, picks "Fire to
     * kitchen now", and the line cook starts cooking immediately while
     * the customer pays via SMS pay link OR at pickup.
     *
     * Held → pending (state machine transition), sets `fired_at`,
     * enqueues a kitchen print job, and — for Pickup orders with an
     * attached customer phone — sends a friendly "Order received"
     * SMS so the customer knows the kitchen has it.
     *
     * Idempotent: calling on an already-fired order is a no-op except
     * the kitchen reprint, which is intentional (cashier can re-fire
     * if the original chit was lost).
     */
    public function fireToKitchen(Request $request, int $id): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $order = DB::transaction(function () use ($id, $request) {
            $order = Order::with('customer')->lockForUpdate()->findOrFail($id);

            // Held tickets walk the state machine back to pending so KDS
            // can see them. Already-pending orders just get fired_at
            // refreshed (cashier asked for a reprint).
            $oldStatus = $order->status;
            if ($order->status === 'held') {
                app(OrderStatusMachine::class)->assertTransitionAllowed($order, 'pending');
                $order->update([
                    'status' => 'pending',
                    'held_at' => null,
                    'fired_at' => $order->fired_at ?? now(),
                ]);
            } elseif (in_array($order->status, ['pending', 'in_progress'], true)) {
                if (!$order->fired_at) {
                    $order->update(['fired_at' => now()]);
                }
            } else {
                abort(422, "Order is {$order->status} and cannot be fired to kitchen.");
            }

            app(AuditLogService::class)->log(
                'order.fired_to_kitchen',
                'Order',
                $order->id,
                ['status' => $oldStatus],
                ['status' => $order->status, 'fired_at' => $order->fired_at],
                [],
                $request,
            );

            return $order->fresh(['customer', 'items.modifiers']);
        });

        // Kitchen print + customer "Order received" SMS run post-commit
        // so a failed enqueue / SMS doesn't roll back the state change.
        DB::afterCommit(function () use ($order, $request): void {
            try {
                app(\App\Services\PrintJobService::class)
                    ->enqueueKitchen($order, reason: 'fire_to_kitchen');
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::warning('fireToKitchen: kitchen print enqueue failed', [
                    'order_id' => $order->id,
                    'error' => $e->getMessage(),
                ]);
            }

            // SMS the customer if this is a Pickup ticket with a phone.
            // Dine-in / Takeaway customers are at the counter — no SMS.
            // Pay link is intentionally NOT auto-included (cashier
            // chooses via the separate "Send pay link" button).
            if ($order->type !== 'online_pickup') {
                return;
            }
            $phone = $order->customer?->phone;
            if (!$phone) {
                return;
            }
            try {
                $orderNum = $order->order_number ?? "#{$order->id}";
                $total = number_format((float) $order->total, 2);
                // First-name only — keeps GSM-7 segment count low and
                // avoids shouting a formal title in casual SMS copy.
                $rawName = trim((string) ($order->customer?->name ?? ''));
                $firstName = $rawName !== '' ? trim(strtok($rawName, ' ')) : '';
                $greeting = $firstName !== '' ? "Hi {$firstName}, order" : 'Order';

                // Mint (or fetch) the public invoice — idempotent, so
                // multiple Fire-to-Kitchen taps don't create duplicates.
                // We use the existing /invoices/{token} public Blade
                // page so the customer can scroll line-items + price
                // before they pay. The "Send pay link" button (future
                // BML wiring) sends a separate, payment-focused SMS.
                $link = null;
                try {
                    $invoice = app(InvoiceController::class)
                        ->createFromOrderInternal($order, $request->user());
                    $link = rtrim(config('app.url'), '/') . '/invoices/' . $invoice->token;
                } catch (\Throwable $e) {
                    \Illuminate\Support\Facades\Log::warning('fireToKitchen: invoice mint failed', [
                        'order_id' => $order->id,
                        'error' => $e->getMessage(),
                    ]);
                }

                // Multi-line SMS layout requested by the cashier so each
                // datum (number, total, link, expectation) reads on its
                // own line on a phone screen. Pushes the message into a
                // second GSM-7 segment (~180 chars with link) — fine,
                // 2 segments costs basically nothing.
                $lines = [
                    "Bake & Grill: {$greeting} {$orderNum} received.",
                    "Order total: MVR {$total}",
                ];
                if ($link !== null) {
                    $lines[] = "View invoice: {$link}";
                }
                $lines[] = "We'll text you when it's ready.";

                app(SmsService::class)->send(new SmsMessage(
                    to: $phone,
                    message: implode("\n", $lines),
                    type: 'transactional',
                    customerId: $order->customer_id,
                    referenceType: 'order',
                    referenceId: (string) $order->id,
                    idempotencyKey: 'order:fired:received:' . $order->id,
                ));
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::warning('fireToKitchen: SMS failed', [
                    'order_id' => $order->id,
                    'error' => $e->getMessage(),
                ]);
            }
        });

        return response()->json(['order' => $order]);
    }

    /**
     * POST /api/orders/{id}/send-pay-link
     *
     * Mints a fresh BML Connect payment URL for the order's remaining
     * balance and SMSes it to the customer. Powers the "Send pay link"
     * button on the POS Open Tickets row.
     *
     * Always uses the live remaining balance so a partial cash payment
     * at the counter shortens the link total — customer pays only the
     * outstanding amount online.
     *
     * No-ops cleanly if:
     *   - order is already paid (returns 422 — cashier sees "already paid")
     *   - customer has no phone
     *   - BML credentials missing (returns 503 — cashier falls back to
     *     "pay at pickup")
     */
    public function sendPayLink(Request $request, int $id): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $order = Order::with(['customer', 'payments'])->findOrFail($id);

        if ($order->payment_status === 'paid' || $order->status === 'paid') {
            return response()->json(['message' => 'Order is already fully paid.'], 422);
        }

        $phone = $order->customer?->phone;
        if (!$phone) {
            return response()->json(['message' => 'Attach a customer phone before sending a pay link.'], 422);
        }

        // Compute remaining balance — sum confirmed payments (cash/card
        // taken at the counter already, BML half-payments, etc.) and
        // subtract from order total. Use integer laari throughout to
        // avoid float drift on the final BML amount.
        $paidLaar = (int) $order->payments
            ->whereIn('status', ['paid', 'completed', 'confirmed'])
            ->reduce(
                fn ($carry, $p) => $carry + ($p->amount_laar ?? (int) round((float) $p->amount * 100)),
                0,
            );
        $orderLaar = (int) ($order->total_laar ?? round((float) $order->total * 100));
        $remainingLaar = max(0, $orderLaar - $paidLaar);

        if ($remainingLaar === 0) {
            return response()->json(['message' => 'Nothing left to charge.'], 422);
        }

        // Local id uniqueness — BML keys off this. Suffix with timestamp
        // so re-sending a link after a previous expiry doesn't collide.
        $localId = 'BG-PAYLINK-' . $order->id . '-' . now()->format('YmdHis');

        try {
            $session = app(\App\Domains\Payments\Gateway\BmlConnectService::class)
                ->createPayment($remainingLaar, $localId);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('sendPayLink: BML createPayment failed', [
                'order_id' => $order->id,
                'error' => $e->getMessage(),
            ]);
            return response()->json([
                'message' => "Couldn't generate a pay link right now. Tell the customer to pay at pickup.",
            ], 503);
        }

        try {
            $orderNum = $order->order_number ?? "#{$order->id}";
            $amount = number_format($remainingLaar / 100, 2);
            app(SmsService::class)->send(new SmsMessage(
                to: $phone,
                message: "Bake & Grill: Pay MVR {$amount} for order {$orderNum} here: {$session['payment_url']}",
                type: 'transactional',
                customerId: $order->customer_id,
                referenceType: 'order',
                referenceId: (string) $order->id,
                // Suffix with the local id so re-sending a link generates a
                // new SMS each time (the customer needs the latest URL).
                idempotencyKey: 'order:paylink:' . $order->id . ':' . $localId,
            ));
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('sendPayLink: SMS failed', [
                'order_id' => $order->id,
                'error' => $e->getMessage(),
            ]);
            return response()->json([
                'message' => 'Pay link created but SMS failed. Read it to the customer manually.',
                'payment_url' => $session['payment_url'],
            ], 502);
        }

        app(AuditLogService::class)->log(
            'order.paylink_sent',
            'Order',
            $order->id,
            [],
            ['payment_url' => $session['payment_url'], 'amount_laar' => $remainingLaar, 'sms_to' => $phone],
            [],
            $request,
        );

        return response()->json([
            'message' => 'Pay link sent.',
            'amount' => $remainingLaar / 100,
            'sent_to' => $phone,
        ]);
    }

    /**
     * POST /api/orders/{id}/mark-ready
     *
     * Cashier-callable equivalent of KDS bump. Walks pending /
     * in_progress orders to `ready`, which triggers the existing
     * SendCustomerOrderStatusSmsListener "Ready for pickup!" SMS.
     *
     * Why this exists: cashier-only setups have no KDS terminal in
     * the kitchen, so the lifecycle SMS chain breaks at "Ready". With
     * this endpoint the cashier can move the order from POS once
     * they hear the bell / see the food, and the customer gets the
     * SMS without the kitchen needing extra hardware.
     *
     * Idempotent for already-ready orders (no-op).
     */
    public function markReady(Request $request, int $id): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $result = DB::transaction(function () use ($id, $request) {
            $order = Order::lockForUpdate()->findOrFail($id);

            if ($order->status === 'ready') {
                // Idempotent — cashier double-tapping shouldn't bounce.
                return ['order' => $order, 'unchanged' => true];
            }

            $machine = app(OrderStatusMachine::class);
            if (!$machine->isAllowed($order->status, 'ready')) {
                return ['error' => "Order is {$order->status} and can't be marked ready."];
            }

            $oldStatus = $order->status;
            $order->update(['status' => 'ready']);

            app(AuditLogService::class)->log(
                'order.ready',
                'Order',
                $order->id,
                ['status' => $oldStatus],
                ['status' => 'ready'],
                // Tagged 'pos' so audit logs distinguish cashier-marked
                // ready from KDS-marked ready. Useful for future
                // analytics ("how often does the cashier override KDS?").
                ['source' => 'pos'],
                $request,
            );

            // OrderStatusChanged event is dispatched by the model
            // observer on status update — that's what fires the
            // existing "Ready for pickup!" SMS, so we don't need to
            // emit anything extra here.

            return ['order' => $order];
        });

        if (isset($result['error'])) {
            return response()->json(['message' => $result['error']], 422);
        }

        return response()->json([
            'order' => $result['order']->fresh(),
            'unchanged' => $result['unchanged'] ?? false,
        ]);
    }

    /**
     * POST /api/orders/{id}/mark-picked-up
     *
     * Cashier-callable equivalent of KDS complete — physically moves
     * an order to the "done" state. Used when the customer has
     * collected their food. Closes the loyalty/referral loop via
     * OrderCompleted (same event KDS bump fires).
     *
     * GUARDED: refuses to complete an unpaid order. This is a till
     * protection — if the cashier accidentally hits "Picked up" on
     * a phone-order that the customer walked away with without
     * paying, we keep the order visible (in Active orders with the
     * UNPAID badge) so it gets chased down at end-of-day.
     * Override path: take the payment first (cash or Send pay link),
     * then this endpoint will accept the transition.
     */
    public function markPickedUp(Request $request, int $id): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $result = DB::transaction(function () use ($id, $request) {
            $order = Order::lockForUpdate()->findOrFail($id);

            if ($order->payment_status !== 'paid' && $order->status !== 'paid') {
                return ['error' => "Order is {$order->payment_status} — take payment or send pay link before marking picked up."];
            }

            if ($order->status === 'completed') {
                return ['order' => $order, 'unchanged' => true];
            }

            $machine = app(OrderStatusMachine::class);
            if (!$machine->isAllowed($order->status, 'completed')) {
                return ['error' => "Order is {$order->status} and can't be marked picked up."];
            }

            $oldStatus = $order->status;
            $order->update([
                'status' => 'completed',
                'completed_at' => now(),
            ]);

            app(AuditLogService::class)->log(
                'order.completed',
                'Order',
                $order->id,
                ['status' => $oldStatus],
                ['status' => 'completed'],
                ['source' => 'pos'],
                $request,
            );

            $orderForEvent = $order->fresh();
            DB::afterCommit(function () use ($orderForEvent): void {
                \App\Domains\Orders\Events\OrderCompleted::dispatch(
                    \App\Domains\Orders\DTOs\OrderCompletedData::fromOrder($orderForEvent),
                );
            });

            return ['order' => $order];
        });

        if (isset($result['error'])) {
            return response()->json(['message' => $result['error']], 422);
        }

        return response()->json([
            'order' => $result['order']->fresh(),
            'unchanged' => $result['unchanged'] ?? false,
        ]);
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

            // Held tickets must transition back to 'pending' before any
            // payment is applied. Previously addPayments silently flipped a
            // held order straight to 'paid', which bypassed the
            // OrderStatusMachine and left `held_at` populated forever —
            // KDS / Open Tickets filters then disagreed with Sales Reports
            // about whether the ticket was still "parked". This walks the
            // state machine first so the transition is auditable and
            // `held_at` is cleared properly.
            if ($order->status === 'held') {
                $machine->assertTransitionAllowed($order, 'pending');
                $order->update(['status' => 'pending', 'held_at' => null]);
                $order->refresh();
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
                // Mirror the financial state into the dedicated `payment_status`
                // column so Open Tickets can show an UNPAID badge without
                // recomputing payments on every list render. The order's
                // lifecycle `status` (pending → paid → completed) and
                // financial state are now tracked independently — fully
                // paid here regardless of whether the kitchen has started.
                $order->update([
                    'status' => 'paid',
                    'paid_at' => now(),
                    'payment_status' => 'paid',
                ]);

                app(AuditLogService::class)->log('order.paid', 'Order', $order->id, ['status' => $oldStatus], ['status' => 'paid'], ['paid_total' => $paidTotal], $request);

                DB::afterCommit(function () use ($order, $printReceipt): void {
                    OrderPaid::dispatch(OrderPaidData::fromOrder($order->fresh(), $printReceipt));
                });
            } else {
                $order->update([
                    'status' => 'partial',
                    'payment_status' => 'partial',
                ]);

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
