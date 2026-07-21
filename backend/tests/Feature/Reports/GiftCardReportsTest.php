<?php

declare(strict_types=1);

namespace Tests\Feature\Reports;

use App\Domains\Reporting\Services\ReportsService;
use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GiftCardReportsTest extends TestCase
{
    use RefreshDatabase;

    public function test_sales_summary_excludes_gift_card_orders_from_totals_but_exposes_sold_count(): void
    {
        $customer = $this->makeCustomer();

        // Regular sale — MVR 100.
        Order::create([
            'order_number' => 'S-1',
            'tracking_token' => 's1',
            'type' => 'takeaway',
            'status' => 'completed',
            'customer_id' => $customer->id,
            'subtotal' => 100,
            'subtotal_laar' => 10000,
            'tax_amount' => 0,
            'tax_laar' => 0,
            'total' => 100,
            'total_laar' => 10000,
        ]);

        // Gift card sale — MVR 250, must NOT count in totals.
        Order::create([
            'order_number' => 'GC-1',
            'tracking_token' => 'gc1',
            'type' => 'gift_card',
            'status' => 'completed',
            'customer_id' => $customer->id,
            'subtotal' => 250,
            'subtotal_laar' => 25000,
            'tax_amount' => 0,
            'tax_laar' => 0,
            'total' => 250,
            'total_laar' => 25000,
        ]);

        $summary = app(ReportsService::class)->salesSummary(
            now()->startOfDay(),
            now()->endOfDay(),
        );

        $this->assertSame(1, $summary['totals']['orders_count']);
        $this->assertEqualsWithDelta(100.0, (float) $summary['totals']['total'], 0.001);
        $this->assertSame(1, $summary['gift_cards_sold_count']);
        $this->assertEqualsWithDelta(250.0, (float) $summary['gift_cards_sold'], 0.001);
    }

    public function test_z_report_reports_gift_cards_sold_separately(): void
    {
        Order::create([
            'order_number' => 'GC-Z',
            'tracking_token' => 'gcz',
            'type' => 'gift_card',
            'status' => 'completed',
            'subtotal' => 500,
            'subtotal_laar' => 50000,
            'tax_amount' => 0,
            'tax_laar' => 0,
            'total' => 500,
            'total_laar' => 50000,
        ]);

        $z = app(ReportsService::class)->zReport(now()->startOfDay(), now()->endOfDay());
        $this->assertSame(0, $z['totals']['orders_count']);
        $this->assertSame(1, $z['gift_cards_sold_count']);
        $this->assertEqualsWithDelta(500.0, (float) $z['gift_cards_sold'], 0.001);
    }

    public function test_discounts_by_type_no_gift_card_row(): void
    {
        $customer = $this->makeCustomer();

        Order::create([
            'order_number' => 'D-GC',
            'tracking_token' => 'dgc',
            'type' => 'takeaway',
            'status' => 'completed',
            'customer_id' => $customer->id,
            'subtotal' => 100,
            'subtotal_laar' => 10000,
            'tax_amount' => 0,
            'tax_laar' => 0,
            'total' => 60,
            'total_laar' => 6000,
            'promo_discount_laar' => 1000,
            'gift_card_discount_laar' => 3000,
        ]);

        $rows = app(ReportsService::class)->discountsByType(
            now()->startOfDay(),
            now()->endOfDay(),
        )['rows'];

        $keys = array_map(fn ($r) => $r['type'], $rows);
        $this->assertNotContains('gift_card', $keys);
        $this->assertContains('promo', $keys);
    }
}
