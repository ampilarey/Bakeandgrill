<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DemoUserSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        if (app()->isProduction()) {
            $this->command->warn('DemoUserSeeder: skipped in production — would create trivial PINs.');
            return;
        }

        $users = [
            ['name' => 'Owner',   'email' => 'owner@bakegrill.local',   'role' => 'owner',   'pin' => '1111'],
            ['name' => 'Manager', 'email' => 'manager@bakegrill.local', 'role' => 'manager', 'pin' => '3333'],
            ['name' => 'Staff',   'email' => 'staff@bakegrill.local',   'role' => 'staff',   'pin' => '4444'],
        ];

        foreach ($users as $userData) {
            $role = Role::where('slug', $userData['role'])->first();

            User::updateOrCreate(
                ['email' => $userData['email']],
                [
                    'name'      => $userData['name'],
                    'password'  => Hash::make('password'),
                    'role_id'   => $role?->id,
                    'pin_hash'  => Hash::make($userData['pin']),
                    'is_active' => true,
                ],
            );
        }

        // Remove legacy demo users
        User::whereIn('email', ['admin@bakegrill.local', 'cashier@bakegrill.local'])->delete();
    }
}
