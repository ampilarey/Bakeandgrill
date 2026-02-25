<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

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
use App\Services\OrderCreationService;
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
        $query = Order::with(['customer:id,name,phone', 'items:id,order_id,item_name,quantity,unit_price,total_price'])
            ->orderBy('created_at', 'desc');

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        if ($request->filled('type')) {
            $query->where('type', $request->input('type'));
        }

        if ($request->filled('date')) {
            $query->whereDate('created_at', $request->input('date'));
        }

        $orders = $query->paginate(30);

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

        foreach ($payloads as $index => $payload) {
            try {
                $order = app(OrderCreationService::class)->createFromPayload($payload, $user);
                app(AuditLogService::class)->log('order.created', 'Order', $order->id, [], $order->toArray(), ['source' => 'sync', 'index' => $index], $request);
                $processed++;
            } catch (\Throwable $error) {
                $failed[] = ['index' => $index, 'error' => $error->getMessage()];
            }
        }

        return response()->json(['processed' => $processed, 'failed' => $failed]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $order = Order::with(['items.modifiers', 'payments', 'customer', 'table'])
            ->findOrFail($id);

        return response()->json(['order' => $order]);
    }

    public function hold(Request $request, int $id): JsonResponse
    {
        $order = Order::findOrFail($id);
        if ($order->status === 'completed') {
            return response()->json(['message' => 'Completed orders cannot be held.'], 422);
        }

        $oldStatus = $order->status;
        $order->update(['status' => 'held', 'held_at' => now()]);

        app(AuditLogService::class)->log('order.held', 'Order', $order->id, ['status' => $oldStatus], ['status' => 'held'], [], $request);

        return response()->json(['order' => $order]);
    }

    public function resume(Request $request, int $id): JsonResponse
    {
        $order = Order::findOrFail($id);
        if ($order->status !== 'held') {
            return response()->json(['message' => 'Only held orders can be resumed.'], 422);
        }

        $oldStatus = $order->status;
        $order->update(['status' => 'pending', 'held_at' => null]);

        app(AuditLogService::class)->log('order.resumed', 'Order', $order->id, ['status' => $oldStatus], ['status' => 'pending'], [], $request);

        return response()->json(['order' => $order]);
    }

    public function addPayments(StoreOrderPaymentsRequest $request, int $id): JsonResponse
    {
        $order = Order::with('payments')->findOrFail($id);
        $validated = $request->validated();
        $oldStatus = $order->status;
        $printReceipt = !array_key_exists('print_receipt', $validated) || $validated['print_receipt'] === true;

        DB::transaction(function () use ($order, $validated, $request): void {
            foreach ($validated['payments'] as $paymentPayload) {
                $payment = Payment::create([
                    'order_id' => $order->id,
                    'method' => $paymentPayload['method'],
                    'amount' => $paymentPayload['amount'],
                    'status' => $paymentPayload['status'] ?? 'paid',
                    'reference_number' => $paymentPayload['reference_number'] ?? null,
                    'processed_at' => now(),
                ]);

                app(AuditLogService::class)->log('payment.created', 'Payment', $payment->id, [], $payment->toArray(), ['order_id' => $order->id], $request);
            }
        });

        $paidTotal = $order->payments()
            ->whereIn('status', ['paid', 'completed', 'confirmed'])
            ->sum('amount');

        if ($paidTotal >= $order->total) {
            DB::transaction(function () use ($order, $paidTotal, $oldStatus, $request, $printReceipt): void {
                $order->update([
                    'status' => 'paid',
                    'paid_at' => now(),
                ]);

                app(AuditLogService::class)->log('order.paid', 'Order', $order->id, ['status' => $oldStatus], ['status' => 'paid'], ['paid_total' => $paidTotal], $request);

                DB::afterCommit(function () use ($order, $printReceipt): void {
                    OrderPaid::dispatch($order->fresh(['items.modifiers', 'payments']), $printReceipt);
                });
            });
        } else {
            $order->update(['status' => 'partial']);

            app(AuditLogService::class)->log('order.partial', 'Order', $order->id, ['status' => $oldStatus], ['status' => 'partial'], ['paid_total' => $paidTotal], $request);
        }

        return response()->json([
            'order' => $order->fresh('payments'),
            'paid_total' => $paidTotal,
        ]);
    }
}
