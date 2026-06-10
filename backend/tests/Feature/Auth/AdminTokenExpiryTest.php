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

    public function test_phone_login_token_has_admin_ttl_expiry(): void
    {
        config(['sanctum.admin_token_ttl_hours' => 24]);

        $user = $this->createAdminUser();

        $response = $this->postJson('/api/auth/staff/login', [
            'phone' => '+9607771234',
            'password' => 'password123',
        ]);

        $response->assertOk()->assertJsonStructure(['token']);

        $accessToken = $user->tokens()->latest('id')->first();
        $this->assertNotNull($accessToken);
        $this->assertNotNull($accessToken->expires_at);
        $this->assertTrue(
            $accessToken->expires_at->between(now()->addHours(23), now()->addHours(25)),
            'Admin token should expire ~24 hours after issuance',
        );
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
