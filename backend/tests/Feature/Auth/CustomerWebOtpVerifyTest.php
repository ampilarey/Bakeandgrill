<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Customer;
use App\Models\OtpVerification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class CustomerWebOtpVerifyTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function get_verify_otp_redirects_guests_to_login(): void
    {
        $this->get('/customer/verify-otp')
            ->assertRedirect(route('customer.login'));
    }

    #[Test]
    public function get_verify_otp_sends_authed_incomplete_customers_to_profile(): void
    {
        $customer = Customer::factory()->create([
            'is_profile_complete' => false,
        ]);

        $this->actingAs($customer, 'customer')
            ->get('/customer/verify-otp')
            ->assertRedirect(route('customer.complete-profile'));
    }

    #[Test]
    public function soft_deleted_customer_can_verify_otp_without_unique_constraint_error(): void
    {
        $phone = '+9607712345';

        $customer = Customer::factory()->create([
            'phone' => $phone,
            'is_profile_complete' => false,
            'is_active' => true,
        ]);
        $customer->delete();

        OtpVerification::create([
            'phone' => $phone,
            'code_hash' => Hash::make('123456'),
            'expires_at' => now()->addMinutes(10),
            'attempts' => 0,
        ]);

        $this->from(route('customer.login'))
            ->post(route('customer.verify-otp'), [
                'phone' => $phone,
                'otp' => '123456',
            ])
            ->assertRedirect(route('customer.complete-profile'));

        $this->assertDatabaseHas('customers', [
            'id' => $customer->id,
            'phone' => $phone,
            'deleted_at' => null,
            'is_active' => 1,
        ]);

        $this->assertAuthenticatedAs($customer->fresh(), 'customer');
    }

    #[Test]
    public function new_customer_otp_verify_creates_account_and_redirects_to_profile(): void
    {
        $phone = '+9607799988';

        OtpVerification::create([
            'phone' => $phone,
            'code_hash' => Hash::make('654321'),
            'expires_at' => now()->addMinutes(10),
            'attempts' => 0,
        ]);

        $this->from(route('customer.login'))
            ->post(route('customer.verify-otp'), [
                'phone' => $phone,
                'otp' => '654321',
            ])
            ->assertRedirect(route('customer.complete-profile'));

        $this->assertDatabaseHas('customers', ['phone' => $phone]);
        $this->assertAuthenticated('customer');
    }
}
