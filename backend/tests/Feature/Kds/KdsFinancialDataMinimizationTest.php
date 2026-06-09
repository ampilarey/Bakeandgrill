<?php

declare(strict_types=1);

namespace Tests\Feature\Kds;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Http\Controllers\Api\KdsController;
use App\Models\Category;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class KdsFinancialDataMinimizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_kds_orders_api_omits_financial_fields(): void
    {
        PermissionCatalogSync::sync();

        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        $staff = User::create([
            'name' => 'KDS Viewer',
            'email' => 'kds-fin@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        $staff->grantPermission('kds.view');
        $staff->unsetRelation('permissions');

        $device = Device::create([
            'name' => 'KDS Screen',
            'identifier' => 'KDS-FIN-01',
            'type' => 'kds',
            'is_active' => true,
        ]);

        $category = Category::create(['name' => 'KDS Fin', 'slug' => 'kds-fin', 'is_active' => true]);
        $item = Item::create([
            'category_id' => $category->id,
            'name' => 'KDS Plate',
            'base_price' => 40.0,
            'sku' => 'KDS-FIN-1',
            'is_active' => true,
            'is_available' => true,
        ]);

        $order = Order::create([
            'order_number' => 'KDS-HTTP-1',
            'type' => 'takeaway',
            'status' => 'pending',
            'subtotal' => 40,
            'tax_amount' => 3.2,
            'discount_amount' => 0,
            'total' => 43.2,
            'total_laar' => 4320,
            'payment_status' => 'paid',
        ]);
        $order->items()->create([
            'item_id' => $item->id,
            'item_name' => $item->name,
            'quantity' => 1,
            'unit_price' => 40,
            'total_price' => 40,
        ]);

        Sanctum::actingAs($staff, ['staff']);

        $response = $this->withHeader('X-Device-Identifier', $device->identifier)
            ->getJson('/api/kds/orders')
            ->assertOk();

        $firstOrder = collect($response->json('orders'))->firstWhere('id', $order->id);
        $this->assertIsArray($firstOrder);
        $this->assertArrayNotHasKey('total', $firstOrder);
        $this->assertArrayNotHasKey('subtotal', $firstOrder);
        $this->assertArrayNotHasKey('payment_status', $firstOrder);
        $this->assertArrayNotHasKey('payments', $firstOrder);

        $firstItem = $firstOrder['items'][0] ?? null;
        $this->assertIsArray($firstItem);
        $this->assertArrayNotHasKey('total', $firstItem);
        $this->assertArrayNotHasKey('payment_status', $firstItem);
        $this->assertArrayNotHasKey('payments', $firstItem);
    }

    public function test_kitchen_order_payload_omits_financial_fields(): void
    {
        $order = Order::create([
            'order_number' => 'KDS-FIN-1',
            'type' => 'takeaway',
            'status' => 'pending',
            'subtotal' => 99.99,
            'tax_amount' => 8,
            'discount_amount' => 5,
            'total' => 102.99,
            'total_laar' => 10299,
            'payment_status' => 'unpaid',
        ]);

        $payload = KdsController::formatKitchenOrder($order->fresh());
        $json = json_encode($payload);

        $this->assertArrayNotHasKey('total', $payload);
        $this->assertArrayNotHasKey('subtotal', $payload);
        $this->assertArrayNotHasKey('payment_status', $payload);
        $this->assertStringNotContainsString('"payments"', (string) $json);
    }
}
