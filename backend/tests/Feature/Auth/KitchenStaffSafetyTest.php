<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Domains\Orders\Events\OrderCompleted;
use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Helpers\ModelHelpers;
use Tests\TestCase;

class KitchenStaffSafetyTest extends TestCase
{
    use ModelHelpers;
    use RefreshDatabase;

    private const DEVICE_ID = 'KITCHEN-KDS-01';

    private User $kitchenUser;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();

        PermissionCatalogSync::sync();

        $this->kitchenUser = $this->makeKitchenStaff([
            'email' => 'kitchen@test.com',
            'phone' => '+9607771234',
            'pin_hash' => Hash::make('5678'),
        ]);

        Device::create([
            'name' => 'Kitchen KDS',
            'identifier' => self::DEVICE_ID,
            'type' => 'kds',
            'is_active' => true,
        ]);

        $this->withHeader('X-Device-Identifier', self::DEVICE_ID);

        $cat = Category::create(['name' => 'Kitchen Test', 'slug' => 'kitchen-test', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $cat->id,
            'name' => 'Test Item',
            'base_price' => 25.0,
            'sku' => 'KIT-001',
            'is_active' => true,
            'is_available' => true,
        ]);
    }

    public function test_kitchen_staff_role_exists_and_legacy_admin_cashier_absent(): void
    {
        $this->assertDatabaseHas('roles', ['slug' => 'kitchen_staff', 'name' => 'Kitchen Staff']);
        $this->assertDatabaseMissing('roles', ['slug' => 'admin']);
        $this->assertDatabaseMissing('roles', ['slug' => 'cashier']);
    }

    public function test_pin_login_with_kds_view_only_succeeds(): void
    {
        $response = $this->postJson('/api/auth/staff/pin-login', [
            'username' => 'kitchen@test.com',
            'pin' => '5678',
            'device_identifier' => self::DEVICE_ID,
        ]);

        $response->assertOk()
            ->assertJsonPath('user.role', 'kitchen_staff')
            ->assertJsonStructure(['token', 'user' => ['permissions']]);
    }

    public function test_kitchen_user_cannot_access_kds_without_view_permission(): void
    {
        $user = $this->makeKitchenStaff(['email' => 'denied@test.com']);
        $user->revokePermission('kds.view');
        $user->unsetRelation('permissions');

        Sanctum::actingAs($user, ['staff']);

        $this->getJson('/api/kds/orders')->assertForbidden();
    }

    public function test_kitchen_user_can_view_and_start_but_not_bump(): void
    {
        Sanctum::actingAs($this->kitchenUser, ['staff']);

        $order = Order::create([
            'order_number' => 'KIT-001',
            'type' => 'takeaway',
            'status' => 'pending',
            'subtotal' => 25.0,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 25.0,
            'total_laar' => 2500,
        ]);

        $this->getJson('/api/kds/orders')->assertOk();
        $this->postJson("/api/kds/orders/{$order->id}/start")->assertOk();
        $this->postJson("/api/kds/orders/{$order->id}/bump")->assertForbidden();
        $this->postJson("/api/kds/orders/{$order->id}/recall")->assertForbidden();
        $this->postJson("/api/kds/items/{$this->item->id}/86")->assertForbidden();
    }

    public function test_kitchen_done_does_not_change_status_or_fire_payment_events(): void
    {
        Event::fake([OrderPaid::class, OrderCompleted::class]);
        Sanctum::actingAs($this->kitchenUser, ['staff']);

        $order = Order::create([
            'order_number' => 'KIT-DONE-001',
            'type' => 'takeaway',
            'status' => 'in_progress',
            'payment_status' => 'unpaid',
            'subtotal' => 25.0,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 25.0,
            'total_laar' => 2500,
        ]);

        $beforeCount = \App\Models\TaxLedgerEntry::count();

        $response = $this->postJson("/api/kds/orders/{$order->id}/kitchen-done");
        $response->assertOk()
            ->assertJsonPath('order.status', 'in_progress')
            ->assertJsonStructure(['order' => ['kitchen_done_at']]);

        $fresh = $order->fresh();
        $this->assertSame('in_progress', $fresh->status);
        $this->assertSame('unpaid', $fresh->payment_status);
        $this->assertNotNull($fresh->kitchen_done_at);
        $this->assertSame($this->kitchenUser->id, $fresh->kitchen_done_by);
        $this->assertSame($beforeCount, \App\Models\TaxLedgerEntry::count());

        Event::assertNotDispatched(OrderPaid::class);
        Event::assertNotDispatched(OrderCompleted::class);

        // Idempotent second call
        $this->postJson("/api/kds/orders/{$order->id}/kitchen-done")->assertOk();
    }

    public function test_kitchen_user_blocked_from_pos_sales_and_finance(): void
    {
        Sanctum::actingAs($this->kitchenUser, ['staff']);

        $this->postJson('/api/orders', [
            'type' => 'takeaway',
            'device_identifier' => self::DEVICE_ID,
            'print' => false,
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ])->assertForbidden();

        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertForbidden();

        $order = Order::create([
            'order_number' => 'KIT-BLOCK-001',
            'type' => 'takeaway',
            'status' => 'ready',
            'subtotal' => 25.0,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 25.0,
            'total_laar' => 2500,
        ]);

        $this->postJson("/api/orders/{$order->id}/payments", [
            'payments' => [['method' => 'cash', 'amount' => 25.0]],
        ])->assertForbidden();

        $this->getJson('/api/reports/finance/gst/output-statement?period=2026-05')->assertForbidden();
    }

    public function test_role_permissions_api_includes_kitchen_staff(): void
    {
        $owner = $this->makeOwner(['email' => 'owner-kitchen@test.com']);
        Sanctum::actingAs($owner, ['staff']);

        $this->getJson('/api/roles/kitchen_staff/permissions')
            ->assertOk()
            ->assertJsonFragment(['slug' => 'kds.view', 'granted' => true])
            ->assertJsonFragment(['slug' => 'pos.ring_sales', 'granted' => false]);
    }
}
