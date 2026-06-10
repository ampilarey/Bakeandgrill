<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\StaffUserLookup;
use Illuminate\Console\Command;

class ActivateStaffUserCommand extends Command
{
    protected $signature = 'staff:activate
        {login : Staff email or mobile number}
        {--force : Required in production when ALLOW_STAFF_CLI_CREATE is true}';

    protected $description = 'Re-enable a deactivated staff account so they can sign in.';

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

        $login = trim((string) $this->argument('login'));
        $user = StaffUserLookup::findByUsername($login);

        if ($user === null) {
            $this->error("No staff user found for: {$login}");
            $this->line('Run `php artisan staff:list` to see accounts on this server.');

            return 1;
        }

        if ($user->is_active) {
            $this->info("{$user->email} (id {$user->id}) is already active.");

            return 0;
        }

        $user->update(['is_active' => true]);
        $this->info("Activated {$user->email} (id {$user->id}). They can sign in now.");

        return 0;
    }
}
