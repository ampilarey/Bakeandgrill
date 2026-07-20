<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Domains\Gst\Services\GstSettingsService;
use App\Domains\Orders\Services\OrderTotalsCalculator;
use App\Domains\Orders\Services\PackagingFeeCalculator;
use App\Domains\Orders\Services\PackagingOptionResolver;
use App\Domains\Printing\Services\PrintJobService;
use App\Models\GstSetting;
use App\Models\Item;
use App\Models\ItemPackagingOption;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Printer;
use App\Models\PrintJob;
use App\Models\Receipt;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
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

    public function test_receipt_view_shows_packaging_option_name_when_present(): void
    {
        $order = Order::create([
            'order_number' => 'PKG-RCPT-1',
            'type' => 'takeaway',
            'status' => 'paid',
            'paid_at' => now(),
            'subtotal' => 10,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 15,
            'total_laar' => 1500,
            'packaging_fee_laar' => 500,
        ]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => Item::factory()->create()->id,
            'item_name' => 'Iced Latte',
            'quantity' => 1,
            'unit_price' => 10,
            'total_price' => 10,
            'packaging_option_name' => 'Premium cup',
            'packaging_fee' => 5,
            'packaging_fee_mode' => 'per_line',
        ]);
        $receipt = Receipt::create([
            'order_id' => $order->id,
            'token' => Str::random(48),
            'channel' => 'sms',
        ]);
        $receipt->setRelation('order', $order->fresh(['items.modifiers', 'payments', 'refunds']));

        $html = view('receipt', ['receipt' => $receipt])->render();

        $this->assertStringContainsString('Iced Latte', $html);
        $this->assertStringContainsString('+ Premium cup', $html);
    }

    public function test_receipt_view_omits_packaging_label_when_null(): void
    {
        $order = Order::create([
            'order_number' => 'PKG-RCPT-2',
            'type' => 'takeaway',
            'status' => 'paid',
            'paid_at' => now(),
            'subtotal' => 10,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 10,
            'total_laar' => 1000,
        ]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => Item::factory()->create()->id,
            'item_name' => 'Plain Bun',
            'quantity' => 1,
            'unit_price' => 10,
            'total_price' => 10,
            'packaging_option_name' => null,
        ]);
        $receipt = Receipt::create([
            'order_id' => $order->id,
            'token' => Str::random(48),
            'channel' => 'sms',
        ]);
        $receipt->setRelation('order', $order->fresh(['items.modifiers', 'payments', 'refunds']));

        $html = view('receipt', ['receipt' => $receipt])->render();

        $this->assertStringContainsString('Plain Bun', $html);
        // Phone numbers use "+960…" — assert no packaging secondary line.
        $this->assertStringNotContainsString('doc-mods">+', $html);
        $this->assertStringNotContainsString('packaging_option', $html);
    }

    public function test_print_payloads_include_packaging_option_name(): void
    {
        Printer::create([
            'name' => 'Kitchen PKG',
            'type' => 'kitchen',
            'ip_address' => '127.0.0.1',
            'port' => 9100,
            'is_active' => true,
        ]);
        Printer::create([
            'name' => 'Receipt PKG',
            'type' => 'receipt',
            'ip_address' => '127.0.0.1',
            'port' => 9100,
            'is_active' => true,
        ]);

        $order = Order::create([
            'order_number' => 'PKG-PRINT-1',
            'type' => 'takeaway',
            'status' => 'pending',
            'subtotal' => 10,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 15,
            'total_laar' => 1500,
        ]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => Item::factory()->create()->id,
            'item_name' => 'Iced Latte',
            'quantity' => 1,
            'unit_price' => 10,
            'total_price' => 10,
            'packaging_option_name' => 'Premium cup',
        ]);

        $service = app(PrintJobService::class);
        $service->dispatchKitchen($order->fresh(['items.modifiers']));
        $service->dispatchReceipt($order->fresh(['items.modifiers', 'payments']));

        $kitchen = PrintJob::query()->where('type', 'kitchen')->where('order_id', $order->id)->first();
        $receipt = PrintJob::query()->where('type', 'receipt')->where('order_id', $order->id)->first();
        $this->assertNotNull($kitchen);
        $this->assertNotNull($receipt);

        $kitchenPayload = is_array($kitchen->payload) ? $kitchen->payload : json_decode((string) $kitchen->payload, true);
        $receiptPayload = is_array($receipt->payload) ? $receipt->payload : json_decode((string) $receipt->payload, true);

        $this->assertSame('Premium cup', $kitchenPayload['order']['items'][0]['packaging_option_name'] ?? null);
        $this->assertSame('Premium cup', $receiptPayload['order']['items'][0]['packaging_option_name'] ?? null);
    }
}
