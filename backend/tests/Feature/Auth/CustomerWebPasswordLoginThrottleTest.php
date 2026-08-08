<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Customer;
use App\Support\CustomerLoginThrottle;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

class CustomerWebPasswordLoginThrottleTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $this->customer = Customer::create([
            'name' => 'Web Login',
            'phone' => '+9607002222',
            'is_active' => true,
            'is_profile_complete' => true,
        ]);
        $this->customer->password = 'secret123';
        $this->customer->save();
    }

    public function test_web_login_locks_out_after_repeated_invalid_attempts(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->from(route('customer.login'))
                ->post(route('customer.password-login'), [
                    'phone' => '+9607002222',
                    'password' => 'wrong',
                ])
                ->assertSessionHasErrors();
        }

        $this->from(route('customer.login'))
            ->post(route('customer.password-login'), [
                'phone' => '+9607002222',
                'password' => 'wrong',
            ])
            ->assertSessionHasErrors('phone');

        $this->assertTrue(CustomerLoginThrottle::tooManyAttempts('+9607002222', '127.0.0.1'));
    }

    public function test_successful_web_login_clears_limit(): void
    {
        CustomerLoginThrottle::hit('+9607002222', '127.0.0.1');
        CustomerLoginThrottle::hit('+9607002222', '127.0.0.1');

        $this->from(route('customer.login'))
            ->post(route('customer.password-login'), [
                'phone' => '+9607002222',
                'password' => 'secret123',
            ])
            ->assertRedirect();

        $this->assertFalse(
            RateLimiter::tooManyAttempts(CustomerLoginThrottle::phoneIpKey('+9607002222', '127.0.0.1'), 5),
        );
    }

    public function test_account_limit_shared_with_api_keys(): void
    {
        $phone = '+9607002222';
        for ($i = 0; $i < 20; $i++) {
            CustomerLoginThrottle::hit($phone, '10.0.0.' . ($i % 250));
        }

        $this->assertTrue(CustomerLoginThrottle::tooManyAttempts($phone, '10.0.0.99'));

        $this->postJson('/api/auth/customer/login', [
            'phone' => $phone,
            'password' => 'wrong',
        ])->assertStatus(422);
    }
}
