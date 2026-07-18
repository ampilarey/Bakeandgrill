<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Orders;

use App\Domains\Orders\Services\OrderVisibilityService;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCustomerOrderRequest;
use App\Http\Requests\StoreOrderBatchRequest;
use App\Http\Requests\StoreOrderRequest;
use App\Models\Customer;
use App\Models\Order;
use App\Services\AuditLogService;
use App\Services\OnlineOrderingGateService;
use App\Services\OrderCreationService;
use App\Services\PermissionService;
use App\Services\ShiftAccessService;
use App\Support\BusinessDay;
use App\Support\OrderSettlement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OrderCreationController extends Controller
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

        // Maldives business-day window (not UTC midnight, not a shifted UTC
        // window that pulls in the previous local evening).
        if ($request->filled('date')) {
            [$from, $to] = BusinessDay::bounds((string) $request->input('date'));
            $query->whereBetween('created_at', [$from, $to]);
        }

        if ($request->filled('date_from')) {
            [$from] = BusinessDay::bounds((string) $request->input('date_from'));
            $query->where('created_at', '>=', $from);
        }
        if ($request->filled('date_to')) {
            [, $to] = BusinessDay::bounds((string) $request->input('date_to'));
            $query->where('created_at', '<=', $to);
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
            // Online gift-card purchases are not kitchen/cashier tickets.
            $query->where('type', '!=', 'gift_card');

            $query->where(function ($w) {
                $w->whereIn('type', ['online_pickup', 'delivery'])
                    ->orWhere(function ($w2) {
                        $w2->whereIn('type', ['dine_in', 'takeaway'])
                            ->where(function ($w3) {
                                $w3->whereNull('payment_status')
                                    ->orWhereIn('payment_status', ['unpaid', 'partial']);
                            });
                    })
                    ->orWhereNotIn('type', ['dine_in', 'takeaway', 'online_pickup', 'delivery', 'gift_card']);
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
}
