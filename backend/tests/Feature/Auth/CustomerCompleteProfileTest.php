<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Customer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class CustomerCompleteProfileTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function guest_is_redirected_from_complete_profile_page(): void
    {
        $this->get('/customer/complete-profile')
            ->assertRedirect(route('customer.login'));
    }

    #[Test]
    public function incomplete_customer_can_view_complete_profile_page(): void
    {
        $customer = Customer::factory()->create([
            'name' => null,
            'is_profile_complete' => false,
            'password' => null,
        ]);

        $this->actingAs($customer, 'customer')
            ->get('/customer/complete-profile')
            ->assertOk()
            ->assertSee('One last step', false);
    }

    #[Test]
    public function incomplete_customer_can_submit_complete_profile_without_mass_assignment_error(): void
    {
        // Mirrors test/local APP_ENV where preventSilentlyDiscardingAttributes is on.
        Customer::preventSilentlyDiscardingAttributes();

        $customer = Customer::factory()->create([
            'name' => null,
            'is_profile_complete' => false,
            'password' => null,
        ]);

        $this->actingAs($customer, 'customer')
            ->post('/customer/complete-profile', [
                'name' => 'Ahmed Ali',
                'email' => 'ahmed@example.com',
                'password' => 'secret12',
                'password_confirmation' => 'secret12',
            ])
            ->assertRedirect('/');

        $customer->refresh();

        $this->assertTrue($customer->is_profile_complete);
        $this->assertSame('Ahmed Ali', $customer->name);
        $this->assertSame('ahmed@example.com', $customer->email);
        $this->assertNotEmpty($customer->password);
        $this->assertTrue(Hash::check('secret12', $customer->password));
    }
}
