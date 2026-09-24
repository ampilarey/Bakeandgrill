<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCashMovementRequest;
use App\Models\CashMovement;
use App\Models\Shift;
use App\Services\AuditLogService;
use App\Services\PermissionService;
use Illuminate\Http\Request;

class CashMovementController extends Controller
{
    public function store(StoreCashMovementRequest $request, $shiftId)
    {
        $shift = Shift::where('user_id', $request->user()?->id)->findOrFail($shiftId);

        if ($shift->closed_at) {
            return response()->json(['message' => 'Shift is closed.'], 422);
        }

        $validated = $request->validated();

        $movement = CashMovement::create([
            'shift_id' => $shift->id,
            'user_id' => $request->user()?->id,
            'type' => $validated['type'],
            'amount' => $validated['amount'],
            'reason' => $validated['reason'],
            'category' => $validated['category'] ?? null,
        ]);

        app(AuditLogService::class)->log(
            'cash_movement.created',
            'CashMovement',
            $movement->id,
            [],
            $movement->toArray(),
            ['shift_id' => $shift->id],
            $request,
        );

        return response()->json(['movement' => $movement], 201);
    }

    /**
     * POST /shifts/{shiftId}/cash-movements/{movementId}/void — strike a
     * movement through with a reason while the shift is open (ops audit,
     * 2026-09-25). Own shift, or any shift for staff who can see all history.
     */
    public function void(Request $request, $shiftId, $movementId)
    {
        $user = $request->user();
        $canAll = app(PermissionService::class)->hasPermission($user, 'shifts.view_all_history');
        $shiftQuery = Shift::query()->where('id', $shiftId);
        if (!$canAll) {
            $shiftQuery->where('user_id', $user?->id);
        }
        $shift = $shiftQuery->firstOrFail();
        if ($shift->closed_at) {
            return response()->json(['message' => 'Shift is closed; the count already includes this movement.'], 422);
        }
        $validated = $request->validate(['reason' => 'required|string|min:3|max:255']);
        $movement = CashMovement::where('shift_id', $shift->id)->findOrFail($movementId);
        if ($movement->voided_at) {
            return response()->json(['message' => 'Already voided.'], 422);
        }
        $movement->update(['voided_at' => now(), 'voided_by' => $user?->id, 'void_reason' => trim($validated['reason'])]);

        app(AuditLogService::class)->log(
            'cash_movement.voided',
            'CashMovement',
            $movement->id,
            ['voided_at' => null],
            ['voided_at' => $movement->voided_at, 'void_reason' => $movement->void_reason],
            ['shift_id' => $shift->id],
            $request,
        );

        return response()->json(['movement' => $movement->fresh()]);
    }
}
