<?php

declare(strict_types=1);

namespace Tests\Feature\Menu;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Item;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Signing in must not change what is on the menu.
 *
 * Owner, 2026-09-05: an item was missing from the order app but present in a
 * private window. The owner was signed in to the order app with their own
 * staff account, and `/api/items` decided "admin" purely from the token
 * holding the `staff` ability — regardless of which app was asking. Admin mode
 * paginates at 25 where the customer menu returns 100, so the app, which read
 * only `data`, was served the first quarter of the menu. The missing item was
 * 46th.
 *
 * The order app now says which menu it wants. `view=customer` can only narrow
 * what comes back, so honouring it from the client hands out nothing.
 */
class SignedInStaffSeeTheCustomerMenuTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
    }

    /** Enough items that the admin page size of 25 cuts the list. */
    private function seedMenu(int $count): Category
    {
        $category = Category::create(['name' => 'Bondibai', 'is_active' => true]);

        for ($i = 1; $i <= $count; $i++) {
            Item::create([
                'category_id' => $category->id,
                'name' => sprintf('Dish %02d', $i),
                'base_price' => 10 + $i,
                'sort_order' => $i,
                'is_active' => true,
                'is_available' => true,
            ]);
        }

        return $category;
    }

    /** @return list<string> */
    private function names(string $url): array
    {
        return array_column($this->getJson($url)->assertOk()->json('data'), 'name');
    }

    public function test_a_signed_out_customer_gets_the_whole_menu(): void
    {
        $this->seedMenu(40);

        $names = $this->names('/api/items?channel=online_pickup&view=customer');

        $this->assertCount(40, $names);
        $this->assertContains('Dish 40', $names);
    }

    public function test_a_signed_in_staff_member_gets_the_same_menu_as_a_customer(): void
    {
        // The bug, exactly: the same request, the same app, one signed-in
        // phone, and a quarter of the menu.
        $this->seedMenu(40);
        $signedOut = $this->names('/api/items?channel=online_pickup&view=customer');

        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $signedIn = $this->names('/api/items?channel=online_pickup&view=customer');

        $this->assertSame($signedOut, $signedIn, 'Signing in must not change the menu.');
    }

    public function test_the_item_that_fell_off_page_one_is_there(): void
    {
        $this->seedMenu(50);
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $names = $this->names('/api/items?channel=online_pickup&view=customer');

        $this->assertContains('Dish 46', $names, 'The 46th dish is the one the owner could not find.');
    }

    public function test_the_customer_view_still_marks_availability(): void
    {
        // Admin mode omits `available_now` entirely, so a staff member browsing
        // the order app saw items with no availability at all. The customer
        // view has to be the customer payload, not just the customer's rows.
        $this->seedMenu(1);
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $row = $this->getJson('/api/items?channel=online_pickup&view=customer')->assertOk()->json('data.0');

        $this->assertArrayHasKey('available_now', $row);
        $this->assertTrue($row['available_now']);
    }

    public function test_the_customer_view_hides_what_customers_may_not_see(): void
    {
        // It narrows, never widens: an inactive item stays hidden even though
        // the caller holds a staff token that would otherwise reveal it.
        $category = $this->seedMenu(1);
        Item::create([
            'category_id' => $category->id,
            'name' => 'Retired Dish',
            'base_price' => 20,
            'is_active' => false,
            'is_available' => true,
        ]);

        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->assertNotContains(
            'Retired Dish',
            $this->names('/api/items?channel=online_pickup&view=customer'),
        );
    }

    public function test_the_admin_listing_is_untouched(): void
    {
        // The admin dashboard asks without a view and keeps exactly what it had.
        $this->seedMenu(40);
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $res = $this->getJson('/api/items')->assertOk();

        $this->assertSame(25, $res->json('per_page'));
        $this->assertArrayHasKey('channel_availabilities', $res->json('data.0'));
    }

    public function test_the_response_says_how_many_pages_there_are(): void
    {
        // What the order app now follows instead of assuming one page.
        $this->seedMenu(40);
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->assertSame(2, $this->getJson('/api/items')->assertOk()->json('last_page'));
    }
}
