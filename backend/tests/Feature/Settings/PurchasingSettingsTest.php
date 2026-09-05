<?php

declare(strict_types=1);

namespace Tests\Feature\Settings;

use App\Domains\Finance\Services\NonStockPurchaseExpenseService;
use App\Domains\Inventory\Services\BackdatePolicy;
use App\Domains\Operations\Services\OpsAlertsService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\ExpenseCategory;
use App\Models\SiteSetting;
use App\Services\ExpenseBudgetService;
use App\Services\PurchaseRequestVerificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * One screen for every switch that governs buying.
 *
 * The important property is not that the endpoint stores values — it is that
 * each value lands in the key the relevant service already reads. Otherwise
 * the new screen would be a second set of switches wired to nothing, which is
 * worse than the four screens it replaces. So every write below is checked
 * through the service, not through the settings table.
 */
class PurchasingSettingsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
    }

    private function asOwner(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
    }

    public function test_it_returns_every_switch_with_its_default(): void
    {
        $this->asOwner();
        ExpenseCategory::create(['name' => 'Supplies', 'slug' => 'supplies', 'icon' => '📦']);

        $s = $this->getJson('/api/purchasing/settings')->assertOk()->json('settings');

        foreach ([
            'auto_request_on_low_stock', 'recurring_lists_enabled', 'auto_approve_under_mvr',
            'show_price_hints', 'backdate_max_days', 'stock_variance_reason_mvr',
            'auto_expense_on_verify', 'default_expense_category_id', 'auto_expense_non_stock_purchases',
            'enforce_expense_budgets', 'restock_include_waste', 'restock_high_waste_pct', 'reorder_alert_sms',
        ] as $key) {
            $this->assertArrayHasKey($key, $s, "Missing switch: {$key}");
        }
        // The defaults the services themselves use, so an untouched shop reads
        // the same on the new screen as it behaves.
        $this->assertFalse($s['auto_request_on_low_stock']);
        $this->assertTrue($s['show_price_hints']);
        $this->assertSame(BackdatePolicy::DEFAULT_MAX_DAYS, $s['backdate_max_days']);
        $this->assertEquals(15, $s['restock_high_waste_pct']);
        // Seeded categories already exist; the one created here must be among them.
        $this->assertContains('Supplies', array_column($s['expense_categories'], 'name'));
    }

    public function test_each_switch_lands_where_its_service_reads(): void
    {
        $this->asOwner();
        $category = ExpenseCategory::create(['name' => 'Kitchen', 'slug' => 'kitchen', 'icon' => '🍳']);

        $this->patchJson('/api/purchasing/settings', [
            'auto_request_on_low_stock' => true,
            'recurring_lists_enabled' => true,
            'auto_approve_under_mvr' => 250.50,
            'show_price_hints' => false,
            'backdate_max_days' => 14,
            'stock_variance_reason_mvr' => 120,
            'auto_expense_on_verify' => true,
            'default_expense_category_id' => $category->id,
            'auto_expense_non_stock_purchases' => true,
            'enforce_expense_budgets' => true,
            'restock_include_waste' => true,
            'restock_high_waste_pct' => 22.5,
            'reorder_alert_sms' => true,
        ])->assertOk();

        // Requests: the existing purchase-request settings reader.
        $pr = app(PurchaseRequestVerificationService::class)->autoExpenseSettings();
        $this->assertTrue($pr['auto_on_low_stock']);
        $this->assertTrue($pr['recurring_lists_enabled']);
        $this->assertSame(25050, $pr['auto_approve_under_laar']);
        $this->assertFalse($pr['show_price_hints']);
        $this->assertTrue($pr['auto_expense']);
        $this->assertSame($category->id, $pr['default_expense_category_id']);

        // Buying window.
        $this->assertSame(14, BackdatePolicy::maxDays());

        // Receiving.
        $this->assertSame('120', SiteSetting::get('stock_variance_reason_mvr'));

        // Costing.
        $this->assertTrue(app(NonStockPurchaseExpenseService::class)->enabled());
        $this->assertTrue(app(ExpenseBudgetService::class)->enforceEnabled());

        // Restocking.
        $this->assertSame('1', SiteSetting::get('restock_include_waste'));
        $this->assertSame('22.5', SiteSetting::get('restock_high_waste_pct'));
        $this->assertTrue(app(OpsAlertsService::class)->settings()['inventory_reorder_alert_sms']);
    }

    public function test_a_partial_update_leaves_the_rest_alone(): void
    {
        // Every switch saves on its own; flipping one must not reset another.
        $this->asOwner();
        SiteSetting::set('restock_high_waste_pct', '30');

        $this->patchJson('/api/purchasing/settings', ['show_price_hints' => false])->assertOk();

        $this->assertSame('30', SiteSetting::get('restock_high_waste_pct'));
    }

    public function test_out_of_range_values_are_refused(): void
    {
        $this->asOwner();

        $this->patchJson('/api/purchasing/settings', ['backdate_max_days' => 5000])
            ->assertStatus(422)->assertJsonValidationErrors(['backdate_max_days']);
        $this->patchJson('/api/purchasing/settings', ['restock_high_waste_pct' => 101])
            ->assertStatus(422)->assertJsonValidationErrors(['restock_high_waste_pct']);
        $this->patchJson('/api/purchasing/settings', ['default_expense_category_id' => 999999])
            ->assertStatus(422)->assertJsonValidationErrors(['default_expense_category_id']);
    }

    public function test_a_manager_with_settings_update_can_change_them(): void
    {
        Sanctum::actingAs($this->makeManager(), ['staff']);

        $this->patchJson('/api/purchasing/settings', ['backdate_max_days' => 30])->assertOk();
        $this->assertSame(30, BackdatePolicy::maxDays());
    }

    public function test_a_cashier_cannot_see_or_change_them(): void
    {
        Sanctum::actingAs($this->makeStaff('staff'), ['staff']);

        $this->getJson('/api/purchasing/settings')->assertForbidden();
        $this->patchJson('/api/purchasing/settings', ['auto_expense_on_verify' => true])->assertForbidden();
    }
}
