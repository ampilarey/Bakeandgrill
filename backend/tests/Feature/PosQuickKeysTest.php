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
use App\Models\PosQuickKey;
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
 * The Quick tab and the Popular-now tab on the till.
 *
 * Owner, 2026-09-02: the POS shows categories and items in the admin's
 * order, "but usually pos used for dine in customers and certain items are
 * frequent in certain times … manually add/edit … for pos or each staff on
 * his own". Two answers: a pinned set per cashier (and a shared default),
 * and a ranking of what sells at this hour, both riding in the menu payload
 * so they are there offline.
 */
class PosQuickKeysTest extends TestCase
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

    private function staff(string $roleSlug = 'staff', string $email = 'cashier@test.local'): User
    {
        $role = Role::firstOrCreate(
            ['slug' => $roleSlug],
            ['name' => ucfirst($roleSlug), 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();

        return User::create([
            'name' => 'Till ' . $roleSlug,
            'email' => $email,
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
    }

    // ── Quick keys ──────────────────────────────────────────────────────────

    public function test_the_menu_carries_the_shared_set_and_the_cashiers_own(): void
    {
        $bajiya = $this->item('Bajiya');
        $tea = $this->item('Black Tea');
        $cashier = $this->staff();

        PosQuickKey::create(['user_id' => null, 'item_id' => $tea->id, 'sort_order' => 0]);
        PosQuickKey::create(['user_id' => $cashier->id, 'item_id' => $bajiya->id, 'sort_order' => 0]);
        PosQuickKey::create(['user_id' => $cashier->id, 'item_id' => $tea->id, 'sort_order' => 1]);

        Sanctum::actingAs($cashier, ['staff']);

        $this->getJson('/api/pos/menu?channel=dine_in')
            ->assertOk()
            ->assertJsonPath('quick_keys.shared', [$tea->id])
            ->assertJsonPath('quick_keys.mine', [$bajiya->id, $tea->id]);

        $this->getJson('/api/pos/bootstrap?channel=dine_in')
            ->assertOk()
            ->assertJsonPath('quick_keys.mine', [$bajiya->id, $tea->id]);
    }

    public function test_a_cashier_saves_their_own_set_in_order(): void
    {
        $bajiya = $this->item('Bajiya');
        $tea = $this->item('Black Tea');
        $cashier = $this->staff();
        Sanctum::actingAs($cashier, ['staff']);

        $this->putJson('/api/pos/quick-keys', ['item_ids' => [$tea->id, $bajiya->id]])
            ->assertOk()
            ->assertJsonPath('mine', [$tea->id, $bajiya->id]);

        // Saving again replaces, it does not append.
        $this->putJson('/api/pos/quick-keys', ['item_ids' => [$bajiya->id]])
            ->assertOk()
            ->assertJsonPath('mine', [$bajiya->id]);

        $this->assertSame(1, PosQuickKey::where('user_id', $cashier->id)->count());
        $this->assertSame(0, PosQuickKey::whereNull('user_id')->count());
    }

    public function test_an_unknown_item_and_a_duplicate_are_dropped_not_rejected(): void
    {
        // The till builds its list from a cached menu; an item retired since
        // then must not make the whole save fail.
        $bajiya = $this->item('Bajiya');
        Sanctum::actingAs($this->staff(), ['staff']);

        $this->putJson('/api/pos/quick-keys', ['item_ids' => [$bajiya->id, 999999, $bajiya->id]])
            ->assertOk()
            ->assertJsonPath('mine', [$bajiya->id]);
    }

    public function test_only_a_menu_manager_may_change_the_shared_set(): void
    {
        $bajiya = $this->item('Bajiya');

        Sanctum::actingAs($this->staff('staff', 'a@test.local'), ['staff']);
        $this->putJson('/api/pos/quick-keys/shared', ['item_ids' => [$bajiya->id]])
            ->assertStatus(403);
        $this->getJson('/api/pos/menu?channel=dine_in')
            ->assertJsonPath('can_manage_shared_quick_keys', false);

        Sanctum::actingAs($this->staff('owner', 'b@test.local'), ['staff']);
        $this->putJson('/api/pos/quick-keys/shared', ['item_ids' => [$bajiya->id]])
            ->assertOk()
            ->assertJsonPath('shared', [$bajiya->id]);
        $this->getJson('/api/pos/menu?channel=dine_in')
            ->assertJsonPath('quick_keys.shared', [$bajiya->id])
            ->assertJsonPath('can_manage_shared_quick_keys', true);
    }

    public function test_the_set_is_capped(): void
    {
        Sanctum::actingAs($this->staff(), ['staff']);

        $this->putJson('/api/pos/quick-keys', ['item_ids' => range(1, 40)])
            ->assertStatus(422);
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
}
