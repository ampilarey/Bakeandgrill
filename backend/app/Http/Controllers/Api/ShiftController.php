<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\CloseShiftRequest;
use App\Http\Requests\OpenShiftRequest;
use App\Models\CashMovement;
use App\Models\Payment;
use App\Models\Shift;
use App\Services\AuditLogService;
use Illuminate\Http\Request;

class ShiftController extends Controller
{
    public function current(Request $request)
    {
        $shift = Shift::where('user_id', $request->user()?->id)
            ->whereNull('closed_at')
            ->latest('opened_at')
            ->first();

        return response()->json(['shift' => $shift]);
    }

    public function open(OpenShiftRequest $request)
    {
        $userId = $request->user()?->id;
        $existing = Shift::where('user_id', $userId)
            ->whereNull('closed_at')
            ->first();

        if ($existing) {
            return response()->json(['message' => 'Shift already open.'], 422);
        }

        $shift = Shift::create([
            'user_id' => $userId,
            'device_id' => $request->input('device_id'),
            'opened_at' => now(),
            'opening_cash' => $request->input('opening_cash'),
            'notes' => $request->input('notes'),
        ]);

        app(AuditLogService::class)->log(
            'shift.opened',
            'Shift',
            $shift->id,
            [],
            $shift->toArray(),
            [],
            $request,
        );

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
            ->where('type', 'cash_in')
            ->sum('amount');
        $cashOut = CashMovement::where('shift_id', $shift->id)
            ->where('type', 'cash_out')
            ->sum('amount');

        $cashSales = Payment::where('method', 'cash')
            ->whereHas('order', function ($query) use ($shift) {
                $query->where('user_id', $shift->user_id);
            })
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

        return response()->json([
            'shift' => $shift,
            'cash_sales' => $cashSales,
            'cash_in' => $cashIn,
            'cash_out' => $cashOut,
        ]);
    }
}
