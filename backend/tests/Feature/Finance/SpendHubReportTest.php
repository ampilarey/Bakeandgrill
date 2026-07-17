<?php

declare(strict_types=1);

namespace Tests\Feature\Finance;

use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\InventoryItem;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use App\Models\Supplier;
use App\Models\WasteLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SpendHubReportTest extends TestCase
{
    use RefreshDatabase;

    public function test_spend_hub_separates_purchases_and_expenses(): void
    {
        $owner = $this->makeOwner();
        $today = now()->toDateString();

        $supplier = Supplier::create(['name' => 'Cafe Supply', 'is_active' => true]);
        $cat = ExpenseCategory::create(['name' => 'Utilities', 'slug' => 'utilities', 'icon' => '⚡']);
        $flour = InventoryItem::create([
            'name' => 'Flour',
            'sku' => 'FLR-HUB',
            'unit' => 'kg',
            'current_stock' => 0,
            'is_active' => true,
        ]);

        $po = Purchase::create([
            'purchase_number' => 'PO-HUB-1',
            'supplier_id' => $supplier->id,
            'user_id' => $owner->id,
            'status' => 'received',
            'subtotal' => 200,
            'tax_amount' => 0,
            'total' => 200,
            'purchase_date' => $today,
        ]);
        PurchaseItem::create([
            'purchase_id' => $po->id,
            'inventory_item_id' => $flour->id,
            'quantity' => 20,
            'received_quantity' => 20,
            'receive_status' => 'complete',
            'unit_cost' => 10,
            'total_cost' => 200,
        ]);

        Expense::create([
            'expense_number' => 'EXP-HUB-1',
            'expense_category_id' => $cat->id,
            'user_id' => $owner->id,
            'description' => 'Electricity',
            'amount' => 75,
            'amount_laar' => 7500,
            'expense_date' => $today,
            'status' => 'approved',
            'payment_method' => 'cash',
        ]);

        Expense::create([
            'expense_number' => 'EXP-HUB-2',
            'expense_category_id' => $cat->id,
            'user_id' => $owner->id,
            'purchase_id' => $po->id,
            'description' => 'Linked reference only',
            'amount' => 25,
            'amount_laar' => 2500,
            'expense_date' => $today,
            'status' => 'pending',
            'payment_method' => 'cash',
        ]);

        WasteLog::create([
            'inventory_item_id' => $flour->id,
            'user_id' => $owner->id,
            'quantity' => 2,
            'unit' => 'kg',
            'cost_estimate' => 20,
            'reason' => 'spoilage',
            'notes' => 'test waste',
        ]);

        $response = $this->getJson(
            '/api/reports/finance/spend-hub?from='.$today.'&to='.$today,
            $this->staffHeaders($owner),
        );

        $response->assertOk()
            ->assertJsonPath('totals.purchases', 200)
            ->assertJsonPath('totals.expenses_approved', 75)
            ->assertJsonPath('totals.expenses_pending', 25)
            ->assertJsonPath('totals.combined_outflow', 275)
            ->assertJsonPath('totals.waste_cost', 20)
            ->assertJsonPath('totals.waste_count', 1)
            ->assertJsonPath('totals.total_with_waste', 295)
            ->assertJsonPath('totals.po_count', 1)
            ->assertJsonPath('totals.expenses_linked_to_po', 1)
            ->assertJsonPath('purchases.by_supplier.0.supplier_name', 'Cafe Supply')
            ->assertJsonPath('purchases.top_items.0.item_name', 'Flour')
            ->assertJsonPath('expenses.by_category.0.category', 'Utilities')
            ->assertJsonPath('waste.by_reason.0.reason', 'spoilage')
            ->assertJsonPath('waste.by_reason.0.total', 20);

        $this->assertStringContainsString('COGS', (string) $response->json('note'));
        $this->assertStringContainsString('Waste', (string) $response->json('note'));
    }

    public function test_spend_hub_requires_auth(): void
    {
        $this->getJson('/api/reports/finance/spend-hub?from='.now()->toDateString().'&to='.now()->toDateString())
            ->assertStatus(401);
    }
}
