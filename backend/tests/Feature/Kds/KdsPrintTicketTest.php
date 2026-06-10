<?php

declare(strict_types=1);

namespace Tests\Feature\Kds;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\Printer;
use App\Models\PrintJob;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class KdsPrintTicketTest extends TestCase
{
    use RefreshDatabase;

    private User $kitchenStaff;

    private Device $kdsDevice;

    protected function setUp(): void
    {
        parent::setUp();

        PermissionCatalogSync::sync();

        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        $this->kitchenStaff = User::create([
            'name' => 'KDS Printer',
            'email' => 'kds-print@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        $this->kitchenStaff->grantPermission('kds.print_ticket');
        $this->kitchenStaff->unsetRelation('permissions');

        $this->kdsDevice = Device::create([
            'name' => 'KDS Screen',
            'identifier' => 'KDS-PRINT-01',
            'type' => 'kds',
            'is_active' => true,
        ]);

        Printer::create([
            'name' => 'Kitchen Main',
            'type' => 'kitchen',
            'ip_address' => '192.168.1.50',
            'port' => 9100,
            'is_active' => true,
        ]);
    }

    public function test_kds_print_ticket_queues_kitchen_job(): void
    {
        $category = Category::create(['name' => 'KDS Print', 'slug' => 'kds-print', 'is_active' => true]);
        $item = Item::create([
            'category_id' => $category->id,
            'name' => 'Print Burger',
            'base_price' => 40.0,
            'sku' => 'KDS-PRINT-1',
            'is_active' => true,
            'is_available' => true,
        ]);

        $order = Order::create([
            'order_number' => 'ORD-KDS-PRINT',
            'type' => 'takeaway',
            'status' => 'in_progress',
            'subtotal' => 40.0,
            'total' => 40.0,
            'total_laar' => 4000,
        ]);
        $order->items()->create([
            'item_id' => $item->id,
            'item_name' => $item->name,
            'quantity' => 1,
            'unit_price' => 40.0,
            'total_price' => 40.0,
        ]);

        Sanctum::actingAs($this->kitchenStaff, ['staff']);

        $this->withHeader('X-Device-Identifier', $this->kdsDevice->identifier)
            ->postJson("/api/kds/orders/{$order->id}/print-ticket")
            ->assertOk()
            ->assertJsonPath('message', 'Kitchen ticket queued for printing.');

        $this->assertSame(
            1,
            PrintJob::where('order_id', $order->id)->where('type', 'kitchen')->count(),
        );
    }

    public function test_kds_print_ticket_requires_permission(): void
    {
        $this->kitchenStaff->revokePermission('kds.print_ticket');
        $this->kitchenStaff->unsetRelation('permissions');

        $order = Order::create([
            'order_number' => 'ORD-KDS-DENY',
            'type' => 'takeaway',
            'status' => 'in_progress',
            'subtotal' => 10.0,
            'total' => 10.0,
            'total_laar' => 1000,
        ]);

        Sanctum::actingAs($this->kitchenStaff, ['staff']);

        $this->withHeader('X-Device-Identifier', $this->kdsDevice->identifier)
            ->postJson("/api/kds/orders/{$order->id}/print-ticket")
            ->assertForbidden();
    }
}
