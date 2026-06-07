<?php

declare(strict_types=1);

namespace App\Domains\Shifts\Services;

use App\Models\Shift;
use App\Models\User;

class ShiftAccessService
{
    public function findOpenShift(User $user): ?Shift
    {
        return Shift::query()
            ->where('user_id', $user->id)
            ->whereNull('closed_at')
            ->latest('opened_at')
            ->first();
    }

    /**
     * @throws \Symfony\Component\HttpKernel\Exception\HttpException 422 when no open shift
     */
    public function requireOpenShift(User $user, string $message = 'Open a shift before continuing.'): Shift
    {
        $shift = $this->findOpenShift($user);
        if ($shift === null) {
            abort(422, $message);
        }

        return $shift;
    }
}
