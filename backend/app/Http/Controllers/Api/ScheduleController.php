<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\StaffSchedule;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class ScheduleController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $date  = $request->query('date', today()->toDateString());
        $week  = $request->query('week');

        $query = StaffSchedule::with('user:id,name,email')
            ->orderBy('shift_start');

        if ($week) {
            $start = \Carbon\Carbon::parse($week)->startOfWeek();
            $end   = $start->copy()->endOfWeek();
            $query->whereBetween('date', [$start->toDateString(), $end->toDateString()]);
        } else {
            $query->where('date', $date);
        }

        return response()->json(['schedules' => $query->get()->map(fn($s) => $this->format($s))]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id'       => ['required', 'integer', 'exists:users,id'],
            'date'          => ['required', 'date'],
            'shift_start'   => ['required', 'date_format:H:i'],
            'shift_end'     => ['required', 'date_format:H:i', 'after:shift_start'],
            'role_override' => ['nullable', 'string', 'max:60'],
            'notes'         => ['nullable', 'string', 'max:500'],
            'is_confirmed'  => ['sometimes', 'boolean'],
        ]);

        $schedule = StaffSchedule::updateOrCreate(
            ['user_id' => $validated['user_id'], 'date' => $validated['date']],
            $validated,
        );

        return response()->json(['schedule' => $this->format($schedule->load('user'))], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $schedule  = StaffSchedule::findOrFail($id);
        $validated = $request->validate([
            'shift_start'   => ['sometimes', 'date_format:H:i'],
            'shift_end'     => ['sometimes', 'date_format:H:i'],
            'role_override' => ['nullable', 'string', 'max:60'],
            'notes'         => ['nullable', 'string', 'max:500'],
            'is_confirmed'  => ['sometimes', 'boolean'],
        ]);
        $schedule->update($validated);

        return response()->json(['schedule' => $this->format($schedule->fresh()->load('user'))]);
    }

    public function destroy(int $id): JsonResponse
    {
        StaffSchedule::findOrFail($id)->delete();

        return response()->json(['message' => 'Deleted.']);
    }

    private function format(StaffSchedule $s): array
    {
        return [
            'id'            => $s->id,
            'user_id'       => $s->user_id,
            'user_name'     => $s->user?->name,
            'date'          => $s->date->toDateString(),
            'shift_start'   => $s->shift_start,
            'shift_end'     => $s->shift_end,
            'role_override' => $s->role_override,
            'notes'         => $s->notes,
            'is_confirmed'  => $s->is_confirmed,
        ];
    }
}
