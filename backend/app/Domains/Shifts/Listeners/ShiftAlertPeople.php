<?php

declare(strict_types=1);

namespace App\Domains\Shifts\Listeners;

use App\Domains\Notifications\Support\AlertAudience;
use App\Domains\Notifications\Support\NotificationChannels;
use App\Models\User;
use Illuminate\Support\Collection;

/** The people a shift alert goes to, less the person who opened or closed it: they know. */
final class ShiftAlertPeople
{
    /**
     * @param Collection<int, string> $addresses
     * @return list<string>
     */
    public static function except(Collection $addresses, int $userId): array
    {
        $user = User::query()->find($userId);
        $mine = array_filter([
            $user && trim((string) $user->phone) !== '' ? AlertAudience::addressKey((string) $user->phone) : null,
            $user ? AlertAudience::addressKey(NotificationChannels::token($user)) : null,
        ]);

        return $addresses->map(fn ($a) => (string) $a)
            ->reject(fn (string $a) => in_array(AlertAudience::addressKey($a), $mine, true))
            ->values()->all();
    }
}
