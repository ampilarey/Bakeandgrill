<?php

declare(strict_types=1);

namespace Tests\Feature\Gst;

use App\Domains\Gst\Enums\GstTaxCode;
use App\Domains\Gst\Services\GstLedgerPoster;
use App\Domains\Gst\Services\GstPeriodService;
use App\Domains\Gst\Services\GstSettingsService;
use App\Domains\Gst\Services\GstTaxCalculator;
use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Orders\DTOs\OrderPaidData;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\GstPeriodLock;
use App\Models\GstSetting;
use App\Models\Item;
use App\Models\Order;
use App\Models\Role;
use App\Models\TaxLedgerEntry;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class GstModuleTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->owner = $this->makeOwner(['email' => 'owner@gst.test']);
    }

    public function test_bootstrap_returns_general_sector_8_percent(): void
    {
        $this->getJson('/api/gst/bootstrap')
            ->assertOk()
            ->assertJsonPath('default_tax_rate_bp', 800)
            ->assertJsonPath('tax_rate_percent', 8)
            ->assertJsonPath('sector', 'general');
    }

    public function test_settings_default_hybrid_accounting_basis(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $this->getJson('/api/admin/gst/settings')
            ->assertOk()
            ->assertJsonPath('settings.accounting_basis', 'hybrid')
            ->assertJsonPath('settings.default_tax_rate_bp', 800)
            ->assertJsonPath('settings.sector', 'general');
    }

    public function test_admin_can_change_accounting_basis(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $this->putJson('/api/admin/gst/settings', [
            'accounting_basis' => 'payment',
        ])->assertOk()
            ->assertJsonPath('settings.accounting_basis', 'payment');
    }

    public function test_tax_calculator_uses_integer_laar_for_8_percent(): void
    {
        $calc = app(GstTaxCalculator::class);
        $taxLaar = $calc->calculateLineTaxLaar(10000, GstTaxCode::Standard8->value, false);

        $this->assertSame(800, $taxLaar);
    }

    public function test_zero_rated_item_charges_no_gst(): void
    {
        $calc = app(GstTaxCalculator::class);
        $taxLaar = $calc->calculateLineTaxLaar(10000, GstTaxCode::ZeroRated->value, false);

        $this->assertSame(0, $taxLaar);
    }

    public function test_paid_order_posts_output_ledger_entry(): void
    {
        $category = Category::create(['name' => 'GST Food', 'slug' => 'gst-food', 'is_active' => true]);
        Item::create([
            'category_id' => $category->id,
            'name' => 'Coffee',
            'base_price' => 10,
            'tax_rate' => 8,
            'tax_code' => 'standard_8',
            'sku' => 'GST-COFFEE',
            'is_active' => true,
            'is_available' => true,
        ]);

        $order = Order::factory()->create([
            'status' => 'completed',
            'payment_status' => 'paid',
            'paid_at' => now(),
            'subtotal_laar' => 10000,
            'tax_laar' => 800,
            'total_laar' => 10800,
            'subtotal' => 100,
            'tax_amount' => 8,
            'total' => 108,
            'tax_rate_bp' => 800,
        ]);

        app(GstLedgerPoster::class)->postOrderOnPayment($order);

        $this->assertDatabaseHas('tax_ledger_entries', [
            'source_type' => 'order',
            'source_id' => $order->id,
            'direction' => 'output',
            'tax_laar' => 800,
        ]);
    }

    public function test_tax_invoice_to_gst_customer_appears_in_output_statement(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $customer = Customer::create([
            'name' => 'B2B Corp',
            'phone' => '9607700000',
            'tin' => 'TIN123456',
            'is_gst_registered' => true,
        ]);

        $period = now()->format('Y-m');
        TaxLedgerEntry::create([
            'period_key' => $period,
            'source_type' => 'invoice',
            'source_id' => 1,
            'direction' => 'output',
            'tax_code' => 'standard_8',
            'customer_id' => $customer->id,
            'customer_tin' => 'TIN123456',
            'document_no' => 'BG-TI-2026-00001',
            'document_date' => now()->toDateString(),
            'taxable_value_laar' => 10000,
            'tax_laar' => 800,
            'total_laar' => 10800,
            'rate_bp' => 800,
            'is_tax_invoice' => true,
            'is_claimable' => false,
        ]);

        $response = $this->getJson("/api/reports/finance/gst/output-statement?period={$period}")
            ->assertOk();

        $this->assertCount(1, $response->json('tax_invoices'));
        $this->assertSame('TIN123456', $response->json('tax_invoices.0.customer_tin'));
    }

    public function test_pos_order_without_tax_invoice_in_other_transactions(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $period = now()->format('Y-m');

        TaxLedgerEntry::create([
            'period_key' => $period,
            'source_type' => 'order',
            'source_id' => 99,
            'direction' => 'output',
            'tax_code' => 'standard_8',
            'document_no' => 'ORD-99',
            'document_date' => now()->toDateString(),
            'taxable_value_laar' => 5000,
            'tax_laar' => 400,
            'total_laar' => 5400,
            'rate_bp' => 800,
            'is_tax_invoice' => false,
            'is_claimable' => false,
        ]);

        $response = $this->getJson("/api/reports/finance/gst/output-statement?period={$period}")
            ->assertOk();

        $this->assertSame(5000, $response->json('other_transactions.0.standard_8_laar'));
    }

    public function test_locked_period_redirects_posting_to_next_open(): void
    {
        $period = now()->format('Y-m');
        GstPeriodLock::create([
            'period_key' => $period,
            'locked_at' => now(),
            'locked_by' => $this->owner->id,
            'carry_forward_input_laar' => 0,
        ]);

        $next = app(GstPeriodService::class)->nextOpenPeriodKey($period);
        $this->assertNotSame($period, $next);
    }

    public function test_legacy_tax_report_includes_by_rate_for_reports_page(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $from = now()->startOfMonth()->toDateString();
        $to = now()->endOfMonth()->toDateString();

        $this->getJson("/api/reports/finance/tax?from={$from}&to={$to}")
            ->assertOk()
            ->assertJsonStructure(['total_tax_collected', 'by_rate', 'output_tax', 'net_tax_payable']);
    }

    public function test_item_save_syncs_tax_rate_from_settings(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $category = Category::create(['name' => 'Menu', 'slug' => 'gst-menu', 'is_active' => true]);

        $response = $this->postJson('/api/items', [
            'category_id' => $category->id,
            'name' => 'GST Burger',
            'base_price' => 50,
            'tax_code' => 'standard_8',
            'is_active' => true,
        ])->assertCreated();

        $itemId = $response->json('item.id');
        $this->assertEquals(8.0, (float) Item::find($itemId)->tax_rate);
    }

    public function test_claimable_expense_posts_input_ledger(): void
    {
        $category = ExpenseCategory::create([
            'name' => 'Supplies',
            'slug' => 'supplies',
            'icon' => '📦',
        ]);

        $expense = Expense::create([
            'expense_number' => 'EXP-GST-1',
            'expense_category_id' => $category->id,
            'user_id' => $this->owner->id,
            'description' => 'GST supplies',
            'amount' => 108,
            'amount_laar' => 10800,
            'amount_excluding_gst_laar' => 10000,
            'tax_laar' => 800,
            'gst_rate_bp' => 800,
            'supplier_tin' => 'TIN-SUP-1',
            'supplier_invoice_no' => 'SI-100',
            'supplier_invoice_date' => now()->toDateString(),
            'is_input_tax_claimable' => true,
            'revenue_or_capital' => 'revenue',
            'expense_date' => now()->toDateString(),
            'status' => 'approved',
            'approved_by' => $this->owner->id,
        ]);

        app(GstLedgerPoster::class)->postExpenseInput($expense);

        $this->assertDatabaseHas('tax_ledger_entries', [
            'source_type' => 'expense',
            'source_id' => $expense->id,
            'direction' => 'input',
            'tax_laar' => 800,
            'is_claimable' => true,
        ]);
    }

    public function test_output_xlsx_export_returns_spreadsheet(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $period = now()->format('Y-m');

        GstSetting::query()->updateOrCreate(['id' => 1], [
            'seller_tin' => 'TIN-TEST-001',
            'taxable_activity_no' => 'TA-001',
            'seller_name' => 'Bake & Grill Test',
        ]);
        app(GstSettingsService::class)->bust();

        $response = $this->get("/api/reports/finance/gst/export/output-statement.xlsx?period={$period}");

        $response->assertOk();
        $this->assertStringContainsString(
            'spreadsheet',
            (string) $response->headers->get('content-type'),
        );
    }
}
