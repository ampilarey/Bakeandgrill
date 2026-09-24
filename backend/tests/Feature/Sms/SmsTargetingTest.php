<?php

declare(strict_types=1);

namespace Tests\Feature\Sms;

use App\Domains\Notifications\Contracts\SmsProviderInterface;
use App\Domains\Notifications\Services\BulkSmsService;
use App\Domains\Notifications\Support\SmsAudienceCriteria;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\ItemPairStat;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\SmsAudience;
use App\Models\SmsCampaign;
use App\Models\SmsLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\TestCase;

/**
 * SMS audit, 2026-09-24: "advanced promotions based on customer purchases".
 * A campaign audience can be built from what people bought, how they
 * ordered, what they spent, how long they have been away and when their
 * birthday is; audiences can be saved and reused; recipes fill the form;
 * "send a test to me" texts the signed-in staff member the exact text.
 */
class SmsTargetingTest extends TestCase
{
    use RefreshDatabase;

    private Category $bakery;

    private Category $cakes;

    private Category $grill;

    private Item $croissant;

    private Item $cake;

    private Item $burger;

    private Item $wrap;

    private int $seq = 1;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->bakery = Category::create(['name' => 'Bakery', 'slug' => 'bakery', 'is_active' => true]);
        $this->cakes = Category::create(['name' => 'Cakes', 'slug' => 'cakes', 'is_active' => true, 'parent_id' => $this->bakery->id]);
        $this->grill = Category::create(['name' => 'Grill', 'slug' => 'grill', 'is_active' => true]);
        $this->croissant = $this->makeItem(false, 10, ['name' => 'Croissant', 'category_id' => $this->bakery->id]);
        $this->cake = $this->makeItem(false, 10, ['name' => 'Chocolate cake', 'category_id' => $this->cakes->id]);
        $this->burger = $this->makeItem(false, 10, ['name' => 'Chicken burger', 'category_id' => $this->grill->id]);
        $this->wrap = $this->makeItem(false, 10, ['name' => 'Chicken wrap', 'category_id' => $this->grill->id]);
    }

    private function customer(string $name, array $attrs = []): Customer
    {
        $n = $this->seq++;

        return Customer::create(array_merge([
            'name' => $name, 'phone' => sprintf('+96077%05d', $n), 'loyalty_points' => 0, 'tier' => 'bronze', 'is_active' => true, 'sms_opt_out' => false,
        ], $attrs));
    }

    /** @param list<Item> $items */
    private function paidOrder(Customer $c, array $items, int $daysAgo = 5, string $type = 'takeaway', float $total = 100, string $status = 'completed'): Order
    {
        $order = Order::factory()->create([
            'customer_id' => $c->id, 'type' => $type, 'status' => $status,
            'paid_at' => now()->subDays($daysAgo), 'created_at' => now()->subDays($daysAgo),
            'subtotal' => $total, 'tax_amount' => 0, 'total' => $total, 'total_laar' => (int) round($total * 100),
        ]);
        foreach ($items as $item) {
            OrderItem::create(['order_id' => $order->id, 'item_id' => $item->id, 'item_name' => $item->name, 'quantity' => 1, 'unit_price' => 10, 'total_price' => 10]);
        }

        return $order;
    }

    /** @return list<string> */
    private function names(array $criteria): array
    {
        return app(BulkSmsService::class)->resolveAudience($criteria)->pluck('name')->sort()->values()->all();
    }

    public function test_bought_item_and_category_filters_follow_paid_orders_in_the_window(): void
    {
        $aisha = $this->customer('Aisha');
        $ibrahim = $this->customer('Ibrahim');
        $mariyam = $this->customer('Mariyam');
        $hassan = $this->customer('Hassan');
        $this->paidOrder($aisha, [$this->burger], 10);
        $this->paidOrder($ibrahim, [$this->burger], 120);                       // outside a 90-day window
        $this->paidOrder($mariyam, [$this->cake], 3);                            // child category of Bakery
        $this->paidOrder($hassan, [$this->burger], 2, status: 'refunded');       // refunded: never counts
        $this->paidOrder($hassan, [$this->croissant], 2, status: 'cancelled');

        $this->assertSame(['Aisha'], $this->names(['bought_item_ids' => [$this->burger->id]]));
        $this->assertSame(['Aisha', 'Ibrahim'], $this->names(['bought_item_ids' => [$this->burger->id], 'window_days' => 365]));
        $this->assertSame(['Mariyam'], $this->names(['bought_category_ids' => [$this->bakery->id]]), 'a parent category covers its children');
        $this->assertSame(['Aisha'], $this->names(['bought_category_ids' => [$this->grill->id]]));
        $this->assertSame(['Hassan', 'Mariyam'], $this->names(['not_bought_item_ids' => [$this->burger->id]]), 'never bought, all time — Ibrahim did, 120 days ago; Hassan\'s was refunded');
        $this->assertSame([], $this->names(['bought_item_ids' => [$this->burger->id], 'bought_category_ids' => [$this->bakery->id]]), 'filters intersect');
    }

    public function test_order_type_spend_orders_dormant_and_birthday_filters(): void
    {
        $delivery = $this->customer('Delivery Dan', ['date_of_birth' => '1990-10-14']);
        $regular = $this->customer('Regular Rania', ['date_of_birth' => '1985-03-02']);
        $gone = $this->customer('Gone Gasim');
        $never = $this->customer('Never Nadha', ['date_of_birth' => '2000-10-01']);
        $this->paidOrder($delivery, [$this->burger], 4, 'delivery', 350);
        $this->paidOrder($regular, [$this->croissant], 1, 'dine_in', 200);
        $this->paidOrder($regular, [$this->croissant], 8, 'takeaway', 200);
        $this->paidOrder($regular, [$this->croissant], 20, 'takeaway', 200);
        $this->paidOrder($gone, [$this->wrap], 75, 'takeaway', 900);

        $this->assertSame(['Delivery Dan'], $this->names(['order_types' => ['delivery']]));
        $this->assertSame(['Regular Rania'], $this->names(['order_types' => ['dine_in', 'online_pickup']]));
        $this->assertSame(['Gone Gasim', 'Regular Rania'], $this->names(['min_spend_mvr' => 500]));
        $this->assertSame(['Regular Rania'], $this->names(['min_orders' => 3]));
        $this->assertSame(['Gone Gasim'], $this->names(['dormant_days' => 60]));
        $this->assertSame(['Delivery Dan', 'Never Nadha'], $this->names(['birthday_month' => 10]));
        $this->assertSame(['Delivery Dan'], $this->names(['birthday_month' => 10, 'min_spend_mvr' => 300]));
        $this->assertSame(['Never Nadha'], $this->names(['segment' => 'no_order_yet']));
        $this->assertSame(['Delivery Dan', 'Gone Gasim'], $this->names(['segment' => 'first_time_buyers', 'window_days' => 365, 'not_bought_item_ids' => [$this->croissant->id]]));
        $this->assertSame('Delivery in the last 90 days · Spent MVR 300+ · Birthday in October', SmsAudienceCriteria::describe(['order_types' => ['delivery'], 'min_spend_mvr' => 300, 'birthday_month' => 10, 'window_days' => 90]));
    }

    public function test_likes_item_reaches_buyers_of_the_item_and_of_what_goes_with_it(): void
    {
        $fan = $this->customer('Fan');
        $pairFan = $this->customer('Pair fan');
        $other = $this->customer('Other');
        $this->paidOrder($fan, [$this->burger], 3);
        $this->paidOrder($pairFan, [$this->wrap], 3);
        $this->paidOrder($other, [$this->croissant], 3);
        ItemPairStat::create(['item_id' => $this->burger->id, 'paired_item_id' => $this->wrap->id, 'pair_count' => 12, 'anchor_orders' => 20, 'paired_orders' => 15, 'total_orders' => 100, 'confidence' => 0.6, 'lift' => 4.0, 'computed_at' => now()]);
        ItemPairStat::create(['item_id' => $this->burger->id, 'paired_item_id' => $this->croissant->id, 'pair_count' => 12, 'anchor_orders' => 20, 'paired_orders' => 90, 'total_orders' => 100, 'confidence' => 0.6, 'lift' => 0.7, 'computed_at' => now()]);

        $this->assertSame(['Fan', 'Pair fan'], $this->names(['likes_item_id' => $this->burger->id]), 'lift below 1 (the croissant) is just popular, not related');
    }

    public function test_saved_audiences_are_reusable_and_a_campaign_built_on_one_follows_its_current_meaning(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $dan = $this->customer('Dan');
        $rania = $this->customer('Rania');
        $this->paidOrder($dan, [$this->burger], 4, 'delivery');
        $this->paidOrder($rania, [$this->burger], 4, 'dine_in');

        $this->postJson('/api/admin/sms/audiences', ['name' => 'Delivery regulars', 'criteria' => ['order_types' => ['delivery'], 'window_days' => 90, 'segment' => '', 'audience_id' => null]])
            ->assertCreated()
            ->assertJsonPath('audience.count', 1)
            ->assertJsonPath('audience.summary', 'Delivery in the last 90 days')
            ->assertJsonPath('audience.criteria', ['order_types' => ['delivery'], 'window_days' => 90]);
        $id = (int) SmsAudience::firstOrFail()->id;
        $this->postJson('/api/admin/sms/audiences', ['name' => 'Delivery regulars', 'criteria' => []])->assertStatus(422);

        $this->postJson('/api/admin/sms/campaigns/preview', ['message' => 'Free delivery tonight', 'target_criteria' => ['audience_id' => $id]])
            ->assertOk()->assertJsonPath('recipient_count', 1)->assertJsonPath('sample_recipients.0.name', 'Dan');

        $this->postJson('/api/admin/sms/campaigns', ['name' => 'Delivery push', 'message' => 'Free delivery tonight', 'target_criteria' => ['audience_id' => $id, 'min_orders' => 1]])
            ->assertCreated();
        $campaign = SmsCampaign::firstOrFail();
        $this->assertSame(['audience_id' => $id, 'min_orders' => 1], $campaign->target_criteria);

        // Widen the saved audience: the campaign follows it.
        $this->patchJson("/api/admin/sms/audiences/{$id}", ['criteria' => ['order_types' => ['delivery', 'dine_in']]])->assertOk()->assertJsonPath('audience.count', 2);
        $this->assertSame(['Dan', 'Rania'], $this->names($campaign->target_criteria));
        $this->getJson('/api/admin/sms/campaigns')->assertOk()->assertJsonPath('data.0.audience_summary', 'Delivery/Dine-in in the last 90 days · 1+ paid orders');

        $this->getJson('/api/admin/sms/audiences')->assertOk()->assertJsonCount(1, 'audiences')->assertJsonPath('audiences.0.name', 'Delivery regulars');
        $this->deleteJson("/api/admin/sms/audiences/{$id}")->assertOk();
        $this->assertSame(0, SmsAudience::count());
        $this->assertSame(['Dan', 'Rania'], $this->names($campaign->target_criteria), 'a deleted audience leaves the inline criteria');

        $this->postJson('/api/admin/sms/campaigns/preview', ['message' => 'x', 'target_criteria' => ['bought_item_ids' => [999999]]])->assertStatus(422);
        $this->postJson('/api/admin/sms/campaigns/preview', ['message' => 'x', 'target_criteria' => ['order_types' => ['carrier_pigeon']]])->assertStatus(422);
    }

    public function test_recipes_and_send_a_test_to_me(): void
    {
        $provider = Mockery::mock(SmsProviderInterface::class);
        $sent = [];
        $provider->shouldReceive('send')->andReturnUsing(function (string $to, string $message) use (&$sent) {
            $sent[] = [$to, $message];

            return [true, ['ok' => true], null];
        });
        $this->app->instance(SmsProviderInterface::class, $provider);

        Sanctum::actingAs($this->makeOwner(['name' => 'Ahmed Rasheed', 'phone' => '+9607779999']), ['staff']);
        $recipes = $this->getJson('/api/admin/sms/campaigns/recipes')->assertOk()->json('recipes');
        $keys = array_column($recipes, 'key');
        $this->assertContains('win_back', $keys);
        $this->assertContains('new_dish_for_fans', $keys);
        $this->assertSame('item', collect($recipes)->firstWhere('key', 'new_dish_for_fans')['needs']);

        $this->postJson('/api/admin/sms/campaigns/test-send', ['message' => 'Hi {name}, 20% off tonight', 'message_variant_b' => 'Plan B'])
            ->assertOk()->assertJsonPath('ok', true)->assertJsonCount(2, 'results');
        $this->assertCount(2, $sent);
        $this->assertSame('+9607779999', $sent[0][0]);
        $this->assertStringStartsWith("Hi Ahmed, 20% off tonight\nStop: ", $sent[0][1], 'the exact text: name filled in, opt-out line on');
        $log = SmsLog::where('type', 'staff_campaign_test')->firstOrFail();
        $this->assertSame('campaign_test', $log->reference_type);

        $this->postJson('/api/admin/sms/campaigns/test-send', ['message' => 'To a typed number', 'phone' => '7771111'])->assertOk();
        $this->assertSame('+9607771111', end($sent)[0]);

        Sanctum::actingAs($this->makeManager(['phone' => null]), ['staff']);
        $this->postJson('/api/admin/sms/campaigns/test-send', ['message' => 'No phone'])->assertStatus(422);
    }

    public function test_a_campaign_text_fills_in_the_first_name(): void
    {
        $provider = Mockery::mock(SmsProviderInterface::class);
        $sent = [];
        $provider->shouldReceive('send')->andReturnUsing(function (string $to, string $message) use (&$sent) {
            $sent[$to] = $message;

            return [true, ['ok' => true], null];
        });
        $this->app->instance(SmsProviderInterface::class, $provider);
        $this->customer('Aminath Shifa');
        $this->customer('', ['phone' => '+9607700099']);

        $campaign = SmsCampaign::create(['name' => 'Hello', 'message' => 'Hi {name}, cake is back', 'status' => 'draft', 'target_criteria' => []]);
        app(BulkSmsService::class)->dispatch($campaign);

        $this->assertStringStartsWith('Hi Aminath, cake is back', $sent['+9607700001']);
        $this->assertStringStartsWith('Hi there, cake is back', $sent['+9607700099']);
    }
}
