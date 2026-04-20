<?php

declare(strict_types=1);

namespace App\Domains\Sms\Services;

use App\Models\StaffSchedule;
use App\Models\User;
use Carbon\Carbon;

class StaffScheduleResolver
{
    /**
     * Return true if the given staff member has a confirmed shift that covers $at.
     */
    public function isOnShift(User $user, Carbon $at): bool
    {
        return StaffSchedule::query()
            ->where('user_id', $user->id)
            ->where('date', $at->toDateString())
            ->where('shift_start', '<=', $at->format('H:i'))
            ->where('shift_end', '>=', $at->format('H:i'))
            ->exists();
    }

    /**
     * Return all staff members who have a confirmed shift covering $at.
     */
    public function staffOnShiftAt(Carbon $at): \Illuminate\Database\Eloquent\Collection
    {
        $schedules = StaffSchedule::query()
            ->where('date', $at->toDateString())
            ->where('shift_start', '<=', $at->format('H:i'))
            ->where('shift_end', '>=', $at->format('H:i'))
            ->with('user')
            ->get();

        return $schedules->pluck('user')->filter()->unique('id')->values();
    }
}
