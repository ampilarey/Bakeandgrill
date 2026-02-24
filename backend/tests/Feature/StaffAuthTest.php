<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class StaffAuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_staff_can_login_with_pin(): void
    {
        $role = Role::create([
            'name' => 'Owner',
            'slug' => 'owner',
            'description' => 'Owner role',
            'is_active' => true,
        ]);

        User::create([
            'name' => 'Test User',
            'email' => 'owner@example.com',
            'password' => 'password',
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $response = $this->postJson('/api/auth/staff/pin-login', [
            'pin' => '1234',
            'device_identifier' => 'POS-001',
        ]);

        $response->assertOk()
            ->assertJsonStructure([
                'token',
                'user' => ['id', 'name', 'email', 'role'],
            ]);
    }
}
