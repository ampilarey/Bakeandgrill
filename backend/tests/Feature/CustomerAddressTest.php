<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CustomerAddressTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    private string $customerToken;

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();

        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);

        $this->customer = Customer::create([
            'name' => 'Address Customer',
            'phone' => '+9607002001',
            'is_active' => true,
        ]);

        $this->customerToken = $this->customer
            ->createToken('test', ['customer'])
            ->plainTextToken;

        $staffRole = Role::where('slug', 'staff')->firstOrFail();
        $this->staff = User::create([
            'name' => 'Staff',
            'email' => 'staff@address.test',
            'password' => Hash::make('password'),
            'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
    }

    public function test_customer_can_create_list_update_delete_addresses(): void
    {
        $create = $this->postJson('/api/customer/addresses', [
            'label' => 'Home',
            'address_line1' => 'M. Finihiyya',
            'island' => 'Male',
            'contact_name' => 'Address Customer',
            'contact_phone' => '7002001',
            'location_link' => 'https://maps.google.com/?q=finihiyya',
            'is_default' => true,
        ], ['Authorization' => "Bearer {$this->customerToken}"]);

        $create->assertStatus(201)
            ->assertJsonPath('address.label', 'Home')
            ->assertJsonPath('address.is_default', true)
            ->assertJsonPath('address.location_link', 'https://maps.google.com/?q=finihiyya');

        $addressId = (int) $create->json('address.id');

        $list = $this->getJson('/api/customer/addresses', [
            'Authorization' => "Bearer {$this->customerToken}",
        ]);
        $list->assertOk()->assertJsonCount(1, 'addresses');

        $update = $this->patchJson("/api/customer/addresses/{$addressId}", [
            'label' => 'Office',
            'address_line2' => '2nd floor',
        ], ['Authorization' => "Bearer {$this->customerToken}"]);
        $update->assertOk()->assertJsonPath('address.label', 'Office');

        $delete = $this->deleteJson("/api/customer/addresses/{$addressId}", [], [
            'Authorization' => "Bearer {$this->customerToken}",
        ]);
        $delete->assertOk();

        $this->assertDatabaseMissing('customer_addresses', ['id' => $addressId]);
    }

    public function test_customer_can_set_default_address(): void
    {
        $first = CustomerAddress::create([
            'customer_id' => $this->customer->id,
            'address_line1' => 'First',
            'island' => 'Male',
            'contact_name' => 'A',
            'contact_phone' => '+9607002001',
            'is_default' => true,
        ]);
        $second = CustomerAddress::create([
            'customer_id' => $this->customer->id,
            'address_line1' => 'Second',
            'island' => 'Male',
            'contact_name' => 'A',
            'contact_phone' => '+9607002001',
            'is_default' => false,
        ]);

        $this->postJson("/api/customer/addresses/{$second->id}/default", [], [
            'Authorization' => "Bearer {$this->customerToken}",
        ])->assertOk()->assertJsonPath('address.is_default', true);

        $this->assertFalse($first->fresh()->is_default);
        $this->assertTrue($second->fresh()->is_default);
    }

    public function test_staff_can_list_customer_addresses_for_pos(): void
    {
        CustomerAddress::create([
            'customer_id' => $this->customer->id,
            'label' => 'Home',
            'address_line1' => 'POS Street',
            'island' => 'Male',
            'contact_name' => 'Address Customer',
            'contact_phone' => '+9607002001',
            'is_default' => true,
        ]);

        Sanctum::actingAs($this->staff, ['staff']);

        $this->getJson("/api/customers/{$this->customer->id}/addresses")
            ->assertOk()
            ->assertJsonPath('addresses.0.address_line1', 'POS Street');
    }
}
