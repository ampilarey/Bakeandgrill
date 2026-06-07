<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Payments\Actions\SettleOrderPaymentAction;
use App\Domains\Payments\Services\PaymentAllocationService;
use App\Domains\Kitchen\Support\KitchenHandoverSettings;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\CustomerSmsMessageBuilder;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\SmsNotificationSettings;
use App\Domains\Orders\DTOs\OrderCancelledData;
use App\Domains\Orders\DTOs\OrderPaidData;
use App\Domains\Orders\Events\OrderCancelled;
use App\Domains\Orders\Events\OrderPaid;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCustomerOrderRequest;
use App\Http\Requests\StoreOrderBatchRequest;
use App\Http\Requests\StoreOrderPaymentsRequest;
use App\Http\Requests\StoreOrderRequest;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Receipt;
use App\Models\RestaurantTable;
use App\Models\Variant;
use App\Services\AuditLogService;
use App\Services\OnlineOrderingGateService;
use App\Services\OrderCreationService;
use App\Services\OrderStatusMachine;
use App\Services\PermissionService;
use App\Services\ShiftAccessService;
use App\Services\StockManagementService;
use App\Support\DeferAfterResponse;
use App\Support\OrderSettlement;
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

        $user = $request->user();
        $permissions = app(PermissionService::class);
        $canViewAllStations = $permissions->hasPermission($user, 'pos.view_all_station_orders');
        $cashierId = (int) $user->id;

        // Cashiers may only query their own sales — not another staff member's.
        if (!$canViewAllStations
            && $request->filled('user_id')
            && (int) $request->input('user_id') !== $cashierId) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $query = Order::with([
            'customer:id,name,phone',
            'user:id,name',
            'device:id,name,identifier',
            'shift:id,opened_at',
            'items:id,order_id,item_name,quantity,unit_price,total_price',
            // Eager-load the table so the POS Active orders search
            // can match on table name (e.g. cashier types "T4"
            // and lands on Table T4's open ticket without
            // scrolling). Relation on Order is `table()`, schema
            // columns are id/name/location.
            'table:id,name,location',
            'payments:id,order_id,method,amount,amount_laar,status',
        ])
            ->orderBy('created_at', 'desc');

        if ($request->filled('status')) {
            $statuses = explode(',', $request->input('status'));
            $validStatuses = ['pending', 'paid', 'payment_pending', 'confirmed', 'preparing', 'in_progress', 'ready', 'out_for_delivery', 'picked_up', 'on_the_way', 'delivered', 'completed', 'cancelled', 'partial', 'refunded', 'held'];
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

        if ($request->filled('user_id')) {
            $query->where('user_id', (int) $request->input('user_id'));
        }

        // POS Active Orders — narrow to tickets this cashier created.
        if ($request->filled('created_by_me') && $request->boolean('created_by_me')) {
            $query->where('user_id', $cashierId);
        }

        // POS Active Orders — online ordering app (pickup + delivery).
        if ($request->filled('online_only') && $request->boolean('online_only')) {
            $query->whereIn('type', ['online_pickup', 'delivery']);
        }

        if ($canViewAllStations && $request->filled('device_id')) {
            $query->where('device_id', (int) $request->input('device_id'));
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

        // Device filter — managers/owners only. Cashiers see their own
        // orders across every device they've logged into (iPad + phone).
        if ($canViewAllStations && $request->filled('device_identifier')) {
            $identifier = (string) $request->input('device_identifier');
            if ($request->filled('active_only') && $request->boolean('active_only')) {
                $query->where(function ($w) use ($identifier) {
                    $w->whereHas('device', fn ($q) => $q->where('identifier', $identifier))
                        ->orWhereIn('type', ['online_pickup', 'delivery']);
                });
            } else {
                $query->whereHas('device', fn ($q) => $q->where('identifier', $identifier));
            }
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

        // Active orders feed — tickets the cashier still has operational
        // work on. Excludes terminal states (cancelled / refunded /
        // completed / payment_pending).
        //
        // Payment + type rules:
        //   - dine_in / takeaway: only while UNPAID (or partial). Once
        //     paid the sale is done — it belongs in Receipts, not here.
        //   - online_pickup / delivery: stay until physically fulfilled,
        //     even when paid, so staff can Start cooking → Ready →
        //     Picked up / Delivered.
        if ($request->filled('active_only') && $request->boolean('active_only')) {
            $query->whereNotIn('status', ['cancelled', 'refunded', 'completed', 'payment_pending']);

            $query->where(function ($w) {
                $w->whereIn('type', ['online_pickup', 'delivery'])
                    ->orWhere(function ($w2) {
                        $w2->whereIn('type', ['dine_in', 'takeaway'])
                            ->where(function ($w3) {
                                $w3->whereNull('payment_status')
                                    ->orWhereIn('payment_status', ['unpaid', 'partial']);
                            });
                    })
                    ->orWhereNotIn('type', ['dine_in', 'takeaway', 'online_pickup', 'delivery']);
            });
        }

        // Cashier scope for receipts/history only — active orders are venue-wide.
        if (!$canViewAllStations && !($request->filled('active_only') && $request->boolean('active_only'))) {
            $query->where('user_id', $cashierId);
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

        // POS active-order feeds only need ticket metadata — skip the
        // per-row payment_settlement recompute on every poll cycle.
        $slim = in_array($request->query('slim'), ['1', 'true', 'yes'], true)
            || ($request->boolean('active_only') && !$request->filled('q'));

        $orders->through(function (Order $order) use ($slim) {
            $data = $order->toArray();
            if (!$slim) {
                $data['payment_settlement'] = OrderSettlement::forOrder($order);
            }

            return $data;
        });

        return response()->json($orders);
    }

    public function store(StoreOrderRequest $request): JsonResponse
    {
        if (!$request->user()->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        app(ShiftAccessService::class)->requireOpenShift(
            $request->user(),
            'Open a shift before ringing sales.',
        );

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

        if (!empty($payload['pickup_slot_at'])) {
            app(\App\Domains\Ordering\Services\PickupSlotService::class)
                ->assertSlotAvailable($payload['pickup_slot_at']);
        }

        $order = app(OrderCreationService::class)->createFromPayload($payload, null);
        $customer->update(['last_order_at' => now()]);

        app(AuditLogService::class)->log('order.created', 'Order', $order->id, [], $order->toArray(), ['source' => 'customer'], $request);

        return response()->json(['order' => $order], 201);
    }

    public function sync(StoreOrderBatchRequest $request): JsonResponse
    {
        $payloads = $request->validated()['orders'];
        $user = $request->user();

        app(ShiftAccessService::class)->requireOpenShift(
            $user,
            'Open a shift before ringing sales.',
        );

        $processed = 0;
        $deduped = 0;
        $failed = [];

        // Intentional partial-success: each order is processed individually so
        // a single failure (e.g. duplicate idempotency key) does not block all
        // other orders in the batch. The caller inspects `failed` to retry.
        foreach ($payloads as $index => $payload) {
            try {
                // Idempotency on offline_id — if the queue retried (network
                // blip, exponential backoff, cashier hit Sync twice) we'd
                // otherwise duplicate the order AND double-deduct POS stock,
                // which is the worst kind of silent inventory bug.
                //
                // OfflineSyncController already does this for its own endpoint;
                // /orders/sync used to skip the check and was the last way
                // duplicate orders could sneak into the database after a
                // dropped connection.
                $offlineId = $payload['offline_id'] ?? null;
                if ($offlineId !== null && $offlineId !== '') {
                    $existing = Order::where('offline_id', $offlineId)->first();
                    if ($existing) {
                        $deduped++;
                        continue;
                    }
                }

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

        return response()->json([
            'processed' => $processed,
            'deduped' => $deduped,
            'failed' => $failed,
        ]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        // Only staff (User model) may use this endpoint.
        // Customers must use the customer-scoped endpoint which enforces ownership.
        if (!$request->user() instanceof \App\Models\User) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $order = Order::with(['items.modifiers', 'payments', 'customer', 'table', 'user:id,name', 'device:id,name,identifier', 'shift:id,opened_at'])
            ->findOrFail($id);

        $permissions = app(PermissionService::class);
        if (!$this->staffCanViewOrder($request, $order, $permissions)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        return response()->json(['order' => $order]);
    }

    private function staffCanViewOrder(Request $request, Order $order, PermissionService $permissions): bool
    {
        $user = $request->user();
        if ($permissions->hasPermission($user, 'pos.view_all_station_orders')) {
            return true;
        }
        if ((int) $order->user_id === (int) $user->id) {
            return true;
        }
        if (in_array($order->type, ['online_pickup', 'delivery'], true)) {
            return true;
        }

        return $this->isHandoffVisibleOrder($order);
    }

    private function isHandoffVisibleOrder(Order $order): bool
    {
        return !in_array($order->status, ['cancelled', 'refunded', 'completed'], true);
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
            if (!SmsNotificationSettings::isEnabled(SmsNotificationSettings::POS_FIRE_TO_KITCHEN)) {
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

                if ($link !== null) {
                    $invoiceLine = "View invoice: {$link}";
                } else {
                    $invoiceLine = '';
                }

                $fallback = implode("\n", array_filter([
                    "{$greeting} {$orderNum} received.",
                    "Order total: MVR {$total}",
                    $invoiceLine !== '' ? $invoiceLine : null,
                    "We'll text you when it's ready.",
                ]));

                $message = app(CustomerSmsMessageBuilder::class)->build(
                    CustomerSmsMessageBuilder::SLUG_FIRE_TO_KITCHEN,
                    [
                        'greeting' => $greeting,
                        'order_number' => (string) $orderNum,
                        'total' => $total,
                        'invoice_line' => $invoiceLine,
                    ],
                    $fallback,
                );

                app(SmsService::class)->send(new SmsMessage(
                    to: $phone,
                    message: $message,
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
     * Mints a receipt pay-page URL and SMSes it to the customer. Powers the
     * "Send pay link" button on the POS Open Tickets row.
     *
     * The SMS link opens GET /pay/{token} where the customer reviews the
     * order, agrees to terms, and only then is redirected to BML Connect.
     * (Online orders use the React checkout app instead.)
     *
     * Always uses the live remaining balance so a partial cash payment
     * at the counter shortens the link total — customer pays only the
     * outstanding amount online.
     *
     * No-ops cleanly if:
     *   - order is already paid (returns 422 — cashier sees "already paid")
     *   - customer has no phone
     *
     * BML is only called when the customer taps Pay on the pay page. If BML
     * credentials are missing at that point, they see an error on /pay/{token}.
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

        if (!SmsNotificationSettings::isEnabled(SmsNotificationSettings::POS_SEND_PAY_LINK)) {
            return response()->json(['message' => SmsNotificationSettings::DISABLED_MESSAGE], 422);
        }

        // Compute remaining balance via the same helper the rest of the
        // payment stack uses (COALESCE-safe for legacy POS payments).
        $paymentService = app(\App\Domains\Payments\Services\PaymentService::class);
        $remainingLaar = $paymentService->getRemainingBalanceLaar($order);

        if ($remainingLaar === 0) {
            return response()->json(['message' => 'Nothing left to charge.'], 422);
        }

        // Mint a receipt token and send the customer to our pay page first —
        // they review the order, agree to terms, then we redirect to BML.
        // (Online ordering uses the React checkout app; POS uses this Blade flow.)
        $receipt = Receipt::ensureForOrder($order);
        $payPageUrl = $receipt->posPayPageUrl();

        $idempotencyKey = 'paylink:' . $order->id . ':' . now()->format('YmdHis');

        try {
            $orderNum = $order->order_number ?? "#{$order->id}";
            $amount = number_format($remainingLaar / 100, 2);
            $rawName = trim((string) ($order->customer?->name ?? ''));
            $firstName = $rawName !== '' ? trim(strtok($rawName, ' ')) : '';
            $greeting = $firstName !== '' ? "Hi {$firstName}!" : 'Hi!';
            $fallback = implode("\n", [
                "{$greeting} Your Bake & Grill bill is ready to pay.",
                "Amount: MVR {$amount}",
                "Order: {$orderNum}",
                "View your order & pay: {$payPageUrl}",
                'Thanks — see you soon!',
            ]);
            $message = app(CustomerSmsMessageBuilder::class)->build(
                CustomerSmsMessageBuilder::SLUG_SEND_PAY_LINK,
                [
                    'greeting' => $greeting,
                    'amount' => $amount,
                    'order_number' => (string) $orderNum,
                    'pay_url' => $payPageUrl,
                ],
                $fallback,
            );
            app(SmsService::class)->send(new SmsMessage(
                to: $phone,
                message: $message,
                type: 'transactional',
                customerId: $order->customer_id,
                referenceType: 'order',
                referenceId: (string) $order->id,
                idempotencyKey: 'order:' . $idempotencyKey,
            ));
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('sendPayLink: SMS failed', [
                'order_id' => $order->id,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'Pay link created but SMS failed. Read it to the customer manually.',
                'pay_page_url' => $payPageUrl,
            ], 502);
        }

        app(AuditLogService::class)->log(
            'order.paylink_sent',
            'Order',
            $order->id,
            [],
            [
                'pay_page_url' => $payPageUrl,
                'amount_laar' => $remainingLaar,
                'sms_to' => $phone,
            ],
            [],
            $request,
        );

        return response()->json([
            'message' => 'Pay link sent.',
            'amount' => $remainingLaar / 100,
            'sent_to' => $phone,
            'pay_page_url' => $payPageUrl,
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
    /**
     * POST /api/orders/{id}/cancel
     *
     * Void a non-terminal order from the POS Active Orders panel.
     *
     * Cancels the ticket, returns deducted POS stock, releases any
     * loyalty / promo / gift-card holds (via OrderCancelled listeners),
     * frees the dine-in table, and writes a full audit row. Refuses to
     * touch paid / refunded / completed / already-cancelled orders —
     * money-touching reversals must go through the refund flow which
     * tracks cash movement, ledger entries, and the like.
     *
     * Request body:
     *   reason (required, max 255) — short note shown in the void
     *                                confirm dialog. Recorded on the
     *                                order itself and in the audit log
     *                                so a manager reviewing the day's
     *                                voids can see why each one was
     *                                pulled.
     *
     * Idempotency: a second call on an already-cancelled order short-
     * circuits with a 200 OK ("unchanged"). Prevents double-restore of
     * stock if the cashier double-taps Void.
     */
    public function cancel(Request $request, int $id): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        // Permission gate — restricts voids to users with the orders.void
        // permission (owner/manager by default, but overridable per-user
        // from Settings → Roles & Permissions). VoidPolicy now routes via
        // HasPermissions so the DB override actually takes effect.
        // Returns 403 with a clear message instead of leaking the policy
        // name, so the POS UI can surface "You're not allowed to void
        // tickets" to the cashier.
        if (!\Illuminate\Support\Facades\Gate::check('order.void')) {
            return response()->json([
                'message' => "You don't have permission to void orders. Ask a manager.",
            ], 403);
        }

        $validated = $request->validate([
            'reason' => 'required|string|max:255',
        ]);

        $result = DB::transaction(function () use ($id, $validated, $request) {
            $order = Order::lockForUpdate()->findOrFail($id);

            if ($order->status === 'cancelled') {
                return ['order' => $order, 'unchanged' => true];
            }

            // Hard-block reversal of money-touching states. Refunding a
            // paid order changes inventory + creates a refund ledger
            // entry + (optionally) returns cash from the drawer — none
            // of which this endpoint does. Force the cashier through
            // the proper refund flow instead of silently voiding their
            // way past it.
            //
            // 'partial' is also blocked here: addPayments sets
            // status='partial' (and payment_status='partial') the moment
            // a cashier takes a split-tender first leg (e.g. MVR 50 cash
            // on a MVR 120 ticket). Without this guard the cashier could
            // void the ticket, restore the stock, and keep the cash off-book.
            $blocked = ['paid', 'completed', 'partial', 'refunded', 'partially_refunded'];
            if (in_array($order->status, $blocked, true)) {
                return ['error' => "Order is {$order->status} — issue a refund instead of voiding."];
            }

            // Belt-and-braces: even if the lifecycle status is still 'pending'
            // (e.g. legacy data from before payment_status was wired up),
            // any confirmed payment row means money has changed hands and
            // void is unsafe. Force the refund flow.
            if (in_array($order->payment_status, ['partial', 'paid'], true)) {
                return ['error' => 'Payment recorded on this order — issue a refund instead of voiding.'];
            }
            $confirmedPaymentExists = $order->payments()
                ->whereIn('status', ['paid', 'completed', 'confirmed'])
                ->exists();
            if ($confirmedPaymentExists) {
                return ['error' => 'Confirmed payments exist on this order — issue a refund instead of voiding.'];
            }

            $machine = app(OrderStatusMachine::class);
            if (!$machine->isAllowed($order->status, 'cancelled')) {
                return ['error' => "Order is {$order->status} and can't be voided."];
            }

            $oldStatus = $order->status;
            $reason = trim($validated['reason']);

            $order->update([
                'status' => 'cancelled',
                'cancellation_reason' => $reason,
                'cancelled_at' => now(),
                'cancelled_by' => $request->user()->id,
            ]);

            // Return deducted POS stock to the shelves. Online orders
            // only RESERVE stock — the existing OrderCancelled listener
            // (ReleasePreparedStockOnCancelListener) handles those. POS
            // orders DEDUCT immediately on create, so we have to walk
            // every line item here and call restorePreparedStock /
            // restoreVariantStock with a dedicated cancel idempotency
            // key (so a future double-cancel of the same order can't
            // double-restore inventory).
            $isPosOrder = !in_array($order->type, ['online_pickup', 'delivery'], true);
            if ($isPosOrder) {
                $stockService = app(StockManagementService::class);
                $order->load('items');
                foreach ($order->items as $orderItem) {
                    $qty = (int) $orderItem->quantity;
                    if ($qty <= 0) {
                        continue;
                    }

                    if ($orderItem->variant_id) {
                        $variant = Variant::find($orderItem->variant_id);
                        if ($variant && $variant->track_stock) {
                            $stockService->restoreVariantStock(
                                $variant,
                                $qty,
                                'pos:cancel:order:' . $order->id . ':variant:' . $orderItem->id,
                                $order->id,
                                $request->user()->id,
                            );
                        }
                        continue;
                    }

                    if (!$orderItem->item_id) {
                        continue;
                    }
                    $item = Item::find($orderItem->item_id);
                    if (!$item || !$item->track_stock || $item->availability_type !== 'stock_based') {
                        continue;
                    }
                    $stockService->restorePreparedStock(
                        $item,
                        $qty,
                        'pos:cancel:order:' . $order->id . ':item:' . $orderItem->id,
                        $order->id,
                        $request->user()->id,
                    );
                }
            }

            // Free up the dine-in table if no other active order still
            // sits on it. Only checks for non-terminal sibling orders —
            // a long-since-completed ticket on the same table is fine.
            if ($order->restaurant_table_id) {
                $hasOtherActive = Order::where('restaurant_table_id', $order->restaurant_table_id)
                    ->where('id', '!=', $order->id)
                    ->whereNotIn('status', ['cancelled', 'completed', 'refunded'])
                    ->exists();
                if (!$hasOtherActive) {
                    RestaurantTable::where('id', $order->restaurant_table_id)
                        ->update(['status' => 'available']);
                }
            }

            app(AuditLogService::class)->log(
                'order.cancelled',
                'Order',
                $order->id,
                ['status' => $oldStatus],
                ['status' => 'cancelled', 'reason' => $reason],
                [
                    'source' => 'pos',
                    'cancelled_by_user_id' => $request->user()->id,
                ],
                $request,
            );

            // OrderCancelled fires after commit so promo / loyalty /
            // gift-card holds get released and webhooks dispatched. We
            // already restored POS stock inline above — the listener's
            // releaseForOrder() is a safe no-op when no reservation
            // exists, so no double-restore risk.
            DB::afterCommit(function () use ($order): void {
                OrderCancelled::dispatch(OrderCancelledData::fromOrder($order->fresh()));
            });

            return ['order' => $order];
        });

        if (isset($result['error'])) {
            return response()->json(['message' => $result['error']], 422);
        }

        return response()->json([
            'order' => $result['order']->fresh(['items', 'customer']),
            'unchanged' => $result['unchanged'] ?? false,
        ]);
    }

    /**
     * POST /api/orders/{id}/start-cooking
     *
     * POS equivalent of KDS "Start Cooking" — moves pending/paid tickets
     * into in_progress so the cashier workflow matches the kitchen display.
     */
    public function startCooking(Request $request, int $id): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $result = DB::transaction(function () use ($id, $request) {
            $order = Order::lockForUpdate()->findOrFail($id);

            if ($order->status === 'in_progress') {
                return ['order' => $order, 'unchanged' => true];
            }

            $machine = app(OrderStatusMachine::class);
            if (!$machine->isAllowed($order->status, 'in_progress')) {
                return ['error' => "Order is {$order->status} and can't be started."];
            }

            $oldStatus = $order->status;
            $updates = ['status' => 'in_progress'];
            if (!$order->fired_at) {
                $updates['fired_at'] = now();
            }
            $order->update($updates);

            app(AuditLogService::class)->log(
                'order.started',
                'Order',
                $order->id,
                ['status' => $oldStatus],
                ['status' => 'in_progress', 'fired_at' => $order->fired_at],
                ['source' => 'pos'],
                $request,
            );

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

            // Online-pickup orders are pre-paid by the customer via the
            // online ordering app — if the order somehow reached this
            // status without payment confirmed, refuse to mark ready
            // (the BML webhook hasn't landed yet, so customer would
            // walk out with food the venue hasn't collected on).
            //
            // Takeaway and delivery are EXCLUDED — those are legitimate
            // cash-on-pickup / pay-at-counter / pay-at-door flows. The
            // POS markPickedUp endpoint enforces a final payment check
            // when the food actually leaves with the customer.
            //
            // Dine-in is EXCLUDED — pay-after-meal is the entire model.
            if ($order->type === 'online_pickup'
                && $order->payment_status !== 'paid'
                && $order->status !== 'paid') {
                return ['error' => 'Online order is unpaid — wait for payment confirmation before marking ready.'];
            }

            if (KitchenHandoverSettings::requirePosReceivingBeforeReady()
                && $order->kitchen_handover_status !== 'received'
                && $order->pos_received_at === null) {
                return ['error' => 'Receive from kitchen before marking ready.'];
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

    /**
     * PATCH /api/orders/{id}/items
     *
     * Replace the full line-item set on an existing active order.
     * Used by the POS "💾 Save changes" button when the cashier edits
     * a resumed parked / cooking / ready ticket.
     *
     * Refuses paid, completed, cancelled, and refunded orders so the
     * cashier can't quietly edit a finalised ticket and skew finance
     * reports. (Edits to an already-charged ticket should go through
     * refunds, not silent rewrites.)
     */
    public function updateItems(Request $request, int $id): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $validated = $request->validate([
            'items' => 'required|array|min:1',
            'items.*.item_id' => 'nullable|integer',
            'items.*.name' => 'required|string|max:255',
            'items.*.quantity' => 'required|numeric|min:0.001',
            'items.*.variant_id' => 'nullable|integer',
            'items.*.notes' => 'nullable|string|max:500',
            'items.*.modifiers' => 'nullable|array',
            'items.*.modifiers.*.modifier_id' => 'nullable|integer',
            'items.*.modifiers.*.name' => 'required_with:items.*.modifiers|string|max:255',
            'items.*.modifiers.*.price' => 'required_with:items.*.modifiers|numeric|min:0',
            'reprint_kitchen' => 'nullable|boolean',
        ]);

        $reprintKitchen = (bool) ($validated['reprint_kitchen'] ?? true);

        $order = DB::transaction(function () use ($id, $validated, $reprintKitchen, $request) {
            $order = Order::lockForUpdate()->findOrFail($id);

            // Block edits to anything that's finalised. Specifically:
            //   paid / completed       — money in the till, can't silently rewrite
            //   cancelled / refunded   — terminal states, must not resurface
            //   payment_pending        — online order awaiting BML confirm, hands off
            $blockedStatuses = ['paid', 'completed', 'cancelled', 'refunded', 'partially_refunded', 'payment_pending'];
            if (in_array($order->status, $blockedStatuses, true)) {
                return ['error' => "Order is {$order->status} and cannot be edited. Refund instead."];
            }
            if ($order->payment_status === 'paid') {
                return ['error' => 'Order is fully paid — edits must go through refunds.'];
            }

            $updated = app(OrderCreationService::class)
                ->replaceOrderItems($order, $validated['items'], $reprintKitchen);

            app(AuditLogService::class)->log(
                'order.items_replaced',
                'Order',
                $updated->id,
                [],
                [
                    'item_count' => count($validated['items']),
                    'reprint_kitchen' => $reprintKitchen,
                    'new_total' => $updated->total,
                ],
                ['source' => 'pos'],
                $request,
            );

            return ['order' => $updated];
        });

        if (isset($order['error'])) {
            return response()->json(['message' => $order['error']], 422);
        }

        $fresh = $order['order']->fresh(['items.modifiers', 'customer']);

        return response()->json([
            'order' => [
                'id' => $fresh->id,
                'total' => (float) $fresh->total,
                'subtotal' => (float) $fresh->subtotal,
                'tax_amount' => (float) $fresh->tax_amount,
            ],
        ]);
    }

    /**
     * POST /api/orders/{id}/merge { source_id }
     *
     * Consolidate two open tickets — items from `source_id` are
     * re-parented onto the URL order; source is then cancelled with
     * a "merged into" audit trail. Both orders must be in editable
     * states (not paid / completed / cancelled / refunded). The
     * target order keeps its own customer, table, and order type.
     */
    public function merge(Request $request, int $id): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $validated = $request->validate([
            'source_id' => 'required|integer|different:' . $id,
        ]);

        $result = DB::transaction(function () use ($id, $validated, $request) {
            $target = Order::lockForUpdate()->findOrFail($id);
            $source = Order::lockForUpdate()->findOrFail($validated['source_id']);

            $blocked = ['paid', 'completed', 'cancelled', 'refunded', 'partially_refunded', 'payment_pending'];
            if (in_array($target->status, $blocked, true) || $target->payment_status === 'paid') {
                return ['error' => "Target order is {$target->status} — can't merge into it."];
            }
            if (in_array($source->status, $blocked, true) || $source->payment_status === 'paid') {
                return ['error' => "Source order is {$source->status} — can't merge from it."];
            }

            // Re-parent items. Modifiers travel with their items
            // because OrderItemModifier.order_item_id stays the same.
            \App\Models\OrderItem::where('order_id', $source->id)
                ->update(['order_id' => $target->id]);

            // Recalculate target totals via the calculator (single
            // source of truth — taxes/discounts/etc. all reapply).
            $target = app(OrderCreationService::class)
                ->recalculateTotals($target->fresh());

            // Cancel the source so it disappears from Active orders.
            $sourceOldStatus = $source->status;
            $source->update([
                'status' => 'cancelled',
                'ticket_note' => trim(($source->ticket_note ? $source->ticket_note . ' · ' : '') . "Merged into order #{$target->id}"),
            ]);

            app(AuditLogService::class)->log(
                'order.merged',
                'Order',
                $target->id,
                ['target_status' => $target->status],
                ['source_id' => $source->id, 'new_total' => $target->total],
                ['source' => 'pos'],
                $request,
            );
            app(AuditLogService::class)->log(
                'order.merged_into',
                'Order',
                $source->id,
                ['status' => $sourceOldStatus],
                ['status' => 'cancelled', 'merged_into_id' => $target->id],
                ['source' => 'pos'],
                $request,
            );

            return ['order' => $target, 'source' => $source];
        });

        // Fire OrderCancelled for the source AFTER commit so loyalty /
        // promo / gift-card holds, reservation cleanup, and webhook
        // dispatches all run for the merged-away ticket. Previously the
        // source was silently flipped to 'cancelled' without firing the
        // event, leaving holds tied to a ticket that no longer existed
        // (loyalty points couldn't be re-redeemed until the hold expired,
        // gift cards stayed "in use").
        if (isset($result['source'])) {
            $sourceOrder = $result['source']->fresh();
            DB::afterCommit(function () use ($sourceOrder): void {
                OrderCancelled::dispatch(OrderCancelledData::fromOrder($sourceOrder));
            });
        }

        if (isset($result['error'])) {
            return response()->json(['message' => $result['error']], 422);
        }

        return response()->json([
            'order' => [
                'id' => $result['order']->id,
                'total' => (float) $result['order']->total,
            ],
        ]);
    }

    /**
     * POST /api/orders/{id}/split { item_ids: [...] }
     *
     * Split selected items off the URL order into a brand-new order.
     * Returns both the slimmed source and the new split order. The
     * split inherits the source's type and customer (split bills
     * usually keep the same party) but starts a fresh order_number.
     *
     * Same editable-state guards as merge.
     */
    public function split(Request $request, int $id): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $validated = $request->validate([
            'item_ids' => 'required|array|min:1',
            'item_ids.*' => 'integer',
        ]);

        $result = DB::transaction(function () use ($id, $validated, $request) {
            $source = Order::lockForUpdate()->with('items')->findOrFail($id);

            $blocked = ['paid', 'completed', 'cancelled', 'refunded', 'partially_refunded', 'payment_pending'];
            if (in_array($source->status, $blocked, true) || $source->payment_status === 'paid') {
                return ['error' => "Order is {$source->status} — can't split."];
            }

            $candidateIds = $source->items->pluck('id')->all();
            $toSplit = array_values(array_intersect($validated['item_ids'], $candidateIds));
            if (empty($toSplit)) {
                return ['error' => 'None of the supplied items belong to this order.'];
            }
            if (count($toSplit) === count($candidateIds)) {
                return ['error' => 'Splitting every item would leave the source empty. Just charge the source instead.'];
            }

            // Mint a sibling order with the source's context but zero
            // items, then reparent the chosen items onto it.
            $split = app(OrderCreationService::class)->createFromPayload([
                'type' => $source->type,
                'restaurant_table_id' => $source->restaurant_table_id,
                'customer_id' => $source->customer_id,
                'items' => [],
                'print' => false,
                'ticket_name' => $source->ticket_name ? "{$source->ticket_name} (split)" : null,
                'ticket_note' => "Split from order #{$source->id}",
            ], $request->user());

            \App\Models\OrderItem::whereIn('id', $toSplit)->update(['order_id' => $split->id]);

            $service = app(OrderCreationService::class);
            $source = $service->recalculateTotals($source->fresh());
            $split = $service->recalculateTotals($split->fresh());

            app(AuditLogService::class)->log(
                'order.split',
                'Order',
                $source->id,
                [],
                ['split_into_id' => $split->id, 'item_count' => count($toSplit)],
                ['source' => 'pos'],
                $request,
            );

            return ['source' => $source, 'split' => $split];
        });

        if (isset($result['error'])) {
            return response()->json(['message' => $result['error']], 422);
        }

        return response()->json([
            'source' => ['id' => $result['source']->id, 'total' => (float) $result['source']->total],
            'split' => ['id' => $result['split']->id, 'total' => (float) $result['split']->total],
        ]);
    }

    public function addPayments(StoreOrderPaymentsRequest $request, int $id): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $validated = $request->validated();
        $printReceipt = !array_key_exists('print_receipt', $validated) || $validated['print_receipt'] === true;
        $allocation = app(PaymentAllocationService::class);
        $collector = $request->user();
        $collectorShift = null;

        if ($allocation->needsCollectorShift($validated['payments'])) {
            $collectorShift = app(ShiftAccessService::class)->requireOpenShift(
                $collector,
                'Open a shift before taking payment.',
            );
        }

        [$order, $paidTotal] = app(SettleOrderPaymentAction::class)->execute(
            $id,
            $validated,
            $collector,
            $collectorShift,
            $request,
            $printReceipt,
        );

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
        $order = Order::with(['items.modifiers'])
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
                'payment_status' => $order->payment_status,
                'type' => $order->type,
                'subtotal' => $order->subtotal,
                'tax_amount' => $order->tax_amount,
                'promo_discount_laar' => $order->promo_discount_laar,
                'loyalty_discount_laar' => $order->loyalty_discount_laar,
                'gift_card_discount_laar' => $order->gift_card_discount_laar,
                'referral_discount_laar' => $order->referral_discount_laar,
                'delivery_fee' => $order->delivery_fee,
                'total' => $order->total,
                'paid_at' => $order->paid_at,
                'estimated_wait_minutes' => $order->estimated_wait_minutes,
                // Delivery info (customer already knows their own address)
                'delivery_address_line1' => $order->delivery_address_line1,
                'delivery_island' => $order->delivery_island,
                'delivery_contact_name' => $order->delivery_contact_name,
                'delivery_contact_phone' => $order->delivery_contact_phone,
                'items' => $order->items->map(fn ($item) => [
                    'id' => $item->id,
                    'item_name' => $item->item_name,
                    'variant_name' => $item->variant_name,
                    'quantity' => $item->quantity,
                    'unit_price' => (float) $item->unit_price,
                    'total_price' => (float) $item->total_price,
                    'notes' => $item->notes,
                    'modifiers' => $item->modifiers->map(fn ($m) => [
                        'id' => $m->id,
                        'name' => $m->modifier_name,
                        'modifier_name' => $m->modifier_name,
                        'modifier_price' => (float) $m->modifier_price,
                    ])->values(),
                ])->values(),
            ],
        ]);
    }

    /**
     * PATCH /api/orders/{id}/customer
     *
     * Link, change, or remove the customer on an open order — used when
     * a paid pickup ticket is opened view-only at the counter and the
     * cashier needs to attach a phone for receipt SMS / handover.
     */
    public function updateCustomer(Request $request, int $id): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $request->validate([
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
        ]);

        $order = Order::with('customer')->findOrFail($id);

        if (in_array($order->status, ['completed', 'cancelled', 'refunded'], true)) {
            return response()->json(['message' => 'Cannot change customer on a closed order.'], 422);
        }

        $before = $order->customer_id;
        $order->update(['customer_id' => $request->input('customer_id')]);

        app(AuditLogService::class)->log(
            'order.customer_updated',
            'Order',
            $order->id,
            ['customer_id' => $before],
            ['customer_id' => $order->customer_id],
            [],
            $request,
        );

        return response()->json([
            'order' => $order->fresh(['customer:id,name,phone,loyalty_points,sms_opt_out']),
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
            if (!SmsNotificationSettings::isEnabled(SmsNotificationSettings::POS_SEND_BILL)) {
                return response()->json(['message' => SmsNotificationSettings::DISABLED_MESSAGE], 422);
            }

            $fallback = 'Bill #' . $invoice->invoice_number . ' — MVR ' . number_format((float) $invoice->total, 2) . '. View: ' . $link;
            $message = app(CustomerSmsMessageBuilder::class)->build(
                CustomerSmsMessageBuilder::SLUG_SEND_BILL,
                [
                    'invoice_number' => (string) $invoice->invoice_number,
                    'total' => number_format((float) $invoice->total, 2),
                    'invoice_url' => $link,
                ],
                $fallback,
            );

            app(SmsService::class)->send(new SmsMessage(
                to: $phone,
                message: $message,
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
