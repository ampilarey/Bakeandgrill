<?php

declare(strict_types=1);

namespace Tests\Feature\Finance;

use App\Domains\Finance\Services\NonStockPurchaseExpenseService;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\InventoryItem;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use App\Models\SiteSetting;
use App\Models\Supplier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NonStockPurchaseExpenseTest extends TestCase
{
    use RefreshDatabase;

    public function test_auto_expense_off_by_default(): void
    {
        $owner = $this->makeOwner();
        ExpenseCategory::create(['name' => 'Supplies', 'slug' => 'supplies', 'icon' => '📦']);

        $purchase = $this->makeReceivedNonStockPurchase($owner->id);

        $expense = app(NonStockPurchaseExpenseService::class)->syncForPurchase($purchase, $owner);

        $this->assertNull($expense);
        $this->assertDatabaseCount('expenses', 0);
    }

    public function test_auto_expense_creates_pending_for_non_stock_lines_only(): void
    {
        $owner = $this->makeOwner();
        ExpenseCategory::create(['name' => 'Supplies', 'slug' => 'supplies', 'icon' => '📦']);
        SiteSetting::set(NonStockPurchaseExpenseService::SETTING_KEY, '1');

        $flour = InventoryItem::create([
            'name' => 'Flour',
            'sku' => 'FLR-NS',
            'unit' => 'kg',
            'current_stock' => 0,
            'is_active' => true,
        ]);
        $supplier = Supplier::create(['name' => 'Mixed Co', 'is_active' => true]);
        $po = Purchase::create([
            'purchase_number' => 'PO-NS-MIX',
            'supplier_id' => $supplier->id,
            'user_id' => $owner->id,
            'status' => 'received',
            'subtotal' => 150,
            'tax_amount' => 0,
            'total' => 150,
            'purchase_date' => now()->toDateString(),
        ]);
        PurchaseItem::create([
            'purchase_id' => $po->id,
            'inventory_item_id' => $flour->id,
            'quantity' => 10,
            'received_quantity' => 10,
            'receive_status' => 'complete',
            'unit_cost' => 10,
            'total_cost' => 100,
        ]);
        PurchaseItem::create([
            'purchase_id' => $po->id,
            'inventory_item_id' => null,
            'quantity' => 5,
            'received_quantity' => 5,
            'receive_status' => 'complete',
            'unit_cost' => 10,
            'total_cost' => 50,
        ]);

        $expense = app(NonStockPurchaseExpenseService::class)->syncForPurchase($po->fresh('items'), $owner);

        $this->assertNotNull($expense);
        $this->assertSame(50.0, (float) $expense->amount);
        $this->assertSame('pending', $expense->status);
        $this->assertSame($po->id, $expense->purchase_id);
        $this->assertStringContainsString(NonStockPurchaseExpenseService::NOTE_MARKER, (string) $expense->notes);
    }

    public function test_settings_endpoint_toggles_flag(): void
    {
        $owner = $this->makeOwner();
        $headers = $this->staffHeaders($owner);

        $this->getJson('/api/expenses/settings/purchase-auto', $headers)
            ->assertOk()
            ->assertJsonPath('settings.auto_expense_non_stock_purchases', false);

        $this->patchJson('/api/expenses/settings/purchase-auto', [
            'auto_expense_non_stock_purchases' => true,
        ], $headers)
            ->assertOk()
            ->assertJsonPath('settings.auto_expense_non_stock_purchases', true);

        $this->assertTrue(
            filter_var(SiteSetting::get(NonStockPurchaseExpenseService::SETTING_KEY), FILTER_VALIDATE_BOOLEAN),
        );
    }

    private function makeReceivedNonStockPurchase(int $userId): Purchase
    {
        $supplier = Supplier::create(['name' => 'NS Co', 'is_active' => true]);
        $po = Purchase::create([
            'purchase_number' => 'PO-NS-1',
            'supplier_id' => $supplier->id,
            'user_id' => $userId,
            'status' => 'received',
            'subtotal' => 40,
            'tax_amount' => 0,
            'total' => 40,
            'purchase_date' => now()->toDateString(),
        ]);
        PurchaseItem::create([
            'purchase_id' => $po->id,
            'inventory_item_id' => null,
            'quantity' => 4,
            'received_quantity' => 4,
            'receive_status' => 'complete',
            'unit_cost' => 10,
            'total_cost' => 40,
        ]);

        return $po->fresh('items');
    }
}
