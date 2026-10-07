<?php

declare(strict_types=1);

namespace Tests\Feature\Reports;

use App\Domains\Customers\Services\CustomerGrowthSummaryService;
use App\Domains\Reporting\Services\ReportsService;
use App\Http\Controllers\Api\FinanceReportController;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Variant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

/**
 * Each size is its own product in every report (owner, 2026-10-07: "In all
 * other places also variant should treat as a separate product").
 */
class VariantsAsProductsTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        $water = Item::factory()->create(['name' => 'Water']);
        $small = Variant::query()->create(['item_id' => $water->id, 'name' => 'Small', 'price' => 5]);
        $large = Variant::query()->create(['item_id' => $water->id, 'name' => 'Large', 'price' => 10]);
        $kottu = Item::factory()->create(['name' => 'Kottu']);
        $this->customer = Customer::factory()->create();
        $order = Order::factory()->takeaway()->create(['status' => 'completed', 'payment_status' => 'paid', 'paid_at' => now(), 'total' => 300, 'customer_id' => $this->customer->id]);
        $line = fn (Item $i, ?Variant $v, int $q, float $p) => OrderItem::query()->create([
            'order_id' => $order->id, 'item_id' => $i->id, 'variant_id' => $v?->id, 'item_name' => $i->name,
            'variant_name' => $v?->name, 'quantity' => $q, 'unit_price' => $p, 'total_price' => $q * $p,
        ]);
        $line($water, $small, 40, 5);
        $line($water, $large, 16, 10);
        $line($kottu, null, 2, 50);
    }

    public function test_daily_summary(): void
    {
        $top = collect(app(FinanceReportController::class)->dailySummary(Request::create('/', 'GET', ['date' => now()->toDateString()]))->getData(true)['top_items']);

        $this->assertSame(40.0, (float) $top->firstWhere('name', 'Water (Small)')['qty']);
        $this->assertSame(16.0, (float) $top->firstWhere('name', 'Water (Large)')['qty']);
        $this->assertSame(2.0, (float) $top->firstWhere('name', 'Kottu')['qty']);
        $this->assertNull($top->firstWhere('name', 'Water'));
    }

    public function test_sales_breakdown_and_velocity(): void
    {
        $reports = app(ReportsService::class);
        $b = $reports->salesBreakdown(now()->startOfDay(), now()->endOfDay());
        $names = collect($b['top_items'])->pluck('name')->all();
        $this->assertContains('Water (Small)', $names);
        $this->assertContains('Water (Large)', $names);
        $this->assertSame(160.0, (float) collect($b['top_items'])->firstWhere('name', 'Water (Large)')['revenue']);
        $this->assertCount(3, collect($b['top_items'])->pluck('key')->unique(), 'one key per product');

        $v = collect($reports->stockVelocity(now()->startOfDay(), now()->endOfDay())['rows']);
        $this->assertSame(40, $v->firstWhere('item_name', 'Water (Small)')['qty_sold']);
        $this->assertSame(16, $v->firstWhere('item_name', 'Water (Large)')['qty_sold']);
    }

    public function test_customer_favourites(): void
    {
        $fav = collect(app(CustomerGrowthSummaryService::class)->summary($this->customer, false)['favourite_items']);

        $this->assertSame(['Water (Small)', 'Water (Large)', 'Kottu'], $fav->pluck('name')->all());
    }
}
