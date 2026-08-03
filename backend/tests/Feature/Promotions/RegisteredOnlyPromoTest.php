<?php

declare(strict_types=1);

namespace Tests\Feature\Promotions;

use App\Domains\Promotions\Services\PromotionEvaluator;
use App\Models\Promotion;
use App\Models\PromotionTarget;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\Feature\Promotions\Concerns\BuildsPromoOrders;
use Tests\TestCase;

class RegisteredOnlyPromoTest extends TestCase
{
    use BuildsPromoOrders;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedCatalog();
    }

    public function test_registered_only_false_guest_still_receives_first_order_promo(): void
    {
        $this->makePromo([
            'type' => 'fixed',
            'discount_value' => 500,
            'code' => 'GUESTOK',
            'first_order_only' => true,
            'registered_only' => false,
        ]);

        $order = $this->buildPromoOrder(100.0);
        $order->update(['customer_id' => null]);

        $result = app(PromotionEvaluator::class)->evaluate('GUESTOK', $order->fresh(['items.item']), null);

        $this->assertTrue($result['valid'], $result['message'] ?? 'expected guest eligible');
        $this->assertSame(500, $result['discount_laar']);
    }

    public function test_registered_only_true_rejects_guest_with_sign_in_message(): void
    {
        $this->makePromo([
            'type' => 'fixed',
            'discount_value' => 500,
            'code' => 'MEMBERS',
            'first_order_only' => true,
            'registered_only' => true,
        ]);

        $order = $this->buildPromoOrder(100.0);
        $order->update(['customer_id' => null]);

        $result = app(PromotionEvaluator::class)->evaluate('MEMBERS', $order->fresh(['items.item']), null);

        $this->assertFalse($result['valid']);
        $this->assertSame('Sign in or create an account to use this offer.', $result['message']);
    }

    public function test_registered_only_true_first_time_customer_receives_it(): void
    {
        $this->makePromo([
            'type' => 'fixed',
            'discount_value' => 800,
            'code' => 'WELCOME',
            'first_order_only' => true,
            'registered_only' => true,
        ]);

        $order = $this->buildPromoOrder(100.0);
        $result = app(PromotionEvaluator::class)->evaluate('WELCOME', $order, $this->customer->id);

        $this->assertTrue($result['valid'], $result['message'] ?? 'expected first-time customer eligible');
        $this->assertSame(800, $result['discount_laar']);
    }

    public function test_registered_only_true_returning_customer_rejected_by_first_order_gate(): void
    {
        $this->makePromo([
            'type' => 'fixed',
            'discount_value' => 800,
            'code' => 'WELCOME2',
            'first_order_only' => true,
            'registered_only' => true,
        ]);

        $prior = $this->buildPromoOrder(50.0);
        DB::table('orders')->where('id', $prior->id)->update([
            'payment_status' => 'paid',
            'status' => 'completed',
        ]);

        $order = $this->buildPromoOrder(100.0);
        $result = app(PromotionEvaluator::class)->evaluate('WELCOME2', $order, $this->customer->id);

        $this->assertFalse($result['valid']);
        $this->assertSame('This offer is only available on your first order.', $result['message']);
    }

    public function test_missing_registered_only_defaults_false_guest_eligible(): void
    {
        $promo = $this->makePromo([
            'type' => 'fixed',
            'discount_value' => 300,
            'code' => 'LEGACY',
            'first_order_only' => true,
        ]);
        $this->assertFalse((bool) $promo->fresh()->registered_only);

        $order = $this->buildPromoOrder(100.0);
        $order->update(['customer_id' => null]);
        $result = app(PromotionEvaluator::class)->evaluate('LEGACY', $order->fresh(['items.item']), null);

        $this->assertTrue($result['valid']);
    }

    public function test_item_scoped_auto_first_order_registered_only_reaches_special_for_signed_in_first_timer(): void
    {
        $promo = Promotion::create([
            'name' => 'Welcome 15%',
            'code' => null,
            'type' => 'percentage',
            'discount_value' => 15,
            'is_active' => true,
            'auto_apply' => true,
            'first_order_only' => true,
            'registered_only' => true,
            'scope' => 'item',
            'starts_at' => now()->subDay(),
            'expires_at' => now()->addDays(14),
        ]);
        PromotionTarget::create([
            'promotion_id' => $promo->id,
            'target_type' => 'item',
            'target_id' => $this->item->id,
            'is_exclusion' => false,
        ]);
        app(\App\Domains\Promotions\Services\AutoPromotionPricing::class)->bustCache();

        Sanctum::actingAs($this->customer, ['customer']);
        $response = $this->getJson('/api/items');
        $response->assertOk();
        $row = collect($response->json('data'))->firstWhere('id', $this->item->id);
        $this->assertNotNull($row);
        $this->assertArrayHasKey('special', $row);
        $this->assertSame(85.0, (float) $row['special']['effective_price']);
        $this->assertSame(100.0, (float) $row['special']['original_price']);
    }

    public function test_apply_promo_api_surfaces_registered_only_message_on_guest_order(): void
    {
        $this->makePromo([
            'type' => 'fixed',
            'discount_value' => 500,
            'code' => 'SIGNIN',
            'first_order_only' => true,
            'registered_only' => true,
        ]);

        $order = $this->buildPromoOrder(100.0);
        $order->update(['customer_id' => null]);

        // apply-promo requires auth — staff path uses order.customer_id (null for guests).
        // Order app surfaces this same `message` on CheckoutPage via promoError / field-error.
        $staff = $this->makeOwner();
        $perm = \App\Models\Permission::firstOrCreate(
            ['slug' => 'promotions.discounts'],
            ['name' => 'Promotions discounts', 'group' => 'promotions'],
        );
        $staff->grantPermission('promotions.discounts');
        unset($perm);
        Sanctum::actingAs($staff, ['staff']);

        $this->postJson('/api/orders/'.$order->id.'/apply-promo', ['code' => 'SIGNIN'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Sign in or create an account to use this offer.');
    }
}
