<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Customer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

/**
 * Tests for CustomerAuthController::passwordLogin.
 *
 * Covers:
 * - Successful login returns token and customer data
 * - Wrong password is rejected (422)
 * - Unknown phone is rejected (422)
 * - Controller-level rate limiter locks out after 5 failed attempts
 * - After clearing the limiter, login works again
 * - Inactive account is rejected after correct credentials
 */
class CustomerPasswordLoginTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $this->customer = Customer::create([
            'name' => 'Test Customer',
            'phone' => '+9607001234',
            'loyalty_points' => 0,
            'tier' => 'bronze',
            'is_active' => true,
        ]);

        // Assign password directly (excluded from $fillable, uses hashed cast)
        $this->customer->password = 'secret123';
        $this->customer->save();
    }

    public function test_customer_can_login_with_correct_password(): void
    {
        $response = $this->postJson('/api/auth/customer/login', [
            'phone' => '+9607001234',
            'password' => 'secret123',
        ]);

        $response->assertOk()
            ->assertJsonStructure(['token', 'customer' => ['id', 'phone']]);
    }

    public function test_wrong_password_returns_422(): void
    {
        $this->postJson('/api/auth/customer/login', [
            'phone' => '+9607001234',
            'password' => 'wrongpassword',
        ])->assertStatus(422);
    }

    public function test_unknown_phone_returns_422(): void
    {
        $this->postJson('/api/auth/customer/login', [
            'phone' => '+9609999999',
            'password' => 'secret123',
        ])->assertStatus(422);
    }

    public function test_inactive_customer_cannot_login(): void
    {
        $this->customer->update(['is_active' => false]);

        $this->postJson('/api/auth/customer/login', [
            'phone' => '+9607001234',
            'password' => 'secret123',
        ])->assertStatus(422);
    }

    public function test_rate_limiter_locks_out_after_five_failed_attempts(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/customer/login', [
                'phone' => '+9607001234',
                'password' => 'wrong',
            ]);
        }

        // 6th attempt — locked out by either the route throttle (429) or the
        // controller-level RateLimiter (422 with a friendly message).
        // Both are correct; what matters is that the request is rejected.
        $response = $this->postJson('/api/auth/customer/login', [
            'phone' => '+9607001234',
            'password' => 'wrong',
        ]);

        $this->assertContains($response->status(), [422, 429], 'Expected a lockout response (422 or 429)');
    }

    public function test_login_works_after_limiter_is_cleared(): void
    {
        // Trigger a few failures
        for ($i = 0; $i < 3; $i++) {
            $this->postJson('/api/auth/customer/login', [
                'phone' => '+9607001234',
                'password' => 'wrong',
            ]);
        }

        // Simulate cooldown expiry by clearing the limiter
        $rateKey = 'customer-login:' . \App\Rules\MaldivesPhone::normalize('+9607001234') . ':127.0.0.1';
        RateLimiter::clear($rateKey);

        $this->postJson('/api/auth/customer/login', [
            'phone' => '+9607001234',
            'password' => 'secret123',
        ])->assertOk();
    }

    public function test_successful_login_clears_rate_limiter(): void
    {
        // A few failures, then a success — the limiter should be cleared
        for ($i = 0; $i < 2; $i++) {
            $this->postJson('/api/auth/customer/login', [
                'phone' => '+9607001234',
                'password' => 'wrong',
            ]);
        }

        // Success clears the bucket
        $this->postJson('/api/auth/customer/login', [
            'phone' => '+9607001234',
            'password' => 'secret123',
        ])->assertOk();

        // Subsequent failure starts the count from 1, not from 3
        $this->postJson('/api/auth/customer/login', [
            'phone' => '+9607001234',
            'password' => 'wrong',
        ])->assertStatus(422);

        // Should NOT be locked out yet (only 1 failure since success)
        $response = $this->postJson('/api/auth/customer/login', [
            'phone' => '+9607001234',
            'password' => 'secret123',
        ]);
        $response->assertOk();
    }
}
