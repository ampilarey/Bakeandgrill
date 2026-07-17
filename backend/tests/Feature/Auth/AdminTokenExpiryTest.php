<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class AdminTokenExpiryTest extends TestCase
{
    use RefreshDatabase;

    private function createAdminUser(): User
    {
        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => 'Owner role', 'is_active' => true],
        );

        return User::create([
            'name' => 'Admin User',
            'email' => 'admin@example.com',
            'phone' => '+9607771234',
            'password' => Hash::make('password123'),
            'role_id' => $role->id,
            'is_active' => true,
        ]);
    }

    public function test_phone_login_establishes_web_session_without_pat(): void
    {
        $user = $this->createAdminUser();

        $response = $this->postJson('/api/auth/staff/login', [
            'phone' => '+9607771234',
            'password' => 'password123',
        ]);

        $response->assertOk()
            ->assertJsonStructure(['user' => ['id', 'name', 'role']])
            ->assertJsonMissingPath('token');

        $this->assertAuthenticatedAs($user, 'web');
        $this->assertSame(0, $user->tokens()->count());

        $this->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('user.id', $user->id);
    }

    public function test_admin_pin_login_establishes_web_session(): void
    {
        $user = $this->createAdminUser();
        $user->update(['pin_hash' => Hash::make('4321')]);

        $this->postJson('/api/auth/staff/pin-login', [
            'username' => 'admin@example.com',
            'pin' => '4321',
            'intent' => 'admin',
        ])->assertOk()
            ->assertJsonMissingPath('token');

        $this->assertAuthenticatedAs($user, 'web');

        $this->getJson('/api/auth/me')->assertOk();
    }

    public function test_admin_logout_clears_web_guard(): void
    {
        $user = $this->createAdminUser();
        $this->actingAs($user, 'web');

        $this->postJson('/api/auth/logout')
            ->assertOk()
            ->assertJson(['message' => 'Logged out']);

        $this->assertGuest('web');
    }

    public function test_expired_staff_token_returns_401_on_protected_route(): void
    {
        $user = $this->createAdminUser();

        $issued = $user->createToken(
            'staff-' . $user->id,
            ['staff'],
            now()->subMinute(),
        );

        $plain = $issued->plainTextToken;

        $this->getJson('/api/auth/me', [
            'Authorization' => 'Bearer ' . $plain,
        ])->assertUnauthorized();

        $this->assertNotNull(PersonalAccessToken::findToken($plain));
    }
}
