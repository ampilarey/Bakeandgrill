<?php

declare(strict_types=1);

namespace Tests\Feature\KitchenProduction;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Item;
use App\Models\KitchenProductionBatch;
use App\Models\KitchenProductionItem;
use App\Models\Role;
use App\Models\StockMovement;
use App\Models\User;
use App\Services\KitchenReceivingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class KitchenReceiveIdempotencyTest extends TestCase
{
    use RefreshDatabase;

    private User $cashier;

    private Item $item;

    private KitchenProductionBatch $batch;

    private KitchenProductionItem $prodItem;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();

        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        $this->cashier = User::create([
            'name' => 'Cashier',
            'email' => 'recv-idem@test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->item = Item::create([
            'name' => 'Prep Roll',
            'base_price' => 10,
            'is_active' => true,
            'is_available' => true,
            'track_stock' => true,
            'availability_type' => 'stock_based',
            'stock_quantity' => 0,
        ]);

        $this->batch = KitchenProductionBatch::create([
            'batch_no' => 'KP-IDEM-1',
            'status' => 'submitted',
            'production_type' => 'prepared_stock',
            'produced_by' => $this->cashier->id,
            'submitted_at' => now(),
        ]);

        $this->prodItem = KitchenProductionItem::create([
            'kitchen_production_batch_id' => $this->batch->id,
            'item_id' => $this->item->id,
            'produced_qty' => 10,
            'expected_receive_qty' => 10,
            'unit' => 'pcs',
            'status' => 'submitted',
        ]);
    }

    public function test_duplicate_full_receive_does_not_inflate_stock(): void
    {
        $service = app(KitchenReceivingService::class);

        $service->receiveItem($this->batch, $this->prodItem, $this->cashier, ['received_qty' => 10]);
        $service->receiveItem($this->batch->fresh(), $this->prodItem->fresh(), $this->cashier, ['received_qty' => 10]);

        $this->assertSame('received', $this->prodItem->fresh()->status);
        $this->assertSame(10, (int) $this->item->fresh()->stock_quantity);
        $this->assertSame(1, StockMovement::where('idempotency_key', 'like', 'kitchen:receive:prod-item:' . $this->prodItem->id . '%')->count());
    }

    public function test_two_legitimate_partial_receives_apply_incremental_stock(): void
    {
        $service = app(KitchenReceivingService::class);

        $service->receiveItem($this->batch, $this->prodItem, $this->cashier, [
            'received_qty' => 4,
            'idempotency_key' => 'recv-partial-1',
        ]);
        $this->assertSame('partially_received', $this->prodItem->fresh()->status);
        $this->assertSame(4, (int) $this->item->fresh()->stock_quantity);

        // Second receipt of 6 is incremental (4+6=10), not a cumulative target of 6.
        $service->receiveItem($this->batch->fresh(), $this->prodItem->fresh(), $this->cashier, [
            'received_qty' => 6,
            'idempotency_key' => 'recv-partial-2',
        ]);
        $this->assertSame('received', $this->prodItem->fresh()->status);
        $this->assertSame(10, (int) $this->item->fresh()->stock_quantity);
        $this->assertSame(2, StockMovement::where('idempotency_key', 'like', 'kitchen:receive:prod-item:' . $this->prodItem->id . '%')->count());
    }

    public function test_receive_idempotency_key_retries_do_not_double_apply(): void
    {
        $service = app(KitchenReceivingService::class);

        $service->receiveItem($this->batch, $this->prodItem, $this->cashier, [
            'received_qty' => 4,
            'idempotency_key' => 'recv-retry-key',
        ]);
        $service->receiveItem($this->batch->fresh(), $this->prodItem->fresh(), $this->cashier, [
            'received_qty' => 4,
            'idempotency_key' => 'recv-retry-key',
        ]);

        $this->assertSame(4, (int) $this->item->fresh()->stock_quantity);
        $this->assertSame(1, \App\Models\KitchenReceivingItem::where('idempotency_key', 'recv-retry-key')->count());
    }

    public function test_reject_after_receive_is_blocked(): void
    {
        $service = app(KitchenReceivingService::class);
        $service->receiveItem($this->batch, $this->prodItem, $this->cashier, ['received_qty' => 10]);

        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);
        $service->rejectItem($this->batch->fresh(), $this->prodItem->fresh(), $this->cashier, [
            'rejected_qty' => 10,
            'notes' => 'too late',
        ]);
    }
}
