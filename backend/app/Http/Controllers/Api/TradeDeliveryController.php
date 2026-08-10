<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Trade\Services\TradeCreditExposureService;
use App\Domains\Trade\Services\TradeDispatchService;
use App\Domains\Trade\Services\TradeReconciliationService;
use App\Models\TradeAccount;
use App\Models\TradeDelivery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Validation\Rule;

class TradeDeliveryController extends Controller
{
    public function __construct(
        private readonly TradeDispatchService $dispatch,
        private readonly TradeReconciliationService $reconcile,
        private readonly TradeCreditExposureService $exposure,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = TradeDelivery::query()
            ->with(['tradeAccount:id,shop_name,customer_id', 'tradeAccount.customer:id,name,phone', 'dispatcher:id,name', 'reconciler:id,name'])
            ->withCount('lines')
            ->orderByDesc('id');

        if ($request->filled('status')) {
            $query->where('status', $request->query('status'));
        }
        if ($request->filled('trade_account_id')) {
            $query->where('trade_account_id', (int) $request->query('trade_account_id'));
        }
        if ($request->filled('unreconciled_days')) {
            $days = max(1, (int) $request->query('unreconciled_days'));
            $query->where('status', TradeDelivery::STATUS_DISPATCHED)
                ->where('dispatched_at', '<=', now()->subDays($days));
        }
        if ($request->filled('search')) {
            $search = (string) $request->query('search');
            $query->where(function ($q) use ($search) {
                $q->where('delivery_number', 'like', "%{$search}%")
                    ->orWhere('driver_name', 'like', "%{$search}%")
                    ->orWhereHas('tradeAccount', fn ($aq) => $aq->where('shop_name', 'like', "%{$search}%"));
            });
        }

        $paginator = $query->paginate((int) $request->query('per_page', 50));

        return response()->json([
            'data' => collect($paginator->items())->map(fn (TradeDelivery $d) => $this->formatDelivery($d)),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $delivery = TradeDelivery::with([
            'lines.item:id,name,sku,track_stock,availability_type',
            'lines.variant:id,name',
            'tradeAccount.customer',
            'dispatcher:id,name',
            'reconciler:id,name',
        ])->findOrFail($id);

        $customer = $delivery->tradeAccount?->customer;
        $exposure = $customer ? $this->exposure->forCustomer($customer)->toArray() : null;

        return response()->json([
            'delivery' => $this->formatDelivery($delivery, detailed: true),
            'exposure' => $exposure,
        ]);
    }

    public function exposure(int $accountId): JsonResponse
    {
        $account = TradeAccount::with('customer')->findOrFail($accountId);
        if (! $account->customer) {
            abort(404, 'Customer not found for this trade account.');
        }

        return response()->json([
            'exposure' => $this->exposure->forCustomer($account->customer)->toArray(),
        ]);
    }

    public function dispatch(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'trade_account_id' => ['required', 'integer', 'exists:trade_accounts,id'],
            'idempotency_key' => ['required', 'string', 'max:128'],
            'driver_name' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:5000'],
            'expected_return_at' => ['nullable', 'date'],
            'credit_override_reason' => ['nullable', 'string', 'max:1000'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'integer', 'exists:items,id'],
            'lines.*.variant_id' => ['nullable', 'integer', 'exists:variants,id'],
            'lines.*.qty' => ['required', 'integer', 'min:1'],
        ]);

        $account = TradeAccount::with('customer')->findOrFail($validated['trade_account_id']);
        if (! $account->is_active) {
            abort(422, 'This trade account is inactive.');
        }

        $delivery = $this->dispatch->dispatch(
            account: $account,
            lines: $validated['lines'],
            actor: $request->user(),
            idempotencyKey: $validated['idempotency_key'],
            driverName: $validated['driver_name'] ?? null,
            notes: $validated['notes'] ?? null,
            expectedReturnAt: $validated['expected_return_at'] ?? null,
            creditOverrideReason: $validated['credit_override_reason'] ?? null,
        );

        return response()->json(['delivery' => $this->formatDelivery($delivery, detailed: true)], 201);
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        $delivery = TradeDelivery::findOrFail($id);
        $cancelled = $this->dispatch->cancel($delivery, $request->user());

        return response()->json(['delivery' => $this->formatDelivery($cancelled, detailed: true)]);
    }

    public function reconcile(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.line_id' => ['required', 'integer'],
            'lines.*.reported_sold_qty' => ['required', 'integer', 'min:0'],
            'lines.*.counted_return_qty' => ['required', 'integer', 'min:0'],
            'lines.*.qty_missing' => ['nullable', 'integer', 'min:0'],
            'lines.*.return_condition' => ['nullable', Rule::in([
                'good', 'cold', 'damaged', 'wrong_item', 'undercooked', 'overcooked', 'missing', 'other',
            ])],
            'lines.*.return_action' => ['nullable', Rule::in(['accept_to_stock', 'reject_to_waste'])],
            'lines.*.return_idempotency_key' => ['required', 'string', 'max:128'],
        ]);

        $delivery = TradeDelivery::findOrFail($id);
        $reconciled = $this->reconcile->reconcile($delivery, $validated['lines'], $request->user());

        return response()->json(['delivery' => $this->formatDelivery($reconciled, detailed: true)]);
    }

    /** @return array<string, mixed> */
    private function formatDelivery(TradeDelivery $d, bool $detailed = false): array
    {
        $payload = [
            'id' => $d->id,
            'trade_account_id' => $d->trade_account_id,
            'delivery_number' => $d->delivery_number,
            'status' => $d->status,
            'dispatched_at' => $d->dispatched_at?->toIso8601String(),
            'dispatched_by' => $d->dispatched_by,
            'dispatcher_name' => $d->dispatcher?->name,
            'driver_name' => $d->driver_name,
            'expected_return_at' => $d->expected_return_at?->toIso8601String(),
            'reconciled_at' => $d->reconciled_at?->toIso8601String(),
            'reconciled_by' => $d->reconciled_by,
            'reconciler_name' => $d->reconciler?->name,
            'notes' => $d->notes,
            'has_mismatch' => (bool) $d->has_mismatch,
            'self_reconciled' => (bool) $d->self_reconciled,
            'credit_override_reason' => $d->credit_override_reason,
            'credit_override_by' => $d->credit_override_by,
            'stamped_value_laar' => $d->relationLoaded('lines') ? $d->stampedValueLaar() : null,
            'shop_name' => $d->tradeAccount?->shop_name,
            'lines_count' => $d->lines_count ?? ($d->relationLoaded('lines') ? $d->lines->count() : null),
            'created_at' => $d->created_at?->toIso8601String(),
        ];

        if ($detailed && $d->relationLoaded('lines')) {
            $payload['lines'] = $d->lines->map(fn ($line) => [
                'id' => $line->id,
                'item_id' => $line->item_id,
                'variant_id' => $line->variant_id,
                'item_name' => $line->item?->name,
                'variant_name' => $line->variant?->name,
                'qty_sent' => $line->qty_sent,
                'unit_price_laar' => $line->unit_price_laar,
                'unit_cost_laar' => $line->unit_cost_laar,
                'qty_sold' => $line->qty_sold,
                'qty_returned_good' => $line->qty_returned_good,
                'qty_returned_waste' => $line->qty_returned_waste,
                'qty_missing' => $line->qty_missing,
                'reported_sold_qty' => $line->reported_sold_qty,
                'counted_return_qty' => $line->counted_return_qty,
                'return_condition' => $line->return_condition,
                'return_action' => $line->return_action,
                'line_value_laar' => $line->lineValueLaar(),
            ])->values();
            $payload['trade_account'] = $d->tradeAccount ? [
                'id' => $d->tradeAccount->id,
                'shop_name' => $d->tradeAccount->shop_name,
                'customer_id' => $d->tradeAccount->customer_id,
            ] : null;
        }

        return $payload;
    }
}
