<?php

declare(strict_types=1);

namespace Tests\Feature\Procurement;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\InventoryItem;
use App\Models\PurchaseRequest;
use App\Models\SiteSetting;
use App\Models\User;
use App\Services\PurchaseRequestVerificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AutoExpenseOnVerifyTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;

    private User $cashier;

    private InventoryItem $inventoryItem;

    private ExpenseCategory $supplies;

    private ExpenseCategory $ops;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();

        $this->manager = $this->makeManager(['email' => 'mgr-auto-exp@pr.test']);
        $this->cashier = $this->makeStaff('staff', ['email' => 'cashier-auto-exp@pr.test']);
        $this->supplies = ExpenseCategory::create(['name' => 'Supplies', 'slug' => 'supplies', 'icon' => '📦']);
        $this->ops = ExpenseCategory::create(['name' => 'Ops', 'slug' => 'ops', 'icon' => '⚙️']);

        $this->inventoryItem = InventoryItem::create([
            'name' => 'Flour',
            'sku' => 'FLR-AUTO',
            'unit' => 'kg',
            'current_stock' => 10,
            'unit_cost' => 5.0,
            'is_active' => true,
        ]);
    }

    private function createBoughtRequest(): array
    {
        Sanctum::actingAs($this->cashier, ['staff']);
        $id = $this->postJson('/api/purchase-requests', [
            'source' => 'pos',
            'priority' => 'normal',
            'items' => [[
                'free_text_name' => 'Flour bag',
                'inventory_item_id' => $this->inventoryItem->id,
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
        ])->assertOk();

        return [(int) $id, (int) $itemId];
    }

    public function test_auto_expense_off_by_default_on_verify(): void
    {
        [$id, $itemId] = $this->createBoughtRequest();
        $before = Expense::count();

        Sanctum::actingAs($this->manager, ['staff']);
        $this->postJson("/api/purchase-requests/{$id}/items/{$itemId}/verify-received")->assertOk();

        $this->assertSame($before, Expense::count());
        $this->assertNull(PurchaseRequest::find($id)->expense_id);
        $this->assertFalse(
            filter_var(SiteSetting::get(PurchaseRequestVerificationService::AUTO_EXPENSE_SETTING, '0'), FILTER_VALIDATE_BOOLEAN),
        );
    }

    public function test_auto_expense_creates_pending_expense_on_verify(): void
    {
        SiteSetting::set(PurchaseRequestVerificationService::AUTO_EXPENSE_SETTING, '1');
        SiteSetting::set(PurchaseRequestVerificationService::DEFAULT_CATEGORY_SETTING, (string) $this->ops->id);

        [$id, $itemId] = $this->createBoughtRequest();

        Sanctum::actingAs($this->manager, ['staff']);
        $this->postJson("/api/purchase-requests/{$id}/items/{$itemId}/verify-received")
            ->assertOk()
            ->assertJsonPath('request.expense.expense_number', 'EXP-PR-' . PurchaseRequest::find($id)->request_no);

        $pr = PurchaseRequest::findOrFail($id);
        $this->assertNotNull($pr->expense_id);
        $this->assertDatabaseHas('expenses', [
            'id' => $pr->expense_id,
            'status' => 'pending',
            'expense_category_id' => $this->ops->id,
            'amount_laar' => 1000,
        ]);
        $this->assertSame(1, Expense::count());
    }

    public function test_auto_expense_never_doubles_or_auto_posts(): void
    {
        SiteSetting::set(PurchaseRequestVerificationService::AUTO_EXPENSE_SETTING, '1');
        [$id, $itemId] = $this->createBoughtRequest();

        Sanctum::actingAs($this->manager, ['staff']);
        $this->postJson("/api/purchase-requests/{$id}/items/{$itemId}/verify-received")->assertOk();
        $expenseId = PurchaseRequest::findOrFail($id)->expense_id;

        $this->postJson("/api/purchase-requests/{$id}/convert-to-expense")
            ->assertOk()
            ->assertJsonPath('expense.id', $expenseId);

        $this->postJson("/api/purchase-requests/{$id}/verify-all")->assertStatus(422);

        $this->assertSame(1, Expense::count());
        $this->assertSame('pending', Expense::findOrFail($expenseId)->status);
    }

    public function test_settings_endpoint_toggles_auto_expense_and_category(): void
    {
        Sanctum::actingAs($this->manager, ['staff']);

        $this->getJson('/api/purchase-requests/settings/auto-expense')
            ->assertOk()
            ->assertJsonPath('settings.auto_expense', false)
            ->assertJsonPath('settings.default_expense_category_id', null)
            ->assertJsonPath('settings.auto_on_low_stock', false);

        $this->patchJson('/api/purchase-requests/settings/auto-expense', [
            'auto_expense' => true,
            'default_expense_category_id' => $this->ops->id,
        ])
            ->assertOk()
            ->assertJsonPath('settings.auto_expense', true)
            ->assertJsonPath('settings.default_expense_category_id', $this->ops->id);

        $this->assertTrue(
            filter_var(SiteSetting::get(PurchaseRequestVerificationService::AUTO_EXPENSE_SETTING), FILTER_VALIDATE_BOOLEAN),
        );
        $this->assertSame(
            (string) $this->ops->id,
            (string) SiteSetting::get(PurchaseRequestVerificationService::DEFAULT_CATEGORY_SETTING),
        );
    }

    public function test_verify_all_auto_expenses_when_enabled(): void
    {
        SiteSetting::set(PurchaseRequestVerificationService::AUTO_EXPENSE_SETTING, '1');
        [$id] = $this->createBoughtRequest();

        Sanctum::actingAs($this->manager, ['staff']);
        $this->postJson("/api/purchase-requests/{$id}/verify-all")
            ->assertOk()
            ->assertJsonPath('request.status', 'closed');

        $pr = PurchaseRequest::findOrFail($id);
        $this->assertNotNull($pr->expense_id);
        $this->assertSame('pending', Expense::findOrFail($pr->expense_id)->status);
        $this->assertSame(1, Expense::count());
    }
}
