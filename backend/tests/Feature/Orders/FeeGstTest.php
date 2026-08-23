<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Domains\Gst\Services\GstLedgerPoster;
use App\Domains\Gst\Services\GstSettingsService;
use App\Domains\Orders\Services\OrderTotalsCalculator;
use App\Models\GstSetting;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\SiteSetting;
use App\Models\TaxLedgerEntry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * GST on delivery and small-order fees.
 *
 * Both used to be added to the order total after tax was worked out, so no GST
 * was ever charged on them. A delivery charge is a taxable supply in the
 * Maldives (owner decision, 2026-08-23), which means every delivery order was
 * under-collecting — and the shortfall is the restaurant's to pay, not the
 * customer's, because the total the customer agreed to is the total they paid.
 *
 * The tip is the control: it stays untaxed in every case here, because it is
 * not consideration for a supply.
 */
class FeeGstTest extends TestCase
{
    use RefreshDatabase;

    private function configureGst(bool $taxInclusive): void
    {
        GstSetting::query()->updateOrCreate(['id' => 1], [
            'gst_registered' => true,
            'default_tax_rate_bp' => 800,
            'tax_inclusive' => $taxInclusive,
            'currency' => 'MVR',
            'sector' => 'general',
            // Hybrid so GstLedgerPoster::postOrderOnPayment writes output tax.
            'accounting_basis' => 'hybrid',
            'seller_tin' => 'TIN-FEE-TEST',
            'taxable_activity_no' => 'TA-FEE-001',
            'seller_name' => 'Fee Test Seller',
        ]);
        app(GstSettingsService::class)->bust();
    }

    /** @param array<string, bool> $flags */
    private function configureFeeTax(array $flags = []): void
    {
        foreach ([
            'packaging_fee_taxable' => $flags['packaging'] ?? true,
            'small_order_fee_taxable' => $flags['small_order'] ?? true,
            'delivery_fee_taxable' => $flags['delivery'] ?? true,
        ] as $key => $on) {
            SiteSetting::set($key, $on ? '1' : '0');
        }
        SiteSetting::bust();
    }

    private function enableSmallOrderFee(float $thresholdMvr, float $feeMvr): void
    {
        SiteSetting::set('small_order_fee_enabled', '1');
        SiteSetting::set('small_order_fee_threshold_mvr', (string) $thresholdMvr);
        SiteSetting::set('small_order_fee_amount_mvr', (string) $feeMvr);
        SiteSetting::bust();
    }

    /**
     * A delivery order with no packaging fee, so the delivery fee is the only
     * variable. `$subtotalMvr` of food, `$deliveryMvr` of delivery.
     */
    private function deliveryOrder(float $subtotalMvr, float $deliveryMvr, float $tipMvr = 0): Order
    {
        $item = Item::factory()->create(['base_price' => $subtotalMvr, 'packaging_fee' => 0]);

        $order = Order::factory()->create([
            'type' => 'delivery',
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'delivery_fee_laar' => (int) round($deliveryMvr * 100),
            'tip_amount' => $tipMvr,
        ]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => $item->id,
            'item_name' => $item->name,
            'quantity' => 1,
            'unit_price' => $subtotalMvr,
            'total_price' => $subtotalMvr,
        ]);

        return $order->fresh();
    }

    public function test_exclusive_gst_is_charged_on_the_delivery_fee(): void
    {
        // THE test. MVR 100 food + MVR 30 delivery at 8% exclusive.
        // Tax = 8% of 130 = 10.40, total = 140.40. Before this fix the tax was
        // 8.00 and the total 138.00 — MVR 2.40 short on every delivery order.
        $this->configureGst(false);
        $this->configureFeeTax();

        $order = $this->deliveryOrder(100, 30);
        app(OrderTotalsCalculator::class)->recalculateAndPersist($order);

        $order->refresh();
        $this->assertSame(1040, (int) $order->tax_laar);
        $this->assertSame(14040, (int) $order->total_laar);
    }

    public function test_inclusive_gst_is_extracted_from_the_delivery_fee(): void
    {
        // Inclusive: the MVR 30 fee already contains its GST, so the customer
        // still pays 130 — but 2.22 of it is tax we owe rather than revenue.
        // 8/108 of 13000 = 963 laari (7.41 food + 2.22 delivery).
        $this->configureGst(true);
        $this->configureFeeTax();

        $order = $this->deliveryOrder(100, 30);
        app(OrderTotalsCalculator::class)->recalculateAndPersist($order);

        $order->refresh();
        $this->assertSame(963, (int) $order->tax_laar);
        $this->assertSame(13000, (int) $order->total_laar, 'inclusive tax must not inflate the total');
    }

    public function test_the_delivery_switch_turns_the_tax_off(): void
    {
        // The switch is the whole point: taxability is an accounting position,
        // and the owner has to be able to change it without a deploy.
        $this->configureGst(false);
        $this->configureFeeTax(['delivery' => false]);

        $order = $this->deliveryOrder(100, 30);
        app(OrderTotalsCalculator::class)->recalculateAndPersist($order);

        $order->refresh();
        $this->assertSame(800, (int) $order->tax_laar);
        $this->assertSame(13800, (int) $order->total_laar);
    }

    public function test_gst_is_charged_on_the_small_order_fee(): void
    {
        // MVR 20 food (under the MVR 50 threshold) + MVR 10 small-order fee,
        // no delivery fee. Tax = 8% of 30 = 2.40, total = 32.40.
        $this->configureGst(false);
        $this->configureFeeTax();
        $this->enableSmallOrderFee(50, 10);

        $order = $this->deliveryOrder(20, 0);
        app(OrderTotalsCalculator::class)->recalculateAndPersist($order);

        $order->refresh();
        $this->assertSame(1000, (int) $order->small_order_fee_laar);
        $this->assertSame(240, (int) $order->tax_laar);
        $this->assertSame(3240, (int) $order->total_laar);
    }

    public function test_the_tip_is_never_taxed(): void
    {
        // A tip is not consideration for a supply. It rides on the total and
        // must not move the tax, whichever way the fee switches are set.
        $this->configureGst(false);
        $this->configureFeeTax();

        $order = $this->deliveryOrder(100, 30, tipMvr: 25);
        app(OrderTotalsCalculator::class)->recalculateAndPersist($order);

        $order->refresh();
        $this->assertSame(1040, (int) $order->tax_laar, 'tip must not be taxed');
        $this->assertSame(16540, (int) $order->total_laar, '140.40 + 25.00 tip');
    }

    public function test_the_gst_ledger_declares_the_same_base_the_order_was_taxed_on(): void
    {
        // The number that reaches MIRA. If the ledger's taxable value excludes
        // delivery while the order's tax_laar includes GST on it, the return
        // does not reconcile against the orders it was built from — the
        // declared rate silently stops being 8%.
        $this->configureGst(false);
        $this->configureFeeTax();

        $order = $this->deliveryOrder(100, 30);
        app(OrderTotalsCalculator::class)->recalculateAndPersist($order);

        $order->refresh();
        $order->update(['payment_status' => 'paid', 'status' => 'paid']);

        app(GstLedgerPoster::class)->postOrderOnPayment($order->fresh());

        $entry = TaxLedgerEntry::query()
            ->where('source_type', 'order')
            ->where('source_id', $order->id)
            ->firstOrFail();

        $this->assertSame(13000, (int) $entry->taxable_value_laar, 'food + delivery');
        $this->assertSame(1040, (int) $entry->tax_laar);
        $this->assertSame(14040, (int) $entry->total_laar);
    }

    public function test_an_untaxed_delivery_fee_stays_out_of_the_declared_base(): void
    {
        // The mirror of the test above. With the switch off the fee is not a
        // taxable supply, so declaring it would overstate turnover.
        $this->configureGst(false);
        $this->configureFeeTax(['delivery' => false]);

        $order = $this->deliveryOrder(100, 30);
        app(OrderTotalsCalculator::class)->recalculateAndPersist($order);

        $order->refresh();
        $order->update(['payment_status' => 'paid', 'status' => 'paid']);

        app(GstLedgerPoster::class)->postOrderOnPayment($order->fresh());

        $entry = TaxLedgerEntry::query()
            ->where('source_type', 'order')
            ->where('source_id', $order->id)
            ->firstOrFail();

        $this->assertSame(10000, (int) $entry->taxable_value_laar);
        $this->assertSame(800, (int) $entry->tax_laar);
    }

    public function test_each_fee_is_rounded_separately(): void
    {
        // Locks the rounding the client mirrors in @shared/utils/feeTax. Three
        // 19-laari fees are 1.52 laari of tax each, rounding to 2 → 6. Rounding
        // the combined 57-laari principal instead gives 5, and checkout would
        // quote a total a laari under what the card is charged.
        $this->configureGst(false);
        $this->configureFeeTax();

        $result = app(\App\Domains\Orders\Services\OrderFeeTaxCalculator::class)
            ->calculate(19, 19, 19, false);

        $this->assertSame(6, $result['tax_laar']);
        $this->assertSame(57, $result['taxable_laar']);
    }

    public function test_settings_default_to_taxable_when_the_keys_are_absent(): void
    {
        // Fresh installs and any environment where the seed migration has not
        // run must still charge GST on delivery — silently not charging it is
        // the failure this whole change exists to fix.
        SiteSetting::query()->whereIn('key', [
            'delivery_fee_taxable',
            'small_order_fee_taxable',
            'packaging_fee_taxable',
        ])->delete();
        SiteSetting::bust();

        $this->configureGst(false);

        $order = $this->deliveryOrder(100, 30);
        app(OrderTotalsCalculator::class)->recalculateAndPersist($order);

        $this->assertSame(1040, (int) $order->fresh()->tax_laar);
    }
}
