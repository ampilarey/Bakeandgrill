<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;

class ListStaffUsersCommand extends Command
{
    protected $signature = 'staff:list {--role= : Filter by role slug (owner, manager, staff)}';

    protected $description = 'List staff accounts (id, email, phone, role) for login troubleshooting.';

    public function handle(): int
    {
        $query = User::query()->with('role')->orderBy('id');

        if ($role = $this->option('role')) {
            $query->whereHas('role', fn ($q) => $q->where('slug', $role));
        }

        $users = $query->get();

        if ($users->isEmpty()) {
            $this->warn('No staff users found.');

            return 0;
        }

        $this->table(
            ['ID', 'Name', 'Email', 'Phone', 'Role', 'Active', 'Has PIN', 'Has password'],
            $users->map(fn (User $u) => [
                $u->id,
                $u->name,
                $u->email,
                $u->phone ?? '—',
                $u->role?->slug ?? '—',
                $u->is_active ? 'yes' : 'no',
                $u->pin_hash ? 'yes' : 'no',
                ($u->getAuthPassword() !== null && $u->getAuthPassword() !== '') ? 'yes' : 'no',
            ]),
        );

        return 0;
    }
}
