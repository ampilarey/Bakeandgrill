<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Ends every sign-in a staff account has, on every device (staff audit,
 * 2026-10-01).
 *
 * Revoking the account's tokens only signs out tills and kitchen screens.
 * The admin panel signs in with a session cookie and a 30-day remember
 * cookie, and neither one is a token. So a PIN reset, a cleared second
 * factor, a password reset or "sign out on all devices" left every admin
 * browser signed in, including the one on a lost phone. This removes the
 * stored sessions and changes the remember token, so those cookies stop
 * working on their next request.
 */
final class StaffSessions
{
    /** @return int how many tokens were revoked */
    public function endAll(User $user): int
    {
        $revoked = $user->tokens()->count();
        $user->tokens()->delete();

        $table = (string) config('session.table', 'sessions');
        if (Schema::hasTable($table)) {
            DB::table($table)->where('user_id', $user->id)->delete();
        }

        $user->forceFill(['remember_token' => Str::random(60)])->saveQuietly();

        return $revoked;
    }
}
