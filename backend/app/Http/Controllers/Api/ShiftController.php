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
use App\Models\Order;
use App\Models\Payment;
use App\Models\Refund;
use App\Models\Shift;
use App\Services\AuditLogService;
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
     * Live shift summary — cash drawer breakdown + sales summary the cashier
     * can glance at any time without having to close the shift. Returns the
     * same numbers `close()` will use, so closing should never be a surprise.
     */
    public function summary(Request $request, int $id)
    {
        $shift = Shift::where('user_id', $request->user()?->id)->findOrFail($id);

        $cashIn = (float) CashMovement::where('shift_id', $shift->id)
            ->whereIn('type', ['cash_in', 'paid_in'])->sum('amount');
        $cashOut = (float) CashMovement::where('shift_id', $shift->id)
            ->whereIn('type', ['cash_out', 'paid_out'])->sum('amount');

        // Cash sales/refunds based on Payment rows linked to orders in this shift.
        $cashSales = (float) Payment::where('method', 'cash')
            ->where('amount', '>', 0)
            ->whereHas('order', fn ($q) => $q->where('shift_id', $shift->id))
            ->sum('amount');
        $cashRefunds = (float) Payment::where('method', 'cash')
            ->where('amount', '<', 0)
            ->whereHas('order', fn ($q) => $q->where('shift_id', $shift->id))
            ->sum('amount');

        $openingCash = (float) ($shift->opening_cash ?? 0);
        $expectedCash = $openingCash + $cashIn - $cashOut + $cashSales + $cashRefunds;

        // Sales summary across every order in the shift (any tender, any status
        // except cancelled). Matches what Loyverse calls "Gross sales".
        $orders = Order::where('shift_id', $shift->id)
            ->whereNotIn('status', ['cancelled']);

        $orderCount = (clone $orders)->count();
        $gross = (float) (clone $orders)->sum('total');
        $discounts = (float) (clone $orders)->sum(DB::raw('COALESCE(discount_amount,0) + COALESCE(manual_discount_laar,0)/100'));
        $refundsTotal = (float) Refund::whereHas('order', fn ($q) => $q->where('shift_id', $shift->id))
            ->whereNotIn('status', ['rejected'])
            ->sum('amount');

        // Tender breakdown for non-cash methods (handy for end-of-shift reports).
        $tenders = Payment::whereHas('order', fn ($q) => $q->where('shift_id', $shift->id))
            ->select('method', DB::raw('SUM(amount) as total'))
            ->groupBy('method')
            ->pluck('total', 'method');

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
                'cash_refunds' => abs($cashRefunds),
                'paid_in'      => $cashIn,
                'paid_out'     => $cashOut,
                'expected_cash' => $expectedCash,
            ],
            'sales_summary' => [
                'order_count' => $orderCount,
                'gross_sales' => $gross,
                'discounts'   => $discounts,
                'refunds'     => $refundsTotal,
                'net_sales'   => $gross - $refundsTotal,
            ],
            'tenders' => $tenders,
        ]);
    }

    /**
     * Past shift list for this cashier (or every cashier — owners/managers).
     * Limited to the most recent 60 shifts to keep responses small.
     */
    public function history(Request $request)
    {
        $user = $request->user();
        $isManagerOrOwner = in_array($user?->role?->slug, ['owner', 'manager'], true);

        $query = Shift::query()
            ->whereNotNull('closed_at')
            ->orderByDesc('opened_at')
            ->limit(60);

        if (!$isManagerOrOwner) {
            $query->where('user_id', $user?->id);
        }

        return response()->json(['shifts' => $query->get()]);
    }

    public function open(OpenShiftRequest $request)
    {
        $userId = $request->user()?->id;

        $shift = DB::transaction(function () use ($userId, $request) {
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
                'device_id' => $request->input('device_id'),
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
        $shift = Shift::where('user_id', $request->user()?->id)
            ->findOrFail($id);

        if ($shift->closed_at) {
            return response()->json(['message' => 'Shift already closed.'], 422);
        }

        $cashIn = CashMovement::where('shift_id', $shift->id)
            ->whereIn('type', ['cash_in', 'paid_in'])
            ->sum('amount');
        $cashOut = CashMovement::where('shift_id', $shift->id)
            ->whereIn('type', ['cash_out', 'paid_out'])
            ->sum('amount');

        $cashSales = Payment::where('method', 'cash')
            ->whereHas('order', fn ($q) => $q->where('shift_id', $shift->id))
            ->whereBetween('processed_at', [$shift->opened_at, now()])
            ->sum('amount');

        $expectedCash = ($shift->opening_cash ?? 0) + $cashIn - $cashOut + $cashSales;
        $closingCash = (float) $request->input('closing_cash');
        $variance = $closingCash - $expectedCash;

        $shift->update([
            'closed_at' => now(),
            'closing_cash' => $closingCash,
            'expected_cash' => $expectedCash,
            'variance' => $variance,
            'notes' => $request->input('notes') ?? $shift->notes,
        ]);

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

        $orderCount = Order::where('shift_id', $shift->id)
            ->whereNotIn('status', ['cancelled'])
            ->count();

        $totalRevenue = Order::where('shift_id', $shift->id)
            ->whereNotIn('status', ['cancelled'])
            ->sum('total');

        event(new ShiftClosed(new ShiftClosedData(
            shiftId: $shift->id,
            userId: $shift->user_id,
            userName: $request->user()?->name ?? 'Unknown',
            expectedCash: (float) $expectedCash,
            actualCash: $closingCash,
            variance: (float) $variance,
            orderCount: $orderCount,
            totalRevenue: (float) $totalRevenue,
        )));

        return response()->json([
            'shift' => $shift,
            'cash_sales' => $cashSales,
            'cash_in' => $cashIn,
            'cash_out' => $cashOut,
        ]);
    }
}
