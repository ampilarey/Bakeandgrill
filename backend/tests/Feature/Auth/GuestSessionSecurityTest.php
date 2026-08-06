<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Customer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Tests\TestCase;

/**
 * Guest checkout must never hand out a session for an EXISTING customer —
 * knowing a phone number is not proof of owning it. Existing accounts must
 * verify via OTP or password login.
 */
class GuestSessionSecurityTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_session_creates_new_customer(): void
    {
        $this->postJson('/api/auth/customer/guest-session', [
            'phone' => '7911111',
            'name' => 'Fresh Guest',
        ])->assertOk();

        $this->assertDatabaseHas('customers', ['phone' => '+9607911111', 'name' => 'Fresh Guest']);
    }

    public function test_guest_session_rejects_existing_customer(): void
    {
        $customer = Customer::create([
            'phone' => '+9607922222',
            'name' => 'Real Owner',
            'loyalty_points' => 500,
            'tier' => 'gold',
        ]);

        $this->postJson('/api/auth/customer/guest-session', [
            'phone' => '7922222',
            'name' => 'Attacker',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['phone']);

        // No session was established for the victim account.
        $this->assertFalse(Auth::guard('customer')->check());
        // Victim record untouched.
        $this->assertSame('Real Owner', $customer->fresh()->name);
    }

    public function test_guest_session_rejects_soft_deleted_customer(): void
    {
        $customer = Customer::create([
            'phone' => '+9607933333',
            'name' => 'Deleted Owner',
            'loyalty_points' => 0,
            'tier' => 'bronze',
        ]);
        $customer->delete();

        $this->postJson('/api/auth/customer/guest-session', [
            'phone' => '7933333',
            'name' => 'Attacker',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['phone']);

        $this->assertFalse(Auth::guard('customer')->check());
        $this->assertSoftDeleted('customers', ['id' => $customer->id]);
    }

    public function test_rejected_guest_session_cannot_access_customer_routes(): void
    {
        Customer::create([
            'phone' => '+9607944444',
            'name' => 'Owner',
            'loyalty_points' => 0,
            'tier' => 'bronze',
        ]);

        $this->postJson('/api/auth/customer/guest-session', [
            'phone' => '7944444',
            'name' => 'Attacker',
        ])->assertStatus(422);

        $this->getJson('/api/customer/orders')->assertStatus(401);
    }
}
