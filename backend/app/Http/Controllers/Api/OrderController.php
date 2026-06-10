<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\CustomerSmsMessageBuilder;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\SmsNotificationSettings;
use App\Domains\Orders\DTOs\OrderCancelledData;
use App\Domains\Orders\Events\OrderCancelled;
use App\Domains\Orders\Services\OrderVisibilityService;
use App\Domains\Payments\Actions\SettleOrderPaymentAction;
use App\Domains\Payments\Services\PaymentAllocationService;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCustomerOrderRequest;
use App\Http\Requests\StoreOrderBatchRequest;
use App\Http\Requests\StoreOrderPaymentsRequest;
use App\Http\Requests\StoreOrderRequest;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Receipt;
use App\Services\AuditLogService;
use App\Services\OnlineOrderingGateService;
use App\Services\OrderCreationService;
use App\Services\PermissionService;
use App\Services\ShiftAccessService;
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

        if (!app(OrderVisibilityService::class)->staffCanViewOrder($request->user(), $order)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

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

        if ($allocation->needsCreditShift($validated['payments'])) {
            $isOwner = $collector->role?->slug === 'owner';
            if ($isOwner) {
                $collectorShift ??= app(ShiftAccessService::class)->findOpenShift($collector);
            } else {
                $creditShift = app(ShiftAccessService::class)->requireOpenShift(
                    $collector,
                    'Open a shift before charging customer credit.',
                );
                $collectorShift = $collectorShift ?? $creditShift;
            }
        }

        if ($allocation->needsDepositShift($validated['payments'])) {
            $isOwner = $collector->role?->slug === 'owner';
            if ($isOwner) {
                $collectorShift ??= app(ShiftAccessService::class)->findOpenShift($collector);
            } else {
                $depositShift = app(ShiftAccessService::class)->requireOpenShift(
                    $collector,
                    'Open a shift before using customer deposit payment.',
                );
                $collectorShift = $collectorShift ?? $depositShift;
            }
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
