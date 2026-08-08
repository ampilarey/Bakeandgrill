<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Customer;
use App\Models\OtpVerification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class CustomerWebPasswordResetRevokesTokensTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function web_password_reset_revokes_existing_customer_bearer_tokens(): void
    {
        $phone = '+9607733333';
        $customer = Customer::factory()->create([
            'phone' => $phone,
            'is_active' => true,
            'is_profile_complete' => true,
        ]);
        $customer->password = 'old-secret';
        $customer->save();

        $token = $customer->createToken('customer-api', ['customer'])->plainTextToken;
        $this->assertDatabaseCount('personal_access_tokens', 1);

        OtpVerification::create([
            'phone' => $phone,
            'purpose' => 'web-reset',
            'code_hash' => Hash::make('123456'),
            'expires_at' => now()->addMinutes(10),
            'attempts' => 0,
        ]);

        $this->from(route('customer.forgot-password'))
            ->post(route('customer.verify-reset-otp'), [
                'phone' => $phone,
                'otp' => '123456',
            ])
            ->assertSessionHas('password_reset_grant');

        $this->from(route('customer.forgot-password'))
            ->post(route('customer.reset-password'), [
                'phone' => $phone,
                'password' => 'new-secret',
                'password_confirmation' => 'new-secret',
            ])
            ->assertRedirect('/order/menu');

        $this->assertDatabaseCount('personal_access_tokens', 0);

        // Old bearer token must no longer authorize customer API routes.
        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/customer/orders')
            ->assertStatus(401);
    }

    #[Test]
    public function web_password_reset_does_not_login_inactive_customer(): void
    {
        $phone = '+9607744444';
        $customer = Customer::factory()->create([
            'phone' => $phone,
            'is_active' => false,
            'is_profile_complete' => true,
        ]);
        $customer->password = 'old-secret';
        $customer->save();

        OtpVerification::create([
            'phone' => $phone,
            'purpose' => 'web-reset',
            'code_hash' => Hash::make('123456'),
            'expires_at' => now()->addMinutes(10),
            'attempts' => 0,
        ]);

        $this->from(route('customer.forgot-password'))
            ->post(route('customer.verify-reset-otp'), [
                'phone' => $phone,
                'otp' => '123456',
            ]);

        $this->from(route('customer.forgot-password'))
            ->post(route('customer.reset-password'), [
                'phone' => $phone,
                'password' => 'new-secret',
                'password_confirmation' => 'new-secret',
            ])
            ->assertSessionHasErrors('phone');

        $this->assertGuest('customer');
    }
}
