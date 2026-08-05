<?php

declare(strict_types=1);

namespace Tests\Feature\Promotions;

use App\Domains\Promotions\Services\PromotionEvaluator;
use App\Models\PromotionTarget;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Promotions\Concerns\BuildsPromoOrders;
use Tests\TestCase;

class ExistingPromoRegressionTest extends TestCase
{
    use BuildsPromoOrders;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedCatalog();
        SiteSetting::set('discount_stacking_policy', 'best_wins');
        SiteSetting::set('discount_margin_floor_enabled', 'false');
    }

    public function test_percentage_fixed_and_free_item_still_work(): void
    {
        $this->makePromo([
            'type' => 'percentage',
            'discount_value' => 10,
            'code' => 'PCT10',
        ]);
        $pct = app(PromotionEvaluator::class)->evaluate('PCT10', $this->buildPromoOrder(100.0), $this->customer->id);
        $this->assertTrue($pct['valid']);
        $this->assertSame(1000, $pct['discount_laar']);

        $this->makePromo([
            'type' => 'fixed',
            'discount_value' => 2500,
            'code' => 'FIX25',
        ]);
        $fixed = app(PromotionEvaluator::class)->evaluate('FIX25', $this->buildPromoOrder(100.0), $this->customer->id);
        $this->assertTrue($fixed['valid']);
        $this->assertSame(2500, $fixed['discount_laar']);
    }

    public function test_best_wins_stacking_unchanged_for_merchandise(): void
    {
        $this->makePromo([
            'name' => 'Auto 5%',
            'type' => 'percentage',
            'discount_value' => 5,
            'code' => null,
            'auto_apply' => true,
        ]);
        $this->makePromo([
            'name' => 'Auto 15%',
            'type' => 'percentage',
            'discount_value' => 15,
            'code' => null,
            'auto_apply' => true,
        ]);

        $order = $this->buildPromoOrder(100.0);
        $applied = app(PromotionEvaluator::class)->applyAutomatic($order, $this->customer->id);

        $this->assertCount(1, $applied);
        $this->assertSame(1500, $applied[0]['discount_laar']);
    }

    public function test_discount_never_exceeds_subtotal(): void
    {
        $this->makePromo([
            'type' => 'fixed',
            'discount_value' => 50000,
            'code' => 'HUGE',
        ]);
        $result = app(PromotionEvaluator::class)->evaluate('HUGE', $this->buildPromoOrder(40.0), $this->customer->id);
        $this->assertTrue($result['valid']);
        $this->assertSame(4000, $result['discount_laar']);
    }

    /**
     * REGRESSION: null/absent role on promotion_targets MUST mean reward.
     * If that default is lost, every live free_item / targeted percentage
     * either stops applying or starts applying to the wrong lines.
     */
    public function test_null_role_targets_still_mean_reward(): void
    {
        $promo = $this->makePromo([
            'name' => 'Legacy free item',
            'type' => 'free_item',
            'discount_value' => 0,
            'code' => null,
            'auto_apply' => true,
            'scope' => 'item',
        ]);
        // Explicitly leave role null — the pre-role shape of every live promo.
        PromotionTarget::create([
            'promotion_id' => $promo->id,
            'target_type' => 'item',
            'target_id' => $this->item->id,
            'is_exclusion' => false,
            'role' => null,
        ]);

        $order = $this->buildPromoOrder(100.0);
        $applied = app(PromotionEvaluator::class)->applyAutomatic($order, $this->customer->id);
        $this->assertCount(1, $applied);
        $this->assertSame(10000, $applied[0]['discount_laar']);
    }
}
