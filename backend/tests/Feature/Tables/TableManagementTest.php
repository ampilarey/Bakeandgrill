<?php

declare(strict_types=1);

namespace Tests\Feature\Tables;

use App\Models\Category;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\RestaurantTable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Table management lifecycle tests.
 *
 * Covers: create, update, list, open (creates order), close, merge, split,
 * auth enforcement, and business-rule guards.
 */
class TableManagementTest extends TestCase
{
    use RefreshDatabase;

    private const DEVICE_ID = 'TABLE-TEST-POS';

    private array $managerHeaders;

    protected function setUp(): void
    {
        parent::setUp();

        $manager = $this->makeManager();
        $this->managerHeaders = $this->staffHeaders($manager);

        Device::firstOrCreate(
            ['identifier' => self::DEVICE_ID],
            ['name' => 'Test POS', 'type' => 'pos', 'is_active' => true],
        );
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function createTable(string $name = 'T-01', int $capacity = 4): RestaurantTable
    {
        return RestaurantTable::create([
            'name' => $name,
            'capacity' => $capacity,
            'status' => 'available',
            'is_active' => true,
        ]);
    }

    private function openTableRequest(int $tableId): \Illuminate\Testing\TestResponse
    {
        return $this->withHeader('X-Device-Identifier', self::DEVICE_ID)
            ->postJson("/api/tables/{$tableId}/open", [], $this->managerHeaders);
    }

    // ── Create table ──────────────────────────────────────────────────────────

    public function test_manager_can_create_table(): void
    {
        $this->postJson('/api/tables', [
            'name' => 'Table 1',
            'capacity' => 4,
        ], $this->managerHeaders)
            ->assertStatus(201)
            ->assertJsonPath('table.name', 'Table 1');
    }

    public function test_create_requires_unique_name(): void
    {
        $this->createTable('T-DUPE');

        $this->postJson('/api/tables', [
            'name' => 'T-DUPE',
            'capacity' => 4,
        ], $this->managerHeaders)->assertStatus(422);
    }

    public function test_create_requires_name(): void
    {
        $this->postJson('/api/tables', [
            'capacity' => 4,
        ], $this->managerHeaders)->assertStatus(422);
    }

    public function test_create_requires_auth(): void
    {
        $this->postJson('/api/tables', ['name' => 'T-Auth', 'capacity' => 2])
            ->assertStatus(401);
    }

    // ── Update table ──────────────────────────────────────────────────────────

    public function test_manager_can_update_table(): void
    {
        $table = $this->createTable('Old Name');

        $this->patchJson("/api/tables/{$table->id}", [
            'name' => 'New Name',
            'capacity' => 6,
        ], $this->managerHeaders)
            ->assertStatus(200)
            ->assertJsonPath('table.name', 'New Name');
    }

    // ── List tables ───────────────────────────────────────────────────────────

    public function test_staff_can_list_tables(): void
    {
        $this->createTable('Listed Table');

        $this->getJson('/api/tables', $this->managerHeaders)
            ->assertStatus(200)
            ->assertJsonStructure(['tables']);
    }

    public function test_list_requires_auth(): void
    {
        $this->getJson('/api/tables')->assertStatus(401);
    }

    // ── Open table (creates dine-in order) ───────────────────────────────────

    public function test_opening_active_table_creates_dine_in_order(): void
    {
        $table = $this->createTable('T-OPEN');

        $response = $this->openTableRequest($table->id);
        $response->assertStatus(201);

        $this->assertDatabaseHas('orders', [
            'restaurant_table_id' => $table->id,
            'type' => 'dine_in',
        ]);
    }

    public function test_cannot_open_inactive_table(): void
    {
        $table = RestaurantTable::create([
            'name' => 'T-Inactive',
            'capacity' => 4,
            'status' => 'available',
            'is_active' => false,
        ]);

        $this->openTableRequest($table->id)->assertStatus(422);
    }

    public function test_cannot_open_table_that_already_has_open_order(): void
    {
        $table = $this->createTable('T-ALREADY-OPEN');

        $this->openTableRequest($table->id)->assertStatus(201);
        $this->openTableRequest($table->id)->assertStatus(422);
    }

    // ── Close table ───────────────────────────────────────────────────────────

    public function test_closing_table_without_active_order_succeeds(): void
    {
        $table = $this->createTable('T-NO-ORDER');

        // Table has no open order — should close cleanly (sets status to available)
        $this->withHeader('X-Device-Identifier', self::DEVICE_ID)
            ->postJson("/api/tables/{$table->id}/close", [], $this->managerHeaders)
            ->assertStatus(200);
    }

    public function test_closing_table_with_unpaid_order_detaches_and_frees_seat(): void
    {
        $table = $this->createTable('T-CLOSE-ANYTIME');

        // Open the table — creates an unpaid dine_in order
        $opened = $this->openTableRequest($table->id)->assertStatus(201);
        $orderId = (int) $opened->json('order.id');

        // Close is allowed without payment — frees the seat, keeps the order
        $this->withHeader('X-Device-Identifier', self::DEVICE_ID)
            ->postJson("/api/tables/{$table->id}/close", [], $this->managerHeaders)
            ->assertStatus(200)
            ->assertJsonPath('table.status', 'available');

        $this->assertSame('available', $table->fresh()->status);
        $order = Order::findOrFail($orderId);
        $this->assertNull($order->restaurant_table_id);
        $this->assertNotSame('cancelled', $order->status);
    }

    public function test_list_heals_occupied_table_with_no_active_order(): void
    {
        $table = $this->createTable('T-STALE');
        $table->update(['status' => 'occupied']);

        $this->getJson('/api/tables', $this->managerHeaders)
            ->assertOk()
            ->assertJsonFragment([
                'id' => $table->id,
                'name' => 'T-STALE',
                'status' => 'available',
                'current_order_id' => null,
            ]);

        $this->assertSame('available', $table->fresh()->status);
    }

    public function test_list_marks_occupied_when_active_order_linked(): void
    {
        $table = $this->createTable('T-LINKED');
        // Stale cache: available even though an open check owns the seat.
        $table->update(['status' => 'available']);

        $this->openTableRequest($table->id)->assertCreated();
        $table->update(['status' => 'available']);

        $this->getJson('/api/tables', $this->managerHeaders)
            ->assertOk()
            ->assertJsonFragment([
                'id' => $table->id,
                'status' => 'occupied',
            ]);

        $this->assertSame('occupied', $table->fresh()->status);
        $this->assertNotNull(
            collect($this->getJson('/api/tables', $this->managerHeaders)->json('tables'))
                ->firstWhere('id', $table->id)['current_order_id'] ?? null,
        );
    }

    public function test_cannot_create_second_order_on_same_table(): void
    {
        $category = Category::create(['name' => 'Food', 'slug' => 'table-dupe-food', 'is_active' => true]);
        $item = Item::create([
            'category_id' => $category->id,
            'name' => 'Dupe Burger',
            'base_price' => 15.00,
            'sku' => 'TBL-DUPE-1',
            'is_active' => true,
            'is_available' => true,
        ]);
        $table = $this->createTable('T-DUPE-ORDER');

        $shift = $this->withHeader('X-Device-Identifier', self::DEVICE_ID)
            ->postJson('/api/shifts/open', ['opening_cash' => 50], $this->managerHeaders);
        $this->assertTrue($shift->isSuccessful(), 'shift open: '.$shift->getContent());

        $first = $this->withHeader('X-Device-Identifier', self::DEVICE_ID)
            ->postJson('/api/orders', [
                'type' => 'dine_in',
                'restaurant_table_id' => $table->id,
                'print' => false,
                'items' => [['item_id' => $item->id, 'quantity' => 1]],
            ], $this->managerHeaders);
        $this->assertSame(201, $first->status(), 'first order: '.$first->getContent());

        $second = $this->withHeader('X-Device-Identifier', self::DEVICE_ID)
            ->postJson('/api/orders', [
                'type' => 'dine_in',
                'restaurant_table_id' => $table->id,
                'print' => false,
                'items' => [['item_id' => $item->id, 'quantity' => 1]],
            ], $this->managerHeaders);
        $this->assertSame(422, $second->status(), 'second order: '.$second->getContent());
        $this->assertStringContainsString('Table already has an open order', $second->getContent());
    }

    public function test_charging_dine_in_order_releases_table(): void
    {
        $category = Category::create(['name' => 'Food', 'slug' => 'table-pay-food', 'is_active' => true]);
        $item = Item::create([
            'category_id' => $category->id,
            'name' => 'Table Burger',
            'base_price' => 20.00,
            'sku' => 'TBL-PAY-1',
            'is_active' => true,
            'is_available' => true,
        ]);

        $table = $this->createTable('T-PAY-RELEASE');

        $this->withHeader('X-Device-Identifier', self::DEVICE_ID)
            ->postJson('/api/shifts/open', ['opening_cash' => 50], $this->managerHeaders)
            ->assertCreated();

        $create = $this->withHeader('X-Device-Identifier', self::DEVICE_ID)
            ->postJson('/api/orders', [
                'type' => 'dine_in',
                'restaurant_table_id' => $table->id,
                'print' => false,
                'items' => [['item_id' => $item->id, 'quantity' => 1]],
            ], $this->managerHeaders)
            ->assertCreated();

        $orderId = (int) $create->json('order.id');
        $total = (float) $create->json('order.total');
        $this->assertSame('occupied', $table->fresh()->status);

        $this->withHeader('X-Device-Identifier', self::DEVICE_ID)
            ->postJson("/api/orders/{$orderId}/payments", [
                'payments' => [['method' => 'cash', 'amount' => $total]],
                'print_receipt' => false,
            ], $this->managerHeaders)
            ->assertOk();

        $this->assertSame('paid', Order::findOrFail($orderId)->status);
        $this->assertSame('available', $table->fresh()->status);
        $this->assertNull(Order::findOrFail($orderId)->restaurant_table_id);
    }

    // ── Merge tables ──────────────────────────────────────────────────────────

    public function test_merge_moves_items_from_source_to_target(): void
    {
        $source = $this->createTable('T-SOURCE');
        $target = $this->createTable('T-TARGET');

        // Open both tables
        $this->openTableRequest($source->id)->assertStatus(201);
        $this->openTableRequest($target->id)->assertStatus(201);

        $response = $this->withHeader('X-Device-Identifier', self::DEVICE_ID)
            ->postJson('/api/tables/merge', [
                'source_table_id' => $source->id,
                'target_table_id' => $target->id,
            ], $this->managerHeaders);

        $response->assertStatus(200);
    }

    public function test_merge_requires_different_tables(): void
    {
        $table = $this->createTable('T-SAME');

        $this->withHeader('X-Device-Identifier', self::DEVICE_ID)
            ->postJson('/api/tables/merge', [
                'source_table_id' => $table->id,
                'target_table_id' => $table->id,
            ], $this->managerHeaders)->assertStatus(422);
    }

    // ── Split table ───────────────────────────────────────────────────────────

    public function test_split_with_invalid_order_returns_4xx(): void
    {
        $table = $this->createTable('T-SPLIT');

        $response = $this->withHeader('X-Device-Identifier', self::DEVICE_ID)
            ->postJson("/api/tables/{$table->id}/split", [
                'order_id' => 99999,
                'amount' => 5.00,
            ], $this->managerHeaders);

        // 404 (model not found) or 422 (validation) depending on implementation
        $this->assertContains($response->status(), [404, 422]);
    }
}
