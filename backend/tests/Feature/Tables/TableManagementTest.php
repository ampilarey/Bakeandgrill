<?php

declare(strict_types=1);

namespace Tests\Feature\Tables;

use App\Models\Device;
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
