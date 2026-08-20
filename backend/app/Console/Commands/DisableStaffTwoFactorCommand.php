<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\User;
use App\Services\StaffUserLookup;
use App\Services\TwoFactorService;
use Illuminate\Console\Command;

/**
 * The break-glass path: clear a staff account's second factor from the shell.
 *
 * Every other way back in needs a working sign-in somewhere. If the only owner
 * enrols 2FA, loses the phone, and never printed the recovery codes, there is
 * no one left to click the button in Admin -> Staff — the venue would be shut
 * out of its own admin panel with no way back short of editing the database by
 * hand. This is that way back, and it deliberately needs nothing but server
 * access, which is already the highest privilege anyone here holds.
 *
 *   php artisan staff:2fa-disable 7820288
 *
 * Anyone who can run this could already read the database, so it grants no new
 * power — it just makes the recovery a supported operation instead of an
 * improvised UPDATE at 2am.
 */
class DisableStaffTwoFactorCommand extends Command
{
    protected $signature = 'staff:2fa-disable
        {username : Phone or email of the staff account}
        {--force : Skip the confirmation prompt}';

    protected $description = "Clear a staff account's two-factor authentication (lost phone recovery)";

    public function handle(TwoFactorService $twoFactor): int
    {
        $username = (string) $this->argument('username');

        // Deliberately not restricted to active accounts: a deactivated one
        // still needs clearing before it can be handed back.
        $user = StaffUserLookup::findActiveByUsername($username)
            ?? $this->findAnyByUsername($username);

        if (!$user) {
            $this->error("No staff account found for {$username}.");

            return 1;
        }

        if (!$user->hasTwoFactorEnabled() && $user->two_factor_secret === null) {
            $this->info("{$user->name} does not have two-factor set up. Nothing to do.");

            return 0;
        }

        $this->line("Account: {$user->name} <{$user->email}> (id {$user->id})");

        if (!$this->option('force') && !$this->confirm('Clear two-factor on this account?', false)) {
            $this->info('Left alone.');

            return 0;
        }

        $twoFactor->disable($user, null, null);
        // The phone may be in someone else's hands; drop its sessions too.
        $revoked = $user->tokens()->count();
        $user->tokens()->delete();

        $this->info("Two-factor cleared for {$user->name}. {$revoked} device token(s) revoked.");
        $this->line('They can sign in with their password, then set up a new phone from My Account.');

        return 0;
    }

    private function findAnyByUsername(string $raw): ?User
    {
        $raw = trim($raw);

        return User::query()
            ->where('email', strtolower($raw))
            ->orWhere('phone', $raw)
            ->first();
    }
}
