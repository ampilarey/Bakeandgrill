<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Orders\DTOs\OrderRefundedData;
use App\Domains\Orders\Events\OrderRefunded;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreRefundRequest;
use App\Models\Order;
use App\Models\Refund;
use App\Services\AuditLogService;
use App\Services\StockManagementService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class RefundController extends Controller
{
    public function index(Request $request)
    {
        Gate::authorize('refund.process');

        $allowedStatuses = ['pending', 'approved', 'rejected', 'processed'];
        $query = Refund::with(['order', 'user'])->orderByDesc('created_at');

        if ($request->filled('status') && in_array($request->query('status'), $allowedStatuses, true)) {
            $query->where('status', $request->query('status'));
        }

        return response()->json([
            'refunds' => $query->paginate(50),
        ]);
    }

    public function show($id)
    {
        Gate::authorize('refund.process');

        $refund = Refund::with(['order', 'user'])->findOrFail($id);

        return response()->json(['refund' => $refund]);
    }

    public function store(StoreRefundRequest $request, $orderId)
    {
        Gate::authorize('refund.process');

        $validated = $request->validated();
        $amount = (float) $validated['amount'];
        $amountLaar = (int) round($amount * 100);

        [$refund, $order] = DB::transaction(function () use ($validated, $amount, $amountLaar, $orderId, $request) {
            $order = Order::with('items.item')->lockForUpdate()->findOrFail($orderId);

            $orderTotalLaar     = (int) ($order->total_laar ?? round((float) ($order->total ?? 0) * 100));
            $alreadyRefundedLaar = (int) round(
                (float) $order->refunds()->where('status', '!=', 'rejected')->sum('amount') * 100
            );

            if ($amountLaar + $alreadyRefundedLaar > $orderTotalLaar) {
                abort(422, 'Refund would exceed order total. Already refunded: ' . number_format($alreadyRefundedLaar / 100, 2));
            }

            $refund = Refund::create([
                'order_id' => $order->id,
                'user_id' => $request->user()?->id,
                'amount' => $amount,
                'status' => $validated['status'] ?? 'approved',
                'reason' => $validated['reason'] ?? null,
            ]);

            $isFullRefund = ($amountLaar + $alreadyRefundedLaar >= $orderTotalLaar);

            if ($isFullRefund) {
                $order->update(['status' => 'refunded']);

                // Restore prepared stock for each item that tracks stock.
                // Idempotent: StockMovement unique key blocks double-restore.
                $stockService = app(StockManagementService::class);
                foreach ($order->items as $orderItem) {
                    $item = $orderItem->item;
                    if (!$item || !$item->track_stock || $item->availability_type !== 'stock_based') {
                        continue;
                    }
                    $key = 'refund:order:' . $order->id . ':item:' . $orderItem->id;
                    $stockService->restorePreparedStock(
                        $item,
                        (int) $orderItem->quantity,
                        $key,
                        $order->id,
                        $request->user()?->id,
                    );
                }
            }

            return [$refund, $order];
        });

        app(AuditLogService::class)->log(
            'refund.created',
            'Refund',
            $refund->id,
            [],
            $refund->toArray(),
            ['order_id' => $order->id],
            $request,
        );

        $refund->load('order');
        event(new OrderRefunded(OrderRefundedData::fromRefund($refund)));

        return response()->json(['refund' => $refund], 201);
    }
}
