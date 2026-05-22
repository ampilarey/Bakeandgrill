<?php

declare(strict_types=1);

namespace Tests\Feature\Pos;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Role;
use App\Models\Shift;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OpenOrderContinuationTest extends TestCase
{
    use RefreshDatabase;

    private User $ahmed;

    private User $sara;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();

        PermissionCatalogSync::sync();

        $staffRole = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);

        $this->ahmed = User::create([
            'name' => 'Ahmed', 'email' => 'ahmed@test.com',
            'password' => Hash::make('password'), 'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);

        $this->sara = User::create([
            'name' => 'Sara', 'email' => 'sara@test.com',
            'password' => Hash::make('password'), 'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);

        $category = Category::create(['name' => 'Food', 'slug' => 'food', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Burger', 'base_price' => 25,
            'sku' => 'BRG-1', 'barcode' => 'BRG-1',
            'is_active' => true, 'is_available' => true,
        ]);
    }

    private function openShiftFor(User $user, float $opening = 100): Shift
    {
        Sanctum::actingAs($user, ['staff']);

        $this->postJson('/api/shifts/open', ['opening_cash' => $opening])
            ->assertCreated();

        return Shift::where('user_id', $user->id)->whereNull('closed_at')->firstOrFail();
    }

    private function createUnpaidOrder(User $user): int
    {
        Sanctum::actingAs($user, ['staff']);
        $this->openShiftFor($user);

        $response = $this->postJson('/api/orders', [
            'type' => 'dine_in',
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ])->assertCreated();

        return (int) $response->json('order.id');
    }

    public function test_self_register_auto_approves_without_blocking(): void
    {
        Sanctum::actingAs($this->ahmed, ['staff']);

        $this->postJson('/api/devices/self-register', [
            'name' => 'POS NEW',
            'identifier' => 'POS-AUTO-1',
            'type' => 'pos',
        ])
            ->assertOk()
            ->assertJsonPath('status', 'approved');

        $this->assertDatabaseHas('devices', [
            'identifier' => 'POS-AUTO-1',
            'status' => 'approved',
            'is_active' => true,
        ]);
    }

    public function test_order_create_works_without_device_header_when_shift_open(): void
    {
        Sanctum::actingAs($this->ahmed, ['staff']);
        $this->openShiftFor($this->ahmed);

        $this->postJson('/api/orders', [
            'type' => 'takeaway',
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ])->assertCreated();
    }

    public function test_order_create_blocked_without_open_shift(): void
    {
        Sanctum::actingAs($this->ahmed, ['staff']);

        $this->postJson('/api/orders', [
            'type' => 'takeaway',
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ])->assertStatus(422);
    }

    public function test_second_staff_not_blocked_by_device_user_id(): void
    {
        $device = Device::create([
            'name' => 'Shared iPad',
            'identifier' => 'POS-SHARED',
            'type' => 'pos',
            'status' => 'approved',
            'is_active' => true,
            'user_id' => $this->ahmed->id,
        ]);

        Sanctum::actingAs($this->sara, ['staff']);
        $this->openShiftFor($this->sara);

        $this->withHeader('X-Device-Identifier', $device->identifier)
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
            ])
            ->assertCreated();
    }

    public function test_sara_sees_and_pays_ahmed_unpaid_order(): void
    {
        $orderId = $this->createUnpaidOrder($this->ahmed);
        $ahmedShift = Shift::where('user_id', $this->ahmed->id)->whereNull('closed_at')->firstOrFail();

        Sanctum::actingAs($this->sara, ['staff']);

        $activeIds = collect($this->getJson('/api/orders?active_only=1')->assertOk()->json('data'))
            ->pluck('id');
        $this->assertTrue($activeIds->contains($orderId));

        $this->getJson("/api/orders/{$orderId}")->assertOk();

        $saraShift = $this->openShiftFor($this->sara);

        $this->postJson("/api/orders/{$orderId}/payments", [
            'payments' => [['method' => 'cash', 'amount' => 25]],
            'print_receipt' => false,
        ])->assertOk();

        $order = Order::findOrFail($orderId);
        $this->assertSame($this->ahmed->id, $order->user_id);
        $this->assertSame($ahmedShift->id, $order->shift_id);

        $payment = Payment::where('order_id', $orderId)->latest('id')->firstOrFail();
        $this->assertSame($this->sara->id, $payment->collected_by_user_id);
        $this->assertSame($saraShift->id, $payment->shift_id);
    }

    public function test_payment_without_open_shift_is_blocked(): void
    {
        $orderId = $this->createUnpaidOrder($this->ahmed);

        Sanctum::actingAs($this->sara, ['staff']);

        $this->postJson("/api/orders/{$orderId}/payments", [
            'payments' => [['method' => 'cash', 'amount' => 25]],
        ])->assertStatus(422);
    }

    public function test_closing_creator_shift_leaves_unpaid_order_active(): void
    {
        $orderId = $this->createUnpaidOrder($this->ahmed);
        $ahmedShift = Shift::where('user_id', $this->ahmed->id)->whereNull('closed_at')->firstOrFail();

        Sanctum::actingAs($this->ahmed, ['staff']);

        $this->postJson("/api/shifts/{$ahmedShift->id}/close", ['closing_cash' => 100])
            ->assertOk()
            ->assertJsonPath('open_unpaid_orders', 1);

        $order = Order::findOrFail($orderId);
        $this->assertSame('pending', $order->status);
        $this->assertSame('unpaid', $order->payment_status);
    }

    public function test_shift_expected_cash_uses_collector_payment_shift(): void
    {
        $orderId = $this->createUnpaidOrder($this->ahmed);
        $ahmedShift = Shift::where('user_id', $this->ahmed->id)->whereNull('closed_at')->firstOrFail();

        Sanctum::actingAs($this->sara, ['staff']);
        $saraShift = $this->openShiftFor($this->sara, 50);

        $this->postJson("/api/orders/{$orderId}/payments", [
            'payments' => [['method' => 'cash', 'amount' => 25]],
            'print_receipt' => false,
        ])->assertOk();

        Sanctum::actingAs($this->ahmed, ['staff']);
        $this->postJson("/api/shifts/{$ahmedShift->id}/close", ['closing_cash' => 100])->assertOk();

        Sanctum::actingAs($this->sara, ['staff']);
        $summary = $this->getJson("/api/shifts/{$saraShift->id}/summary")->assertOk()->json('cash_drawer');
        $this->assertEquals(75.0, (float) $summary['expected_cash']);
    }

    public function test_created_by_me_filter_scopes_active_orders_to_creator(): void
    {
        $ahmedOrderId = $this->createUnpaidOrder($this->ahmed);

        Sanctum::actingAs($this->sara, ['staff']);
        $this->openShiftFor($this->sara);
        $saraOrderId = $this->postJson('/api/orders', [
            'type' => 'dine_in',
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ])->assertCreated()->json('order.id');

        $all = $this->getJson('/api/orders?active_only=1')->assertOk();
        $this->assertGreaterThanOrEqual(2, $all->json('total'));

        $mine = $this->getJson('/api/orders?active_only=1&created_by_me=1')->assertOk();
        $ids = collect($mine->json('data'))->pluck('id')->all();
        $this->assertContains($saraOrderId, $ids);
        $this->assertNotContains($ahmedOrderId, $ids);
    }

    public function test_online_only_filter_scopes_active_orders_to_ordering_app(): void
    {
        $posOrderId = $this->createUnpaidOrder($this->ahmed);

        $online = Order::factory()->onlinePickup()->pending()->create([
            'user_id' => null,
            'order_number' => 'BG-ONLINE-001',
        ]);
        $delivery = Order::factory()->create([
            'user_id' => null,
            'order_number' => 'BG-DELIV-001',
            'type' => 'delivery',
            'status' => 'pending',
            'payment_status' => 'paid',
        ]);

        Sanctum::actingAs($this->sara, ['staff']);

        $onlineOnly = $this->getJson('/api/orders?active_only=1&online_only=1')->assertOk();
        $ids = collect($onlineOnly->json('data'))->pluck('id')->all();

        $this->assertContains($online->id, $ids);
        $this->assertContains($delivery->id, $ids);
        $this->assertNotContains($posOrderId, $ids);
    }
}
