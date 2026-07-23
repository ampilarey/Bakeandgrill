<?php

declare(strict_types=1);

namespace Tests\Feature\Promotions;

use App\Models\Category;
use App\Models\DailySpecial;
use App\Models\Item;
use App\Models\Promotion;
use App\Models\PromotionTarget;
use App\Models\SiteSetting;
use App\Services\EffectivePriceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\PreparesPosApi;
use Tests\TestCase;

class EffectivePriceTest extends TestCase
{
    use PreparesPosApi;
    use RefreshDatabase;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();

        $category = Category::create(['name' => 'Food', 'slug' => 'food-eff', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Burger',
            'base_price' => 100.00,
            'sku' => 'EFF-B001',
            'barcode' => 'EFF-B001',
            'is_active' => true,
            'is_available' => true,
        ]);
    }

    public function test_special_only_returns_special_block_shape(): void
    {
        DailySpecial::create([
            'item_id' => $this->item->id,
            'is_active' => true,
            'start_date' => today()->toDateString(),
            'end_date' => today()->toDateString(),
            'discount_pct' => 20,
            'badge_label' => 'Special Offer',
        ]);

        $result = app(EffectivePriceService::class)->resolveUnitPrice(
            $this->item->id,
            100.00,
            $this->item,
        );

        $this->assertTrue($result->hasDiscount());
        $this->assertSame(80.0, $result->unitPrice);
        $this->assertSame('special', $result->source);
        $block = $result->toApiBlock();
        $this->assertSame(['id', 'badge_label', 'discount_pct', 'original_price', 'effective_price'], array_keys($block));
        $this->assertSame(80.0, $block['effective_price']);
        $this->assertSame(100.0, $block['original_price']);
    }

    public function test_auto_promo_only_shows_discounted_price(): void
    {
        $promo = Promotion::create([
            'name' => 'Auto 15%',
            'code' => null,
            'type' => 'percentage',
            'discount_value' => 15,
            'is_active' => true,
            'auto_apply' => true,
            'scope' => 'item',
        ]);
        PromotionTarget::create([
            'promotion_id' => $promo->id,
            'target_type' => 'item',
            'target_id' => $this->item->id,
            'is_exclusion' => false,
        ]);
        app(\App\Domains\Promotions\Services\AutoPromotionPricing::class)->bustCache();

        $result = app(EffectivePriceService::class)->resolveUnitPrice(
            $this->item->id,
            100.00,
            $this->item,
        );

        $this->assertTrue($result->hasDiscount());
        $this->assertSame(85.0, $result->unitPrice);
        $this->assertSame('promo', $result->source);
        $this->assertSame($promo->id, $result->promoId);
        $block = $result->toApiBlock();
        $this->assertSame($promo->id, $block['id']);
        $this->assertSame(85.0, $block['effective_price']);
    }

    public function test_best_wins_picks_larger_discount(): void
    {
        SiteSetting::set('discount_stacking_policy', 'best_wins');

        DailySpecial::create([
            'item_id' => $this->item->id,
            'is_active' => true,
            'start_date' => today()->toDateString(),
            'end_date' => today()->toDateString(),
            'discount_pct' => 10,
        ]);

        $promo = Promotion::create([
            'name' => 'Auto 25%',
            'code' => null,
            'type' => 'percentage',
            'discount_value' => 25,
            'is_active' => true,
            'auto_apply' => true,
            'scope' => 'item',
        ]);
        PromotionTarget::create([
            'promotion_id' => $promo->id,
            'target_type' => 'item',
            'target_id' => $this->item->id,
            'is_exclusion' => false,
        ]);
        app(\App\Domains\Promotions\Services\AutoPromotionPricing::class)->bustCache();
        app(\App\Services\SpecialPricingService::class)->bustCache();

        $result = app(EffectivePriceService::class)->resolveUnitPrice(
            $this->item->id,
            100.00,
            $this->item,
        );

        $this->assertSame(75.0, $result->unitPrice);
        $this->assertSame('promo', $result->source);
    }

    public function test_items_api_includes_auto_promo_as_special_block(): void
    {
        $promo = Promotion::create([
            'name' => 'Auto 20%',
            'code' => null,
            'type' => 'percentage',
            'discount_value' => 20,
            'is_active' => true,
            'auto_apply' => true,
            'scope' => 'item',
        ]);
        PromotionTarget::create([
            'promotion_id' => $promo->id,
            'target_type' => 'item',
            'target_id' => $this->item->id,
            'is_exclusion' => false,
        ]);
        app(\App\Domains\Promotions\Services\AutoPromotionPricing::class)->bustCache();

        $response = $this->getJson('/api/items');
        $response->assertOk();
        $row = collect($response->json('data'))->firstWhere('id', $this->item->id);
        $this->assertNotNull($row);
        $this->assertArrayHasKey('special', $row);
        $this->assertSame(80.0, (float) $row['special']['effective_price']);
        $this->assertSame(100.0, (float) $row['special']['original_price']);
    }

    public function test_item_level_auto_promo_not_double_counted_at_checkout(): void
    {
        $promo = Promotion::create([
            'name' => 'Auto 10%',
            'code' => null,
            'type' => 'percentage',
            'discount_value' => 10,
            'is_active' => true,
            'auto_apply' => true,
            'scope' => 'item',
        ]);
        PromotionTarget::create([
            'promotion_id' => $promo->id,
            'target_type' => 'item',
            'target_id' => $this->item->id,
            'is_exclusion' => false,
        ]);
        app(\App\Domains\Promotions\Services\AutoPromotionPricing::class)->bustCache();

        $device = \App\Models\Device::create(['name' => 'POS', 'identifier' => 'T-EFF', 'type' => 'pos', 'is_active' => true]);
        $role = \App\Models\Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        $staff = \App\Models\User::create([
            'name' => 'Staff', 'email' => 'eff@test.com',
            'password' => bcrypt('password'), 'role_id' => $role->id,
            'pin_hash' => bcrypt('1234'), 'is_active' => true,
        ]);
        \App\Models\Permission::updateOrCreate(
            ['slug' => 'promotions.discounts'],
            ['name' => 'Apply Discounts', 'group' => 'Promotions'],
        );
        $staff->grantPermission('promotions.discounts');
        $this->preparePosApi($staff, $device);
        $this->withHeader('X-Device-Identifier', $device->identifier);
        \Laravel\Sanctum\Sanctum::actingAs($staff, ['staff']);

        $response = $this->postJson('/api/orders', [
            'type' => 'takeaway',
            'device_identifier' => $device->identifier,
            'print' => false,
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ])->assertCreated();

        $order = \App\Models\Order::findOrFail($response->json('order.id'));
        // Line price already discounted — no OrderPromotion for item-level auto promo.
        $this->assertSame(0, \App\Models\OrderPromotion::where('order_id', $order->id)->count());
        $this->assertEquals(90.0, (float) $order->items()->first()->unit_price);
        $this->assertSame(0, (int) $order->promo_discount_laar);
    }
}
