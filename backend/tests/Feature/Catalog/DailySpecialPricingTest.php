<?php

declare(strict_types=1);

namespace Tests\Feature\Catalog;

use App\Models\DailySpecial;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Daily specials pricing tests.
 *
 * Verifies that the public /api/specials endpoint returns only currently-active
 * specials with correct effective prices, and that inactive/expired specials
 * are excluded.
 */
class DailySpecialPricingTest extends TestCase
{
    use RefreshDatabase;

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function createSpecial(array $attrs = []): DailySpecial
    {
        $item = $this->makeItem();

        return DailySpecial::create(array_merge([
            'item_id'       => $item->id,
            'is_active'     => true,
            'start_date'    => today()->toDateString(),
            'end_date'      => today()->toDateString(),
            'special_price' => null,
            'discount_pct'  => null,
            'days_of_week'  => null,
            'start_time'    => null,
            'end_time'      => null,
        ], $attrs));
    }

    // ── Active special appears in API ─────────────────────────────────────────

    public function test_active_special_appears_in_api_response(): void
    {
        $item    = $this->makeItem();
        $special = $this->createSpecial([
            'item_id'       => $item->id,
            'special_price' => 9.99,
        ]);

        $this->getJson('/api/specials')
            ->assertStatus(200)
            ->assertJsonFragment(['item_id' => $special->item_id]);
    }

    // ── Expired special is excluded ───────────────────────────────────────────

    public function test_expired_special_is_not_returned(): void
    {
        $item    = $this->makeItem();
        $special = $this->createSpecial([
            'item_id'    => $item->id,
            'start_date' => today()->subDays(5)->toDateString(),
            'end_date'   => today()->subDays(1)->toDateString(),
        ]);

        $response = $this->getJson('/api/specials')->assertStatus(200);
        $specials = $response->json('specials');
        $ids = collect($specials)->pluck('item_id')->toArray();

        $this->assertNotContains($special->item_id, $ids);
    }

    // ── Inactive special is excluded ──────────────────────────────────────────

    public function test_inactive_special_is_not_returned(): void
    {
        $item    = $this->makeItem();
        $special = $this->createSpecial([
            'item_id'   => $item->id,
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
        $item    = $this->makeItem(false, 0, ['base_price' => 20.00]);
        $special = $this->createSpecial([
            'item_id'       => $item->id,
            'special_price' => 12.50,
        ]);

        $response = $this->getJson('/api/specials')->assertStatus(200);
        $specials = $response->json('specials');
        $found    = collect($specials)->firstWhere('item_id', $special->item_id);

        $this->assertNotNull($found);
        $this->assertEquals(12.50, (float) $found['effective_price']);
    }

    // ── Discount percentage effective price ───────────────────────────────────

    public function test_discount_pct_produces_correct_effective_price(): void
    {
        $item    = $this->makeItem(false, 0, ['base_price' => 40.00]);
        $special = $this->createSpecial([
            'item_id'      => $item->id,
            'discount_pct' => 25,  // 25% off → 30.00
        ]);

        $response = $this->getJson('/api/specials')->assertStatus(200);
        $specials = $response->json('specials');
        $found    = collect($specials)->firstWhere('item_id', $special->item_id);

        $this->assertNotNull($found);
        $this->assertEqualsWithDelta(30.00, (float) $found['effective_price'], 0.01);
    }

    // ── Max quantity exhausted special is excluded ────────────────────────────

    public function test_sold_out_special_is_not_returned(): void
    {
        $item    = $this->makeItem();
        $special = $this->createSpecial([
            'item_id'      => $item->id,
            'max_quantity' => 5,
            'sold_count'   => 5,  // exhausted
        ]);

        $response = $this->getJson('/api/specials')->assertStatus(200);
        $specials = $response->json('specials');
        $ids      = collect($specials)->pluck('item_id')->toArray();

        $this->assertNotContains($special->item_id, $ids);
    }

    // ── Day-of-week filter ────────────────────────────────────────────────────

    public function test_special_with_wrong_day_of_week_is_excluded(): void
    {
        $today      = now()->dayOfWeek; // 0 = Sunday
        $wrongDay   = ($today + 3) % 7; // three days from now, guaranteed different

        $item    = $this->makeItem();
        $special = $this->createSpecial([
            'item_id'      => $item->id,
            'days_of_week' => [$wrongDay],
        ]);

        $response = $this->getJson('/api/specials')->assertStatus(200);
        $specials = $response->json('specials');
        $ids      = collect($specials)->pluck('item_id')->toArray();

        $this->assertNotContains($special->item_id, $ids);
    }

    // ── Admin can create a special ────────────────────────────────────────────

    public function test_admin_can_create_a_daily_special(): void
    {
        $owner = $this->makeOwner();
        $item  = $this->makeItem();

        $this->postJson('/api/admin/specials', [
            'item_id'       => $item->id,
            'special_price' => 5.00,
            'start_date'    => today()->toDateString(),
            'end_date'      => today()->addDays(7)->toDateString(),
            'is_active'     => true,
        ], $this->staffHeaders($owner))
        ->assertStatus(201);

        $this->assertDatabaseHas('daily_specials', ['item_id' => $item->id, 'special_price' => 5.00]);
    }
}
