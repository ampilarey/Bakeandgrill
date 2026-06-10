<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Customer;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Customer session cookies must not shadow a valid staff bearer token on staff routes.
 */
class SessionShadowingTest extends TestCase
{
    use RefreshDatabase;

    private User $staffUser;

    private string $staffToken;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => 'Owner', 'is_active' => true],
        );

        $this->staffUser = User::create([
            'name' => 'Shadow Staff',
            'email' => 'shadow-staff@test.local',
            'phone' => '+9607771234',
            'password' => Hash::make('password123'),
            'role_id' => $role->id,
            'is_active' => true,
        ]);

        $this->staffToken = $this->staffUser
            ->createToken('staff-' . $this->staffUser->id, ['staff'])
            ->plainTextToken;

        $this->customer = Customer::create([
            'phone' => '+9607003001',
            'name' => 'Ordering Customer',
            'loyalty_points' => 0,
            'tier' => 'bronze',
        ]);
    }

    #[Test]
    public function staff_bearer_wins_over_customer_session_on_staff_me(): void
    {
        $this->actingAs($this->customer, 'customer');

        $this->getJson('/api/auth/me', [
            'Authorization' => "Bearer {$this->staffToken}",
        ])
            ->assertOk()
            ->assertJsonPath('user.id', $this->staffUser->id)
            ->assertJsonPath('user.email', $this->staffUser->email);
    }

    #[Test]
    public function customer_session_without_bearer_is_rejected_on_staff_me(): void
    {
        $this->actingAs($this->customer, 'customer');

        $this->getJson('/api/auth/me')->assertForbidden();
    }

    #[Test]
    public function expired_staff_bearer_with_customer_session_returns_401(): void
    {
        $issued = $this->staffUser->createToken(
            'staff-' . $this->staffUser->id,
            ['staff'],
            now()->subMinute(),
        );

        $this->actingAs($this->customer, 'customer');

        $this->getJson('/api/auth/me', [
            'Authorization' => 'Bearer ' . $issued->plainTextToken,
        ])->assertUnauthorized();
    }
}
