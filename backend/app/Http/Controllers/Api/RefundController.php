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

        [$refund, $order] = DB::transaction(function () use ($validated, $amount, $orderId, $request) {
            $order = Order::lockForUpdate()->findOrFail($orderId);

            $alreadyRefunded = $order->refunds()
                ->where('status', '!=', 'rejected')
                ->sum('amount');

            if ($amount + $alreadyRefunded > ($order->total ?? 0)) {
                abort(422, 'Refund would exceed order total. Already refunded: ' . number_format($alreadyRefunded, 2));
            }

            $refund = Refund::create([
                'order_id' => $order->id,
                'user_id' => $request->user()?->id,
                'amount' => $amount,
                'status' => $validated['status'] ?? 'approved',
                'reason' => $validated['reason'] ?? null,
            ]);

            if ($amount >= ($order->total ?? 0)) {
                $order->update(['status' => 'refunded']);
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
