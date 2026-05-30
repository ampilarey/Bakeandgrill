<?php

declare(strict_types=1);

namespace Tests\Feature\Ordering;

use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CheckoutFeesPreviewTest extends TestCase
{
    use RefreshDatabase;

    public function test_preview_returns_zero_when_fees_disabled(): void
    {
        $response = $this->getJson('/api/ordering/checkout-fees-preview?order_type=delivery&discounted_subtotal_laar=3000');

        $response->assertOk()
            ->assertJsonPath('packaging_fee_laar', 0)
            ->assertJsonPath('small_order_fee_laar', 0);
    }

    public function test_preview_returns_packaging_and_small_order_fees(): void
    {
        SiteSetting::set('packaging_fee_enabled', '1');
        SiteSetting::set('packaging_fee_type', 'fixed');
        SiteSetting::set('packaging_fee_value', '5');
        SiteSetting::set('packaging_fee_apply_delivery', '1');
        SiteSetting::set('small_order_fee_enabled', '1');
        SiteSetting::set('small_order_fee_threshold_mvr', '50');
        SiteSetting::set('small_order_fee_amount_mvr', '10');

        $response = $this->getJson('/api/ordering/checkout-fees-preview?order_type=delivery&discounted_subtotal_laar=3000');

        $response->assertOk()
            ->assertJsonPath('packaging_fee_laar', 500)
            ->assertJsonPath('small_order_fee_laar', 1000);
    }
}
