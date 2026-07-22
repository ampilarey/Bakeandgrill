<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Order;
use App\Models\Referral;
use App\Models\ReferralCode;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReferralTest extends TestCase
{
    use RefreshDatabase;

    private Customer $referrer;

    private Customer $referee;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();

        $this->referrer = Customer::create([
            'name' => 'Referrer',
            'phone' => '+9607001111',
            'loyalty_points' => 0,
            'tier' => 'bronze',
            'is_active' => true,
        ]);
        $this->referee = Customer::create([
            'name' => 'Referee',
            'phone' => '+9607002222',
            'loyalty_points' => 0,
            'tier' => 'bronze',
            'is_active' => true,
        ]);

        $category = Category::create(['name' => 'Food', 'slug' => 'food-ref', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Wrap',
            'base_price' => 50.00,
            'sku' => 'W001',
            'barcode' => 'W001',
            'is_active' => true,
            'is_available' => true,
        ]);
    }

    private function pendingOrderFor(Customer $customer): Order
    {
        return Order::create([
            'order_number' => 'BG-REF-' . uniqid(),
            'type' => 'online_pickup',
            'status' => 'payment_pending',
            'payment_status' => 'unpaid',
            'subtotal' => 50.00,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 50.00,
            'customer_id' => $customer->id,
        ]);
    }

    public function test_my_code_sets_default_max_uses(): void
    {
        Sanctum::actingAs($this->referrer, ['customer']);
        $this->getJson('/api/customer/referral-code')->assertOk();

        $code = ReferralCode::where('customer_id', $this->referrer->id)->first();
        $this->assertNotNull($code);
        $this->assertSame(20, (int) $code->max_uses);
    }

    public function test_apply_referral_to_order(): void
    {
        $code = ReferralCode::create([
            'customer_id' => $this->referrer->id,
            'code' => 'FRIEND20',
            'uses_count' => 0,
            'max_uses' => 20,
            'referrer_reward_mvr' => 10,
            'referee_discount_mvr' => 5,
            'is_active' => true,
        ]);

        $order = $this->pendingOrderFor($this->referee);
        // Attach a line so subtotal room exists for discount calc
        $order->items()->create([
            'item_id' => $this->item->id,
            'item_name' => $this->item->name,
            'quantity' => 1,
            'unit_price' => 50,
            'total_price' => 50,
        ]);

        Sanctum::actingAs($this->referee, ['customer']);
        $this->postJson("/api/orders/{$order->id}/apply-referral", ['code' => 'FRIEND20'])
            ->assertOk()
            ->assertJsonPath('code', 'FRIEND20');

        $this->assertGreaterThan(0, (int) $order->fresh()->referral_discount_laar);
        $this->assertSame('FRIEND20', $order->fresh()->referral_code);
        $this->assertSame(0, (int) $code->fresh()->uses_count); // bumped on pay, not apply
    }

    public function test_self_referral_blocked(): void
    {
        ReferralCode::create([
            'customer_id' => $this->referrer->id,
            'code' => 'SELFCODE',
            'uses_count' => 0,
            'max_uses' => 20,
            'referrer_reward_mvr' => 10,
            'referee_discount_mvr' => 5,
            'is_active' => true,
        ]);

        $order = $this->pendingOrderFor($this->referrer);
        $order->items()->create([
            'item_id' => $this->item->id,
            'item_name' => $this->item->name,
            'quantity' => 1,
            'unit_price' => 50,
            'total_price' => 50,
        ]);

        Sanctum::actingAs($this->referrer, ['customer']);
        $this->postJson("/api/orders/{$order->id}/apply-referral", ['code' => 'SELFCODE'])
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'You cannot use your own referral code.']);
    }

    public function test_duplicate_referral_blocked(): void
    {
        $code = ReferralCode::create([
            'customer_id' => $this->referrer->id,
            'code' => 'DUPCODE',
            'uses_count' => 0,
            'max_uses' => 20,
            'referrer_reward_mvr' => 10,
            'referee_discount_mvr' => 5,
            'is_active' => true,
        ]);

        Referral::create([
            'referral_code_id' => $code->id,
            'referee_customer_id' => $this->referee->id,
            'order_id' => null,
            'reward_paid' => false,
        ]);

        $order = $this->pendingOrderFor($this->referee);
        $order->items()->create([
            'item_id' => $this->item->id,
            'item_name' => $this->item->name,
            'quantity' => 1,
            'unit_price' => 50,
            'total_price' => 50,
        ]);

        Sanctum::actingAs($this->referee, ['customer']);
        $this->postJson("/api/orders/{$order->id}/apply-referral", ['code' => 'DUPCODE'])
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'You have already used this referral code.']);
    }

    public function test_max_uses_enforced(): void
    {
        ReferralCode::create([
            'customer_id' => $this->referrer->id,
            'code' => 'MAXED',
            'uses_count' => 1,
            'max_uses' => 1,
            'referrer_reward_mvr' => 10,
            'referee_discount_mvr' => 5,
            'is_active' => true,
        ]);

        $order = $this->pendingOrderFor($this->referee);
        $order->items()->create([
            'item_id' => $this->item->id,
            'item_name' => $this->item->name,
            'quantity' => 1,
            'unit_price' => 50,
            'total_price' => 50,
        ]);

        Sanctum::actingAs($this->referee, ['customer']);
        $this->postJson("/api/orders/{$order->id}/apply-referral", ['code' => 'MAXED'])
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'This referral code has reached its usage limit.']);
    }

    public function test_first_order_only_blocks_prior_paid_customers(): void
    {
        config(['loyalty.referral.first_order_only' => true]);

        ReferralCode::create([
            'customer_id' => $this->referrer->id,
            'code' => 'FIRSTONLY',
            'uses_count' => 0,
            'max_uses' => 20,
            'referrer_reward_mvr' => 10,
            'referee_discount_mvr' => 5,
            'is_active' => true,
        ]);

        Order::create([
            'order_number' => 'BG-PRIOR-1',
            'type' => 'takeaway',
            'status' => 'paid',
            'payment_status' => 'paid',
            'subtotal' => 20,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 20,
            'customer_id' => $this->referee->id,
        ]);

        $order = $this->pendingOrderFor($this->referee);
        $order->items()->create([
            'item_id' => $this->item->id,
            'item_name' => $this->item->name,
            'quantity' => 1,
            'unit_price' => 50,
            'total_price' => 50,
        ]);

        Sanctum::actingAs($this->referee, ['customer']);
        $this->postJson("/api/orders/{$order->id}/apply-referral", ['code' => 'FIRSTONLY'])
            ->assertStatus(422)
            ->assertJsonFragment([
                'message' => 'Referral discounts are only available on your first paid order.',
            ]);
    }
}
