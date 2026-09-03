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
        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => 'Owner role', 'is_active' => true],
        );

        return User::create([
            'name' => 'Test User',
            'email' => $email,
            'password' => 'password',
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
    }

    public function test_staff_can_login_with_username_and_pin(): void
    {
        $this->createOwner();

        $response = $this->postJson('/api/auth/staff/pin-login', [
            'username' => 'owner@example.com',
            'pin' => '1234',
            'device_identifier' => 'POS-001',
        ]);

        $response->assertOk()
            ->assertJsonStructure([
                'token',
                'user' => ['id', 'name', 'email', 'role'],
            ]);
    }

    public function test_owner_can_login_with_normalized_phone_and_pin(): void
    {
        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => 'Owner role', 'is_active' => true],
        );

        User::create([
            'name' => 'Phone Owner',
            'email' => 'phone-owner@example.com',
            'phone' => '+9607820288',
            'password' => 'password',
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->postJson('/api/auth/staff/pin-login', [
            'username' => '7820288',
            'pin' => '1234',
            'device_identifier' => 'POS-001',
        ])->assertOk();
    }

    /**
     * Used to assert a "No PIN is set on this account" message. That was
     * genuinely helpful and also told anyone working through phone numbers
     * which accounts exist. The hint moved to Admin -> Staff, which shows
     * has_pin per member and is only visible to someone already signed in.
     */
    public function test_pin_login_without_pin_set_does_not_reveal_the_account_exists(): void
    {
        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => 'Owner role', 'is_active' => true],
        );

        User::create([
            'name' => 'No Pin Owner',
            'email' => 'nopin@example.com',
            'phone' => '7820999',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => null,
            'is_active' => true,
        ]);

        $response = $this->postJson('/api/auth/staff/pin-login', [
            'username' => '7820999',
            'pin' => '1234',
            'device_identifier' => 'POS-001',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['pin']);

        // Byte-identical to the message an unknown number gets.
        $this->assertSame('Invalid mobile/email or PIN.', (string) $response->json('errors.pin.0'));

        $unknown = $this->postJson('/api/auth/staff/pin-login', [
            'username' => '7820000',
            'pin' => '1234',
            'device_identifier' => 'POS-001',
        ]);
        $this->assertSame(
            (string) $unknown->json('errors.pin.0'),
            (string) $response->json('errors.pin.0'),
            'a real account and an unknown one must be indistinguishable',
        );
    }

    public function test_owner_can_pos_password_login_without_pin(): void
    {
        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => 'Owner role', 'is_active' => true],
        );

        User::create([
            'name' => 'Password Owner',
            'email' => 'pwd-owner@example.com',
            'phone' => '7820888',
            'password' => 'secret-pass',
            'role_id' => $role->id,
            'pin_hash' => null,
            'is_active' => true,
        ]);

        $this->postJson('/api/auth/staff/pos-password-login', [
            'username' => '7820888',
            'password' => 'secret-pass',
            'device_identifier' => 'POS-001',
        ])->assertOk()
            ->assertJsonStructure(['token', 'user' => ['permissions']]);
    }

    public function test_admin_phone_login_accepts_email_in_phone_field(): void
    {
        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => 'Owner role', 'is_active' => true],
        );

        User::create([
            'name' => 'Email Owner',
            'email' => 'owner-login@example.com',
            'phone' => '7820666',
            'password' => 'password',
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->postJson('/api/auth/staff/login', [
            'phone' => 'owner-login@example.com',
            'password' => 'password',
        ])->assertOk();
    }

    public function test_admin_pin_login_with_intent_admin(): void
    {
        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => 'Owner role', 'is_active' => true],
        );

        User::create([
            'name' => 'Pin Admin',
            'email' => 'pin-admin@example.com',
            'password' => 'password',
            'role_id' => $role->id,
            'pin_hash' => Hash::make('4321'),
            'is_active' => true,
        ]);

        $this->postJson('/api/auth/staff/pin-login', [
            'username' => 'pin-admin@example.com',
            'pin' => '4321',
            'intent' => 'admin',
        ])->assertOk()
            ->assertJsonStructure(['user' => ['permissions']])
            ->assertJsonMissingPath('token');
    }

    public function test_admin_phone_login_accepts_local_phone_format(): void
    {
        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => 'Owner role', 'is_active' => true],
        );

        User::create([
            'name' => 'Admin Phone Owner',
            'email' => 'admin-phone@example.com',
            'phone' => '+9607820777',
            'password' => 'password',
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->postJson('/api/auth/staff/login', [
            'phone' => '7820777',
            'password' => 'password',
        ])->assertOk();
    }

    public function test_login_without_username_returns_422(): void
    {
        $this->createOwner();

        $response = $this->postJson('/api/auth/staff/pin-login', [
            'pin' => '1234',
            'device_identifier' => 'POS-001',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['username']);
    }

    public function test_login_with_wrong_pin_returns_422(): void
    {
        $this->createOwner();

        $response = $this->postJson('/api/auth/staff/pin-login', [
            'username' => 'owner@example.com',
            'pin' => '9999',
            'device_identifier' => 'POS-001',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['pin']);
    }

    public function test_login_with_unknown_email_returns_422(): void
    {
        $response = $this->postJson('/api/auth/staff/pin-login', [
            'username' => 'nobody@example.com',
            'pin' => '1234',
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
            'name' => 'Inactive',
            'email' => 'inactive@example.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => false,
        ]);

        $response = $this->postJson('/api/auth/staff/pin-login', [
            'username' => 'inactive@example.com',
            'pin' => '1234',
            'device_identifier' => 'POS-001',
        ]);

        $response->assertStatus(422);
    }

    public function test_staff_can_update_own_pos_idle_lock_preference(): void
    {
        $owner = $this->createOwner();

        $login = $this->postJson('/api/auth/staff/pin-login', [
            'username' => 'owner@example.com',
            'pin' => '1234',
            'device_identifier' => 'POS-001',
        ]);

        $token = $login->json('token');

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->patchJson('/api/auth/me/preferences', [
                'pos_idle_lock_minutes' => 15,
            ]);

        $response->assertOk()
            ->assertJsonPath('user.pos_idle_lock_minutes', 15)
            ->assertJsonPath('user.pos_idle_lock_minutes_resolved', 15);

        $this->assertDatabaseHas('users', [
            'id' => $owner->id,
            'pos_idle_lock_minutes' => 15,
        ]);
    }

    /** Owner, 2026-09-02: a left-hand option for the till, saved per cashier. */
    public function test_staff_can_put_the_ticket_on_the_left_and_it_follows_them(): void
    {
        $owner = $this->createOwner();
        $login = $this->postJson('/api/auth/staff/pin-login', [
            'username' => 'owner@example.com',
            'pin' => '1234',
            'device_identifier' => 'POS-001',
        ]);
        $token = $login->json('token');

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->patchJson('/api/auth/me/preferences', ['pos_cart_side' => 'left'])
            ->assertOk()
            ->assertJsonPath('user.pos_cart_side', 'left');
        $this->assertDatabaseHas('users', ['id' => $owner->id, 'pos_cart_side' => 'left']);

        // One preference at a time: saving the lock minutes leaves the side alone.
        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->patchJson('/api/auth/me/preferences', ['pos_idle_lock_minutes' => 10])
            ->assertOk()
            ->assertJsonPath('user.pos_cart_side', 'left');

        // Right is the default and is stored as nothing at all.
        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->patchJson('/api/auth/me/preferences', ['pos_cart_side' => 'right'])
            ->assertOk()
            ->assertJsonPath('user.pos_cart_side', 'right');
        $this->assertDatabaseHas('users', ['id' => $owner->id, 'pos_cart_side' => null]);

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->patchJson('/api/auth/me/preferences', ['pos_cart_side' => 'middle'])
            ->assertStatus(422);
        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->patchJson('/api/auth/me/preferences', [])
            ->assertStatus(422);
    }

    public function test_me_includes_pos_idle_lock_preference(): void
    {
        $owner = $this->createOwner();
        $owner->update(['pos_idle_lock_minutes' => 0]);

        $login = $this->postJson('/api/auth/staff/pin-login', [
            'username' => 'owner@example.com',
            'pin' => '1234',
            'device_identifier' => 'POS-001',
        ]);

        $token = $login->json('token');

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('user.pos_idle_lock_minutes', 0)
            ->assertJsonPath('user.pos_idle_lock_minutes_resolved', 0);
    }
}
