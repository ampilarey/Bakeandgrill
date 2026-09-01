<?php

declare(strict_types=1);

namespace Tests\Feature\Menu;

use App\Models\Category;
use App\Models\Item;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The menu opens an item in a sheet instead of navigating.
 *
 * Tapping a card used to cost a page load — a blank flash, the header
 * redrawn, then the item — while the order app opened the same thing
 * instantly. Owner, 2026-09-01.
 *
 * The sheet fetches the item's body on its own and moves the address bar with
 * pushState. What must survive that, and is what these tests are about: the
 * full document still exists at the same URL for crawlers and shared links,
 * the fragment is not something that can be indexed or landed on, and both
 * come from one copy of the markup so they cannot drift apart.
 */
class MenuItemSheetTest extends TestCase
{
    use RefreshDatabase;

    private function item(string $name = 'Bajiya', float $price = 5.0): Item
    {
        $category = Category::create([
            'name' => 'Shorteats', 'slug' => 'shorteats', 'is_active' => true, 'sort_order' => 1,
        ]);

        return Item::create([
            'category_id' => $category->id,
            'name' => $name,
            'description' => 'Crisp, filled and fried.',
            'base_price' => $price,
            'is_active' => true,
            'is_available' => true,
        ]);
    }

    // ── The document a crawler and a shared link get ────────────────────────

    public function test_the_item_url_still_serves_a_whole_page(): void
    {
        // The sheet must take nothing away from what Google already indexes.
        $item = $this->item();

        $response = $this->get("/menu/{$item->id}")->assertOk();

        $response->assertSee('<!DOCTYPE html', false);
        $response->assertSee('Bajiya', false);
        $response->assertSee('MVR 5.00', false);
    }

    public function test_the_full_page_keeps_its_structured_data(): void
    {
        $item = $this->item();

        $this->get("/menu/{$item->id}")
            ->assertSee('application/ld+json', false)
            ->assertSee('MenuItem', false);
    }

    public function test_the_menu_links_to_items_with_real_hrefs(): void
    {
        // The sheet is layered on top of these. A crawler follows the href;
        // a customer with no JavaScript does too.
        $item = $this->item();

        $this->get('/menu')->assertSee('href="/menu/' . $item->id . '"', false);
    }

    // ── The fragment the sheet asks for ─────────────────────────────────────

    public function test_the_sheet_gets_the_body_alone(): void
    {
        $item = $this->item();

        $response = $this->withHeader('X-Menu-Sheet', '1')
            ->get("/menu/{$item->id}")
            ->assertOk();

        $response->assertSee('Bajiya', false);
        $response->assertSee('menu-item-page', false);
        // No document furniture — this is a panel, not a page.
        $response->assertDontSee('<!DOCTYPE html', false);
        $response->assertDontSee('<title>', false);
    }

    public function test_the_fragment_carries_no_structured_data(): void
    {
        // Structured data belongs to a document. Repeating it inside a panel
        // would describe a page that does not exist.
        $item = $this->item();

        $this->withHeader('X-Menu-Sheet', '1')
            ->get("/menu/{$item->id}")
            ->assertDontSee('application/ld+json', false);
    }

    public function test_the_fragment_is_not_reachable_without_the_header(): void
    {
        // Gated on a header rather than a query string on purpose: a fragment
        // has no canonical and no meta, so nothing a crawler or a pasted link
        // can reach may return one.
        $item = $this->item();

        $this->get("/menu/{$item->id}?sheet=1")->assertSee('<!DOCTYPE html', false);
        $this->get("/menu/{$item->id}?partial=1")->assertSee('<!DOCTYPE html', false);
    }

    public function test_page_and_sheet_render_the_same_item_body(): void
    {
        // One copy of the markup — the reason the sheet cannot drift from the
        // page it stands in for.
        $item = $this->item('Cutlet', 6);

        $article = function (string $html): string {
            $start = strpos($html, '<article class="menu-item-page"');
            $end = strrpos($html, '</article>');
            $this->assertNotFalse($start, 'no item article in the response');
            $this->assertNotFalse($end);

            // The CSP nonce is minted per request, so two renders of identical
            // markup differ by it and nothing else.
            return preg_replace('/nonce="[^"]*"/', 'nonce="x"', substr($html, $start, $end - $start));
        };

        $fragment = $this->withHeader('X-Menu-Sheet', '1')
            ->get("/menu/{$item->id}")->getContent();
        $page = $this->get("/menu/{$item->id}")->getContent();

        $this->assertSame($article($page), $article($fragment));
    }

    // ── Nothing regressed for the odd cases ────────────────────────────────

    public function test_an_unavailable_item_still_opens_both_ways(): void
    {
        // Old social posts must not 404, sheet or page.
        $item = $this->item();
        $item->update(['is_available' => false]);

        $this->get("/menu/{$item->id}")->assertOk();
        $this->withHeader('X-Menu-Sheet', '1')->get("/menu/{$item->id}")->assertOk();
    }

    public function test_an_id_that_never_existed_is_still_a_404(): void
    {
        $this->get('/menu/999999')->assertNotFound();
        $this->withHeader('X-Menu-Sheet', '1')->get('/menu/999999')->assertNotFound();
    }
}
