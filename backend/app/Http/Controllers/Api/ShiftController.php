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
            ->whereHas('order', fn ($q) => $q->where('shift_id', $shift->id))
            ->sum('amount');

        // Cash refunds (negative-amount cash payments). Kept separate for
        // reporting clarity in the UI; both arms feed the same expected total.
        $cashRefundsRaw = (float) Payment::where('method', 'cash')
            ->where('amount', '<', 0)
            ->whereHas('order', fn ($q) => $q->where('shift_id', $shift->id))
            ->sum('amount');

        $opening = (float) ($shift->opening_cash ?? 0);

        return [
            'opening' => $opening,
            'cash_in' => $cashIn,
            'cash_out' => $cashOut,
            'cash_sales' => $cashSales,
            'cash_refunds' => abs($cashRefundsRaw),
            'expected' => $opening + $cashIn - $cashOut + $cashSales + $cashRefundsRaw,
        ];
    }

    /**
     * Live shift summary — cash drawer breakdown + sales summary the cashier
     * can glance at any time without having to close the shift. Returns the
     * same numbers `close()` will use, so closing should never be a surprise.
     */
    public function summary(Request $request, int $id)
    {
        $shift = Shift::where('user_id', $request->user()?->id)->findOrFail($id);

        $cash = $this->expectedCashFor($shift);
        $openingCash = $cash['opening'];
        $cashIn = $cash['cash_in'];
        $cashOut = $cash['cash_out'];
        $cashSales = $cash['cash_sales'];
        $cashRefunds = -$cash['cash_refunds'];
        $expectedCash = $cash['expected'];

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
        $cashSales = $cash['cash_sales'] - $cash['cash_refunds'];
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
