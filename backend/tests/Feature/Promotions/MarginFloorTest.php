<?php

declare(strict_types=1);

namespace Tests\Feature\Promotions;

use App\Domains\Promotions\Services\PromotionEvaluator;
use App\Models\PromotionTarget;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Tests\Feature\Promotions\Concerns\BuildsPromoOrders;
use Tests\TestCase;

class MarginFloorTest extends TestCase
{
    use BuildsPromoOrders;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Catalog price 100, cost 80 → floor at 10% margin = 88 unit min
        $this->seedCatalog(100.0, 80.0);
        SiteSetting::set('discount_margin_floor_enabled', 'true');
        SiteSetting::set('discount_margin_floor_pct', '10');
    }

    public function test_clamps_item_promo_so_stacked_special_cannot_breach_floor(): void
    {
        Log::spy();

        $promo = $this->makePromo([
            'type' => 'percentage',
            'discount_value' => 50,
            'code' => 'FLOOR50',
            'scope' => 'item',
        ]);
        PromotionTarget::create([
            'promotion_id' => $promo->id,
            'target_type' => 'item',
            'target_id' => $this->item->id,
            'is_exclusion' => false,
        ]);

        // Already-discounted unit (special baked in): 90 MVR — floor is 88
        $order = $this->buildPromoOrder(90.0, 1);
        $order->items->first()->update(['unit_price' => 90.0, 'total_price' => 90.0]);
        $order = $order->fresh(['items.item']);

        $result = app(PromotionEvaluator::class)->evaluate('FLOOR50', $order, $this->customer->id);

        $this->assertTrue($result['valid']);
        // Max discountable = 9000 - 8800 = 200 laari (not 4500)
        $this->assertSame(200, $result['discount_laar']);
        Log::shouldHaveReceived('info')->withArgs(function ($message) {
            return is_string($message) && str_contains($message, 'margin floor');
        })->atLeast()->once();
    }
}
