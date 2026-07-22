<?php

declare(strict_types=1);

namespace Tests\Feature\Procurement;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\InventoryItem;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\PurchaseRequestItemQuote;
use App\Models\Supplier;
use App\Models\SupplierPriceHistory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProcurementAnalyticsTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->manager = $this->makeManager(['email' => 'mgr-proc-an@test']);
        $this->staff = $this->makeStaff('staff', ['email' => 'staff-proc-an@test']);
    }

    public function test_procurement_report_requires_permission(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);
        $this->getJson('/api/reports/procurement')->assertForbidden();
    }

    public function test_spend_breakdowns_price_trend_and_savings(): void
    {
        $cat = ExpenseCategory::create(['name' => 'Kitchen', 'slug' => 'kitchen', 'icon' => '🍳']);
        $supplier = Supplier::create(['name' => 'Island Foods', 'is_active' => true]);
        $item = InventoryItem::create([
            'name' => 'Rice',
            'unit' => 'kg',
            'current_stock' => 10,
            'is_active' => true,
        ]);

        Expense::create([
            'expense_number' => 'EXP-P3-1',
            'expense_category_id' => $cat->id,
            'supplier_id' => $supplier->id,
            'user_id' => $this->manager->id,
            'description' => 'Rice buy',
            'amount' => 250,
            'amount_laar' => 25000,
            'expense_date' => now()->toDateString(),
            'status' => 'approved',
            'payment_method' => 'cash',
        ]);
        $this->assertSame(1, Expense::count());
        $this->assertSame(25000, (int) Expense::first()->amount_laar);

        SupplierPriceHistory::create([
            'supplier_id' => $supplier->id,
            'inventory_item_id' => $item->id,
            'unit_price' => 18.5,
            'unit' => 'kg',
            'recorded_at' => now()->subDays(2)->toDateString(),
        ]);
        SupplierPriceHistory::create([
            'supplier_id' => $supplier->id,
            'inventory_item_id' => $item->id,
            'unit_price' => 17.0,
            'unit' => 'kg',
            'recorded_at' => now()->toDateString(),
        ]);

        $pr = PurchaseRequest::create([
            'request_no' => 'PR-AN-1',
            'source' => 'admin',
            'status' => 'closed',
            'priority' => 'normal',
            'requested_by' => $this->manager->id,
            'assigned_to' => $this->staff->id,
            'total_actual_laar' => 3400,
        ]);
        $line = PurchaseRequestItem::create([
            'purchase_request_id' => $pr->id,
            'inventory_item_id' => $item->id,
            'requested_qty' => 2,
            'requested_unit' => 'kg',
            'actual_qty' => 2,
            'actual_unit_cost_laar' => 1700,
            'actual_total_laar' => 3400,
            'status' => 'received',
        ]);
        PurchaseRequestItemQuote::create([
            'purchase_request_item_id' => $line->id,
            'supplier_id' => $supplier->id,
            'unit_price_laar' => 1700,
            'unit' => 'kg',
            'quoted_by' => $this->staff->id,
            'selected_at' => now(),
            'savings_laar' => 300,
        ]);

        Sanctum::actingAs($this->manager, ['staff']);
        $response = $this->getJson('/api/reports/procurement?from=' . now()->subDays(7)->toDateString() . '&to=' . now()->toDateString())
            ->assertOk();
        $res = $response->json();
        $this->assertNotEmpty($res['spend_by_category'], json_encode($res));
        $this->assertSame('Kitchen', $res['spend_by_category'][0]['category']);
        $this->assertSame(25000, $res['spend_by_category'][0]['amount_laar']);
        $this->assertSame('Island Foods', $res['spend_by_supplier'][0]['supplier']);
        $this->assertSame($this->staff->id, $res['spend_by_buyer'][0]['buyer_id']);
        $this->assertSame(3400, $res['spend_by_buyer'][0]['bought_laar']);
        $this->assertNotEmpty($res['price_trend']);
        $this->assertSame(300, $res['savings']['total_savings_laar']);
        $this->assertSame(1, $res['savings']['quote_picks']);
    }

    public function test_rejects_oversized_date_range(): void
    {
        Sanctum::actingAs($this->manager, ['staff']);
        $this->getJson('/api/reports/procurement?from=' . now()->subDays(400)->toDateString() . '&to=' . now()->toDateString())
            ->assertStatus(422);
    }
}
