<?php

declare(strict_types=1);

namespace Tests\Feature\Promotions;

use App\Domains\Promotions\Services\PromotionEvaluator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Promotions\Concerns\BuildsPromoOrders;
use Tests\TestCase;

class TieredPromotionTest extends TestCase
{
    use BuildsPromoOrders;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedCatalog();
    }

    public function test_selects_highest_satisfied_tier(): void
    {
        $promo = $this->makePromo([
            'type' => 'tiered',
            'discount_value' => 0,
            'code' => 'TIERED',
            'metadata' => [
                'tiers' => [
                    ['min_laar' => 20000, 'kind' => 'fixed', 'value' => 2000],
                    ['min_laar' => 30000, 'kind' => 'fixed', 'value' => 3000],
                    ['min_laar' => 50000, 'kind' => 'fixed', 'value' => 5000],
                ],
            ],
        ]);

        $order = $this->buildPromoOrder(350.0);
        $result = app(PromotionEvaluator::class)->evaluate('TIERED', $order, $this->customer->id);

        $this->assertTrue($result['valid']);
        $this->assertSame(3000, $result['discount_laar']);
        $this->assertSame($promo->id, $result['promotion']->id);
    }

    public function test_below_lowest_tier_yields_no_discount(): void
    {
        $this->makePromo([
            'type' => 'tiered',
            'discount_value' => 0,
            'code' => 'TIERLOW',
            'metadata' => [
                'tiers' => [
                    ['min_laar' => 30000, 'kind' => 'fixed', 'value' => 3000],
                ],
            ],
        ]);

        $order = $this->buildPromoOrder(250.0);
        $result = app(PromotionEvaluator::class)->evaluate('TIERLOW', $order, $this->customer->id);

        $this->assertFalse($result['valid']);
    }
}
