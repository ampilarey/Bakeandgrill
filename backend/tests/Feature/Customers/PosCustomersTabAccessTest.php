<?php

declare(strict_types=1);

namespace Tests\Feature\Customers;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Customer;
use App\Models\Device;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The POS Customers tab (owner, 2026-10-02) calls the admin customer
 * endpoints from the till. A manager signed in on a till reaches them; a
 * cashier is kept to the lookup endpoints the cart already used.
 */
class PosCustomersTabAccessTest extends TestCase
{
    use RefreshDatabase;

    private Device $device;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->device = Device::create(['name' => 'Front till', 'identifier' => 'pos-cust-tab', 'type' => 'pos', 'is_active' => true]);
    }

    private function fromTill(): static
    {
        return $this->withHeader('X-Device-Identifier', $this->device->identifier);
    }

    public function test_a_manager_on_a_till_can_list_filter_open_and_edit_customers(): void
    {
        $aisha = Customer::create(['name' => 'Aisha', 'phone' => '+9607771234']);
        Customer::create(['name' => 'Hassan', 'phone' => '+9607775555']);
        Sanctum::actingAs($this->makeManager(), ['staff']);

        $this->fromTill()->getJson('/api/admin/customers?search=Aish')->assertOk()
            ->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.name', 'Aisha');
        $this->fromTill()->getJson('/api/admin/customers/segments')->assertOk()->assertJsonStructure(['segments' => [['slug', 'label', 'count']]]);
        $this->fromTill()->getJson('/api/admin/customers?segment=no_order_yet')->assertOk()->assertJsonPath('meta.total', 2);
        $this->fromTill()->getJson("/api/admin/customers/{$aisha->id}")->assertOk()->assertJsonPath('customer.phone', '+9607771234');
        $this->fromTill()->getJson("/api/customers/{$aisha->id}/pos-summary")->assertOk();

        $this->fromTill()->patchJson("/api/admin/customers/{$aisha->id}", [
            'internal_notes' => 'Allergic to nuts', 'sms_opt_out' => true, 'is_active' => true,
        ])->assertOk()->assertJsonPath('customer.internal_notes', 'Allergic to nuts')->assertJsonPath('customer.sms_opt_out', true);
    }

    public function test_a_cashier_gets_lookup_but_not_the_management_endpoints(): void
    {
        $aisha = Customer::create(['name' => 'Aisha', 'phone' => '+9607771234']);
        Sanctum::actingAs($this->makeStaff('staff'), ['staff']);

        $this->fromTill()->getJson('/api/customers/search?q=Aish')->assertOk();
        $this->fromTill()->getJson("/api/customers/{$aisha->id}/pos-summary")->assertOk();
        $this->fromTill()->patchJson("/api/customers/{$aisha->id}", ['name' => 'Aisha Ali'])->assertOk();

        $this->fromTill()->getJson('/api/admin/customers')->assertForbidden();
        $this->fromTill()->getJson("/api/admin/customers/{$aisha->id}")->assertForbidden();
        $this->fromTill()->patchJson("/api/admin/customers/{$aisha->id}", ['internal_notes' => 'x'])->assertForbidden();
        $this->fromTill()->patchJson("/api/admin/customers/{$aisha->id}/phone", ['phone' => '+9607779999'])->assertForbidden();
        $this->assertSame('+9607771234', $aisha->fresh()->phone);
    }
}
