<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Role;
use Illuminate\Database\Seeder;

class RoleSeeder extends Seeder
{
    /**
     * Seed the three consolidated roles: owner, manager, staff.
     * admin and cashier have been consolidated (see consolidate_user_roles migration).
     */
    public function run(): void
    {
        $roles = [
            ['name' => 'Owner',   'slug' => 'owner',   'description' => 'Full access to all features and settings'],
            ['name' => 'Manager', 'slug' => 'manager', 'description' => 'Day-to-day management of operations and staff'],
            ['name' => 'Staff',   'slug' => 'staff',   'description' => 'Front-line staff member with limited access'],
        ];

        foreach ($roles as $role) {
            Role::updateOrCreate(
                ['slug' => $role['slug']],
                ['name' => $role['name'], 'description' => $role['description'], 'is_active' => true],
            );
        }

        // Remove legacy roles that no longer exist
        Role::whereIn('slug', ['admin', 'cashier'])->delete();
    }
}
