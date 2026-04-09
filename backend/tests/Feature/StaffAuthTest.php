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

    private function createOwner(string $email = 'owner@example.com'): User
    {
        $role = Role::create([
            'name'        => 'Owner',
            'slug'        => 'owner',
            'description' => 'Owner role',
            'is_active'   => true,
        ]);

        return User::create([
            'name'      => 'Test User',
            'email'     => $email,
            'password'  => Hash::make('password'),
            'role_id'   => $role->id,
            'pin_hash'  => Hash::make('1234'),
            'is_active' => true,
        ]);
    }

    public function test_staff_can_login_with_username_and_pin(): void
    {
        $this->createOwner();

        $response = $this->postJson('/api/auth/staff/pin-login', [
            'username'          => 'owner@example.com',
            'pin'               => '1234',
            'device_identifier' => 'POS-001',
        ]);

        $response->assertOk()
            ->assertJsonStructure([
                'token',
                'user' => ['id', 'name', 'email', 'role'],
            ]);
    }

    public function test_login_without_username_returns_422(): void
    {
        $this->createOwner();

        $response = $this->postJson('/api/auth/staff/pin-login', [
            'pin'               => '1234',
            'device_identifier' => 'POS-001',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['username']);
    }

    public function test_login_with_wrong_pin_returns_422(): void
    {
        $this->createOwner();

        $response = $this->postJson('/api/auth/staff/pin-login', [
            'username'          => 'owner@example.com',
            'pin'               => '9999',
            'device_identifier' => 'POS-001',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['pin']);
    }

    public function test_login_with_unknown_email_returns_422(): void
    {
        $response = $this->postJson('/api/auth/staff/pin-login', [
            'username'          => 'nobody@example.com',
            'pin'               => '1234',
            'device_identifier' => 'POS-001',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['pin']);
    }

    public function test_inactive_user_cannot_login(): void
    {
        $role = Role::firstOrCreate(
            ['slug' => 'staff'],
            ['name' => 'Staff', 'description' => '', 'is_active' => true],
        );

        User::create([
            'name'      => 'Inactive',
            'email'     => 'inactive@example.com',
            'password'  => Hash::make('password'),
            'role_id'   => $role->id,
            'pin_hash'  => Hash::make('1234'),
            'is_active' => false,
        ]);

        $response = $this->postJson('/api/auth/staff/pin-login', [
            'username'          => 'inactive@example.com',
            'pin'               => '1234',
            'device_identifier' => 'POS-001',
        ]);

        $response->assertStatus(422);
    }
}
