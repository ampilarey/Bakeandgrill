<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCashMovementRequest;
use App\Models\CashMovement;
use App\Models\Shift;
use App\Services\AuditLogService;
use Illuminate\Http\Request;

class CashMovementController extends Controller
{
    public function store(StoreCashMovementRequest $request, $shiftId)
    {
        $shift = Shift::where('user_id', $request->user()?->id)->findOrFail($shiftId);

        if ($shift->closed_at) {
            return response()->json(['message' => 'Shift is closed.'], 422);
        }

        $movement = CashMovement::create([
            'shift_id' => $shift->id,
            'user_id' => $request->user()?->id,
            'type' => $request->input('type'),
            'amount' => $request->input('amount'),
            'reason' => $request->input('reason'),
        ]);

        app(AuditLogService::class)->log(
            'cash_movement.created',
            'CashMovement',
            $movement->id,
            [],
            $movement->toArray(),
            ['shift_id' => $shift->id],
            $request
        );

        return response()->json(['movement' => $movement], 201);
    }
}
