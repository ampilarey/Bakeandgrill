<?php

declare(strict_types=1);

namespace Tests\Feature\Procurement;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\ExpenseCategory;
use App\Models\InventoryItem;
use App\Models\PurchaseRequest;
use App\Models\RecurringShoppingList;
use App\Models\SiteSetting;
use App\Models\Supplier;
use App\Models\SupplierPriceHistory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class Phase2ProcurementTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;

    private User $cashier;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->manager = $this->makeManager(['email' => 'mgr-p2@test']);
        $this->cashier = $this->makeStaff('staff', ['email' => 'cashier-p2@test']);
        ExpenseCategory::create(['name' => 'Supplies', 'slug' => 'supplies', 'icon' => '📦']);
    }

    public function test_price_hints_on_purchase_request_show(): void
    {
        $supplier = Supplier::create(['name' => 'Cheap Co', 'is_active' => true]);
        $item = InventoryItem::create([
            'name' => 'Oil',
            'unit' => 'L',
            'current_stock' => 5,
            'last_purchase_price' => 12.5,
            'is_active' => true,
        ]);
        SupplierPriceHistory::create([
            'supplier_id' => $supplier->id,
            'inventory_item_id' => $item->id,
            'unit_price' => 10,
            'unit' => 'L',
            'recorded_at' => now()->toDateString(),
        ]);

        Sanctum::actingAs($this->cashier, ['staff']);
        $id = $this->postJson('/api/purchase-requests', [
            'source' => 'pos',
            'items' => [[
                'inventory_item_id' => $item->id,
                'requested_qty' => 2,
                'requested_unit' => 'L',
            ]],
        ])->json('request.id');

        Sanctum::actingAs($this->manager, ['staff']);
        $this->getJson("/api/purchase-requests/{$id}")
            ->assertOk()
            ->assertJsonPath('request.items.0.price_hint.last_paid', 12.5)
            ->assertJsonPath('request.items.0.price_hint.cheapest.unit_price', 10);
    }

    public function test_auto_approve_under_threshold(): void
    {
        SiteSetting::set('purchase_requests_auto_approve_under_laar', '50000'); // MVR 500

        Sanctum::actingAs($this->cashier, ['staff']);
        $this->postJson('/api/purchase-requests', [
            'source' => 'pos',
            'items' => [[
                'free_text_name' => 'Tape',
                'requested_qty' => 1,
                'requested_unit' => 'pcs',
                'estimated_unit_cost_laar' => 1000,
            ]],
        ])->assertCreated()->assertJsonPath('request.status', 'approved');
    }

    public function test_category_budget_warns_and_can_enforce(): void
    {
        $cat = ExpenseCategory::first();
        $cat->update(['monthly_budget_laar' => 10000]); // MVR 100
        SiteSetting::set('expense_budgets_enforce', '1');

        Sanctum::actingAs($this->manager, ['staff']);
        $this->postJson('/api/expenses', [
            'expense_category_id' => $cat->id,
            'description' => 'Over budget',
            'amount' => 150,
            'expense_date' => now()->toDateString(),
        ])->assertStatus(422);

        SiteSetting::set('expense_budgets_enforce', '0');
        $this->postJson('/api/expenses', [
            'expense_category_id' => $cat->id,
            'description' => 'Warn only',
            'amount' => 150,
            'expense_date' => now()->toDateString(),
        ])->assertCreated()->assertJsonPath('budget_warning.over_budget', true);
    }

    public function test_recurring_shopping_list_crud_and_generate(): void
    {
        SiteSetting::set('purchase_requests_recurring_lists_enabled', '1');
        SiteSetting::set('purchase_requests_auto_approve_under_laar', '0');
        Sanctum::actingAs($this->manager, ['staff']);

        $res = $this->postJson('/api/recurring-shopping-lists', [
            'name' => 'Weekly staples',
            'recurrence_interval' => 'weekly',
            'next_run_date' => now()->toDateString(),
            'items' => [[
                'free_text_name' => 'Cooking oil',
                'qty' => 2,
                'unit' => 'L',
                'estimated_unit_cost_laar' => 8000,
            ]],
        ])->assertCreated();

        $listId = $res->json('list.id');
        $this->assertDatabaseHas('recurring_shopping_lists', ['id' => $listId, 'name' => 'Weekly staples']);
        $this->assertDatabaseHas('recurring_shopping_list_items', [
            'recurring_shopping_list_id' => $listId,
            'free_text_name' => 'Cooking oil',
        ]);

        $this->assertTrue(
            filter_var(SiteSetting::get('purchase_requests_recurring_lists_enabled'), FILTER_VALIDATE_BOOLEAN),
        );
        $this->assertNotNull(
            User::query()->where('is_active', true)->whereHas('role', fn ($q) => $q->whereIn('slug', ['owner', 'manager']))->first(),
        );

        $exit = $this->withoutMockingConsoleOutput()->artisan('purchase-requests:generate-recurring-lists');
        $output = Artisan::output();
        $this->assertSame(0, $exit, $output);
        $this->assertStringContainsString('Weekly staples', $output, $output);
        $this->assertGreaterThan(0, PurchaseRequest::where('source', 'recurring_list')->count(), $output);
        $this->assertTrue(
            RecurringShoppingList::find($listId)->next_run_date->gt(now()->startOfDay()),
        );
    }

    public function test_reconciliation_endpoint(): void
    {
        Sanctum::actingAs($this->manager, ['staff']);
        $this->getJson('/api/purchase-requests/reconciliation')
            ->assertOk()
            ->assertJsonStructure(['from', 'to', 'buyers', 'totals']);
    }

    public function test_phase2_settings_extend_auto_expense_endpoint(): void
    {
        Sanctum::actingAs($this->manager, ['staff']);
        $this->patchJson('/api/purchase-requests/settings/auto-expense', [
            'auto_on_low_stock' => true,
            'auto_approve_under_mvr' => 25,
            'show_price_hints' => false,
            'recurring_lists_enabled' => true,
        ])->assertOk()
            ->assertJsonPath('settings.auto_on_low_stock', true)
            ->assertJsonPath('settings.auto_approve_under_laar', 2500)
            ->assertJsonPath('settings.show_price_hints', false)
            ->assertJsonPath('settings.recurring_lists_enabled', true);
    }
}
