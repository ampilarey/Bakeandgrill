<?php

declare(strict_types=1);

namespace Tests\Feature\Procurement;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\PurchaseRequestItemQuote;
use App\Models\Supplier;
use App\Models\SupplierPriceHistory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MultiQuoteTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;

    private User $buyer;

    private InventoryItem $item;

    private Supplier $cheap;

    private Supplier $dear;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->manager = $this->makeManager(['email' => 'mgr-quote@test']);
        $this->buyer = $this->makeStaff('staff', ['email' => 'buyer-quote@test']);
        $this->item = InventoryItem::create([
            'name' => 'Sugar',
            'unit' => 'kg',
            'current_stock' => 20,
            'last_purchase_price' => 15,
            'is_active' => true,
        ]);
        $this->cheap = Supplier::create(['name' => 'Cheap Mart', 'is_active' => true]);
        $this->dear = Supplier::create(['name' => 'Dear Mart', 'is_active' => true]);
        SupplierPriceHistory::create([
            'supplier_id' => $this->cheap->id,
            'inventory_item_id' => $this->item->id,
            'unit_price' => 12,
            'unit' => 'kg',
            'recorded_at' => now()->toDateString(),
        ]);
    }

    /** @return array{0: int, 1: int} request id + item id */
    private function assignedBuyingLine(): array
    {
        Sanctum::actingAs($this->buyer, ['staff']);
        $id = $this->postJson('/api/purchase-requests', [
            'source' => 'pos',
            'items' => [[
                'inventory_item_id' => $this->item->id,
                'requested_qty' => 2,
                'requested_unit' => 'kg',
            ]],
        ])->json('request.id');

        Sanctum::actingAs($this->manager, ['staff']);
        $this->postJson("/api/purchase-requests/{$id}/approve")->assertOk();
        $this->postJson("/api/purchase-requests/{$id}/assign", [
            'assigned_to' => $this->buyer->id,
        ])->assertOk();

        $itemId = (int) $this->getJson("/api/purchase-requests/{$id}")->json('request.items.0.id');

        return [(int) $id, $itemId];
    }

    public function test_add_list_delete_quotes_and_cheapest(): void
    {
        [$id, $itemId] = $this->assignedBuyingLine();

        Sanctum::actingAs($this->buyer, ['staff']);
        $this->postJson("/api/purchase-requests/{$id}/items/{$itemId}/quotes", [
            'supplier_id' => $this->dear->id,
            'unit_price_laar' => 1800,
            'unit' => 'kg',
        ])->assertCreated();

        $this->postJson("/api/purchase-requests/{$id}/items/{$itemId}/quotes", [
            'supplier_name_text' => 'Street stall',
            'unit_price_laar' => 1100,
            'unit' => 'kg',
        ])->assertCreated();

        $list = $this->getJson("/api/purchase-requests/{$id}/items/{$itemId}/quotes")
            ->assertOk()
            ->json();

        $this->assertCount(2, $list['quotes']);
        $this->assertNotNull($list['cheapest_quote_id']);
        $this->assertTrue(collect($list['quotes'])->contains(fn ($q) => $q['is_cheapest'] === true && $q['unit_price_laar'] === 1100));
        $this->assertNotNull($list['price_hint']);
        $this->assertSame(12.0, (float) $list['price_hint']['cheapest']['unit_price']);

        $dearId = collect($list['quotes'])->firstWhere('unit_price_laar', 1800)['id'];
        $this->deleteJson("/api/purchase-requests/{$id}/items/{$itemId}/quotes/{$dearId}")
            ->assertOk()
            ->assertJsonCount(1, 'quotes');
    }

    public function test_mark_bought_from_quote_copies_price_and_supplier(): void
    {
        [$id, $itemId] = $this->assignedBuyingLine();

        Sanctum::actingAs($this->buyer, ['staff']);
        $quoteId = $this->postJson("/api/purchase-requests/{$id}/items/{$itemId}/quotes", [
            'supplier_id' => $this->cheap->id,
            'unit_price_laar' => 1250,
            'unit' => 'kg',
        ])->json('quote.id');

        $this->postJson("/api/purchase-requests/{$id}/items/{$itemId}/mark-bought", [
            'from_quote_id' => $quoteId,
            'actual_qty' => 2,
        ])->assertOk()
            ->assertJsonPath('item.status', 'bought');

        $this->assertDatabaseHas('purchase_request_items', [
            'id' => $itemId,
            'actual_unit_cost_laar' => 1250,
            'supplier_id' => $this->cheap->id,
            'status' => 'bought',
        ]);

        $this->assertNotNull(PurchaseRequestItemQuote::find($quoteId)?->selected_at);
        $this->assertGreaterThanOrEqual(0, (int) PurchaseRequestItemQuote::find($quoteId)?->savings_laar);
    }

    public function test_buying_without_quotes_still_works(): void
    {
        [$id, $itemId] = $this->assignedBuyingLine();

        Sanctum::actingAs($this->buyer, ['staff']);
        $this->postJson("/api/purchase-requests/{$id}/items/{$itemId}/mark-bought", [
            'actual_qty' => 2,
            'actual_unit_cost_laar' => 1400,
            'supplier_name_text' => 'Ad-hoc shop',
        ])->assertOk()
            ->assertJsonPath('item.status', 'bought');

        $this->assertDatabaseHas('purchase_request_items', [
            'id' => $itemId,
            'actual_unit_cost_laar' => 1400,
            'supplier_name_text' => 'Ad-hoc shop',
            'status' => 'bought',
        ]);

        $this->assertSame(0, PurchaseRequestItemQuote::count());
    }
}
