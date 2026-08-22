<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Item;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The menu, rendered on the server.
 *
 * Two things were wrong before this page existed, and the tests here are
 * shaped around both:
 *
 *   - `/menu` was a 301 into `/order/menu`, a React route that serves a
 *     crawler `<div id="root"></div>`. The site's own Restaurant schema
 *     pointed there too, so Google was being sent to an empty page.
 *   - The dine-in QR code pointed at `/order/view`, meaning a customer at a
 *     table waited for a large JS bundle before seeing any food.
 *
 * So every assertion here is about what arrives in the HTML, before any
 * JavaScript runs. Anything that only appears after hydration has missed the
 * point of the page.
 */
class MenuPageTest extends TestCase
{
    use RefreshDatabase;

    private function category(string $name, int $sort = 1): Category
    {
        return Category::create([
            'name' => $name,
            'slug' => str()->slug($name),
            'is_active' => true,
            'sort_order' => $sort,
        ]);
    }

    private function item(Category $category, string $name, float $price = 10.0, array $attrs = []): Item
    {
        return Item::create(array_merge([
            'category_id' => $category->id,
            'name' => $name,
            'base_price' => $price,
            'sku' => 'MENU-' . strtoupper(substr(md5($name), 0, 6)),
            'is_active' => true,
            'is_available' => true,
        ], $attrs));
    }

    public function test_the_food_is_in_the_html_without_javascript(): void
    {
        // The whole reason the page exists.
        $shorteats = $this->category('Shorteats');
        $this->item($shorteats, 'Bajiya', 5);
        $this->item($shorteats, 'Cutlet', 6);

        $response = $this->get('/menu')->assertOk();

        $response->assertSee('Bajiya', false);
        $response->assertSee('Cutlet', false);
        $response->assertSee('Shorteats', false);
        $response->assertSee('MVR 5.00', false);
    }

    public function test_menu_is_no_longer_a_redirect(): void
    {
        // It used to 301 into the SPA. A route added below that redirect would
        // have been dead code, so this asserts the redirect is really gone.
        $this->category('Shorteats');

        $this->get('/menu')->assertOk();
    }

    public function test_an_item_priced_by_size_never_advertises_zero(): void
    {
        // base_price stays 0 on a sized item; printing it read "MVR 0.00" on
        // other surfaces before this was fixed.
        $drinks = $this->category('Drinks');
        $coke = $this->item($drinks, 'Coke', 0, ['has_variants' => true]);
        $coke->variants()->create(['name' => 'Small', 'price' => 15, 'is_active' => true]);
        $coke->variants()->create(['name' => 'Large', 'price' => 25, 'is_active' => true]);

        $response = $this->get('/menu')->assertOk();

        $response->assertSee('MVR 15.00', false);
        $response->assertSee('From', false);
        $response->assertDontSee('MVR 0.00', false);
    }

    public function test_each_item_links_into_the_ordering_app(): void
    {
        // Browsing is a reading task and belongs here; the cart stays in the
        // SPA. This link is the handoff.
        $cat = $this->category('Shorteats');
        $item = $this->item($cat, 'Bajiya', 5);

        $this->get('/menu')
            ->assertOk()
            ->assertSee('/order/menu?item=' . $item->id, false);
    }

    public function test_it_hides_what_a_customer_cannot_order(): void
    {
        $cat = $this->category('Shorteats');
        $this->item($cat, 'Available Item', 5);
        $this->item($cat, 'Sold Out Item', 5, ['is_available' => false]);
        $this->item($cat, 'Retired Item', 5, ['is_active' => false]);

        $response = $this->get('/menu')->assertOk();

        $response->assertSee('Available Item', false);
        $response->assertDontSee('Sold Out Item', false);
        $response->assertDontSee('Retired Item', false);
    }

    public function test_an_item_whose_category_is_gone_is_still_shown(): void
    {
        // An item nobody can find is indistinguishable from one that does not
        // exist. Silently dropping stock off the menu is the worse failure.
        $live = $this->category('Shorteats');
        $this->item($live, 'Bajiya', 5);

        $hidden = $this->category('Retired Category');
        $orphan = $this->item($hidden, 'Orphan Item', 7);
        $hidden->update(['is_active' => false]);

        $response = $this->get('/menu')->assertOk();

        $response->assertSee('Bajiya', false);
        $response->assertSee('Orphan Item', false);
        // Grouped under a neutral heading rather than the retired category.
        $response->assertDontSee('Retired Category', false);
    }

    public function test_categories_follow_menu_order(): void
    {
        $drinks = $this->category('Drinks', 2);
        $food = $this->category('Shorteats', 1);
        $this->item($drinks, 'Coke', 15);
        $this->item($food, 'Bajiya', 5);

        $html = $this->get('/menu')->assertOk()->getContent();

        $this->assertLessThan(
            strpos($html, 'Drinks'),
            strpos($html, 'Shorteats'),
            'sort_order 1 must render before sort_order 2',
        );
    }

    // ── Layout: the rail, the bands, the outline ──────────────────────────

    /** Just the menu, without the shared header/footer chrome around it. */
    private function menuShell(): string
    {
        $html = $this->get('/menu')->assertOk()->getContent();

        $start = strpos($html, '<div class="menu-shell">');
        $end = strpos($html, '<div class="menu-cta">');
        $this->assertNotFalse($start, 'the menu shell must be in the HTML');
        $this->assertNotFalse($end, 'the closing CTA must follow the menu');

        return substr($html, $start, $end - $start);
    }

    public function test_the_rail_lists_every_section_with_its_count(): void
    {
        // Mirrors the order app's left category rail. The count is what tells
        // someone whether a section is worth the tap.
        $shorteats = $this->category('Shorteats', 1);
        $this->item($shorteats, 'Bajiya', 5);
        $this->item($shorteats, 'Cutlet', 6);
        $drinks = $this->category('Drinks', 2);
        $this->item($drinks, 'Coke', 15);

        $html = $this->get('/menu')->assertOk()->getContent();

        preg_match('#<nav class="menu-rail".*?</nav>#s', $html, $rail);
        $this->assertNotEmpty($rail, 'the category rail must be in the HTML');

        $this->assertStringContainsString('href="#cat-' . $shorteats->id . '"', $rail[0]);
        $this->assertStringContainsString('href="#cat-' . $drinks->id . '"', $rail[0]);
        // Spoken as "Shorteats 3" without this — the numeral needs a noun.
        $this->assertStringContainsString('aria-label="Shorteats, 2 items"', $rail[0]);
        $this->assertStringContainsString('aria-label="Drinks, 1 item"', $rail[0]);
    }

    public function test_a_category_without_art_never_renders_an_empty_image(): void
    {
        // src="" re-requests the page itself in some browsers, and shows a
        // broken-image glyph in the band either way.
        $cat = $this->category('Shorteats');
        $this->item($cat, 'Bajiya', 5);

        $shell = $this->menuShell();

        // Scoped to the menu itself: the shared layout renders the brand logo
        // with an empty src when no logo setting is stored, which is its own
        // problem and would make this assertion fail for the wrong reason.
        $this->assertStringNotContainsString('src=""', $shell);
        $this->assertStringNotContainsString('srcset=""', $shell);
        // The band is still there, carrying its own tint instead of a photo.
        $this->assertMatchesRegularExpression(
            '#<header class="menu-cat-band" id="cat-' . $cat->id . '"\s+style="background: linear-gradient#',
            $shell,
        );
    }

    public function test_the_page_has_a_heading_outline_a_crawler_can_follow(): void
    {
        // h1 page → h2 category → h3 item. Item names were spans first, which
        // renders the same and tells a crawler nothing about the structure.
        $cat = $this->category('Shorteats');
        $this->item($cat, 'Bajiya', 5);

        $html = $this->get('/menu')->assertOk()->getContent();

        preg_match('#<div class="menu-main">.*#s', $html, $main);
        $this->assertNotEmpty($main);

        $this->assertMatchesRegularExpression('#<h2[^>]*>\s*Shorteats\s*</h2>#', $main[0]);
        $this->assertMatchesRegularExpression('#<h3 class="menu-card-name"[^>]*>Bajiya</h3>#', $main[0]);
    }

    public function test_the_whole_card_is_the_link_not_a_caption_beside_it(): void
    {
        // The photo is the biggest thing on the card; a separate "Order →"
        // caption made the small text the only tap target.
        $cat = $this->category('Shorteats');
        $item = $this->item($cat, 'Bajiya', 5);

        $html = $this->get('/menu')->assertOk()->getContent();

        $this->assertMatchesRegularExpression(
            '#<a class="menu-card" href="/order/menu\?item=' . $item->id . '">\s*<div class="menu-card-circle">#',
            $html,
        );
    }

    // ── What search engines get ───────────────────────────────────────────

    public function test_it_publishes_menu_structured_data(): void
    {
        $cat = $this->category('Shorteats');
        $this->item($cat, 'Bajiya', 5);

        $html = $this->get('/menu')->assertOk()->getContent();

        preg_match_all('#<script type="application/ld\+json">(.*?)</script>#s', $html, $matches);
        $this->assertNotEmpty($matches[1], 'the page must carry JSON-LD');

        $menu = null;
        foreach ($matches[1] as $json) {
            $decoded = json_decode(trim($json), true);
            // A block that does not parse is worth nothing and nobody reports it.
            $this->assertIsArray($decoded, 'every JSON-LD block must be valid JSON');
            if (($decoded['@type'] ?? null) === 'Menu') {
                $menu = $decoded;
            }
        }

        $this->assertNotNull($menu, 'a Menu block must be present');
        $this->assertSame('Shorteats', $menu['hasMenuSection'][0]['name']);

        $first = $menu['hasMenuSection'][0]['hasMenuItem'][0];
        $this->assertSame('Bajiya', $first['name']);
        $this->assertSame('5.00', $first['offers']['price']);
        $this->assertSame('MVR', $first['offers']['priceCurrency']);
    }

    public function test_the_restaurant_schema_points_at_a_page_a_crawler_can_read(): void
    {
        // It used to say hasMenu: /order — the SPA, which serves an empty div.
        $this->category('Shorteats');

        $html = $this->get('/')->assertOk()->getContent();

        preg_match_all('#<script type="application/ld\+json">(.*?)</script>#s', $html, $matches);
        $restaurant = null;
        foreach ($matches[1] as $json) {
            $decoded = json_decode(trim($json), true);
            if (($decoded['@type'] ?? null) === 'Restaurant') {
                $restaurant = $decoded;
            }
        }

        // Decoded rather than string-matched: @json escapes slashes, so the
        // raw HTML reads "http:\/\/…" and a literal comparison would fail
        // while the schema is perfectly correct.
        $this->assertNotNull($restaurant, 'the Restaurant block must be present');
        $this->assertSame(url('/menu'), $restaurant['hasMenu']);
    }

    public function test_the_sitemap_advertises_it(): void
    {
        $this->get('/sitemap.xml')
            ->assertOk()
            ->assertSee('<loc>' . url('/menu') . '</loc>', false);
    }

    // ── Edge cases ────────────────────────────────────────────────────────

    public function test_an_empty_menu_says_so_rather_than_breaking(): void
    {
        $this->get('/menu')
            ->assertOk()
            ->assertSee('being updated', false);
    }

    /** The middleware serves English unless the owner has switched Dhivehi on. */
    private function enableDhivehi(): void
    {
        SiteSetting::set('language_switcher_enabled', 'true', 'website', 'en');
    }

    public function test_a_dhivehi_visitor_gets_dhivehi_names(): void
    {
        $this->enableDhivehi();
        $cat = $this->category('Shorteats');
        $this->item($cat, 'Bajiya', 5, ['name_dv' => 'ބަޖިޔާ']);

        $this->get('/menu?lang=dv')
            ->assertOk()
            ->assertSee('ބަޖިޔާ', false);
    }

    public function test_a_dhivehi_visitor_gets_dhivehi_category_names(): void
    {
        // The rail and the band are the page's navigation. Leaving them English
        // on a Dhivehi page is the half-translation that reads worst.
        $this->enableDhivehi();
        $cat = Category::create([
            'name' => 'Shorteats',
            'name_dv' => 'ހެދިކާ',
            'slug' => 'shorteats',
            'is_active' => true,
            'sort_order' => 1,
        ]);
        $this->item($cat, 'Bajiya', 5);

        $this->get('/menu?lang=dv')
            ->assertOk()
            ->assertSee('ހެދިކާ', false);
    }

    public function test_an_item_with_no_dhivehi_name_still_appears_in_dhivehi(): void
    {
        // Falling back to English is right; showing an empty card is not.
        $this->enableDhivehi();
        $cat = $this->category('Shorteats');
        $this->item($cat, 'Cutlet', 6);

        $this->get('/menu?lang=dv')
            ->assertOk()
            ->assertSee('Cutlet', false);
    }
}
