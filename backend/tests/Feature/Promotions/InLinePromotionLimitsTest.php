<?php

declare(strict_types=1);

namespace Tests\Feature\Promotions;

use App\Domains\Orders\DTOs\OrderPaidData;
use App\Domains\Orders\DTOs\OrderRefundedData;
use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Orders\Events\OrderRefunded;
use App\Domains\Orders\Services\OrderCreationService;
use App\Domains\Orders\Support\DiscountSettings;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Promotions\Listeners\RecordInLinePromotionRedemptionsListener;
use App\Domains\Promotions\Listeners\ReleasePromoRedemptionOnRefundListener;
use App\Domains\Promotions\Services\AutoPromotionPricing;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\DailySpecial;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Promotion;
use App\Models\PromotionRedemption;
use App\Models\PromotionTarget;
use App\Models\SiteSetting;
use App\Models\User;
use App\Services\SpecialPricingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Pricing audit, 2026-10-01, finding 1: an automatic promotion aimed at an item
 * or a category is priced straight into the line, and it never recorded a use,
 * so none of its limits applied. It now does, and they do.
 */
class InLinePromotionLimitsTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Item $tea;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->owner = $this->makeOwner();
        Sanctum::actingAs($this->owner, ['staff']);

        $drinks = Category::create(['name' => 'Drinks', 'is_active' => true]);
        $this->tea = Item::create([
            'name' => 'Milk tea', 'category_id' => $drinks->id, 'base_price' => 100, 'cost' => 40,
            'is_active' => true, 'is_available' => true,
        ]);
    }

    /** @param array<string, mixed> $attrs */
    private function promo(array $attrs = []): Promotion
    {
        $promo = Promotion::create(array_merge([
            'name' => 'Drinks 20% off', 'type' => 'percentage', 'discount_value' => 20,
            'is_active' => true, 'auto_apply' => true, 'scope' => 'item',
        ], $attrs));
        PromotionTarget::create([
            'promotion_id' => $promo->id, 'target_type' => 'item', 'target_id' => $this->tea->id,
            'is_exclusion' => false, 'role' => PromotionTarget::ROLE_REWARD,
        ]);
        app(AutoPromotionPricing::class)->bustCache();

        return $promo->fresh();
    }

    private function sell(int $qty = 1): Order
    {
        $order = app(OrderCreationService::class)->createFromPayload(
            ['type' => 'pos', 'items' => [['item_id' => $this->tea->id, 'quantity' => $qty, 'unit_price' => 1]]],
            $this->owner,
        );

        return $order->fresh(['items']);
    }

    private function pay(Order $order): void
    {
        DB::table('orders')->where('id', $order->id)->update(['payment_status' => 'paid', 'status' => 'paid']);
        app(RecordInLinePromotionRedemptionsListener::class)->handle(
            new OrderPaid(OrderPaidData::fromOrder($order->fresh(), false)),
        );
    }

    public function test_the_line_names_its_promotion_and_payment_counts_one_use(): void
    {
        $promo = $this->promo();

        $order = $this->sell(2);
        $line = $order->items->first();
        $this->assertSame(80.0, (float) $line->unit_price);
        $this->assertSame($promo->id, $line->promotion_id);

        $this->pay($order);

        $promo->refresh();
        $this->assertSame(1, (int) $promo->redemptions_count);
        $this->assertSame(4000, (int) $promo->spent_laar, 'two lines saving 20 each');
        $this->assertSame(1, PromotionRedemption::where('promotion_id', $promo->id)->count());

        // Paying twice changes nothing.
        $this->pay($order);
        $this->assertSame(1, (int) $promo->fresh()->redemptions_count);
    }

    public function test_the_use_limit_is_respected(): void
    {
        $promo = $this->promo(['max_uses' => 1]);

        $first = $this->sell();
        $this->assertSame(80.0, (float) $first->items->first()->unit_price);

        // While the first order is unpaid it already holds the one use.
        $second = $this->sell();
        $this->assertSame(100.0, (float) $second->items->first()->unit_price);
        $this->assertNull($second->items->first()->promotion_id);

        $this->pay($first);
        $third = $this->sell();
        $this->assertSame(100.0, (float) $third->items->first()->unit_price);
    }

    public function test_the_budget_is_respected_and_a_spent_budget_ends_the_offer(): void
    {
        $promo = $this->promo(['budget_laar' => 3000]);

        $first = $this->sell();
        $this->assertSame(80.0, (float) $first->items->first()->unit_price);
        $this->pay($first);

        // 20 more would take it to 40 against a budget of 30.
        $second = $this->sell();
        $this->assertSame(100.0, (float) $second->items->first()->unit_price);

        $promo->forceFill(['spent_laar' => 3000])->save();
        $this->assertFalse($promo->fresh()->isValid(), 'a spent budget stops the menus advertising it');
    }

    public function test_the_margin_floor_holds_the_price_above_cost(): void
    {
        SiteSetting::set(DiscountSettings::MARGIN_FLOOR_ENABLED, 'true');
        SiteSetting::set(DiscountSettings::MARGIN_FLOOR_PCT, '100');
        SiteSetting::bust();
        $this->tea->update(['cost' => 45]);
        $this->promo();

        // Cost 45 plus 100% is 90: the 20% promotion may only take it to 90.
        $line = $this->sell()->items->first();
        $this->assertSame(90.0, (float) $line->unit_price);

        $this->tea->update(['cost' => 60]);
        $line = $this->sell()->items->first();
        $this->assertSame(100.0, (float) $line->unit_price, 'a floor above the price leaves no discount');
        $this->assertNull($line->promotion_id);
    }

    public function test_a_used_up_special_falls_back_to_the_promotion_not_full_price(): void
    {
        $promo = $this->promo();
        $special = DailySpecial::create([
            'item_id' => $this->tea->id, 'discount_pct' => 50, 'max_quantity' => 1,
            'start_date' => today(), 'end_date' => today(), 'is_active' => true,
        ]);
        app(SpecialPricingService::class)->bustCache();

        $first = $this->sell();
        $this->assertSame(50.0, (float) $first->items->first()->unit_price);
        $this->assertSame($special->id, $first->items->first()->daily_special_id);

        // The one special is held by the unpaid first order.
        $second = $this->sell()->items->first();
        $this->assertSame(80.0, (float) $second->unit_price);
        $this->assertSame($promo->id, $second->promotion_id);
        $this->assertNull($second->daily_special_id);
    }

    public function test_a_full_refund_gives_the_use_back(): void
    {
        $promo = $this->promo();
        $order = $this->sell();
        $this->pay($order);

        DB::table('orders')->where('id', $order->id)->update(['status' => 'refunded']);
        app(ReleasePromoRedemptionOnRefundListener::class)->handle(new OrderRefunded(new OrderRefundedData(
            refundId: 1,
            orderId: $order->id,
            orderNumber: (string) $order->order_number,
            amount: 80.0,
            reason: 'test',
            refundRatio: 1.0,
        )));

        $this->assertSame(0, (int) $promo->fresh()->redemptions_count);
        $this->assertSame(0, (int) $promo->fresh()->spent_laar);
    }

    public function test_price_changes_are_on_the_record(): void
    {
        $this->patchJson("/api/items/{$this->tea->id}", ['base_price' => 120])->assertOk();

        $log = AuditLog::where('action', 'item.price_changed')->where('model_id', $this->tea->id)->first();
        $this->assertNotNull($log);
        $this->assertSame($this->owner->id, $log->user_id);
        $this->assertEquals(100, $log->old_values['base_price']);
        $this->assertEquals(120, $log->new_values['base_price']);

        $promo = $this->promo();
        $this->assertTrue(AuditLog::where('action', 'promotion.created')->where('model_id', $promo->id)->exists());
        $promo->update(['discount_value' => 30]);
        $this->assertTrue(AuditLog::where('action', 'promotion.updated')->where('model_id', $promo->id)->exists());

        // Renaming an item is not a price change.
        $before = AuditLog::count();
        $this->tea->update(['name' => 'Iced milk tea']);
        $this->assertSame($before, AuditLog::count());

        $this->assertSame(0, OrderItem::count());
    }
}
