<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Domains\Orders\Services\OrderTotalsCalculator;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Reporting\Services\ReportsService;
use App\Models\Category;
use App\Models\Device;
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
}
