<?php

declare(strict_types=1);

namespace Tests\Feature\Procurement;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\ExpenseCategory;
use App\Models\InventoryItem;
use App\Models\PurchaseRequest;
use App\Models\SiteSetting;
use App\Models\User;
use App\Services\PurchaseRequestVerificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * One shop run, one pot.
 *
 * A verified purchase request can be recorded as an Expense or as a Purchase
 * order. Each conversion guarded only against its own duplicate, so a request
 * could quietly become BOTH — the same money in the expense figures and in the
 * purchase figures, and the monthly cost (the owner's whole accounting model,
 * 2026-09-06) counting it twice.
 */
class OneShopRunOnePotTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;

    private User $cashier;

    private InventoryItem $flour;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();

        $this->manager = $this->makeManager(['email' => 'mgr-onepot@pr.test']);
        $this->cashier = $this->makeStaff('staff', ['email' => 'cashier-onepot@pr.test']);
        ExpenseCategory::create(['name' => 'Supplies', 'slug' => 'supplies', 'icon' => '📦']);

        $this->flour = InventoryItem::create([
            'name' => 'Flour', 'sku' => 'FLR-1', 'unit' => 'kg',
            'current_stock' => 10, 'unit_cost' => 5.0, 'is_active' => true,
        ]);
    }

    private function boughtRequest(): int
    {
        Sanctum::actingAs($this->cashier, ['staff']);
        $id = (int) $this->postJson('/api/purchase-requests', [
            'source' => 'pos',
            'priority' => 'normal',
            'items' => [[
                'free_text_name' => 'Flour bag',
                'inventory_item_id' => $this->flour->id,
                'requested_qty' => 2,
                'requested_unit' => 'kg',
            ]],
        ])->json('request.id');

        Sanctum::actingAs($this->manager, ['staff']);
        $this->postJson("/api/purchase-requests/{$id}/approve")->assertOk();
        $this->postJson("/api/purchase-requests/{$id}/assign", ['assigned_to' => $this->cashier->id])->assertOk();

        $itemId = PurchaseRequest::findOrFail($id)->items()->first()->id;
        Sanctum::actingAs($this->cashier, ['staff']);
        $this->postJson("/api/purchase-requests/{$id}/items/{$itemId}/mark-bought", [
            'actual_qty' => 2,
            'actual_unit_cost_laar' => 500,
            'supplier_name_text' => 'Fahi Store',
            'brand' => 'Anchor',
        ])->assertOk();

        Sanctum::actingAs($this->manager, ['staff']);
        $this->postJson("/api/purchase-requests/{$id}/items/{$itemId}/verify-received")->assertOk();

        return $id;
    }

    public function test_the_brand_on_the_tin_survives_the_whole_shop_run(): void
    {
        /*
         * Purchase orders always carried brand; the shop run never did, so
         * half the buying was invisible to the brand price comparison. The
         * brand typed at mark-bought has to land in the price history and on
         * the PO line the request becomes.
         */
        $id = $this->boughtRequest();

        $this->assertSame('Anchor', PurchaseRequest::findOrFail($id)->items()->first()->brand);
        $this->assertSame(
            'Anchor',
            \App\Models\SupplierPriceHistory::whereNull('purchase_id')
                ->where('inventory_item_id', $this->flour->id)
                ->value('brand'),
        );

        $this->postJson("/api/purchase-requests/{$id}/convert-to-purchase")->assertOk();

        $purchaseId = PurchaseRequest::findOrFail($id)->purchase_id;
        $this->assertSame(
            'Anchor',
            \App\Models\PurchaseItem::where('purchase_id', $purchaseId)->value('brand'),
        );
    }

    public function test_a_request_that_became_a_purchase_cannot_also_become_an_expense(): void
    {
        $id = $this->boughtRequest();

        $this->postJson("/api/purchase-requests/{$id}/convert-to-purchase")->assertOk();

        $this->postJson("/api/purchase-requests/{$id}/convert-to-expense")
            ->assertStatus(422);

        $this->assertNull(PurchaseRequest::findOrFail($id)->expense_id);
    }

    public function test_a_request_that_became_an_expense_cannot_also_become_a_purchase(): void
    {
        $id = $this->boughtRequest();

        $this->postJson("/api/purchase-requests/{$id}/convert-to-expense")->assertOk();

        $this->postJson("/api/purchase-requests/{$id}/convert-to-purchase")
            ->assertStatus(422);

        $this->assertNull(PurchaseRequest::findOrFail($id)->purchase_id);
    }

    public function test_the_auto_expense_stands_down_when_a_purchase_already_owns_the_money(): void
    {
        /*
         * The silent version of the same double count: the auto-expense fires
         * on its own whenever a request closes. Once the request is a purchase
         * order, the money lives there — a later auto fire (a re-verify, a
         * replayed webhook) must produce nothing.
         */
        $id = $this->boughtRequest();
        $this->postJson("/api/purchase-requests/{$id}/convert-to-purchase")->assertOk();

        SiteSetting::set(PurchaseRequestVerificationService::AUTO_EXPENSE_SETTING, '1');
        SiteSetting::bust();

        $pr = PurchaseRequest::findOrFail($id);
        $service = app(PurchaseRequestVerificationService::class);

        $this->assertNull($service->maybeAutoExpense($pr, $this->manager, request()));
        $this->assertNull($pr->fresh()->expense_id);
    }
}
