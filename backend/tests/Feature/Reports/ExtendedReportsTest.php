<?php

declare(strict_types=1);

namespace Tests\Feature\Reports;

use App\Models\Customer;
use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExtendedReportsTest extends TestCase
{
    use RefreshDatabase;

    public function test_discounts_by_type_report(): void
    {
        $owner = $this->makeOwner();
        $this->actingAs($owner);

        Order::factory()->create([
            'status' => 'completed',
            'promo_discount_laar' => 500,
            'loyalty_discount_laar' => 200,
            'subtotal' => 50,
            'total' => 47.3,
        ]);

        $response = $this->getJson('/api/reports/discounts-by-type?from=' . now()->toDateString() . '&to=' . now()->toDateString());

        $response->assertOk()
            ->assertJsonPath('rows.0.type', 'promo')
            ->assertJsonPath('rows.0.amount_laar', 500);
    }

    public function test_credit_exposure_report(): void
    {
        $owner = $this->makeOwner();
        $this->actingAs($owner);

        Customer::factory()->create([
            'credit_enabled' => true,
            'credit_balance_laar' => 15000,
        ]);

        $response = $this->getJson('/api/reports/credit-exposure');

        $response->assertOk()
            ->assertJsonPath('total_balance_laar', 15000)
            ->assertJsonPath('customers_count', 1);
    }
}
