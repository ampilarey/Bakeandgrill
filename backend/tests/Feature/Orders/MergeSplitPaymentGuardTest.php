<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Role;
use App\Models\User;
use App\Services\OrderCreationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * 2026-08 audit #4 — merge/split must not run once money is attached, or
 * payments and items drift apart (unpaid items, cancelled orders holding
 * confirmed payments).
 */
class MergeSplitPaymentGuardTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;

    private Device $device;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();

        $role = Role::firstOrCreate(
            ['slug' => 'staff'],
            ['name' => 'Staff', 'description' => 'Staff', 'is_active' => true],
        );
        $this->staff = User::create([
            'name' => 'Merge Staff',
            'email' => 'merge@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        $this->device = Device::create([
            'name' => 'Merge POS',
            'identifier' => 'MERGE-POS',
            'type' => 'pos',
            'is_active' => true,
        ]);
        $this->item = Item::factory()->create(['base_price' => 60.0]);

        Sanctum::actingAs($this->staff, ['staff']);
    }

    private function makeDineInOrder(): Order
    {
        return app(OrderCreationService::class)->createFromPayload([
            'type' => 'dine_in',
            'print' => false,
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ], $this->staff);
    }

    private function attachPartialPayment(Order $order): void
    {
        Payment::create([
            'order_id' => $order->id,
            'method' => 'cash',
            'amount' => 20.0,
            'amount_laar' => 2000,
            'status' => 'paid',
            'processed_at' => now(),
            'collected_by_user_id' => $this->staff->id,
        ]);
        $order->update(['payment_status' => 'partial']);
    }

    public function test_merge_rejected_when_source_partially_paid(): void
    {
        $target = $this->makeOrder();
        $source = $this->makeOrder();
        $this->attachPartialPayment($source);

        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$target->id}/merge", ['source_id' => $source->id])
            ->assertStatus(422);

        // Source not cancelled and its payment stayed attached.
        $this->assertNotSame('cancelled', $source->fresh()->status);
        $this->assertSame(1, Payment::where('order_id', $source->id)->count());
    }

    public function test_split_rejected_when_partially_paid(): void
    {
        $source = $this->makeOrder();
        // Add a second line so a split would otherwise be valid.
        $source->items()->create([
            'item_id' => $this->item->id,
            'item_name' => $this->item->name,
            'quantity' => 1,
            'unit_price' => 60.0,
            'total_price' => 60.0,
        ]);
        $this->attachPartialPayment($source);

        $firstItemId = $source->items()->first()->id;

        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$source->id}/split", ['item_ids' => [$firstItemId]])
            ->assertStatus(422);
    }
}
