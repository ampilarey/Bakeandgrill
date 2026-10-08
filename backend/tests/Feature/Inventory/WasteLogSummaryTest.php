<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\WasteLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Inventory → Waste logs → Summary said "Server error" whenever a date range
 * was set (it always is): the top-items queries join items and
 * inventory_items, both with a created_at, and the date filter named a bare
 * created_at.
 */
class WasteLogSummaryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
    }

    public function test_summary_with_a_date_range_totals_reasons_and_top_items(): void
    {
        $cat = $this->makeCategory();
        $bajiya = $this->makeItem(false, 0, ['name' => 'Bajiya', 'category_id' => $cat->id, 'base_price' => 5]);
        $flour = InventoryItem::create(['name' => 'Flour', 'unit' => 'kg', 'current_stock' => 50, 'unit_cost' => 12, 'is_active' => true]);
        WasteLog::create(['item_id' => $bajiya->id, 'quantity' => 12, 'unit' => 'pcs', 'cost_estimate' => 38.4, 'reason' => 'expired']);
        WasteLog::create(['inventory_item_id' => $flour->id, 'quantity' => 2, 'unit' => 'kg', 'cost_estimate' => 24, 'reason' => 'spoilage']);
        $old = WasteLog::create(['inventory_item_id' => $flour->id, 'quantity' => 1, 'unit' => 'kg', 'cost_estimate' => 12, 'reason' => 'spoilage']);
        $old->forceFill(['created_at' => now()->subDays(60)])->save();

        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $res = $this->getJson('/api/waste-logs/summary?from=' . now()->subDays(30)->toDateString() . '&to=' . now()->toDateString())
            ->assertOk();

        $this->assertSame(2, $res->json('total_entries'));
        $this->assertEqualsWithDelta(62.4, $res->json('total_cost'), 0.001);
        $this->assertSame(['Bajiya', 'Flour'], array_column($res->json('top_items'), 'name'));
        $this->assertEqualsCanonicalizing(['expired', 'spoilage'], array_column($res->json('by_reason'), 'reason'));
    }
}
