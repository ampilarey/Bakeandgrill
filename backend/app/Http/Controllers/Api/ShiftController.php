<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Shifts\DTOs\ShiftClosedData;
use App\Domains\Shifts\DTOs\ShiftOpenedData;
use App\Domains\Shifts\Events\ShiftClosed;
use App\Domains\Shifts\Events\ShiftOpened;
use App\Http\Controllers\Controller;
use App\Http\Requests\CloseShiftRequest;
use App\Http\Requests\OpenShiftRequest;
use App\Models\CashMovement;
use App\Models\Device;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Refund;
use App\Models\Shift;
use App\Services\AuditLogService;
use App\Services\PermissionService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ShiftController extends Controller
{
    public function current(Request $request)
    {
        $shift = Shift::where('user_id', $request->user()?->id)
            ->whereNull('closed_at')
            ->latest('opened_at')
            ->first();

        if ($shift) {
            $shift->load('cashMovements.user');
            $cashIn = $shift->cashMovements->whereIn('type', ['cash_in',  'paid_in'])->sum('amount');
            $cashOut = $shift->cashMovements->whereIn('type', ['cash_out', 'paid_out'])->sum('amount');
            $shift->setAttribute('total_cash_in', $cashIn);
            $shift->setAttribute('total_cash_out', $cashOut);
            $shift->setAttribute('cash_movements', $shift->cashMovements->values());
        }

        return response()->json(['shift' => $shift]);
    }

    /**
     * Single source of truth for "what should be in the cash drawer right now".
     * Used by both summary() and close() so the cashier never sees one number
     * on screen and a different one when they tap Close.
     *
     * @return array{opening:float,cash_in:float,cash_out:float,cash_sales:float,cash_refunds:float,expected:float}
     */
    private function expectedCashFor(Shift $shift): array
    {
        $cashIn = (float) CashMovement::where('shift_id', $shift->id)
            ->whereIn('type', ['cash_in', 'paid_in'])->sum('amount');
        $cashOut = (float) CashMovement::where('shift_id', $shift->id)
            ->whereIn('type', ['cash_out', 'paid_out'])->sum('amount');

        $cashSales = (float) Payment::where('method', 'cash')
            ->where('amount', '>', 0)
            ->where('shift_id', $shift->id)
            ->whereIn('status', ['paid', 'completed', 'confirmed'])
            ->sum('amount');

        $cashRefundsRaw = (float) Payment::where('method', 'cash')
            ->where('amount', '<', 0)
            ->where('shift_id', $shift->id)
            ->sum('amount');

        $refundCashOut = (float) Refund::where('shift_id', $shift->id)
            ->whereNotIn('status', ['rejected'])
            ->sum('amount');

        $opening = (float) ($shift->opening_cash ?? 0);

        return [
            'opening' => $opening,
            'cash_in' => $cashIn,
            'cash_out' => $cashOut,
            'cash_sales' => $cashSales,
            'cash_refunds' => abs($cashRefundsRaw) + $refundCashOut,
            'expected' => $opening + $cashIn - $cashOut + $cashSales + $cashRefundsRaw - $refundCashOut,
        ];
    }

    /**
     * Live shift summary — cash drawer breakdown + sales summary the cashier
     * can glance at any time without having to close the shift. Returns the
     * same numbers `close()` will use, so closing should never be a surprise.
     */
    public function summary(Request $request, int $id)
    {
        $user = $request->user();
        $canViewAll = app(PermissionService::class)->hasPermission($user, 'shifts.view_all_history');

        $shiftQuery = Shift::query()->where('id', $id);
        if (!$canViewAll) {
            $shiftQuery->where('user_id', $user?->id);
        }
        $shift = $shiftQuery->firstOrFail();

        $cash = $this->expectedCashFor($shift);
        $openingCash = $cash['opening'];
        $cashIn = $cash['cash_in'];
        $cashOut = $cash['cash_out'];
        $cashSales = $cash['cash_sales'];
        $cashRefunds = $cash['cash_refunds'];
        $expectedCash = $cash['expected'];

        $paymentsInShift = Payment::query()
            ->where('shift_id', $shift->id)
            ->whereIn('status', ['paid', 'completed', 'confirmed']);

        $gross = (float) (clone $paymentsInShift)->sum('amount');
        $refundsTotal = (float) Refund::where('shift_id', $shift->id)
            ->whereNotIn('status', ['rejected'])
            ->sum('amount');

        $ordersCreated = Order::where('shift_id', $shift->id)
            ->whereNotIn('status', ['cancelled']);
        $ordersCreatedCount = (clone $ordersCreated)->count();

        $orderCount = (int) Payment::query()
            ->where('shift_id', $shift->id)
            ->whereIn('status', ['paid', 'completed', 'confirmed'])
            ->distinct()
            ->count('order_id');

        $tenders = Payment::query()
            ->where('shift_id', $shift->id)
            ->whereIn('status', ['paid', 'completed', 'confirmed'])
            ->select('method', DB::raw('SUM(amount) as total'))
            ->groupBy('method')
            ->pluck('total', 'method');

        $openUnpaidOrders = Order::where('shift_id', $shift->id)
            ->whereIn('payment_status', ['unpaid', 'partial'])
            ->whereNotIn('status', ['cancelled', 'refunded', 'completed'])
            ->count();

        return response()->json([
            'shift' => [
                'id' => $shift->id,
                'opened_at' => $shift->opened_at,
                'opening_cash' => $openingCash,
                'user_id' => $shift->user_id,
                'device_id' => $shift->device_id,
            ],
            'cash_drawer' => [
                'opening_cash' => $openingCash,
                'cash_sales'   => $cashSales,
                'cash_refunds' => $cashRefunds,
                'paid_in'      => $cashIn,
                'paid_out'     => $cashOut,
                'expected_cash' => $expectedCash,
            ],
            'sales_summary' => [
                'order_count' => $orderCount,
                'orders_created_count' => $ordersCreatedCount,
                'gross_sales' => $gross,
                'discounts'   => 0,
                'refunds'     => $refundsTotal,
                'net_sales'   => $gross - $refundsTotal,
            ],
            'tenders' => $tenders,
            'open_unpaid_orders' => $openUnpaidOrders,
        ]);
    }

    /**
     * Past shift list for this cashier (or every cashier — owners/managers).
     * Limited to the most recent 60 shifts to keep responses small.
     */
    public function history(Request $request)
    {
        $user = $request->user();
        $canViewAll = app(PermissionService::class)->hasPermission($user, 'shifts.view_all_history');

        $query = Shift::query()
            ->whereNotNull('closed_at')
            ->orderByDesc('opened_at')
            ->limit(60);

        if (!$canViewAll) {
            $query->where('user_id', $user?->id);
        }

        return response()->json(['shifts' => $query->with(['user:id,name', 'device:id,name,identifier'])->get()]);
    }

    /**
     * All currently open shifts (admin oversight).
     */
    public function live(Request $request)
    {
        $user = $request->user();
        if (!app(PermissionService::class)->hasPermission($user, 'shifts.view_all_history')) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $shifts = Shift::query()
            ->whereNull('closed_at')
            ->with(['user:id,name', 'device:id,name,identifier'])
            ->orderByDesc('opened_at')
            ->get();

        return response()->json(['shifts' => $shifts]);
    }

    /**
     * Owner/manager force-close a stuck shift.
     */
    public function forceClose(Request $request, int $id)
    {
        $actor = $request->user();
        if (!app(PermissionService::class)->hasPermission($actor, 'shifts.view_all_history')) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $validated = $request->validate([
            'notes' => 'nullable|string|max:500',
        ]);

        $shift = DB::transaction(function () use ($id, $validated, $actor) {
            $shift = Shift::lockForUpdate()->findOrFail($id);

            if ($shift->closed_at) {
                return null;
            }

            $cash = $this->expectedCashFor($shift);
            $expectedCash = $cash['expected'];

            $shift->update([
                'closed_at' => now(),
                'closing_cash' => $expectedCash,
                'expected_cash' => $expectedCash,
                'variance' => 0,
                'notes' => trim(($validated['notes'] ?? '') . ' [Force closed by ' . ($actor->name ?? 'admin') . ']'),
            ]);

            return $shift;
        });

        if ($shift === null) {
            return response()->json(['message' => 'Shift already closed.'], 422);
        }

        app(AuditLogService::class)->log(
            'shift.force_closed',
            'Shift',
            $shift->id,
            [],
            $shift->fresh()->toArray(),
            ['forced_by' => $actor->id],
            $request,
        );

        return response()->json(['shift' => $shift->fresh(), 'message' => 'Shift force-closed.']);
    }

    public function open(OpenShiftRequest $request)
    {
        $userId = $request->user()?->id;
        $deviceId = $request->input('device_id');
        if (!$deviceId) {
            $identifier = $request->header('X-Device-Identifier')
                ?? $request->header('X-Device-Id');
            if ($identifier) {
                $deviceId = Device::where('identifier', $identifier)->value('id');
            }
        }

        $shift = DB::transaction(function () use ($userId, $request, $deviceId) {
            // Lock any existing open shift row for this user to prevent double-open race
            $existing = Shift::where('user_id', $userId)
                ->whereNull('closed_at')
                ->lockForUpdate()
                ->first();

            if ($existing) {
                return null;
            }

            return Shift::create([
                'user_id' => $userId,
                'device_id' => $deviceId,
                'opened_at' => now(),
                'opening_cash' => $request->input('opening_cash'),
                'notes' => $request->input('notes'),
            ]);
        });

        if ($shift === null) {
            return response()->json(['message' => 'Shift already open.'], 422);
        }

        app(AuditLogService::class)->log(
            'shift.opened',
            'Shift',
            $shift->id,
            [],
            $shift->toArray(),
            [],
            $request,
        );

        event(new ShiftOpened(new ShiftOpenedData(
            shiftId: $shift->id,
            userId: $userId,
            userName: $request->user()?->name ?? 'Unknown',
            openingCash: (float) ($shift->opening_cash ?? 0),
        )));

        return response()->json(['shift' => $shift], 201);
    }

    public function close(CloseShiftRequest $request, $id)
    {
        // Wrap the close in a row-locked transaction so two concurrent
        // close requests (e.g. cashier double-tapping Close + manager
        // closing from the admin panel) can't both pass the
        // "already closed?" check and corrupt closing_cash / variance.
        // open() already uses lockForUpdate; close was the asymmetric
        // gap.
        $shift = DB::transaction(function () use ($id, $request) {
            $shift = Shift::where('user_id', $request->user()?->id)
                ->lockForUpdate()
                ->findOrFail($id);

            if ($shift->closed_at) {
                return null;
            }

            $cash = $this->expectedCashFor($shift);
            $expectedCash = $cash['expected'];
            $closingCash = (float) $request->input('closing_cash');
            $variance = $closingCash - $expectedCash;

            $shift->update([
                'closed_at' => now(),
                'closing_cash' => $closingCash,
                'expected_cash' => $expectedCash,
                'variance' => $variance,
                'notes' => $request->input('notes') ?? $shift->notes,
            ]);

            return $shift;
        });

        if ($shift === null) {
            return response()->json(['message' => 'Shift already closed.'], 422);
        }

        // Re-read cash breakdown outside the lock for the response body /
        // audit log payload — at this point the close is committed so
        // the totals are stable.
        $cash = $this->expectedCashFor($shift);
        $cashIn = $cash['cash_in'];
        $cashOut = $cash['cash_out'];
        $cashSales = $cash['cash_sales'];
        $expectedCash = $cash['expected'];
        $closingCash = (float) $shift->closing_cash;
        $variance = (float) $shift->variance;

        app(AuditLogService::class)->log(
            'shift.closed',
            'Shift',
            $shift->id,
            [
                'closed_at' => null,
                'closing_cash' => $shift->getOriginal('closing_cash'),
                'expected_cash' => $shift->getOriginal('expected_cash'),
                'variance' => $shift->getOriginal('variance'),
            ],
            [
                'closed_at' => $shift->closed_at,
                'closing_cash' => $shift->closing_cash,
                'expected_cash' => $shift->expected_cash,
                'variance' => $shift->variance,
            ],
            [
                'cash_sales' => $cashSales,
                'cash_in' => $cashIn,
                'cash_out' => $cashOut,
            ],
            $request,
        );

        $orderCount = (int) Payment::query()
            ->where('shift_id', $shift->id)
            ->whereIn('status', ['paid', 'completed', 'confirmed'])
            ->distinct()
            ->count('order_id');

        $totalRevenue = (float) Payment::where('shift_id', $shift->id)
            ->whereIn('status', ['paid', 'completed', 'confirmed'])
            ->sum('amount');

        $openUnpaidOrders = Order::where('shift_id', $shift->id)
            ->whereIn('payment_status', ['unpaid', 'partial'])
            ->whereNotIn('status', ['cancelled', 'refunded', 'completed'])
            ->count();

        event(new ShiftClosed(new ShiftClosedData(
            shiftId: $shift->id,
            userId: $shift->user_id,
            userName: $request->user()?->name ?? 'Unknown',
            expectedCash: (float) $expectedCash,
            actualCash: $closingCash,
            variance: (float) $variance,
            orderCount: $orderCount,
            totalRevenue: $totalRevenue,
        )));

        $response = [
            'shift' => $shift,
            'cash_sales' => $cashSales,
            'cash_in' => $cashIn,
            'cash_out' => $cashOut,
        ];

        if ($openUnpaidOrders > 0) {
            $response['open_unpaid_orders'] = $openUnpaidOrders;
            $response['message'] = 'This shift has open unpaid orders created during it. They will remain active and can be paid by another staff shift.';
        }

        return response()->json($response);
    }
}
