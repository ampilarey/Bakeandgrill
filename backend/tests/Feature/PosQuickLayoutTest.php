<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Item;
use App\Models\ItemChannelAvailability;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\PosQuickLayout;
use App\Models\Role;
use App\Models\User;
use App\Services\PosPopularNowService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The Quick tabs and the Popular-now tab on the till.
 *
 * Owner, 2026-09-02: the POS shows categories and items in the admin's
 * order, "but usually pos used for dine in customers and certain items are
 * frequent in certain times … each staff on his own" — then, the same
 * afternoon: more than one tab, renamed, rearranged, switching by time of
 * day, following the cashier to any iPad, and copyable from another
 * cashier. All of it rides in the menu payload so it is there offline.
 */
class PosQuickLayoutTest extends TestCase
{
    use RefreshDatabase;

    private function item(string $name, float $price = 10.0): Item
    {
        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $category = Category::firstOrCreate(['slug' => 'pos-food'], ['name' => 'POS Food', 'is_active' => true]);
        $item = Item::create([
            'category_id' => $category->id,
            'name' => $name,
            'base_price' => $price,
            'is_active' => true,
            'is_available' => true,
        ]);
        ItemChannelAvailability::query()->updateOrCreate(
            ['item_id' => $item->id, 'channel' => 'dine_in'],
            ['is_enabled' => true],
        );

        return $item;
    }

    private function staff(string $roleSlug = 'staff', string $email = 'cashier@test.local', string $name = 'Ariya'): User
    {
        $role = Role::firstOrCreate(
            ['slug' => $roleSlug],
            ['name' => ucfirst($roleSlug), 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();

        return User::create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
    }

    /** @param list<int> $items */
    private function tab(string $name, array $items, ?string $from = null, ?string $to = null, string $id = 'tab-1'): array
    {
        return ['id' => $id, 'name' => $name, 'items' => $items, 'from' => $from, 'to' => $to];
    }

    // ── Layouts ─────────────────────────────────────────────────────────────

    public function test_the_menu_carries_the_shared_layout_and_the_cashiers_own(): void
    {
        $bajiya = $this->item('Bajiya');
        $tea = $this->item('Black Tea');
        $cashier = $this->staff();

        PosQuickLayout::create(['user_id' => null, 'tabs' => [$this->tab('Everyone', [$tea->id])]]);
        PosQuickLayout::create(['user_id' => $cashier->id, 'tabs' => [
            $this->tab('Morning', [$bajiya->id, $tea->id], '06:00', '11:00', 'tab-1'),
            $this->tab('Evening', [$tea->id], null, null, 'tab-2'),
        ]]);

        Sanctum::actingAs($cashier, ['staff']);

        $menu = $this->getJson('/api/pos/menu?channel=dine_in')->assertOk();
        $menu->assertJsonPath('quick_layout.shared.0.name', 'Everyone')
            ->assertJsonPath('quick_layout.shared.0.items', [$tea->id])
            ->assertJsonPath('quick_layout.mine.0.name', 'Morning')
            ->assertJsonPath('quick_layout.mine.0.from', '06:00')
            ->assertJsonPath('quick_layout.mine.0.to', '11:00')
            ->assertJsonPath('quick_layout.mine.1.name', 'Evening')
            ->assertJsonPath('quick_layout.mine.1.from', null);

        // The bootstrap feed carries the same, so a fresh login on another
        // iPad shows the cashier's tabs at once.
        $this->getJson('/api/pos/bootstrap?channel=dine_in')
            ->assertOk()
            ->assertJsonPath('quick_layout.mine.0.name', 'Morning');
    }

    public function test_a_cashier_saves_their_layout_whole(): void
    {
        $bajiya = $this->item('Bajiya');
        $tea = $this->item('Black Tea');
        Sanctum::actingAs($this->staff(), ['staff']);

        $this->putJson('/api/pos/quick-keys', ['tabs' => [
            $this->tab('Tea time', [$tea->id, $bajiya->id], '15:00', '18:00'),
            $this->tab('Regulars', [$bajiya->id], null, null, 'tab-2'),
        ]])
            ->assertOk()
            ->assertJsonPath('mine.0.name', 'Tea time')
            ->assertJsonPath('mine.0.items', [$tea->id, $bajiya->id])
            ->assertJsonPath('mine.1.name', 'Regulars');

        // Saving again replaces the layout; it does not append tabs.
        $this->putJson('/api/pos/quick-keys', ['tabs' => [$this->tab('Only', [$bajiya->id])]])
            ->assertOk()
            ->assertJsonCount(1, 'mine');

        $this->assertSame(1, PosQuickLayout::whereNotNull('user_id')->count());
        $this->assertSame(0, PosQuickLayout::whereNull('user_id')->count());
    }

    public function test_an_unknown_item_and_a_duplicate_are_dropped_not_rejected(): void
    {
        // The till builds its tabs from a cached menu; an item retired since
        // then must not make the whole save fail.
        $bajiya = $this->item('Bajiya');
        Sanctum::actingAs($this->staff(), ['staff']);

        $this->putJson('/api/pos/quick-keys', ['tabs' => [$this->tab('Quick', [$bajiya->id, 999999, $bajiya->id])]])
            ->assertOk()
            ->assertJsonPath('mine.0.items', [$bajiya->id]);
    }

    public function test_what_a_person_typed_is_checked(): void
    {
        $bajiya = $this->item('Bajiya');
        Sanctum::actingAs($this->staff(), ['staff']);

        // No name.
        $this->putJson('/api/pos/quick-keys', ['tabs' => [$this->tab('', [$bajiya->id])]])->assertStatus(422);
        // Half a time window.
        $this->putJson('/api/pos/quick-keys', ['tabs' => [$this->tab('Morning', [$bajiya->id], '06:00', null)]])->assertStatus(422);
        // Not a clock time.
        $this->putJson('/api/pos/quick-keys', ['tabs' => [$this->tab('Morning', [$bajiya->id], '6am', '11am')]])->assertStatus(422);
        // Too many tabs.
        $tabs = array_map(fn (int $i) => $this->tab("Tab $i", [$bajiya->id], null, null, "tab-$i"), range(1, 7));
        $this->putJson('/api/pos/quick-keys', ['tabs' => $tabs])->assertStatus(422);
        // Too many items on one tab.
        $this->putJson('/api/pos/quick-keys', ['tabs' => [$this->tab('Big', range(1, 40))]])->assertStatus(422);
    }

    public function test_only_a_menu_manager_may_change_the_shared_layout(): void
    {
        $bajiya = $this->item('Bajiya');

        Sanctum::actingAs($this->staff('staff', 'a@test.local'), ['staff']);
        $this->putJson('/api/pos/quick-keys/shared', ['tabs' => [$this->tab('Shared', [$bajiya->id])]])
            ->assertStatus(403);
        $this->getJson('/api/pos/menu?channel=dine_in')
            ->assertJsonPath('can_manage_shared_quick_keys', false);

        Sanctum::actingAs($this->staff('owner', 'b@test.local', 'Boss'), ['staff']);
        $this->putJson('/api/pos/quick-keys/shared', ['tabs' => [$this->tab('Shared', [$bajiya->id])]])
            ->assertOk()
            ->assertJsonPath('shared.0.name', 'Shared');
        $this->getJson('/api/pos/menu?channel=dine_in')
            ->assertJsonPath('quick_layout.shared.0.items', [$bajiya->id])
            ->assertJsonPath('can_manage_shared_quick_keys', true);
    }

    // ── Copying another cashier's tabs ──────────────────────────────────────

    public function test_a_cashier_can_see_who_has_tabs_and_take_a_copy(): void
    {
        $bajiya = $this->item('Bajiya');
        $ariya = $this->staff('staff', 'ariya@test.local', 'Ariya');
        $hassan = $this->staff('staff', 'hassan@test.local', 'Hassan');
        $nobody = $this->staff('staff', 'nobody@test.local', 'Nobody');

        PosQuickLayout::create(['user_id' => $ariya->id, 'tabs' => [$this->tab('Ariya morning', [$bajiya->id], '06:00', '11:00')]]);
        PosQuickLayout::create(['user_id' => $nobody->id, 'tabs' => []]);

        Sanctum::actingAs($hassan, ['staff']);

        // Only cashiers with something to copy, never yourself.
        $this->getJson('/api/pos/quick-keys/sources')
            ->assertOk()
            ->assertJsonCount(1, 'sources')
            ->assertJsonPath('sources.0.user_id', $ariya->id)
            ->assertJsonPath('sources.0.name', 'Ariya')
            ->assertJsonPath('sources.0.tabs', 1);

        $this->postJson('/api/pos/quick-keys/copy', ['user_id' => $ariya->id])
            ->assertOk()
            ->assertJsonPath('mine.0.name', 'Ariya morning')
            ->assertJsonPath('mine.0.items', [$bajiya->id])
            ->assertJsonPath('mine.0.from', '06:00');

        // A copy, not a link: Ariya changing hers leaves Hassan's alone.
        PosQuickLayout::where('user_id', $ariya->id)->update(['tabs' => []]);
        $this->getJson('/api/pos/menu?channel=dine_in')
            ->assertJsonPath('quick_layout.mine.0.name', 'Ariya morning');

        // Nothing to copy is a validation error, not a wiped layout.
        $this->postJson('/api/pos/quick-keys/copy', ['user_id' => $nobody->id])->assertStatus(422);
        $this->getJson('/api/pos/menu?channel=dine_in')
            ->assertJsonPath('quick_layout.mine.0.name', 'Ariya morning');
    }

    // ── Popular now ─────────────────────────────────────────────────────────

    private function sold(Item $item, int $qty, CarbonImmutable $at): void
    {
        $order = Order::factory()->create(['status' => 'completed', 'created_at' => $at, 'updated_at' => $at]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => $item->id,
            'item_name' => $item->name,
            'quantity' => $qty,
            'unit_price' => $item->base_price,
            'total_price' => $item->base_price * $qty,
        ]);
    }

    public function test_popular_now_ranks_what_sells_at_this_hour_on_this_kind_of_day(): void
    {
        Cache::flush();
        $hedhika = $this->item('Hedhika');
        $breakfast = $this->item('Continental Breakfast');
        $cake = $this->item('Date Cake');

        // A Tuesday at 16:00 — "now".
        $now = CarbonImmutable::parse('2026-09-01 16:00:00');

        // Hedhika sells at tea time on weekdays; breakfast sells at 8am;
        // cake sells at tea time but only on Saturdays.
        $this->sold($hedhika, 5, $now->subWeeks(1)->setTime(16, 30));
        $this->sold($hedhika, 4, $now->subWeeks(2)->setTime(15, 15));
        $this->sold($cake, 2, $now->subWeeks(1)->setTime(16, 10));
        $this->sold($breakfast, 20, $now->subWeeks(1)->setTime(8, 0));
        $this->sold($cake, 30, $now->subDays(3)->setTime(16, 0)); // Saturday
        // Too old to count.
        $this->sold($breakfast, 50, $now->subWeeks(8)->setTime(16, 0));

        $ranked = app(PosPopularNowService::class)->rank([$hedhika->id, $breakfast->id, $cake->id], $now);

        $this->assertSame([$hedhika->id, $cake->id], $ranked);
    }

    public function test_popular_now_rides_in_the_menu_payload(): void
    {
        Cache::flush();
        $item = $this->item('Bajiya');
        $this->sold($item, 3, CarbonImmutable::now()->subWeek());
        Sanctum::actingAs($this->staff(), ['staff']);

        $response = $this->getJson('/api/pos/menu?channel=dine_in')->assertOk();

        $this->assertIsArray($response->json('popular_now'));
        $this->assertContains($item->id, $response->json('popular_now'));
    }

    public function test_a_cancelled_order_does_not_count(): void
    {
        Cache::flush();
        $item = $this->item('Bajiya');
        $now = CarbonImmutable::parse('2026-09-01 12:00:00');
        $order = Order::factory()->create(['status' => 'cancelled', 'created_at' => $now->subWeek(), 'updated_at' => $now->subWeek()]);
        OrderItem::create([
            'order_id' => $order->id, 'item_id' => $item->id, 'item_name' => $item->name,
            'quantity' => 9, 'unit_price' => 10, 'total_price' => 90,
        ]);

        $this->assertSame([], app(PosPopularNowService::class)->rank([$item->id], $now));
    }

    public function test_an_unpaid_pending_order_does_not_count(): void
    {
        Cache::flush();
        $item = $this->item('Bajiya');
        $now = CarbonImmutable::parse('2026-09-01 12:00:00');
        $order = Order::factory()->create(['status' => 'pending', 'created_at' => $now->subWeek(), 'updated_at' => $now->subWeek()]);
        OrderItem::create([
            'order_id' => $order->id, 'item_id' => $item->id, 'item_name' => $item->name,
            'quantity' => 9, 'unit_price' => 10, 'total_price' => 90,
        ]);

        $this->assertSame([], app(PosPopularNowService::class)->rank([$item->id], $now));
    }

    public function test_saving_the_shared_layout_twice_leaves_one_shared_row(): void
    {
        Sanctum::actingAs($this->staff('owner', 'boss@test.local', 'Boss'), ['staff']);
        $item = $this->item('Bajiya');

        foreach ([1, 2] as $n) {
            $this->putJson('/api/pos/quick-keys/shared', ['tabs' => [$this->tab("Quick $n", [$item->id])]])
                ->assertOk();
        }

        $this->assertSame(1, PosQuickLayout::query()->whereNull('user_id')->count());
        $this->assertSame('Quick 2', PosQuickLayout::query()->whereNull('user_id')->first()->tabs[0]['name']);
    }
}
