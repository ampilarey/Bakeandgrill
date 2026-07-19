<?php

declare(strict_types=1);

namespace Tests\Feature\Ordering;

use App\Models\Item;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CheckoutFeesPreviewTest extends TestCase
{
    use RefreshDatabase;

    public function test_preview_returns_zero_when_no_lines(): void
    {
        $response = $this->getJson('/api/ordering/checkout-fees-preview?order_type=delivery&discounted_subtotal_laar=3000');

        $response->assertOk()
            ->assertJsonPath('packaging_fee_laar', 0)
            ->assertJsonPath('small_order_fee_laar', 0);
    }

    public function test_preview_sums_per_item_packaging_from_lines(): void
    {
        $a = Item::factory()->create(['packaging_fee' => 5]);
        $b = Item::factory()->create(['packaging_fee' => 2]);

        SiteSetting::set('small_order_fee_enabled', '1');
        SiteSetting::set('small_order_fee_threshold_mvr', '50');
        SiteSetting::set('small_order_fee_amount_mvr', '10');

        $response = $this->postJson('/api/ordering/checkout-fees-preview', [
            'order_type' => 'delivery',
            'discounted_subtotal_laar' => 3000,
            'lines' => [
                ['item_id' => $a->id, 'quantity' => 2],
                ['item_id' => $b->id, 'quantity' => 1],
            ],
        ]);

        $response->assertOk()
            ->assertJsonPath('packaging_fee_laar', 1200) // 2×5 + 1×2 = 12 MVR
            ->assertJsonPath('small_order_fee_laar', 1000);
    }

    public function test_preview_ignores_unknown_item_ids_without_500(): void
    {
        $response = $this->postJson('/api/ordering/checkout-fees-preview', [
            'order_type' => 'online_pickup',
            'discounted_subtotal_laar' => 1000,
            'lines' => [
                ['item_id' => 999999, 'quantity' => 2],
            ],
        ]);

        $response->assertOk()->assertJsonPath('packaging_fee_laar', 0);
    }
}
