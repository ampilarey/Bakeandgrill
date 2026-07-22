<?php

declare(strict_types=1);

namespace Tests\Feature\Procurement;

use App\Domains\Inventory\Services\RestockIntelligenceService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\SiteSetting;
use App\Models\StockMovement;
use App\Models\User;
use App\Models\WasteLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WasteAwareReorderTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private InventoryItem $flour;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->owner = $this->makeOwner();

        $this->flour = InventoryItem::create([
            'name' => 'Flour Waste',
            'sku' => 'FLR-WST',
            'unit' => 'kg',
            'current_stock' => 20,
            'reorder_point' => 5,
            'reorder_quantity' => 40,
            'is_active' => true,
        ]);

        $deduct = StockMovement::create([
            'idempotency_key' => 'waste-aware-deduct-1',
            'inventory_item_id' => $this->flour->id,
            'user_id' => $this->owner->id,
            'type' => 'deduction',
            'quantity' => -30,
            'balance_after' => 20,
            'unit_cost' => 5,
            'reference_type' => 'order',
            'reference_id' => 1,
            'notes' => 'usage',
        ]);
        $deduct->forceFill([
            'created_at' => now()->subDays(10),
            'updated_at' => now()->subDays(10),
        ])->save();

        $waste = WasteLog::create([
            'inventory_item_id' => $this->flour->id,
            'user_id' => $this->owner->id,
            'quantity' => 15,
            'unit' => 'kg',
            'cost_estimate' => 75,
            'reason' => 'spoilage',
            'notes' => 'test waste',
        ]);
        $waste->forceFill([
            'created_at' => now()->subDays(5),
            'updated_at' => now()->subDays(5),
        ])->save();
    }

    public function test_setting_off_leaves_usage_rate_unchanged(): void
    {
        SiteSetting::set('restock_include_waste', '0');
        $svc = app(RestockIntelligenceService::class);

        $off = $svc->restockPlan(30, 90, 3, 14, false);
        $row = collect($off['items'])->firstWhere('id', $this->flour->id);
        $this->assertNotNull($row);
        $this->assertFalse($off['include_waste']);
        $this->assertSame($row['daily_usage_rate'], $row['effective_daily_rate']);
        $this->assertGreaterThan(0, $row['waste_daily_rate']);
        $this->assertGreaterThan(0, $row['waste_pct']);
    }

    public function test_setting_on_adds_clamped_waste_and_flags_high_waste(): void
    {
        SiteSetting::set('restock_include_waste', '1');
        SiteSetting::set('restock_high_waste_pct', '15');
        $svc = app(RestockIntelligenceService::class);

        $on = $svc->restockPlan(30, 90, 3, 14, true);
        $row = collect($on['items'])->firstWhere('id', $this->flour->id);
        $this->assertNotNull($row);
        $this->assertTrue($on['include_waste']);
        $this->assertGreaterThan($row['daily_usage_rate'], $row['effective_daily_rate']);
        $this->assertLessThanOrEqual($row['daily_usage_rate'], $row['waste_daily_rate_clamped']);
        $this->assertTrue($row['high_waste']);
        $this->assertTrue((float) $row['waste_pct'] >= 15.0);
    }

    public function test_api_include_waste_query_overrides_setting(): void
    {
        SiteSetting::set('restock_include_waste', '0');
        Sanctum::actingAs($this->owner, ['staff']);

        $off = $this->getJson('/api/forecasts/restock?include_waste=0&lookback_days=30')
            ->assertOk()
            ->json();
        $this->assertFalse($off['include_waste']);

        $on = $this->getJson('/api/forecasts/restock?include_waste=1&lookback_days=30')
            ->assertOk()
            ->json();
        $this->assertTrue($on['include_waste']);
        $row = collect($on['items'])->firstWhere('id', $this->flour->id);
        $this->assertGreaterThan($row['daily_usage_rate'], $row['effective_daily_rate']);
    }

    public function test_absurd_waste_is_clamped_to_usage(): void
    {
        // Add huge waste spike
        $spike = WasteLog::create([
            'inventory_item_id' => $this->flour->id,
            'user_id' => $this->owner->id,
            'quantity' => 500,
            'unit' => 'kg',
            'reason' => 'spoilage',
        ]);
        $spike->forceFill([
            'created_at' => now()->subDays(2),
            'updated_at' => now()->subDays(2),
        ])->save();

        $svc = app(RestockIntelligenceService::class);
        $plan = $svc->restockPlan(30, 90, 3, 14, true);
        $row = collect($plan['items'])->firstWhere('id', $this->flour->id);
        $this->assertNotNull($row);
        $this->assertLessThanOrEqual($row['daily_usage_rate'] + 0.0001, $row['waste_daily_rate_clamped']);
        $this->assertEqualsWithDelta(
            $row['daily_usage_rate'] + $row['waste_daily_rate_clamped'],
            $row['effective_daily_rate'],
            0.0001,
        );
    }
}
