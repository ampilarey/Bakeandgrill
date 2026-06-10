<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\StaffUserLookup;
use Illuminate\Console\Command;

/**
 * Recover admin dashboard login when the owner password is unknown.
 */
class SetStaffPasswordCommand extends Command
{
    protected $signature = 'staff:set-password
        {login : Staff email or mobile number}
        {password : New admin password (min 8 chars)}
        {--force : Required in production when ALLOW_STAFF_CLI_CREATE is true}';

    protected $description = 'Set or reset a staff member admin password (mobile/email + password login).';

    public function handle(): int
    {
        if (app()->isProduction()) {
            if (!filter_var(env('ALLOW_STAFF_CLI_CREATE', false), FILTER_VALIDATE_BOOLEAN)) {
                $this->error('Refused in production. Set ALLOW_STAFF_CLI_CREATE=true in .env for a deliberate one-shot, then remove it.');

                return 1;
            }
            if (!$this->option('force')) {
                $this->error('Refused in production without --force.');

                return 1;
            }
        }

        $password = (string) $this->argument('password');
        if (strlen($password) < 8) {
            $this->error('Password must be at least 8 characters.');

            return 1;
        }

        $login = trim((string) $this->argument('login'));
        $user = StaffUserLookup::findActiveByUsername($login);

        if ($user === null) {
            $this->error("No active staff user found for: {$login}");

            return 1;
        }

        $user->update(['password' => $password]);
        $user->tokens()->where('name', 'like', 'staff-%')->delete();

        $this->info("Password updated for {$user->email} (id {$user->id}). Old sessions revoked.");

        return 0;
    }
}
