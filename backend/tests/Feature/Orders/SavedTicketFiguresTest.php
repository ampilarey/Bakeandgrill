<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Models\Category;
use App\Models\Device;
use App\Models\Item;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\PreparesPosApi;
use Tests\TestCase;

/**
 * Owner, 2026-11-12: the cart of a saved ticket said 419 and Charge asked 400. The till now
 * shows a saved ticket's own figures, so the order and the save reply must carry them, and
 * they must add up to the total Charge takes.
 */
class SavedTicketFiguresTest extends TestCase
{
    use PreparesPosApi;
    use RefreshDatabase;

    private User $staff;

    private Device $device;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        $this->staff = User::create([
            'name' => 'Staff', 'email' => 'staff-figures@test.com',
            'password' => Hash::make('password'), 'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);
        $this->device = Device::create(['name' => 'POS', 'identifier' => 'T-FIG', 'type' => 'pos', 'is_active' => true]);
        $this->withHeader('X-Device-Identifier', $this->device->identifier);
        $category = Category::create(['name' => 'Food', 'slug' => 'food-figures', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id, 'name' => 'Curry', 'base_price' => 100.00,
            'sku' => 'FIG-1', 'barcode' => 'FIG-1', 'is_active' => true, 'is_available' => true,
        ]);
        $this->preparePosApi($this->staff, $this->device);

        foreach ([
            'service_charge_enabled' => '1', 'service_charge_type' => 'percent', 'service_charge_value' => '10',
            'service_charge_apply_dine_in' => '1', 'service_charge_taxable' => '1',
        ] as $key => $value) {
            SiteSetting::set($key, $value);
        }
    }

    public function test_a_saved_ticket_carries_figures_that_add_up_to_its_total(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);
        $id = (int) $this->postJson('/api/orders', [
            'type' => 'dine_in', 'device_identifier' => $this->device->identifier, 'print' => false,
            'items' => [['item_id' => $this->item->id, 'quantity' => 2]],
        ])->assertCreated()->json('order.id');
        $this->postJson("/api/orders/{$id}/hold")->assertOk();

        // The service charge is changed in Admin while the ticket waits: the ticket follows it.
        SiteSetting::set('service_charge_value', '5');
        $this->postJson("/api/orders/{$id}/resume")->assertOk();
        $saved = $this->patchJson("/api/orders/{$id}/items", [
            'items' => [['item_id' => $this->item->id, 'name' => 'Curry', 'quantity' => 2]],
        ])->assertOk()->json('order');

        $this->assertEqualsWithDelta(10.0, (float) $saved['service_charge_amount'], 0.001);
        $this->assertSame(0, (int) $saved['packaging_fee_laar']);
        $this->assertEqualsWithDelta(
            (float) $saved['total'],
            (float) $saved['subtotal'] + (float) $saved['service_charge_amount'] + (float) $saved['tax_amount'],
            0.001,
        );

        $order = $this->getJson("/api/orders/{$id}")->assertOk()->json('order');
        $this->assertEqualsWithDelta(10.0, (float) $order['service_charge_amount'], 0.001);
        $this->assertArrayHasKey('packaging_fee_laar', $order);
        $this->assertArrayHasKey('tax_amount', $order);
        $this->assertEqualsWithDelta((float) $saved['total'], (float) $order['total'], 0.001);
    }
}
