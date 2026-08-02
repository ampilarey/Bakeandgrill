<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Domains\Gst\Services\GstLedgerPoster;
use App\Domains\Gst\Services\GstReportService;
use App\Domains\Gst\Services\GstSettingsService;
use App\Domains\Orders\Services\OrderTotalsCalculator;
use App\Domains\Orders\Services\ServiceChargeCalculator;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Reporting\Services\ReportsService;
use App\Models\Category;
use App\Models\Device;
use App\Models\GstSetting;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ServiceChargeTest extends TestCase
{
    use RefreshDatabase;

    private User $staffUser;
    private User $owner;
    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $category = Category::create(['name' => 'Food', 'slug' => 'sc-food', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'SC Test Item',
            'base_price' => 100.0,
            'sku' => 'SC-001',
            'is_active' => true,
            'is_available' => true,
            'tax_rate' => 8,
            'tax_code' => 'standard_8',
        ]);

        PermissionCatalogSync::sync();
        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        $this->staffUser = User::create([
            'name' => 'Cashier',
            'email' => 'cashier@sc.test',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        $this->owner = $this->makeOwner(['email' => 'owner@sc.test']);
        Device::create(['name' => 'SC POS', 'identifier' => 'SC-POS', 'type' => 'pos', 'is_active' => true]);
    }

    private function configureServiceCharge(array $overrides = []): void
    {
        $defaults = [
            'enabled' => true,
            'type' => 'percent',
            'value' => '10',
            'label' => 'Service charge',
            'apply_dine_in' => true,
            'apply_takeaway' => false,
            'apply_online_pickup' => false,
            'apply_delivery' => false,
            'taxable' => true,
            'show_on_receipts' => true,
        ];
        $cfg = array_merge($defaults, $overrides);
        SiteSetting::set('service_charge_enabled', ($cfg['enabled'] ?? false) ? '1' : '0');
        SiteSetting::set('service_charge_type', (string) ($cfg['type'] ?? 'percent'));
        SiteSetting::set('service_charge_value', (string) ($cfg['value'] ?? '0'));
        SiteSetting::set('service_charge_label', (string) ($cfg['label'] ?? 'Service charge'));
        SiteSetting::set('service_charge_apply_dine_in', ($cfg['apply_dine_in'] ?? false) ? '1' : '0');
        SiteSetting::set('service_charge_apply_takeaway', ($cfg['apply_takeaway'] ?? false) ? '1' : '0');
        SiteSetting::set('service_charge_apply_online_pickup', ($cfg['apply_online_pickup'] ?? false) ? '1' : '0');
        SiteSetting::set('service_charge_apply_delivery', ($cfg['apply_delivery'] ?? false) ? '1' : '0');
        SiteSetting::set('service_charge_taxable', ($cfg['taxable'] ?? true) ? '1' : '0');
        SiteSetting::set('show_service_charge_on_receipts', ($cfg['show_on_receipts'] ?? true) ? '1' : '0');
        SiteSetting::bust();
    }

    private function createStaffOrder(string $type = 'dine_in', int $qty = 1, array $extra = []): Order
    {
        Sanctum::actingAs($this->staffUser, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();

        $payload = array_merge([
            'type' => $type,
            'print' => false,
            'items' => [['item_id' => $this->item->id, 'quantity' => $qty]],
        ], $extra);

        $response = $this->withHeader('X-Device-Identifier', 'SC-POS')
            ->postJson('/api/orders', $payload)
            ->assertCreated();

        return Order::findOrFail($response->json('order.id'));
    }

    private function createDeliveryOrderWithItems(int $deliveryFeeLaar = 0): Order
    {
        $order = Order::factory()->delivery()->create([
            'status' => 'pending',
            'delivery_fee_laar' => $deliveryFeeLaar,
            'delivery_fee' => round($deliveryFeeLaar / 100, 2),
        ]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => $this->item->id,
            'item_name' => $this->item->name,
            'quantity' => 1,
            'unit_price' => 100,
            'total_price' => 100,
            'tax_rate' => 8,
        ]);
        app(OrderTotalsCalculator::class)->recalculateAndPersist($order->fresh());

        return $order->fresh();
    }

    public function test_disabled_service_charge_is_zero_on_dine_in_order(): void
    {
        $this->configureServiceCharge(['enabled' => false]);
        $order = $this->createStaffOrder('dine_in');

        $this->assertFalse((bool) $order->service_charge_enabled);
        $this->assertSame(0, (int) $order->service_charge_amount_laar);
    }

    public function test_ten_percent_dine_in_applies_to_discounted_subtotal(): void
    {
        $this->configureServiceCharge(['enabled' => true, 'value' => '10', 'apply_dine_in' => true]);
        $order = $this->createStaffOrder('dine_in');

        $this->assertTrue((bool) $order->service_charge_enabled);
        $this->assertSame(1000, (int) $order->service_charge_amount_laar);
        $this->assertSame('dine_in', $order->service_charge_applied_to);
    }

    public function test_service_charge_uses_discounted_subtotal(): void
    {
        $this->configureServiceCharge(['enabled' => true, 'value' => '10', 'apply_dine_in' => true]);
        $order = $this->createStaffOrder('dine_in');
        $order->update(['manual_discount_laar' => 1000]);
        app(OrderTotalsCalculator::class)->recalculateAndPersist($order->fresh());

        $order->refresh();
        $this->assertSame(900, (int) $order->service_charge_amount_laar);
    }

    public function test_takeaway_not_charged_when_only_dine_in_enabled(): void
    {
        $this->configureServiceCharge(['apply_dine_in' => true, 'apply_takeaway' => false]);
        $order = $this->createStaffOrder('takeaway');

        $this->assertSame(0, (int) $order->service_charge_amount_laar);
    }

    public function test_delivery_order_type_eligibility(): void
    {
        $this->configureServiceCharge([
            'apply_dine_in' => false,
            'apply_delivery' => true,
            'value' => '15',
        ]);

        $order = $this->createDeliveryOrderWithItems();
        $this->assertSame(1500, (int) $order->service_charge_amount_laar);
    }

    public function test_delivery_fee_is_separate_from_service_charge_base(): void
    {
        $this->configureServiceCharge(['apply_delivery' => true, 'value' => '10']);
        $order = $this->createDeliveryOrderWithItems(2000);

        $this->assertSame(1000, (int) $order->service_charge_amount_laar);
        $this->assertSame(2000, (int) $order->delivery_fee_laar);
        $this->assertGreaterThan(12000, (int) $order->total_laar);
    }

    public function test_fixed_amount_service_charge(): void
    {
        $this->configureServiceCharge(['type' => 'fixed', 'value' => '15', 'apply_dine_in' => true]);
        $order = $this->createStaffOrder('dine_in');

        $this->assertSame('fixed', $order->service_charge_type);
        $this->assertSame(1500, (int) $order->service_charge_amount_laar);
    }

    public function test_paid_order_keeps_service_charge_snapshot_when_settings_change(): void
    {
        $this->configureServiceCharge(['value' => '10', 'apply_dine_in' => true]);
        $order = $this->createStaffOrder('dine_in');
        $originalSc = (int) $order->service_charge_amount_laar;

        Sanctum::actingAs($this->staffUser, ['staff']);
        $this->postJson("/api/orders/{$order->id}/payments", [
            'payments' => [['method' => 'cash', 'amount' => (float) $order->total]],
            'print_receipt' => false,
        ])->assertOk();

        $this->configureServiceCharge(['value' => '25']);
        app(OrderTotalsCalculator::class)->recalculateAndPersist($order->fresh());

        $order->refresh();
        $this->assertSame($originalSc, (int) $order->service_charge_amount_laar);
    }

    public function test_open_order_recalculates_when_settings_change(): void
    {
        $this->configureServiceCharge(['value' => '10', 'apply_dine_in' => true]);
        $order = $this->createStaffOrder('dine_in');

        $this->configureServiceCharge(['value' => '20']);
        app(OrderTotalsCalculator::class)->recalculateAndPersist($order->fresh());

        $order->refresh();
        $this->assertSame(2000, (int) $order->service_charge_amount_laar);
    }

    public function test_create_order_ignores_client_service_charge_spoof(): void
    {
        $this->configureServiceCharge(['value' => '10', 'apply_dine_in' => true]);
        Sanctum::actingAs($this->staffUser, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();
        $response = $this->withHeader('X-Device-Identifier', 'SC-POS')
            ->postJson('/api/orders', [
                'type' => 'dine_in',
                'print' => false,
                'service_charge_amount' => 999,
                'service_charge_amount_laar' => 99999,
                'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
            ])
            ->assertCreated();

        $order = Order::findOrFail($response->json('order.id'));
        $this->assertSame(1000, (int) $order->service_charge_amount_laar);
    }

    public function test_order_show_includes_service_charge_fields(): void
    {
        $this->configureServiceCharge(['value' => '10', 'apply_dine_in' => true]);
        $order = $this->createStaffOrder('dine_in');

        Sanctum::actingAs($this->staffUser, ['staff']);
        $this->getJson("/api/orders/{$order->id}")
            ->assertOk()
            ->assertJsonPath('order.service_charge_amount_laar', 1000)
            ->assertJsonPath('order.service_charge_enabled', true);
    }

    public function test_sales_summary_includes_service_charge_total(): void
    {
        $this->configureServiceCharge(['value' => '10', 'apply_dine_in' => true]);
        $order = $this->createStaffOrder('dine_in');
        $this->assertSame(10.0, (float) $order->service_charge_amount);
        Order::whereKey($order->id)->update([
            'status' => 'completed',
            'completed_at' => now(),
        ]);

        $summary = app(ReportsService::class)->salesSummary(now()->startOfDay(), now()->endOfDay());
        $this->assertSame(1, $summary['totals']['orders_count']);
        $this->assertSame(10.0, $summary['totals']['service_charge_total']);
    }

    public function test_settings_validation_rejects_percent_over_100(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $this->putJson('/api/admin/settings/service-charge', [
            'enabled' => true,
            'label' => 'Service charge',
            'type' => 'percent',
            'value' => 150,
            'apply_dine_in' => true,
            'apply_takeaway' => false,
            'apply_online_pickup' => false,
            'apply_delivery' => false,
            'taxable' => true,
            'show_on_receipts' => true,
        ])->assertStatus(422);
    }

    public function test_settings_update_requires_permission(): void
    {
        Sanctum::actingAs($this->staffUser, ['staff']);
        $this->putJson('/api/admin/settings/service-charge', [
            'enabled' => false,
            'label' => 'Service charge',
            'type' => 'percent',
            'value' => 10,
            'apply_dine_in' => true,
            'apply_takeaway' => false,
            'apply_online_pickup' => false,
            'apply_delivery' => false,
            'taxable' => true,
            'show_on_receipts' => true,
        ])->assertStatus(403);
    }

    public function test_owner_can_read_and_update_service_charge_settings(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $this->getJson('/api/admin/settings/service-charge')->assertOk();

        $this->putJson('/api/admin/settings/service-charge', [
            'enabled' => true,
            'label' => 'SC',
            'type' => 'percent',
            'value' => 12,
            'apply_dine_in' => true,
            'apply_takeaway' => true,
            'apply_online_pickup' => false,
            'apply_delivery' => false,
            'taxable' => true,
            'show_on_receipts' => true,
        ])->assertOk()
            ->assertJsonPath('settings.value', 12);
    }

    public function test_current_settings_defaults_match_calculate_engine(): void
    {
        // Seeded migration values aside — when keys are absent, defaults must
        // match calculate() (0 / false), not invent a 10% dine-in charge.
        SiteSetting::query()->where('key', 'like', 'service_charge%')->delete();
        SiteSetting::query()->where('key', 'show_service_charge_on_receipts')->delete();
        SiteSetting::bust();

        $settings = app(ServiceChargeCalculator::class)->currentSettings();
        $this->assertSame(0.0, (float) $settings['value']);
        $this->assertFalse((bool) $settings['apply_dine_in']);
        $this->assertFalse((bool) $settings['enabled']);
    }

    private function configureGst(bool $taxInclusive): void
    {
        GstSetting::query()->updateOrCreate(['id' => 1], [
            'gst_registered' => true,
            'default_tax_rate_bp' => 800,
            'tax_inclusive' => $taxInclusive,
            'currency' => 'MVR',
            'sector' => 'general',
            // Hybrid so GstLedgerPoster::postOrderOnPayment will write output tax.
            'accounting_basis' => 'hybrid',
            'seller_tin' => 'TIN-SC-TEST',
            'taxable_activity_no' => 'TA-SC-001',
            'seller_name' => 'SC Test Seller',
        ]);
        app(GstSettingsService::class)->bust();
    }

    public function test_inclusive_taxable_service_charge_adds_gst_to_tax_laar_not_total(): void
    {
        $this->configureGst(true);
        $this->configureServiceCharge([
            'enabled' => true,
            'value' => '10',
            'apply_dine_in' => true,
            'taxable' => true,
        ]);

        $order = $this->createStaffOrder('dine_in');
        $order->refresh();

        $merchTax = (int) round(10000 * 800 / 10800); // 741
        $scTax = (int) round(1000 * 800 / 10800); // 74
        // Before fix: tax_laar was merch-only (741). After: includes SC GST.
        $this->assertSame(1000, (int) $order->service_charge_amount_laar);
        $this->assertSame($merchTax + $scTax, (int) $order->tax_laar);
        // Customer total unchanged — tax is embedded, not added on top.
        $this->assertSame(10000 + 1000, (int) $order->total_laar);
    }

    public function test_inclusive_non_taxable_service_charge_excludes_sc_from_tax_laar(): void
    {
        $this->configureGst(true);
        $this->configureServiceCharge([
            'enabled' => true,
            'value' => '10',
            'apply_dine_in' => true,
            'taxable' => false,
        ]);

        $order = $this->createStaffOrder('dine_in');
        $order->refresh();

        $merchTax = (int) round(10000 * 800 / 10800);
        $this->assertSame(1000, (int) $order->service_charge_amount_laar);
        $this->assertSame($merchTax, (int) $order->tax_laar);
        $this->assertSame(10000 + 1000, (int) $order->total_laar);
    }

    public function test_exclusive_taxable_service_charge_still_adds_sc_tax_to_total(): void
    {
        $this->configureGst(false);
        $this->configureServiceCharge([
            'enabled' => true,
            'value' => '10',
            'apply_dine_in' => true,
            'taxable' => true,
        ]);

        $order = $this->createStaffOrder('dine_in');
        $order->refresh();

        // Merch 800 + SC 80 = 880; total = 100 + 10 + 8.80
        $this->assertSame(1000, (int) $order->service_charge_amount_laar);
        $this->assertSame(880, (int) $order->tax_laar);
        $this->assertSame(10000 + 1000 + 880, (int) $order->total_laar);
    }

    public function test_gst_report_output_tax_includes_inclusive_service_charge_gst(): void
    {
        $this->configureGst(true);
        $this->configureServiceCharge([
            'enabled' => true,
            'value' => '10',
            'apply_dine_in' => true,
            'taxable' => true,
        ]);

        $order = $this->createStaffOrder('dine_in');
        $order->refresh();
        $expectedTaxLaar = (int) $order->tax_laar;
        $merchTax = (int) round(10000 * 800 / 10800);
        $scTax = (int) round(1000 * 800 / 10800);
        $this->assertSame($merchTax + $scTax, $expectedTaxLaar);

        // Query builder — Eloquent $order->update() can bounce status in this suite.
        Order::whereKey($order->id)->update([
            'status' => 'completed',
            'payment_status' => 'paid',
            'paid_at' => now(),
        ]);
        $entry = app(GstLedgerPoster::class)->postOrderOnPayment($order->fresh());
        $this->assertNotNull($entry, 'Expected GST ledger output entry for paid order');
        $this->assertSame($expectedTaxLaar, (int) $entry->tax_laar);

        $summary = app(GstReportService::class)->summary(now()->format('Y-m'));
        $this->assertSame($expectedTaxLaar, (int) $summary['gst_on_standard_sales_laar']);
        $this->assertSame($expectedTaxLaar, (int) $summary['output_tax_before_adjustments_laar']);
        $this->assertGreaterThan($merchTax, (int) $summary['gst_on_standard_sales_laar']);
    }

    /**
     * Pin backend SC tax to the same multi-line numbers as
     * posCartTotals "multi-line SC tax matches backend grouped buckets".
     * Lines 33.33+33.33+33.34+20+15 = 135.00; SC 10% = 1350 laar.
     * Grouped (by tax code) SC tax: exclusive 108, inclusive 100.
     */
    public function test_multi_line_service_charge_tax_matches_grouped_frontend_parity(): void
    {
        $prices = [33.33, 33.33, 33.34, 20.0, 15.0];
        $lineLaars = array_map(fn (float $p): int => (int) round($p * 100), $prices);
        $this->assertSame([3333, 3333, 3334, 2000, 1500], $lineLaars);

        $this->configureServiceCharge([
            'enabled' => true,
            'value' => '10',
            'apply_dine_in' => true,
            'taxable' => true,
        ]);

        foreach ([false, true] as $inclusive) {
            $this->configureGst($inclusive);

            $order = Order::factory()->create([
                'type' => 'dine_in',
                'status' => 'pending',
            ]);
            foreach ($prices as $i => $price) {
                OrderItem::create([
                    'order_id' => $order->id,
                    'item_id' => $this->item->id,
                    'item_name' => $this->item->name.' '.$i,
                    'quantity' => 1,
                    'unit_price' => $price,
                    'total_price' => $price,
                    'tax_rate' => 8,
                    'tax_code' => 'standard_8',
                ]);
            }

            app(OrderTotalsCalculator::class)->recalculateAndPersist($order->fresh());
            $order->refresh();

            $this->assertSame(13500, (int) $order->subtotal_laar);
            $this->assertSame(1350, (int) $order->service_charge_amount_laar);

            if ($inclusive) {
                $merchTax = 1000;
                $scTax = 100;
                $this->assertSame($merchTax + $scTax, (int) $order->tax_laar);
                $this->assertSame(13500 + 1350, (int) $order->total_laar);
            } else {
                $merchTax = 1081;
                $scTax = 108;
                $this->assertSame($merchTax + $scTax, (int) $order->tax_laar);
                $this->assertSame(13500 + 1350 + $merchTax + $scTax, (int) $order->total_laar);
            }
        }
    }
}
