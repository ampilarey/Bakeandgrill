<?php

declare(strict_types=1);

namespace Tests\Feature\Procurement;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class GenerateRestockRequestTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->manager = $this->makeManager(['email' => 'mgr-restock-pr@test']);
    }

    private function seedBelowRopItem(string $name = 'Flour', float $stock = 5, float $rop = 20, float $roq = 40, float $lastPrice = 4.5): InventoryItem
    {
        $item = InventoryItem::create([
            'name' => $name,
            'sku' => 'SKU-' . substr(md5($name), 0, 8),
            'unit' => 'kg',
            'current_stock' => $stock,
            'reorder_point' => $rop,
            'reorder_quantity' => $roq,
            'unit_cost' => $lastPrice,
            'last_purchase_price' => $lastPrice,
            'is_active' => true,
        ]);

        // Usage so the item appears in the restock plan.
        $deduct = StockMovement::create([
            'idempotency_key' => 'restock-gen-' . $item->id,
            'inventory_item_id' => $item->id,
            'user_id' => $this->manager->id,
            'type' => 'deduction',
            'quantity' => -30,
            'balance_after' => $stock,
            'unit_cost' => $lastPrice,
            'reference_type' => 'order',
            'reference_id' => 1,
            'notes' => 'test usage',
        ]);
        $deduct->forceFill([
            'created_at' => now()->subDays(10),
            'updated_at' => now()->subDays(10),
        ])->save();

        return $item;
    }

    public function test_generates_draft_purchase_request_from_below_rop_items(): void
    {
        $flour = $this->seedBelowRopItem();

        Sanctum::actingAs($this->manager, ['staff']);
        $response = $this->postJson('/api/forecasts/restock/generate-request', [
            'lookback_days' => 30,
            'lead_days' => 3,
            'cover_days' => 14,
        ]);

        $response->assertCreated()
            ->assertJsonPath('request.source', 'restock')
            ->assertJsonPath('request.status', 'requested');

        $prId = (int) $response->json('request.id');
        $this->assertDatabaseHas('purchase_requests', [
            'id' => $prId,
            'source' => 'restock',
            'status' => 'requested',
        ]);

        $line = PurchaseRequestItem::where('purchase_request_id', $prId)->first();
        $this->assertNotNull($line);
        $this->assertSame($flour->id, $line->inventory_item_id);
        $this->assertGreaterThan(0, (float) $line->requested_qty);
        $this->assertSame(450, (int) $line->estimated_unit_cost_laar);
    }

    public function test_skips_items_already_on_open_restock_request(): void
    {
        $flour = $this->seedBelowRopItem('Flour Open');
        $sugar = $this->seedBelowRopItem('Sugar Open', 2, 10, 20, 3.0);

        $existing = PurchaseRequest::create([
            'request_no' => 'PR-RST-EXIST',
            'title' => 'Existing restock',
            'source' => 'restock',
            'status' => 'requested',
            'priority' => 'normal',
            'requested_by' => $this->manager->id,
        ]);
        PurchaseRequestItem::create([
            'purchase_request_id' => $existing->id,
            'inventory_item_id' => $flour->id,
            'requested_qty' => 10,
            'requested_unit' => 'kg',
            'status' => 'pending',
        ]);

        Sanctum::actingAs($this->manager, ['staff']);
        $response = $this->postJson('/api/forecasts/restock/generate-request');

        $response->assertCreated();
        $prId = (int) $response->json('request.id');
        $itemIds = PurchaseRequestItem::where('purchase_request_id', $prId)->pluck('inventory_item_id')->all();

        $this->assertNotContains($flour->id, $itemIds);
        $this->assertContains($sugar->id, $itemIds);
        $this->assertNotNull($response->json('warning'));
    }

    public function test_empty_plan_returns_422_without_creating_request(): void
    {
        InventoryItem::create([
            'name' => 'Plenty stock',
            'sku' => 'PLENTY',
            'unit' => 'kg',
            'current_stock' => 500,
            'reorder_point' => 5,
            'reorder_quantity' => 10,
            'is_active' => true,
        ]);

        Sanctum::actingAs($this->manager, ['staff']);
        $before = PurchaseRequest::count();

        $this->postJson('/api/forecasts/restock/generate-request')
            ->assertStatus(422)
            ->assertJsonPath('request', null);

        $this->assertSame($before, PurchaseRequest::count());
    }

    public function test_requires_inventory_manage(): void
    {
        $this->seedBelowRopItem();
        $staff = $this->makeStaff('staff', ['email' => 'staff-restock@test']);

        Sanctum::actingAs($staff, ['staff']);
        $this->postJson('/api/forecasts/restock/generate-request')->assertForbidden();
    }
}
