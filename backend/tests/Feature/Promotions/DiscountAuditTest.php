<?php

declare(strict_types=1);

namespace Tests\Feature\Promotions;

use App\Domains\Orders\Support\DiscountSettings;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Promotions\Services\AutoPromotionPricing;
use App\Models\Category;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\Permission;
use App\Models\Promotion;
use App\Models\PromotionTarget;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\PreparesPosApi;
use Tests\TestCase;

/**
 * Discount and promotion audit, 2026-11-10 (owner: "audit all discounts and promotions" → "Fix
 * all"). One test for each finding.
 */
class DiscountAuditTest extends TestCase
{
    use PreparesPosApi;
    use RefreshDatabase;

    private User $staff;

    private Device $device;

    private Item $curry;

    private Item $roshi;

    protected function setUp(): void
    {
        parent::setUp();
        $this->staff = $this->makeOwner();
        $this->device = Device::create(['name' => 'POS', 'identifier' => 'T-AUDIT', 'type' => 'pos', 'is_active' => true]);
        $this->withHeader('X-Device-Identifier', $this->device->identifier);
        $food = Category::create(['name' => 'Food', 'slug' => 'food-audit', 'is_active' => true]);
        $this->curry = Item::create(['category_id' => $food->id, 'name' => 'Chicken Curry', 'base_price' => 60, 'sku' => 'AUD-C', 'is_active' => true, 'is_available' => true]);
        $this->roshi = Item::create(['category_id' => $food->id, 'name' => 'Roshi', 'base_price' => 5, 'sku' => 'AUD-R', 'is_active' => true, 'is_available' => true]);
        $this->preparePosApi($this->staff, $this->device);
    }

    /** @param array<string, mixed> $extra */
    private function offer(array $extra): Promotion
    {
        $p = Promotion::create(array_merge([
            'name' => 'Offer', 'code' => null, 'type' => 'percentage', 'discount_value' => 10,
            'is_active' => true, 'auto_apply' => true, 'stackable' => false, 'scope' => 'order',
        ], $extra));
        Cache::flush();
        app(AutoPromotionPricing::class)->bustCache();

        return $p;
    }

    private function ticket(int $curries = 1): Order
    {
        Sanctum::actingAs($this->staff, ['staff']);
        $id = (int) $this->postJson('/api/orders', [
            'type' => 'takeaway', 'device_identifier' => $this->device->identifier, 'print' => false,
            'items' => [['item_id' => $this->curry->id, 'quantity' => $curries]],
        ])->assertCreated()->json('order.id');

        return Order::findOrFail($id);
    }

    public function test_an_edit_keeps_the_dates_where_they_were_and_can_move_the_start(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);
        $id = $this->postJson('/api/admin/promotions', [
            'name' => 'Lunch', 'type' => 'percentage', 'discount_value' => 10, 'auto_apply' => true, 'scope' => 'order',
            'starts_at' => '2026-11-09T12:00', 'expires_at' => '2026-11-09T15:00',
        ])->assertCreated()->json('promotion.id');
        $this->assertSame('2026-11-09 15:00:00', Promotion::find($id)->getRawOriginal('expires_at'));

        // The form sends back what the list gave it ("...Z"): the end must not move.
        $row = collect($this->getJson('/api/admin/promotions')->json('data') ?? [])->firstWhere('id', $id)
            ?? Promotion::find($id)->toArray();
        $this->patchJson("/api/admin/promotions/{$id}", ['name' => 'Lunch offer', 'starts_at' => $row['starts_at'], 'expires_at' => $row['expires_at']])->assertOk();
        $p = Promotion::find($id);
        $this->assertSame('2026-11-09 12:00:00', $p->getRawOriginal('starts_at'));
        $this->assertSame('2026-11-09 15:00:00', $p->getRawOriginal('expires_at'));

        $this->patchJson("/api/admin/promotions/{$id}", ['starts_at' => '2026-11-12T12:00', 'expires_at' => '2026-11-12T15:00'])->assertOk();
        $this->assertSame('2026-11-12 12:00:00', Promotion::find($id)->getRawOriginal('starts_at'));

        $this->patchJson("/api/admin/promotions/{$id}", ['expires_at' => '2026-11-01T15:00'])->assertUnprocessable();
    }

    public function test_the_server_refuses_what_the_form_refuses(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);
        $base = ['name' => 'Big', 'auto_apply' => true, 'scope' => 'order'];
        $this->postJson('/api/admin/promotions', $base + ['type' => 'percentage', 'discount_value' => 150])->assertUnprocessable();
        $this->postJson('/api/admin/promotions', $base + ['type' => 'free_item', 'discount_value' => 0])->assertUnprocessable();

        $id = $this->postJson('/api/admin/promotions', $base + ['type' => 'percentage', 'discount_value' => 10])->assertCreated()->json('promotion.id');
        $this->patchJson("/api/admin/promotions/{$id}", ['discount_value' => 101])->assertUnprocessable();
        $this->patchJson("/api/admin/promotions/{$id}", ['type' => 'fixed', 'discount_value' => 500001])->assertUnprocessable();

        // One that slipped in before is still never a negative price.
        $old = $this->offer(['name' => 'Old 150', 'discount_value' => 150, 'scope' => 'item']);
        $old->targets()->create(['target_type' => 'item', 'target_id' => $this->curry->id, 'is_exclusion' => false]);
        Cache::flush();
        $pricing = app(AutoPromotionPricing::class);
        $pricing->bustCache();
        $this->assertSame(0.0, (float) $pricing->resolveForItem($this->curry->id, 60.0, $this->curry)['unit_price']);
    }

    public function test_best_one_wins_between_a_code_and_an_automatic_offer(): void
    {
        $this->offer(['name' => 'Auto 20', 'discount_value' => 20]);
        $this->offer(['name' => 'Five', 'code' => 'FIVE', 'auto_apply' => false, 'discount_value' => 5, 'stackable' => true]);
        $this->offer(['name' => 'Thirty', 'code' => 'THIRTY', 'auto_apply' => false, 'discount_value' => 30]);
        $o = $this->ticket();
        $this->assertSame(1200, (int) $o->fresh()->promo_discount_laar);

        // A smaller code is refused and the 20% stays, ticked "stackable" or not.
        $this->postJson("/api/orders/{$o->id}/apply-promo", ['code' => 'FIVE'])->assertUnprocessable()
            ->assertJsonPath('message', 'This ticket already has Auto 20 (MVR 12.00 off), which is more than this code gives (MVR 3.00). The bigger one stays.');
        $this->assertSame(1200, (int) $o->fresh()->promo_discount_laar);

        // A bigger one takes its place.
        $this->postJson("/api/orders/{$o->id}/apply-promo", ['code' => 'THIRTY'])->assertOk();
        $this->assertSame(1800, (int) $o->fresh()->promo_discount_laar);
    }

    public function test_add_them_up_keeps_both(): void
    {
        SiteSetting::set(DiscountSettings::STACKING, 'stack');
        $this->offer(['name' => 'Auto 20', 'discount_value' => 20]);
        $this->offer(['name' => 'Five', 'code' => 'FIVE', 'auto_apply' => false, 'discount_value' => 5]);
        $o = $this->ticket();
        $this->postJson("/api/orders/{$o->id}/apply-promo", ['code' => 'FIVE'])->assertOk();
        $this->assertSame(1500, (int) $o->fresh()->promo_discount_laar);
    }

    public function test_a_code_removed_and_typed_again_comes_off_again(): void
    {
        $p = $this->offer(['name' => 'Ten', 'code' => 'TEN', 'auto_apply' => false]);
        $o = $this->ticket();
        $this->postJson("/api/orders/{$o->id}/apply-promo", ['code' => 'TEN'])->assertOk();
        $this->deleteJson("/api/orders/{$o->id}/promo/{$p->id}")->assertOk();
        $this->assertSame(0, (int) $o->fresh()->promo_discount_laar);
        $this->postJson("/api/orders/{$o->id}/apply-promo", ['code' => 'TEN'])->assertOk();
        $this->assertSame(600, (int) $o->fresh()->promo_discount_laar);
    }

    public function test_an_item_offer_with_a_minimum_order_waits_for_the_minimum(): void
    {
        $p = $this->offer(['name' => 'Half curry over 100', 'discount_value' => 50, 'scope' => 'item', 'min_order_laar' => 10000]);
        $p->targets()->create(['target_type' => 'item', 'target_id' => $this->curry->id, 'is_exclusion' => false]);
        Cache::flush();
        $pricing = app(AutoPromotionPricing::class);
        $pricing->bustCache();

        $this->assertNull($pricing->resolveForItem($this->curry->id, 60.0, $this->curry)['promotion'], 'not in the menu price');
        $small = $this->ticket(1)->fresh();
        $this->assertSame(6000, (int) $small->subtotal_laar);
        $this->assertSame(0, (int) $small->promo_discount_laar);
        $big = $this->ticket(2)->fresh();
        $this->assertSame(12000, (int) $big->subtotal_laar);
        $this->assertSame(6000, (int) $big->promo_discount_laar);
    }

    public function test_the_free_item_prompt_waits_for_the_minimum_order_too(): void
    {
        $p = $this->offer(['name' => 'Roshi with curry', 'type' => 'free_item', 'discount_value' => 0, 'scope' => 'item', 'min_order_laar' => 10000]);
        $p->targets()->create(['target_type' => 'item', 'target_id' => $this->curry->id, 'is_exclusion' => false, 'role' => PromotionTarget::ROLE_TRIGGER]);
        $p->targets()->create(['target_type' => 'item', 'target_id' => $this->roshi->id, 'is_exclusion' => false, 'role' => PromotionTarget::ROLE_REWARD]);
        Cache::flush();
        Sanctum::actingAs($this->staff, ['staff']);
        $line = fn (int $n) => ['items' => [['item_id' => $this->curry->id, 'quantity' => $n, 'unit_price' => 60]]];

        $this->assertSame([], $this->postJson('/api/promotions/cart-rewards', $line(1))->assertOk()->json('rewards'));
        $this->postJson('/api/promotions/cart-rewards', $line(2))->assertOk()
            ->assertJsonPath('rewards.0.message', "You've earned a free Roshi — add it.");
    }

    public function test_a_happy_hour_past_midnight_belongs_to_the_day_it_opened(): void
    {
        $p = new Promotion(['days_of_week' => [5], 'starts_time' => '22:00', 'ends_time' => '02:00', 'is_active' => true]);

        $this->assertTrue($p->matchesScheduleWindow(CarbonImmutable::parse('2026-11-06 23:00:00')), 'Friday 11 PM');
        $this->assertTrue($p->matchesScheduleWindow(CarbonImmutable::parse('2026-11-07 01:00:00')), 'Saturday 1 AM, still Friday night');
        $this->assertFalse($p->matchesScheduleWindow(CarbonImmutable::parse('2026-11-07 23:00:00')), 'Saturday 11 PM');
        $this->assertFalse($p->matchesScheduleWindow(CarbonImmutable::parse('2026-11-06 01:00:00')), 'Friday 1 AM is Thursday night');
        $this->assertFalse($p->matchesScheduleWindow(CarbonImmutable::parse('2026-11-07 03:00:00')), 'after it closed');
    }

    public function test_a_role_given_promotions_can_save_what_it_can_open(): void
    {
        PermissionCatalogSync::sync();
        $role = Role::create(['slug' => 'marketer', 'name' => 'Marketer', 'description' => '', 'is_active' => true]);
        $role->permissions()->sync(Permission::whereIn('slug', ['promotions.manage', 'admin.access'])->pluck('id'));
        $user = User::create(['name' => 'M', 'email' => 'marketer@test.com', 'password' => Hash::make('x'), 'role_id' => $role->id, 'pin_hash' => Hash::make('1234'), 'is_active' => true]);
        Sanctum::actingAs($user, ['staff']);

        $this->getJson('/api/admin/promotions')->assertOk();
        $id = $this->postJson('/api/admin/promotions', ['name' => 'X', 'type' => 'percentage', 'discount_value' => 10, 'auto_apply' => true, 'scope' => 'order'])
            ->assertCreated()->json('promotion.id');
        $this->patchJson("/api/admin/promotions/{$id}", ['name' => 'Y'])->assertOk();
        $this->deleteJson("/api/admin/promotions/{$id}")->assertOk();
    }
}
