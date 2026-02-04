<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCustomerOrderRequest;
use App\Http\Requests\StoreOrderBatchRequest;
use App\Http\Requests\StoreOrderPaymentsRequest;
use App\Http\Requests\StoreOrderRequest;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Printer;
use App\Models\Payment;
use App\Models\PrintJob;
use App\Services\InventoryDeductionService;
use App\Services\OrderCreationService;
use App\Services\AuditLogService;
use App\Services\PrintProxyService;
use Illuminate\Http\Request;

class OrderController extends Controller
{
    public function store(StoreOrderRequest $request)
    {
        // SECURITY: Ensure this is a staff token
        if (!$request->user()->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $order = app(OrderCreationService::class)->createFromPayload(
            $request->validated(),
            $request->user()
        );

        app(AuditLogService::class)->log(
            'order.created',
            'Order',
            $order->id,
            [],
            $order->toArray(),
            [],
            $request
        );

        return response()->json(['order' => $order], 201);
    }

    public function storeCustomer(StoreCustomerOrderRequest $request)
    {
        // SECURITY: Ensure this is a customer token
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

        app(AuditLogService::class)->log(
            'order.created',
            'Order',
            $order->id,
            [],
            $order->toArray(),
            ['source' => 'customer'],
            $request
        );

        return response()->json(['order' => $order], 201);
    }

    public function sync(StoreOrderBatchRequest $request)
    {
        $payloads = $request->validated()['orders'];
        $user = $request->user();
        $processed = 0;
        $failed = [];

        foreach ($payloads as $index => $payload) {
            try {
                $order = app(OrderCreationService::class)->createFromPayload($payload, $user);
                app(AuditLogService::class)->log(
                    'order.created',
                    'Order',
                    $order->id,
                    [],
                    $order->toArray(),
                    ['source' => 'sync', 'index' => $index],
                    $request
                );
                $processed++;
            } catch (\Throwable $error) {
                $failed[] = [
                    'index' => $index,
                    'error' => $error->getMessage(),
                ];
            }
        }

        return response()->json([
            'processed' => $processed,
            'failed' => $failed,
        ]);
    }

    public function show(Request $request, $id)
    {
        $order = Order::with(['items.modifiers', 'payments', 'customer', 'table'])
            ->findOrFail($id);

        return response()->json(['order' => $order]);
    }

    public function hold(Request $request, $id)
    {
        $order = Order::findOrFail($id);
        if ($order->status === 'completed') {
            return response()->json(['message' => 'Completed orders cannot be held.'], 422);
        }

        $oldStatus = $order->status;
        $order->update([
            'status' => 'held',
            'held_at' => now(),
        ]);

        app(AuditLogService::class)->log(
            'order.held',
            'Order',
            $order->id,
            ['status' => $oldStatus],
            ['status' => 'held'],
            [],
            $request
        );

        return response()->json(['order' => $order]);
    }

    public function resume(Request $request, $id)
    {
        $order = Order::findOrFail($id);
        if ($order->status !== 'held') {
            return response()->json(['message' => 'Only held orders can be resumed.'], 422);
        }

        $oldStatus = $order->status;
        $order->update([
            'status' => 'pending',
            'held_at' => null,
        ]);

        app(AuditLogService::class)->log(
            'order.resumed',
            'Order',
            $order->id,
            ['status' => $oldStatus],
            ['status' => 'pending'],
            [],
            $request
        );

        return response()->json(['order' => $order]);
    }

    public function addPayments(StoreOrderPaymentsRequest $request, $id)
    {
        $order = Order::with('payments')->findOrFail($id);
        $validated = $request->validated();
        $oldStatus = $order->status;

        foreach ($validated['payments'] as $paymentPayload) {
            $payment = Payment::create([
                'order_id' => $order->id,
                'method' => $paymentPayload['method'],
                'amount' => $paymentPayload['amount'],
                'status' => $paymentPayload['status'] ?? 'paid',
                'reference_number' => $paymentPayload['reference_number'] ?? null,
                'processed_at' => now(),
            ]);

            app(AuditLogService::class)->log(
                'payment.created',
                'Payment',
                $payment->id,
                [],
                $payment->toArray(),
                ['order_id' => $order->id],
                $request
            );
        }

        $paidTotal = $order->payments()
            ->whereIn('status', ['paid', 'completed'])
            ->sum('amount');

        if ($paidTotal >= $order->total) {
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
                ['paid_total' => $paidTotal],
                $request
            );

            try {
                app(InventoryDeductionService::class)->deductForOrder($order, $request->user()?->id);
            } catch (\Throwable $error) {
                report($error);
            }

            if (!array_key_exists('print_receipt', $validated) || $validated['print_receipt'] === true) {
                $order->load(['items.modifiers', 'payments']);
                $this->dispatchReceiptPrintJobs($order);
            }
        } else {
            $order->update([
                'status' => 'partial',
            ]);

            app(AuditLogService::class)->log(
                'order.partial',
                'Order',
                $order->id,
                ['status' => $oldStatus],
                ['status' => 'partial'],
                ['paid_total' => $paidTotal],
                $request
            );
        }

        return response()->json([
            'order' => $order->load('payments'),
            'paid_total' => $paidTotal,
        ]);
    }


    private function dispatchReceiptPrintJobs(Order $order): void
    {
        $printers = Printer::where('is_active', true)
            ->whereIn('type', ['receipt', 'counter'])
            ->get();

        if ($printers->isEmpty()) {
            return;
        }

        foreach ($printers as $printer) {
            $job = PrintJob::create([
                'order_id' => $order->id,
                'printer_id' => $printer->id,
                'type' => 'receipt',
                'status' => 'queued',
                'payload' => [
                    'printer' => [
                        'id' => $printer->id,
                        'name' => $printer->name,
                        'ip_address' => $printer->ip_address,
                        'port' => $printer->port,
                        'type' => $printer->type,
                        'station' => $printer->station,
                    ],
                    'order' => [
                        'id' => $order->id,
                        'order_number' => $order->order_number,
                        'type' => $order->type,
                        'notes' => $order->notes,
                        'subtotal' => $order->subtotal,
                        'tax_amount' => $order->tax_amount,
                        'discount_amount' => $order->discount_amount,
                        'total' => $order->total,
                        'created_at' => $order->created_at?->toIso8601String(),
                        'items' => $order->items->map(function ($item) {
                            return [
                                'id' => $item->id,
                                'item_name' => $item->item_name,
                                'quantity' => $item->quantity,
                                'unit_price' => $item->unit_price,
                                'modifiers' => $item->modifiers->map(function ($modifier) {
                                    return [
                                        'id' => $modifier->id,
                                        'modifier_name' => $modifier->modifier_name,
                                        'modifier_price' => $modifier->modifier_price,
                                    ];
                                })->values(),
                            ];
                        })->values(),
                        'payments' => $order->payments->map(function ($payment) {
                            return [
                                'method' => $payment->method,
                                'amount' => $payment->amount,
                            ];
                        })->values(),
                    ],
                ],
                'attempts' => 0,
                'last_error' => null,
            ]);

            try {
                app(PrintProxyService::class)->send($job);
            } catch (\Throwable $error) {
                $job->update([
                    'status' => 'failed',
                    'attempts' => $job->attempts + 1,
                    'last_error' => $error->getMessage(),
                ]);
            }
        }
    }
}
