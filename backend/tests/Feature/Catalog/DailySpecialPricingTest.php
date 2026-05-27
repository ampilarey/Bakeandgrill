<?php

declare(strict_types=1);

namespace Tests\Feature\Catalog;

use App\Domains\Orders\DTOs\OrderPaidData;
use App\Domains\Orders\Events\OrderPaid;
use App\Models\DailySpecial;
use App\Models\DailySpecialVariant;
use App\Models\Variant;
use App\Services\SpecialPricingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Daily specials pricing tests.
 *
 * Verifies that the public /api/specials endpoint returns only currently-active
 * specials with correct effective prices, and that inactive/expired specials
 * are excluded. Also verifies server-side auto-apply at order creation.
 */
class DailySpecialPricingTest extends TestCase
{
    use RefreshDatabase;

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function createSpecial(array $attrs = []): DailySpecial
    {
        $item = $this->makeItem();

        return DailySpecial::create(array_merge([
            'item_id' => $item->id,
            'is_active' => true,
            'start_date' => today()->toDateString(),
            'end_date' => today()->toDateString(),
            'special_price' => null,
            'discount_pct' => null,
            'days_of_week' => null,
            'start_time' => null,
            'end_time' => null,
        ], $attrs));
    }

    private function createCustomerOrder(int $itemId, ?int $variantId = null, int $qty = 1): \Illuminate\Testing\TestResponse
    {
        $customer = $this->makeCustomer();
        Sanctum::actingAs($customer, ['customer']);

        $line = ['item_id' => $itemId, 'quantity' => $qty];
        if ($variantId !== null) {
            $line['variant_id'] = $variantId;
        }

        return $this->postJson('/api/customer/orders', [
            'type' => 'online_pickup',
            'items' => [$line],
        ]);
    }

    // ── Active special appears in API ─────────────────────────────────────────

    public function test_active_special_appears_in_api_response(): void
    {
        $item = $this->makeItem();
        $special = $this->createSpecial([
            'item_id' => $item->id,
            'special_price' => 9.99,
        ]);

        $this->getJson('/api/specials')
            ->assertStatus(200)
            ->assertJsonFragment(['item_id' => $special->item_id]);
    }

    // ── Expired special is excluded ───────────────────────────────────────────

    public function test_expired_special_is_not_returned(): void
    {
        $item = $this->makeItem();
        $special = $this->createSpecial([
            'item_id' => $item->id,
            'start_date' => today()->subDays(5)->toDateString(),
            'end_date' => today()->subDays(1)->toDateString(),
        ]);

        $response = $this->getJson('/api/specials')->assertStatus(200);
        $specials = $response->json('specials');
        $ids = collect($specials)->pluck('item_id')->toArray();

        $this->assertNotContains($special->item_id, $ids);
    }

    // ── Inactive special is excluded ──────────────────────────────────────────

    public function test_inactive_special_is_not_returned(): void
    {
        $item = $this->makeItem();
        $special = $this->createSpecial([
            'item_id' => $item->id,
            'is_active' => false,
        ]);

        $response = $this->getJson('/api/specials')->assertStatus(200);
        $specials = $response->json('specials');
        $ids = collect($specials)->pluck('item_id')->toArray();

        $this->assertNotContains($special->item_id, $ids);
    }

    // ── Special price overrides base price ────────────────────────────────────

    public function test_special_price_is_returned_as_effective_price(): void
    {
        $item = $this->makeItem(false, 0, ['base_price' => 20.00]);
        $special = $this->createSpecial([
            'item_id' => $item->id,
            'special_price' => 12.50,
        ]);

        $response = $this->getJson('/api/specials')->assertStatus(200);
        $specials = $response->json('specials');
        $found = collect($specials)->firstWhere('item_id', $special->item_id);

        $this->assertNotNull($found);
        $this->assertEquals(12.50, (float) $found['effective_price']);
    }

    // ── Discount percentage effective price ───────────────────────────────────

    public function test_discount_pct_produces_correct_effective_price(): void
    {
        $item = $this->makeItem(false, 0, ['base_price' => 40.00]);
        $special = $this->createSpecial([
            'item_id' => $item->id,
            'discount_pct' => 25,  // 25% off → 30.00
        ]);

        $response = $this->getJson('/api/specials')->assertStatus(200);
        $specials = $response->json('specials');
        $found = collect($specials)->firstWhere('item_id', $special->item_id);

        $this->assertNotNull($found);
        $this->assertEqualsWithDelta(30.00, (float) $found['effective_price'], 0.01);
    }

    // ── Max quantity exhausted special is excluded ────────────────────────────

    public function test_sold_out_special_is_not_returned(): void
    {
        $item = $this->makeItem();
        $special = $this->createSpecial([
            'item_id' => $item->id,
            'max_quantity' => 5,
            'sold_count' => 5,  // exhausted
        ]);

        $response = $this->getJson('/api/specials')->assertStatus(200);
        $specials = $response->json('specials');
        $ids = collect($specials)->pluck('item_id')->toArray();

        $this->assertNotContains($special->item_id, $ids);
    }

    // ── Day-of-week filter ────────────────────────────────────────────────────

    public function test_special_with_wrong_day_of_week_is_excluded(): void
    {
        $today = now()->dayOfWeek; // 0 = Sunday
        $wrongDay = ($today + 3) % 7; // three days from now, guaranteed different

        $item = $this->makeItem();
        $special = $this->createSpecial([
            'item_id' => $item->id,
            'days_of_week' => [$wrongDay],
        ]);

        $response = $this->getJson('/api/specials')->assertStatus(200);
        $specials = $response->json('specials');
        $ids = collect($specials)->pluck('item_id')->toArray();

        $this->assertNotContains($special->item_id, $ids);
    }

    // ── Admin can create a special ────────────────────────────────────────────

    public function test_admin_can_create_a_daily_special(): void
    {
        $owner = $this->makeOwner();
        $item = $this->makeItem();

        $this->postJson('/api/admin/specials', [
            'item_id' => $item->id,
            'special_price' => 5.00,
            'start_date' => today()->toDateString(),
            'end_date' => today()->addDays(7)->toDateString(),
            'is_active' => true,
        ], $this->staffHeaders($owner))
            ->assertStatus(201);

        $this->assertDatabaseHas('daily_specials', ['item_id' => $item->id, 'special_price' => 5.00]);
    }

    // ── Order auto-apply ──────────────────────────────────────────────────────

    public function test_order_applies_active_special_price(): void
    {
        $item = $this->makeItem(false, 0, ['base_price' => 20.00]);
        $special = $this->createSpecial([
            'item_id' => $item->id,
            'special_price' => 12.50,
        ]);

        $response = $this->createCustomerOrder($item->id)->assertCreated();
        $line = $response->json('order.items.0');

        $this->assertEqualsWithDelta(12.50, (float) $line['unit_price'], 0.01);
        $this->assertEqualsWithDelta(20.00, (float) $line['original_unit_price'], 0.01);
        $this->assertSame($special->id, $line['daily_special_id']);
    }

    public function test_variant_item_gets_pct_discount_on_order(): void
    {
        $item = $this->makeItem(false, 0, ['base_price' => 10.00, 'has_variants' => true]);
        $variant = Variant::create([
            'item_id' => $item->id,
            'name' => 'Large',
            'price' => 50.00,
            'is_active' => true,
            'sort_order' => 1,
        ]);
        $this->createSpecial([
            'item_id' => $item->id,
            'discount_pct' => 20,
        ]);

        $response = $this->createCustomerOrder($item->id, $variant->id)->assertCreated();
        $line = $response->json('order.items.0');

        $this->assertEqualsWithDelta(40.00, (float) $line['unit_price'], 0.01);
        $this->assertEqualsWithDelta(50.00, (float) $line['original_unit_price'], 0.01);
    }

    public function test_expired_special_charges_full_price_on_order(): void
    {
        $item = $this->makeItem(false, 0, ['base_price' => 30.00]);
        $this->createSpecial([
            'item_id' => $item->id,
            'special_price' => 15.00,
            'start_date' => today()->subDays(5)->toDateString(),
            'end_date' => today()->subDay()->toDateString(),
        ]);

        $response = $this->createCustomerOrder($item->id)->assertCreated();
        $line = $response->json('order.items.0');

        $this->assertEqualsWithDelta(30.00, (float) $line['unit_price'], 0.01);
        $this->assertNull($line['daily_special_id'] ?? null);
    }

    public function test_max_quantity_exhausted_charges_full_price_on_order(): void
    {
        $item = $this->makeItem(false, 0, ['base_price' => 25.00]);
        $this->createSpecial([
            'item_id' => $item->id,
            'discount_pct' => 50,
            'max_quantity' => 5,
            'sold_count' => 5,
        ]);

        $response = $this->createCustomerOrder($item->id)->assertCreated();
        $line = $response->json('order.items.0');

        $this->assertEqualsWithDelta(25.00, (float) $line['unit_price'], 0.01);
        $this->assertNull($line['daily_special_id'] ?? null);
    }

    public function test_sold_count_increments_on_order_paid(): void
    {
        $item = $this->makeItem(false, 0, ['base_price' => 10.00]);
        $special = $this->createSpecial([
            'item_id' => $item->id,
            'discount_pct' => 10,
        ]);

        $response = $this->createCustomerOrder($item->id, null, 2)->assertCreated();
        $orderId = $response->json('order.id');

        $order = \App\Models\Order::with('items')->findOrFail($orderId);
        OrderPaid::dispatch(OrderPaidData::fromOrder($order, false));

        $special->refresh();
        $this->assertSame(2, $special->sold_count);
    }

    public function test_items_api_includes_special_block(): void
    {
        $item = $this->makeItem(false, 0, ['base_price' => 40.00]);
        $this->createSpecial([
            'item_id' => $item->id,
            'discount_pct' => 25,
        ]);

        $response = $this->getJson('/api/items?available_only=1')->assertOk();
        $found = collect($response->json('data'))->firstWhere('id', $item->id);

        $this->assertNotNull($found);
        $this->assertArrayHasKey('special', $found);
        $this->assertEqualsWithDelta(30.00, (float) $found['special']['effective_price'], 0.01);
    }

    public function test_per_variant_discount_pct_on_order(): void
    {
        $item = $this->makeItem(false, 0, ['base_price' => 10.00, 'has_variants' => true]);
        $small = Variant::create([
            'item_id' => $item->id,
            'name' => 'Small',
            'price' => 40.00,
            'is_active' => true,
            'sort_order' => 1,
        ]);
        $large = Variant::create([
            'item_id' => $item->id,
            'name' => 'Large',
            'price' => 60.00,
            'is_active' => true,
            'sort_order' => 2,
        ]);
        $special = $this->createSpecial(['item_id' => $item->id]);
        DailySpecialVariant::create([
            'daily_special_id' => $special->id,
            'variant_id' => $small->id,
            'discount_pct' => 20,
        ]);
        DailySpecialVariant::create([
            'daily_special_id' => $special->id,
            'variant_id' => $large->id,
            'discount_pct' => 10,
        ]);
        app(SpecialPricingService::class)->bustCache();

        $smallResponse = $this->createCustomerOrder($item->id, $small->id)->assertCreated();
        $this->assertEqualsWithDelta(32.00, (float) $smallResponse->json('order.items.0.unit_price'), 0.01);

        $largeResponse = $this->createCustomerOrder($item->id, $large->id)->assertCreated();
        $this->assertEqualsWithDelta(54.00, (float) $largeResponse->json('order.items.0.unit_price'), 0.01);
    }

    public function test_admin_can_create_special_with_variant_overrides(): void
    {
        $owner = $this->makeOwner();
        $item = $this->makeItem(false, 0, ['base_price' => 10.00, 'has_variants' => true]);
        $variant = Variant::create([
            'item_id' => $item->id,
            'name' => 'Regular',
            'price' => 50.00,
            'is_active' => true,
            'sort_order' => 1,
        ]);

        $this->postJson('/api/admin/specials', [
            'item_id' => $item->id,
            'start_date' => today()->toDateString(),
            'end_date' => today()->addDays(7)->toDateString(),
            'is_active' => true,
            'variant_overrides' => [
                ['variant_id' => $variant->id, 'discount_pct' => 15],
            ],
        ], $this->staffHeaders($owner))
            ->assertStatus(201)
            ->assertJsonPath('special.variant_overrides.0.variant_id', $variant->id)
            ->assertJsonPath('special.variant_overrides.0.discount_pct', 15);

        $this->assertDatabaseHas('daily_special_variants', [
            'variant_id' => $variant->id,
            'discount_pct' => 15,
        ]);
    }

    public function test_items_api_applies_per_variant_effective_price(): void
    {
        $item = $this->makeItem(false, 0, ['base_price' => 10.00, 'has_variants' => true]);
        $variant = Variant::create([
            'item_id' => $item->id,
            'name' => 'Large',
            'price' => 50.00,
            'is_active' => true,
            'sort_order' => 1,
        ]);
        $special = $this->createSpecial(['item_id' => $item->id, 'discount_pct' => 10]);
        DailySpecialVariant::create([
            'daily_special_id' => $special->id,
            'variant_id' => $variant->id,
            'discount_pct' => 25,
        ]);
        app(SpecialPricingService::class)->bustCache();

        $response = $this->getJson('/api/items?available_only=1')->assertOk();
        $found = collect($response->json('data'))->firstWhere('id', $item->id);
        $variantRow = collect($found['variants'])->firstWhere('id', $variant->id);

        $this->assertEqualsWithDelta(37.50, (float) $variantRow['effective_price'], 0.01);
        $this->assertEqualsWithDelta(50.00, (float) $variantRow['original_price'], 0.01);
    }
}
