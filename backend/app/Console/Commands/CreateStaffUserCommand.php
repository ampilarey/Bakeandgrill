<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Role;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Bootstrap or recover staff login (admin dashboard + POS share /api/auth/staff/pin-login).
 *
 * Production: set ALLOW_STAFF_CLI_CREATE=true and pass --force (one-shot UAT / recovery only).
 */
class CreateStaffUserCommand extends Command
{
    protected $signature = 'staff:create
        {email : Staff email used at PIN login}
        {pin : 4–8 digit PIN}
        {--role=owner : Role slug: owner, manager, staff}
        {--name= : Display name (default: local part of email)}
        {--force : Required in production when ALLOW_STAFF_CLI_CREATE is true}';

    protected $description = 'Create or update a staff user for PIN login (Admin + POS).';

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

        $email = strtolower(trim($this->argument('email')));
        $pin = (string) $this->argument('pin');
        $roleSlug = strtolower((string) $this->option('role'));
        $name = $this->option('name') ?: Str::title(str_replace(['.', '_', '-'], ' ', Str::before($email, '@')));

        if (strlen($pin) < 4 || strlen($pin) > 8 || !ctype_digit($pin)) {
            $this->error('PIN must be 4–8 digits.');

            return 1;
        }

        $role = Role::where('slug', $roleSlug)->first();
        if ($role === null) {
            $this->error("Unknown role slug: {$roleSlug}. Use owner, manager, or staff.");

            return 1;
        }

        User::updateOrCreate(
            ['email' => $email],
            [
                'name' => $name,
                'password' => Hash::make(Str::password(24)),
                'role_id' => $role->id,
                'pin_hash' => Hash::make($pin),
                'is_active' => true,
            ],
        );

        $this->info("Staff user saved: {$email} (role: {$roleSlug}). Use this email + PIN in Admin and POS.");

        return 0;
    }
}
