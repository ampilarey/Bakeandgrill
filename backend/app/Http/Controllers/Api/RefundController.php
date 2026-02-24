<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreRefundRequest;
use App\Models\Order;
use App\Models\Refund;
use App\Services\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class RefundController extends Controller
{
    public function index(Request $request)
    {
        $query = Refund::with(['order', 'user'])->orderByDesc('created_at');

        if ($request->filled('status')) {
            $query->where('status', $request->query('status'));
        }

        return response()->json([
            'refunds' => $query->paginate(50),
        ]);
    }

    public function show($id)
    {
        $refund = Refund::with(['order', 'user'])->findOrFail($id);

        return response()->json(['refund' => $refund]);
    }

    public function store(StoreRefundRequest $request, $orderId)
    {
        Gate::authorize('refund.process');

        $order = Order::findOrFail($orderId);
        $validated = $request->validated();
        $amount = (float) $validated['amount'];

        if ($amount > ($order->total ?? 0)) {
            return response()->json(['message' => 'Refund exceeds order total.'], 422);
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

        app(AuditLogService::class)->log(
            'refund.created',
            'Refund',
            $refund->id,
            [],
            $refund->toArray(),
            ['order_id' => $order->id],
            $request,
        );

        return response()->json(['refund' => $refund], 201);
    }
}
