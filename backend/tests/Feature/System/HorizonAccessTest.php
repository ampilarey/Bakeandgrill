<?php

declare(strict_types=1);

namespace Tests\Feature\System;

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class HorizonAccessTest extends TestCase
{
    use RefreshDatabase;

    private function makeHorizonUser(string $roleSlug): User
    {
        $role = Role::firstOrCreate(
            ['slug' => $roleSlug],
            ['name' => ucfirst($roleSlug), 'description' => '', 'is_active' => true],
        );

        return User::create([
            'name' => "Test {$roleSlug}",
            'email' => "{$roleSlug}-horizon@test.com",
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
    }

    public function test_view_horizon_gate_allows_owner(): void
    {
        $owner = $this->makeHorizonUser('owner');

        $this->assertTrue(Gate::forUser($owner)->allows('viewHorizon'));
    }

    public function test_view_horizon_gate_denies_manager_without_website_manage(): void
    {
        $manager = $this->makeHorizonUser('manager');

        $this->assertFalse(Gate::forUser($manager)->allows('viewHorizon'));
    }
}
