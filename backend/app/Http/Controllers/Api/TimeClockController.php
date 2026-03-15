<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TimePunch;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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

        $open = TimePunch::where('user_id', $userId)
            ->whereNull('clocked_out_at')
            ->first();

        if ($open) {
            return response()->json(['message' => 'Already clocked in.'], 422);
        }

        $punch = TimePunch::create([
            'user_id'       => $userId,
            'clocked_in_at' => now(),
            'notes'         => $request->input('notes'),
        ]);

        return response()->json(['punch' => $punch], 201);
    }

    public function clockOut(Request $request): JsonResponse
    {
        $userId = $request->user()->id;

        $punch = TimePunch::where('user_id', $userId)
            ->whereNull('clocked_out_at')
            ->latest('clocked_in_at')
            ->first();

        if (!$punch) {
            return response()->json(['message' => 'Not clocked in.'], 422);
        }

        $breakMinutes = (float) ($request->input('break_minutes', 0));

        $punch->clocked_out_at = now();
        $punch->break_minutes  = $breakMinutes;
        $punch->total_hours    = $punch->calculateHours();
        $punch->save();

        return response()->json(['punch' => $punch]);
    }

    public function history(Request $request): JsonResponse
    {
        $from = $request->query('from');
        $to   = $request->query('to');

        $query = TimePunch::with('user:id,name')
            ->whereNotNull('clocked_out_at')
            ->orderByDesc('clocked_in_at');

        if ($from) $query->whereDate('clocked_in_at', '>=', $from);
        if ($to)   $query->whereDate('clocked_in_at', '<=', $to);

        // Non-manager users see only their own records
        $user = $request->user();
        $user->loadMissing('role');
        $roleSlug = $user->role?->slug;

        if (!in_array($roleSlug, ['manager', 'owner'], true)) {
            $query->where('user_id', $user->id);
        }

        $punches = $query->paginate(50);

        $totalHours = $punches->sum('total_hours');

        return response()->json([
            'data'        => $punches->items(),
            'meta'        => ['current_page' => $punches->currentPage(), 'last_page' => $punches->lastPage(), 'total' => $punches->total()],
            'total_hours' => round($totalHours, 2),
        ]);
    }

    public function summary(Request $request): JsonResponse
    {
        $from = $request->query('from', now()->startOfWeek()->toDateString());
        $to   = $request->query('to', now()->toDateString());

        $punches = TimePunch::with('user:id,name')
            ->whereNotNull('clocked_out_at')
            ->whereBetween('clocked_in_at', [$from . ' 00:00:00', $to . ' 23:59:59'])
            ->get();

        $summary = $punches->groupBy('user_id')->map(function ($userPunches) {
            $user = $userPunches->first()->user;
            return [
                'user_id'       => $user?->id,
                'user_name'     => $user?->name ?? 'Unknown',
                'punch_count'   => $userPunches->count(),
                'total_hours'   => round($userPunches->sum('total_hours'), 2),
            ];
        })->values();

        return response()->json([
            'from'    => $from,
            'to'      => $to,
            'summary' => $summary,
        ]);
    }
}
