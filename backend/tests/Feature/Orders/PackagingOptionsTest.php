<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Domains\Gst\Services\GstSettingsService;
use App\Domains\Orders\Services\OrderTotalsCalculator;
use App\Domains\Orders\Services\PackagingFeeCalculator;
use App\Domains\Orders\Services\PackagingOptionResolver;
use App\Models\GstSetting;
use App\Models\Item;
use App\Models\ItemPackagingOption;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PackagingOptionsTest extends TestCase
{
    use RefreshDatabase;

    public function test_resolver_uses_explicit_option_default_and_legacy_fallback(): void
    {
        $item = Item::factory()->create([
            'packaging_fee' => 3,
            'packaging_fee_mode' => 'per_unit',
        ]);
        $regular = ItemPackagingOption::create([
            'item_id' => $item->id,
            'name' => 'Regular',
            'fee' => 2,
            'is_default' => true,
            'is_active' => true,
            'sort_order' => 0,
        ]);
        $premium = ItemPackagingOption::create([
            'item_id' => $item->id,
            'name' => 'Premium',
            'fee' => 5,
            'is_default' => false,
            'is_active' => true,
            'sort_order' => 1,
        ]);

        $resolver = app(PackagingOptionResolver::class);
        $explicit = $resolver->resolve($item->fresh(['packagingOptions']), $premium->id);
        $this->assertSame($premium->id, $explicit['packaging_option_id']);
        $this->assertSame(5.0, $explicit['packaging_fee']);

        $fallback = $resolver->resolve($item->fresh(['packagingOptions']), null);
        $this->assertSame($regular->id, $fallback['packaging_option_id']);
        $this->assertSame(2.0, $fallback['packaging_fee']);

        $legacyItem = Item::factory()->create(['packaging_fee' => 4.5]);
        $legacy = $resolver->resolve($legacyItem->fresh(['packagingOptions']), null);
        $this->assertNull($legacy['packaging_option_id']);
        $this->assertSame(4.5, $legacy['packaging_fee']);
    }

    public function test_resolver_rejects_foreign_or_inactive_option(): void
    {
        $a = Item::factory()->create();
        $b = Item::factory()->create();
        $optB = ItemPackagingOption::create([
            'item_id' => $b->id,
            'name' => 'Box',
            'fee' => 1,
            'is_default' => true,
            'is_active' => true,
            'sort_order' => 0,
        ]);
        $inactive = ItemPackagingOption::create([
            'item_id' => $a->id,
            'name' => 'Old',
            'fee' => 1,
            'is_default' => true,
            'is_active' => false,
            'sort_order' => 0,
        ]);

        $resolver = app(PackagingOptionResolver::class);
        try {
            $resolver->resolve($a->fresh(['packagingOptions']), $optB->id);
            $this->fail('Expected 422 for foreign option');
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
        }

        try {
            $resolver->resolve($a->fresh(['packagingOptions']), $inactive->id);
            $this->fail('Expected 422 for inactive option');
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
        }
    }

    public function test_per_line_vs_per_unit_qty_math(): void
    {
        $calc = app(PackagingFeeCalculator::class);
        $item = Item::factory()->create(['packaging_fee_mode' => 'per_line']);
        $opt = ItemPackagingOption::create([
            'item_id' => $item->id,
            'name' => 'Box',
            'fee' => 10,
            'is_default' => true,
            'is_active' => true,
            'sort_order' => 0,
        ]);

        foreach ([1, 2, 3] as $qty) {
            $this->assertSame(
                1000,
                $calc->previewPackagingForOrderType('takeaway', [[
                    'item_id' => $item->id,
                    'quantity' => $qty,
                    'packaging_option_id' => $opt->id,
                    'packaging_fee' => 10,
                    'packaging_fee_mode' => 'per_line',
                ]]),
                "per_line qty {$qty}",
            );
        }

        $this->assertSame(
            3000,
            $calc->previewPackagingForOrderType('takeaway', [[
                'item_id' => $item->id,
                'quantity' => 3,
                'packaging_fee' => 10,
                'packaging_fee_mode' => 'per_unit',
            ]]),
        );
        $this->assertSame(0, $calc->previewPackagingForOrderType('dine_in', [[
            'item_id' => $item->id,
            'quantity' => 3,
            'packaging_fee' => 10,
            'packaging_fee_mode' => 'per_unit',
        ]]));
    }

    public function test_taxable_exclusive_inclusive_and_off(): void
    {
        GstSetting::query()->updateOrCreate(['id' => 1], [
            'gst_registered' => true,
            'default_tax_rate_bp' => 800,
            'tax_inclusive' => false,
            'currency' => 'MVR',
            'sector' => 'general',
            'accounting_basis' => 'invoice',
        ]);
        app(GstSettingsService::class)->bust();

        SiteSetting::set('packaging_fee_taxable', '1');

        $item = Item::factory()->create(['base_price' => 100, 'packaging_fee' => 10, 'tax_code' => 'standard_8']);
        $order = Order::factory()->create([
            'type' => 'takeaway',
            'status' => 'pending',
            'subtotal' => 100,
            'subtotal_laar' => 10000,
        ]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => $item->id,
            'item_name' => $item->name,
            'quantity' => 1,
            'unit_price' => 100,
            'total_price' => 100,
            'tax_code' => 'standard_8',
            'packaging_fee' => 10,
            'packaging_fee_mode' => 'per_unit',
        ]);

        app(OrderTotalsCalculator::class)->recalculateAndPersist($order->fresh());
        $order->refresh();
        $this->assertSame(1000, (int) $order->packaging_fee_laar);
        // Merchandise tax 800 + packaging tax 80 = 880 (exclusive 8%)
        $this->assertSame(880, (int) $order->tax_laar);
        $this->assertSame(10000 + 800 + 1000 + 80, (int) $order->total_laar);

        SiteSetting::set('packaging_fee_taxable', '0');
        app(OrderTotalsCalculator::class)->recalculateAndPersist($order->fresh());
        $order->refresh();
        $this->assertSame(800, (int) $order->tax_laar);
        $this->assertSame(10000 + 800 + 1000, (int) $order->total_laar);

        SiteSetting::set('packaging_fee_taxable', '1');
        GstSetting::query()->where('id', 1)->update(['tax_inclusive' => true]);
        app(GstSettingsService::class)->bust();

        // Inclusive: packaging 10 embeds tax; total adds packaging principal only.
        app(OrderTotalsCalculator::class)->recalculateAndPersist($order->fresh());
        $order->refresh();
        $packTax = (int) round(1000 * 800 / 10800);
        $merchTax = (int) round(10000 * 800 / 10800);
        $this->assertSame(1000, (int) $order->packaging_fee_laar);
        $this->assertSame($merchTax + $packTax, (int) $order->tax_laar);
        $this->assertSame(10000 + 1000, (int) $order->total_laar);
    }

    public function test_order_items_persist_packaging_snapshot_fields(): void
    {
        $item = Item::factory()->create(['packaging_fee' => 1, 'packaging_fee_mode' => 'per_line']);
        $opt = ItemPackagingOption::create([
            'item_id' => $item->id,
            'name' => 'Premium cup',
            'fee' => 5,
            'is_default' => true,
            'is_active' => true,
            'sort_order' => 0,
        ]);

        $headers = $this->staffHeaders($this->makeOwner());
        $device = \App\Models\Device::create([
            'name' => 'Pack POS',
            'identifier' => 'PACK-OPT-POS',
            'type' => 'pos',
            'is_active' => true,
        ]);
        $this->withHeader('Authorization', $headers['Authorization'])
            ->postJson('/api/shifts/open', ['opening_cash' => 50])
            ->assertCreated();

        $res = $this->withHeaders([
            'Authorization' => $headers['Authorization'],
            'X-Device-Identifier' => $device->identifier,
        ])->postJson('/api/orders', [
            'type' => 'takeaway',
            'device_identifier' => $device->identifier,
            'print' => false,
            'items' => [[
                'item_id' => $item->id,
                'quantity' => 2,
                'packaging_option_id' => $opt->id,
            ]],
        ])->assertCreated();

        $orderId = (int) $res->json('order.id');
        $line = OrderItem::query()->where('order_id', $orderId)->first();
        $this->assertNotNull($line);
        $this->assertSame($opt->id, (int) $line->packaging_option_id);
        $this->assertSame(5.0, (float) $line->packaging_fee);
        $this->assertSame('per_line', $line->packaging_fee_mode);
        $this->assertSame('Premium cup', $line->packaging_option_name);
    }
}
