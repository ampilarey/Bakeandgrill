<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TimePunch;
use App\Services\AuditLogService;
use App\Services\PermissionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TimeClockController extends Controller
{
    public function status(Request $request): JsonResponse
    {
        $punch = TimePunch::where('user_id', $request->user()->id)
            ->whereNull('clocked_out_at')
            ->latest('clocked_in_at')
            ->first();

        return response()->json(['punch' => $punch]);
    }

    public function clockIn(Request $request): JsonResponse
    {
        $userId = $request->user()->id;
        $validated = $request->validate([
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        // Wrap the open-punch check + insert in a transaction with a
        // row lock on every open punch for this user. Without this, two
        // concurrent /clock-in requests (cashier double-tapping; iPad
        // retry on flaky wifi) could both pass the "is there an open
        // punch?" check and both insert — leaving the user with two
        // simultaneous open punches and a payroll report that
        // double-counts their hours.
        $punch = DB::transaction(function () use ($userId, $validated) {
            $existing = TimePunch::where('user_id', $userId)
                ->whereNull('clocked_out_at')
                ->lockForUpdate()
                ->first();

            if ($existing) {
                return null;
            }

            return TimePunch::create([
                'user_id' => $userId,
                'clocked_in_at' => now(),
                'notes' => $validated['notes'] ?? null,
            ]);
        });

        if ($punch === null) {
            return response()->json(['message' => 'Already clocked in.'], 422);
        }

        // Audit punches so payroll disputes / labour-law inquiries have
        // a tamper-evident record outside the time_punches table itself.
        app(AuditLogService::class)->log(
            'time_punch.clock_in',
            'TimePunch',
            $punch->id,
            [],
            ['clocked_in_at' => $punch->clocked_in_at],
            ['user_id' => $userId],
            $request,
        );

        return response()->json(['punch' => $punch], 201);
    }

    public function clockOut(Request $request): JsonResponse
    {
        $userId = $request->user()->id;

        $clockOutValidated = $request->validate([
            'break_minutes' => ['nullable', 'numeric', 'min:0', 'max:1440'],
        ]);

        $breakMinutes = (float) ($clockOutValidated['break_minutes'] ?? 0);

        // Same transactional treatment as clockIn — close + sum in one
        // locked window so the punch can't be double-closed.
        $punch = DB::transaction(function () use ($userId, $breakMinutes) {
            $row = TimePunch::where('user_id', $userId)
                ->whereNull('clocked_out_at')
                ->latest('clocked_in_at')
                ->lockForUpdate()
                ->first();

            if (!$row) {
                return null;
            }

            $row->clocked_out_at = now();
            $row->break_minutes = $breakMinutes;
            $row->total_hours = $row->calculateHours();
            $row->save();

            return $row;
        });

        if ($punch === null) {
            return response()->json(['message' => 'Not clocked in.'], 422);
        }

        app(AuditLogService::class)->log(
            'time_punch.clock_out',
            'TimePunch',
            $punch->id,
            [],
            [
                'clocked_out_at' => $punch->clocked_out_at,
                'break_minutes' => $punch->break_minutes,
                'total_hours' => $punch->total_hours,
            ],
            ['user_id' => $userId],
            $request,
        );

        return response()->json(['punch' => $punch]);
    }

    public function history(Request $request): JsonResponse
    {
        $from = $request->query('from');
        $to = $request->query('to');

        $query = TimePunch::with('user:id,name')
            ->whereNotNull('clocked_out_at')
            ->orderByDesc('clocked_in_at');

        if ($from) {
            $query->whereDate('clocked_in_at', '>=', $from);
        }
        if ($to) {
            $query->whereDate('clocked_in_at', '<=', $to);
        }

        // Oversight (staff.view): all punches. Cashiers (pos.time_clock only): own records.
        $user = $request->user();
        $canViewAll = app(PermissionService::class)->hasPermission($user, 'staff.view');

        if (!$canViewAll) {
            $query->where('user_id', $user->id);
        }

        $punches = $query->paginate(50);

        $totalHours = $punches->sum('total_hours');

        return response()->json([
            'data' => $punches->items(),
            'meta' => ['current_page' => $punches->currentPage(), 'last_page' => $punches->lastPage(), 'total' => $punches->total()],
            'total_hours' => round($totalHours, 2),
        ]);
    }

    public function summary(Request $request): JsonResponse
    {
        // All-staff summary requires staff.view (route middleware also enforces this).
        $user = $request->user();
        abort_unless(app(PermissionService::class)->hasPermission($user, 'staff.view'), 403);

        $from = $request->query('from', now()->startOfWeek()->toDateString());
        $to = $request->query('to', now()->toDateString());

        $punches = TimePunch::with('user:id,name')
            ->whereNotNull('clocked_out_at')
            ->whereBetween('clocked_in_at', [$from . ' 00:00:00', $to . ' 23:59:59'])
            ->get();

        $summary = $punches->groupBy('user_id')->map(function ($userPunches) {
            $user = $userPunches->first()->user;

            return [
                'user_id' => $user?->id,
                'user_name' => $user?->name ?? 'Unknown',
                'punch_count' => $userPunches->count(),
                'total_hours' => round($userPunches->sum('total_hours'), 2),
            ];
        })->values();

        return response()->json([
            'from' => $from,
            'to' => $to,
            'summary' => $summary,
        ]);
    }
}
