<?php

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
        $pinHash = Hash::make('1234');

        $users = [
            ['name' => 'Owner', 'email' => 'owner@bakegrill.local', 'role' => 'owner'],
            ['name' => 'Admin', 'email' => 'admin@bakegrill.local', 'role' => 'admin'],
            ['name' => 'Manager', 'email' => 'manager@bakegrill.local', 'role' => 'manager'],
            ['name' => 'Cashier', 'email' => 'cashier@bakegrill.local', 'role' => 'cashier'],
        ];

        foreach ($users as $userData) {
            $role = Role::where('slug', $userData['role'])->first();

            User::firstOrCreate(
                ['email' => $userData['email']],
                [
                    'name' => $userData['name'],
                    'password' => Hash::make('password'),
                    'role_id' => $role?->id,
                    'pin_hash' => $pinHash,
                    'is_active' => true,
                ]
            );
        }
    }
}
