<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Promotions\Services\OffersService;
use App\Domains\System\Services\ServiceAvailabilityService;
use App\Models\Category;
use App\Models\Customer;
use App\Models\DailySpecial;
use App\Models\Item;
use App\Models\ItemPhoto;
use App\Models\SiteSetting;
use App\Services\SpecialPricingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
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

    public function test_printed_dine_in_qr_codes_still_reach_the_menu(): void
    {
        // Table QR codes were printed against /order/view. That path must keep
        // working after the dine-in menu moved to Blade — a missing redirect
        // is a dead sticker on every table.
        $this->get('/order/view')
            ->assertStatus(301)
            ->assertRedirect('/menu');
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

    public function test_each_item_links_to_its_own_detail_page(): void
    {
        // Cards used to jump straight into the SPA sheet. The details now
        // live in the initial HTML at /menu/{id}; Add to order is the handoff.
        $cat = $this->category('Shorteats');
        $item = $this->item($cat, 'Bajiya', 5);

        $this->get('/menu')
            ->assertOk()
            ->assertSee('/menu/' . $item->id, false)
            ->assertDontSee('/order/menu?item=' . $item->id, false);
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

    private function itemCard(string $html, int $itemId): string
    {
        preg_match(
            // The card carries filter data attributes now, so match the open
            // tag loosely rather than pinning it to `class="menu-card">`.
            '#<article class="menu-card"[^>]*>(?:(?!</article>).)*href="/menu/' . $itemId . '".*?</article>#s',
            $html,
            $card,
        );
        $this->assertNotEmpty($card, 'the item card must be in the HTML');

        return $card[0];
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

    public function test_the_rail_ends_with_an_events_pill(): void
    {
        // Same last-on-rail shortcut as the order app. The wizard is an SPA
        // page, so this is a real path, not an in-page hash.
        $cat = $this->category('Shorteats');
        $this->item($cat, 'Bajiya', 5);

        $html = $this->get('/menu')->assertOk()->getContent();
        preg_match('#<nav class="menu-rail".*?</nav>#s', $html, $rail);
        $this->assertNotEmpty($rail, 'the category rail must be in the HTML');

        preg_match_all('#<a\s[^>]*href="([^"]+)"#', $rail[0], $hrefs);
        $this->assertNotEmpty($hrefs[1]);
        $this->assertSame('/order/events', end($hrefs[1]));
        $this->assertStringContainsString('data-testid="cat-rail-events"', $rail[0]);
        $this->assertStringContainsString('aria-label="Events"', $rail[0]);
        $this->assertMatchesRegularExpression('#<span class="menu-rail-label">Events</span>#', $rail[0]);
        $this->assertMatchesRegularExpression('#<span class="menu-rail-thumb"#', $rail[0]);
    }

    public function test_the_rail_spy_skips_hrefs_that_are_not_page_anchors(): void
    {
        // Without this, IntersectionObserver looks up id="/order/events".
        $cat = $this->category('Shorteats');
        $this->item($cat, 'Bajiya', 5);

        $html = $this->get('/menu')->assertOk()->getContent();
        $this->assertStringContainsString("if (href.charAt(0) !== '#') return;", $html);
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

    public function test_a_gallery_photo_wins_over_the_stale_main_image(): void
    {
        // The order app reads item.photos. /menu used to read image_url only,
        // so a gallery upload left the old main image (or the placeholder) on
        // the dine-in page.
        $cat = $this->category('Shorteats');
        $item = $this->item($cat, 'Bajiya', 5, [
            'image_url' => 'https://cdn.example.com/old-main.jpg',
        ]);
        ItemPhoto::create([
            'item_id' => $item->id,
            'url' => 'https://cdn.example.com/gallery-other.jpg',
            'sort_order' => 1,
            'is_primary' => false,
        ]);
        ItemPhoto::create([
            'item_id' => $item->id,
            'url' => 'https://cdn.example.com/gallery-primary.jpg',
            'thumb_url' => 'https://cdn.example.com/gallery-primary-thumb.jpg',
            'sort_order' => 2,
            'is_primary' => true,
        ]);

        $card = $this->itemCard($this->get('/menu')->assertOk()->getContent(), $item->id);

        $this->assertStringContainsString('gallery-primary-thumb.jpg', $card);
        $this->assertStringNotContainsString('old-main.jpg', $card);
        $this->assertStringNotContainsString('gallery-other.jpg', $card);
    }

    public function test_a_video_first_gallery_renders_the_poster_not_the_file(): void
    {
        $cat = $this->category('Shorteats');
        $item = $this->item($cat, 'Bajiya', 5);
        ItemPhoto::create([
            'item_id' => $item->id,
            'url' => 'https://cdn.example.com/clip.mp4',
            'media_type' => 'video',
            'poster_url' => 'https://cdn.example.com/poster.jpg',
            'sort_order' => 1,
            'is_primary' => true,
        ]);

        $card = $this->itemCard($this->get('/menu')->assertOk()->getContent(), $item->id);

        $this->assertStringContainsString('poster.jpg', $card);
        $this->assertStringNotContainsString('clip.mp4', $card);
    }

    public function test_an_empty_gallery_falls_back_to_the_item_image(): void
    {
        $cat = $this->category('Shorteats');
        $item = $this->item($cat, 'Bajiya', 5, [
            'image_url' => 'https://cdn.example.com/main.jpg',
            'thumb_url' => 'https://cdn.example.com/main-thumb.jpg',
        ]);

        $card = $this->itemCard($this->get('/menu')->assertOk()->getContent(), $item->id);

        $this->assertStringContainsString('main-thumb.jpg', $card);
    }

    public function test_no_item_image_falls_back_to_the_site_default_then_the_emoji(): void
    {
        $cat = $this->category('Shorteats');
        $item = $this->item($cat, 'Bajiya', 5);
        SiteSetting::set('default_item_image', '/storage/site/default_item.jpg', 'shared');

        $withDefault = $this->itemCard($this->get('/menu')->assertOk()->getContent(), $item->id);
        $this->assertStringContainsString('storage/site/default_item.jpg', $withDefault);

        SiteSetting::set('default_item_image', '', 'shared');
        $plain = $this->item($cat, 'Cutlet', 6);
        $card = $this->itemCard($this->get('/menu')->assertOk()->getContent(), $plain->id);
        $this->assertStringContainsString('🍽️', $card);
        $this->assertStringNotContainsString('src=""', $card);
    }

    public function test_the_page_has_a_heading_outline_a_crawler_can_follow(): void
    {
        // A category with no subcategory must not skip a level: h1 → h2 → h3.
        // h4 is only for items under a subcategory heading (the other test).
        // Most categories here have no subcategory, so a fixed h4 skipped a
        // level on nearly every card.
        $cat = $this->category('Shorteats');
        $this->item($cat, 'Bajiya', 5);

        $html = $this->get('/menu')->assertOk()->getContent();

        preg_match('#<div class="menu-main">.*#s', $html, $main);
        $this->assertNotEmpty($main);

        $this->assertMatchesRegularExpression('#<h2[^>]*>\s*Shorteats\s*</h2>#', $main[0]);
        $this->assertMatchesRegularExpression('#<h3 class="menu-card-name"[^>]*>Bajiya</h3>#', $main[0]);
    }

    public function test_a_subcategory_sits_inside_its_parent_not_in_the_rail(): void
    {
        $parent = $this->category('Grill', 1);
        $child = Category::create([
            'parent_id' => $parent->id,
            'name' => 'Wraps',
            'slug' => 'wraps',
            'is_active' => true,
            'sort_order' => 1,
        ]);
        $this->item($parent, 'Chicken Plate', 40);
        $this->item($child, 'Chicken Wrap', 25);

        $html = $this->get('/menu')->assertOk()->getContent();

        preg_match('#<nav class="menu-rail".*?</nav>#s', $html, $rail);
        $this->assertNotEmpty($rail);
        $this->assertStringContainsString('aria-label="Grill, 2 items"', $rail[0]);
        $this->assertStringNotContainsString('href="#cat-' . $child->id . '"', $rail[0]);

        preg_match('#<div class="menu-main">.*#s', $html, $main);
        $this->assertMatchesRegularExpression('#<h2[^>]*>\s*Grill\s*</h2>#', $main[0]);
        $this->assertMatchesRegularExpression('#<h3 class="menu-subcat-title"[^>]*>Wraps</h3>#', $main[0]);
        $this->assertMatchesRegularExpression('#<h4 class="menu-card-name"[^>]*>Chicken Wrap</h4>#', $main[0]);
    }

    public function test_an_active_special_shows_the_discounted_price_and_the_original(): void
    {
        $cat = $this->category('Shorteats');
        $item = $this->item($cat, 'Bajiya', 10);
        DailySpecial::create([
            'item_id' => $item->id,
            'is_active' => true,
            'start_date' => today()->toDateString(),
            'end_date' => today()->toDateString(),
            'special_price' => 7,
            'badge_label' => 'Today',
        ]);
        app(SpecialPricingService::class)->bustCache();
        app(OffersService::class)->bustCache();

        $html = $this->get('/menu')->assertOk()->getContent();

        $card = $this->itemCard($html, $item->id);
        $this->assertStringContainsString('MVR 7.00', $card);
        $this->assertMatchesRegularExpression('#<s class="menu-card-price-was">MVR 10.00</s>#', $card);
    }

    public function test_an_active_offer_renders_with_a_rail_pill(): void
    {
        $cat = $this->category('Shorteats');
        $item = $this->item($cat, 'Bajiya', 10);
        DailySpecial::create([
            'item_id' => $item->id,
            'is_active' => true,
            'start_date' => today()->toDateString(),
            'end_date' => today()->toDateString(),
            'discount_pct' => 20,
            'badge_label' => '20% OFF',
        ]);
        app(SpecialPricingService::class)->bustCache();
        app(OffersService::class)->bustCache();

        $html = $this->get('/menu')->assertOk()->getContent();

        $this->assertStringContainsString('id="menu-view-offers"', $html);
        $this->assertStringContainsString('data-testid="menu-offers-pill"', $html);
        $this->assertStringContainsString('20% OFF', $html);
    }

    public function test_without_offers_the_section_and_pill_are_absent(): void
    {
        $cat = $this->category('Shorteats');
        $this->item($cat, 'Bajiya', 5);

        $html = $this->get('/menu')->assertOk()->getContent();

        $this->assertStringNotContainsString('id="menu-view-offers"', $html);
        $this->assertStringNotContainsString('data-testid="menu-offers-pill"', $html);
    }

    public function test_an_offer_card_shows_the_same_gallery_photo_as_the_item_card(): void
    {
        // OffersService fills image_url from display_image_url — the main
        // image. Left alone, an offer would show exactly the stale photo the
        // item cards were fixed to stop showing.
        $cat = $this->category('Shorteats');
        $item = $this->item($cat, 'Bajiya', 10, [
            'image_url' => 'https://cdn.example.com/old-main.jpg',
        ]);
        ItemPhoto::create([
            'item_id' => $item->id,
            'url' => 'https://cdn.example.com/gallery-full.jpg',
            'thumb_url' => 'https://cdn.example.com/gallery-thumb.jpg',
            'is_primary' => true,
            'sort_order' => 0,
            'media_type' => 'image',
        ]);
        DailySpecial::create([
            'item_id' => $item->id,
            'is_active' => true,
            'start_date' => today()->toDateString(),
            'end_date' => today()->toDateString(),
            'special_price' => 7,
            'badge_label' => 'Today',
        ]);
        app(SpecialPricingService::class)->bustCache();
        app(OffersService::class)->bustCache();

        $html = $this->get('/menu')->assertOk()->getContent();
        preg_match('#<section class="menu-offers".*?</section>#s', $html, $offers);
        $this->assertNotEmpty($offers, 'the offers section must be in the HTML');

        $this->assertStringContainsString('gallery-thumb.jpg', $offers[0]);
        $this->assertStringNotContainsString('old-main.jpg', $offers[0]);
        $this->assertStringNotContainsString('src=""', $offers[0]);
    }

    public function test_structured_data_carries_the_full_photo_not_the_card_thumbnail(): void
    {
        // The card asks for a 400px thumb because it draws a 132px circle.
        // Google wants a large image for rich results, so reusing the card's
        // choice in the schema was a quiet downgrade on what it used to send.
        $cat = $this->category('Shorteats');
        $item = $this->item($cat, 'Bajiya', 5);
        ItemPhoto::create([
            'item_id' => $item->id,
            'url' => 'https://cdn.example.com/gallery-full.jpg',
            'thumb_url' => 'https://cdn.example.com/gallery-thumb.jpg',
            'is_primary' => true,
            'sort_order' => 0,
            'media_type' => 'image',
        ]);

        $html = $this->get('/menu')->assertOk()->getContent();

        $card = $this->itemCard($html, $item->id);
        $this->assertStringContainsString('gallery-thumb.jpg', $card, 'the card wants the thumb');

        preg_match_all('#<script type="application/ld\+json">(.*?)</script>#s', $html, $matches);
        $menu = null;
        foreach ($matches[1] as $json) {
            $decoded = json_decode(trim($json), true);
            if (($decoded['@type'] ?? null) === 'Menu') {
                $menu = $decoded;
            }
        }
        $this->assertNotNull($menu, 'a Menu block must be present');

        $this->assertSame(
            'https://cdn.example.com/gallery-full.jpg',
            $menu['hasMenuSection'][0]['hasMenuItem'][0]['image'],
        );
    }

    public function test_a_new_item_is_badged_an_old_one_is_not_and_the_cap_holds(): void
    {
        $cat = $this->category('Shorteats');
        $fresh = $this->item($cat, 'Fresh Cutlet', 6);
        $fresh->forceFill(['created_at' => now()->subDay()])->save();
        $stale = $this->item($cat, 'Old Cutlet', 6);
        $stale->forceFill(['created_at' => now()->subDays(60)])->save();

        $html = $this->get('/menu')->assertOk()->getContent();
        $this->assertStringContainsString('class="menu-badge-new"', $html);
        $this->assertEquals(1, substr_count($html, 'class="menu-badge-new"'));

        $many = $this->category('Grill', 2);
        for ($i = 1; $i <= 20; $i++) {
            $item = $this->item($many, 'New Plate ' . $i, 12);
            $item->forceFill(['created_at' => now()->subDay()->addSeconds($i)])->save();
        }

        $capped = $this->get('/menu')->assertOk()->getContent();
        $this->assertSame(12, substr_count($capped, 'class="menu-badge-new"'));
    }

    public function test_the_whole_card_is_the_link_not_a_caption_beside_it(): void
    {
        // The photo is the biggest thing on the card; a separate "Order →"
        // caption made the small text the only tap target. The heart is a
        // sibling (a button inside an <a> is invalid), so the card itself
        // is the positioned box and the <a> covers it via ::after.
        $cat = $this->category('Shorteats');
        $item = $this->item($cat, 'Bajiya', 5);

        $html = $this->get('/menu')->assertOk()->getContent();
        $card = $this->itemCard($html, $item->id);

        $this->assertMatchesRegularExpression(
            '#<article class="menu-card"[^>]*>\s*<a class="menu-card-link" href="/menu/' . $item->id . '">\s*<div class="menu-card-circle">#',
            $html,
        );
        $this->assertMatchesRegularExpression(
            '#\.menu-card-link::after\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0#s',
            $html,
        );
        $this->assertMatchesRegularExpression(
            '#<a class="menu-card-link" href="/menu/' . $item->id . '">.*?</a>\s*<a class="menu-fav"#s',
            $card,
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

    public function test_it_carries_no_service_or_opening_hours_notice(): void
    {
        // Owner decision, 2026-08-22. This page briefly rendered the shared
        // service banner: accurate, and removed anyway. The ordering window is
        // narrower than the opening hours, so "Online ordering is currently
        // closed" sat above the menu most of the day. Ordering state belongs
        // where someone tries to order.
        //
        // Asserted with the gate actually shut, because a test that only
        // passes while everything is available proves nothing.
        $this->category('Shorteats');
        app(ServiceAvailabilityService::class)->setState('online_ordering', [
            'status' => 'unavailable',
            'public_message' => 'Online ordering is currently closed.',
            'reason_type' => 'operational_pause',
        ]);

        $html = $this->get('/menu')->assertOk()->getContent();

        $this->assertStringNotContainsString('site-service-banner', $html);
        $this->assertStringNotContainsString('Online ordering is currently closed.', $html);
    }

    public function test_the_food_starts_at_the_top_but_the_h1_survives(): void
    {
        // The hero band — eyebrow, "Everything we make", tagline — was removed
        // on the owner's call: it pushed the food most of a screen down on a
        // phone, which is what this page exists to avoid.
        //
        // The <h1> stayed, visually hidden. It is the page's only level-one
        // heading, so dropping it would start the outline at h2 and leave a
        // search result with nothing to title the page. That distinction is
        // invisible on screen, which is exactly why it needs a test.
        $cat = $this->category('Shorteats');
        $this->item($cat, 'Bajiya', 5);

        $html = $this->get('/menu')->assertOk()->getContent();

        $this->assertStringNotContainsString('menu-hero', $html);
        $this->assertStringNotContainsString('Everything we make', $html);

        $this->assertMatchesRegularExpression(
            '#<h1 class="visually-hidden">.*?</h1>#s',
            $html,
            'the page must keep exactly one h1, even if nothing draws it',
        );
        // Hidden, not removed from the accessibility tree.
        $this->assertMatchesRegularExpression('#\.visually-hidden\s*\{[^}]*clip-path#', $html);
        $this->assertDoesNotMatchRegularExpression('#\.visually-hidden\s*\{[^}]*display:\s*none#', $html);

        $this->assertSame(1, substr_count($html, '<h1'), 'exactly one h1 on the page');
    }

    // ── Filtering ─────────────────────────────────────────────────────────

    public function test_every_card_carries_what_the_search_needs_to_match(): void
    {
        // Filtering happens in the browser over cards that are already in the
        // HTML, so the page has to ship the haystack with them.
        $cat = $this->category('Shorteats');
        $item = $this->item($cat, 'Bajiya', 5, [
            'name_dv' => 'ބަޖިޔާ',
            'short_description' => 'Crispy tuna pastry',
            'dietary_tags' => ['Gluten Free', 'halal'],
        ]);

        $card = $this->itemCard($this->get('/menu')->assertOk()->getContent(), $item->id);

        $this->assertStringContainsString('data-search="', $card);
        $this->assertStringContainsString('bajiya', $card);
        $this->assertStringContainsString('crispy tuna pastry', $card);
        // A Dhivehi visitor on a Latin keyboard must still find the item, so
        // the English name is in the haystack whatever the page locale.
        $this->assertStringContainsString('ބަޖިޔާ', $card);
        // "Gluten Free" and "gluten-free" have to be the same thing.
        $this->assertMatchesRegularExpression('#data-diet="[^"]*gluten-free#', $card);
        $this->assertMatchesRegularExpression('#data-diet="[^"]*halal#', $card);
    }

    public function test_it_only_offers_chips_that_can_match_something(): void
    {
        // A chip for a tag nothing carries always returns an empty menu, which
        // is worse than not offering it. Production has five items and no tags
        // at all, so this is the live case, not a hypothetical.
        $cat = $this->category('Shorteats');
        $this->item($cat, 'Bajiya', 5);

        $html = $this->get('/menu')->assertOk()->getContent();

        // Search always earns its place; the chips do not.
        $this->assertStringContainsString('id="menuSearch"', $html);
        $this->assertStringNotContainsString('data-filter="diet:', $html);
        $this->assertStringNotContainsString('data-filter="special"', $html);

        $this->item($cat, 'Veg Cutlet', 6, ['dietary_tags' => ['vegetarian']]);
        $withTag = $this->get('/menu')->assertOk()->getContent();

        $this->assertStringContainsString('data-filter="diet:vegetarian"', $withTag);
        $this->assertStringContainsString('🥬 Vegetarian', $withTag);
    }

    public function test_a_discounted_item_is_marked_so_the_offers_chip_can_find_it(): void
    {
        $cat = $this->category('Shorteats');
        $plain = $this->item($cat, 'Cutlet', 6);
        $discounted = $this->item($cat, 'Bajiya', 10);
        DailySpecial::create([
            'item_id' => $discounted->id,
            'is_active' => true,
            'start_date' => today()->toDateString(),
            'end_date' => today()->toDateString(),
            'special_price' => 7,
            'badge_label' => 'Today',
        ]);
        app(SpecialPricingService::class)->bustCache();
        app(OffersService::class)->bustCache();

        $html = $this->get('/menu')->assertOk()->getContent();

        $this->assertStringContainsString('data-filter="special"', $html);
        $this->assertStringContainsString('data-special="1"', $this->itemCard($html, $discounted->id));
        $this->assertStringNotContainsString('data-special="1"', $this->itemCard($html, $plain->id));
    }

    public function test_the_toolbar_offers_the_same_controls_as_the_order_app(): void
    {
        // Search button, A–Z / price sorts, Grid / List — the order app's
        // FilterChipsRow and view toggle, ported.
        $cat = $this->category('Shorteats');
        $this->item($cat, 'Bajiya', 5);

        $html = $this->get('/menu')->assertOk()->getContent();

        $this->assertStringContainsString('id="menuSearchToggle"', $html);
        $this->assertStringContainsString('data-sort="name"', $html);
        $this->assertStringContainsString('data-sort="price-low"', $html);
        $this->assertStringContainsString('data-sort="price-high"', $html);
        $this->assertStringContainsString('data-view="grid"', $html);
        $this->assertStringContainsString('data-view="list"', $html);
        // Same key as apps/online-order-web, so a choice made on one surface
        // is honoured on the other instead of each forgetting the other.
        $this->assertStringContainsString("'bg-menu-view'", $html);

        // The field starts collapsed behind the button, as in the order app.
        $this->assertMatchesRegularExpression('#id="menuSearchWrap"[^>]*hidden#', $html);
    }

    public function test_cards_sort_by_the_price_they_actually_advertise(): void
    {
        // Sorting reads data-price, and that has to be the displayed price or
        // "cheapest first" contradicts the card. Two traps: a sized item
        // carries base_price 0, and a discounted item shows its special.
        $cat = $this->category('Shorteats');

        $sized = $this->item($cat, 'Coke', 0, ['has_variants' => true]);
        $sized->variants()->create(['name' => 'Small', 'price' => 15, 'is_active' => true]);

        $discounted = $this->item($cat, 'Bajiya', 10);
        DailySpecial::create([
            'item_id' => $discounted->id,
            'is_active' => true,
            'start_date' => today()->toDateString(),
            'end_date' => today()->toDateString(),
            'special_price' => 7,
            'badge_label' => 'Today',
        ]);
        app(SpecialPricingService::class)->bustCache();
        app(OffersService::class)->bustCache();

        $html = $this->get('/menu')->assertOk()->getContent();

        // Not 0.00, which would sort every sized item to the top of "cheapest".
        $this->assertStringContainsString('data-price="15.00"', $this->itemCard($html, $sized->id));
        // The special, not the 10.00 list price.
        $this->assertStringContainsString('data-price="7.00"', $this->itemCard($html, $discounted->id));
    }

    public function test_the_filter_bar_is_hidden_until_javascript_confirms_itself(): void
    {
        // The bar can only work with JS. Rendering a search box that does
        // nothing is worse than rendering none, so it is display:none until
        // the layout's inline script sets html.js — the same trick the heart
        // uses. The menu underneath stays fully readable either way.
        $cat = $this->category('Shorteats');
        $this->item($cat, 'Bajiya', 5);

        $html = $this->get('/menu')->assertOk()->getContent();

        $this->assertMatchesRegularExpression('#\.menu-filters\s*\{\s*display:\s*none#', $html);
        $this->assertMatchesRegularExpression('#html\.js \.menu-filters\s*\{#', $html);
        $this->assertStringContainsString("document.documentElement.classList.add('js')", $html);
    }

    public function test_a_photo_fills_its_circle_rather_than_letterboxing(): void
    {
        // Reported from the live site: Bajiya's photo sat small inside a pale
        // circle instead of covering it.
        //
        // <picture> is an inline wrapper with no size of its own. The CSS
        // styled `.menu-card-circle-photo img` only, so the img's
        // width/height:100% resolved against a shrink-to-fit <picture> and
        // object-fit:cover had no box to cover. Every photo that is not
        // square rendered letterboxed.
        //
        // Asserting on the stylesheet rather than the markup because the
        // markup was already correct — the rule that makes it work is the
        // thing that was missing, and CSS layout is not something a feature
        // test can otherwise observe.
        $cat = $this->category('Shorteats');
        $item = $this->item($cat, 'Bajiya', 5);
        ItemPhoto::create([
            'item_id' => $item->id,
            'url' => 'https://cdn.example.com/wide.jpg',
            'is_primary' => true,
            'sort_order' => 0,
            'media_type' => 'image',
        ]);

        $html = $this->get('/menu')->assertOk()->getContent();

        $this->assertStringContainsString('<picture>', $this->itemCard($html, $item->id));
        $this->assertMatchesRegularExpression(
            '#\.menu-card-circle-photo picture\s*\{[^}]*height:\s*100%#',
            $html,
            'the <picture> wrapper must be sized, or object-fit has no box to cover',
        );

        $detail = $this->get('/menu/' . $item->id)->assertOk()->getContent();
        $this->assertMatchesRegularExpression(
            '#\.menu-item-hero picture\s*\{[^}]*height:\s*100%#',
            $detail,
            'the detail hero has the same wrapper and the same problem',
        );
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

    // ── Item detail ───────────────────────────────────────────────────────

    public function test_item_details_are_in_the_html_without_javascript(): void
    {
        $cat = $this->category('Shorteats');
        $item = $this->item($cat, 'Bajiya', 5, [
            'description' => 'Crispy pastry filled with tuna, onion and chilli — the full text, not a 60-character clamp.',
            'dietary_tags' => ['halal'],
            'allergens' => ['gluten', 'fish'],
            'spice_level' => 'medium',
            'prep_time_minutes' => 12,
            'has_variants' => true,
        ]);
        $item->variants()->create(['name' => 'Single', 'price' => 5, 'is_active' => true, 'sort_order' => 1]);
        $item->variants()->create(['name' => 'Box of 6', 'price' => 28, 'is_active' => true, 'sort_order' => 2]);
        $item->variants()->create(['name' => 'Retired size', 'price' => 99, 'is_active' => false, 'sort_order' => 3]);

        $html = $this->get('/menu/' . $item->id)->assertOk()->getContent();

        $this->assertStringContainsString('Crispy pastry filled with tuna, onion and chilli — the full text, not a 60-character clamp.', $html);
        $this->assertStringContainsString('Single', $html);
        $this->assertStringContainsString('MVR 5.00', $html);
        $this->assertStringContainsString('Box of 6', $html);
        $this->assertStringContainsString('MVR 28.00', $html);
        $this->assertStringNotContainsString('Retired size', $html);
        $this->assertStringContainsString('halal', $html);
        $this->assertStringContainsString('gluten', $html);
        $this->assertStringContainsString('fish', $html);
        $this->assertStringContainsString('Medium', $html);
        $this->assertStringContainsString('12 min', $html);
        $this->assertStringContainsString('/order/menu?item=' . $item->id, $html);
        $this->assertStringContainsString('Add to order', $html);
        $this->assertStringContainsString('href="/order/menu"', $html);
        $this->assertStringContainsString('View cart', $html);
    }

    public function test_an_item_you_cannot_order_has_no_detail_page(): void
    {
        $cat = $this->category('Shorteats');
        $gone = $this->item($cat, 'Sold Out Item', 5, ['is_available' => false]);
        $retired = $this->item($cat, 'Retired Item', 5, ['is_active' => false]);

        $this->get('/menu/' . $gone->id)->assertNotFound();
        $this->get('/menu/' . $retired->id)->assertNotFound();
        $this->get('/menu/999999')->assertNotFound();
    }

    public function test_the_sitemap_does_not_list_per_item_urls(): void
    {
        $cat = $this->category('Shorteats');
        $item = $this->item($cat, 'Bajiya', 5);

        $this->get('/sitemap.xml')
            ->assertOk()
            ->assertSee('<loc>' . url('/menu') . '</loc>', false)
            ->assertDontSee('/menu/' . $item->id, false);
    }

    public function test_signed_in_favourites_are_filled_on_the_first_paint(): void
    {
        $cat = $this->category('Shorteats');
        $liked = $this->item($cat, 'Bajiya', 5);
        $plain = $this->item($cat, 'Cutlet', 6);
        $customer = Customer::factory()->create();
        DB::table('customer_favorites')->insert([
            'customer_id' => $customer->id,
            'item_id' => $liked->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $html = $this->actingAs($customer, 'customer')->get('/menu')->assertOk()->getContent();

        $this->assertStringContainsString("document.documentElement.classList.add('js')", $html);
        $this->assertStringContainsString('name="csrf-token"', $html);
        $this->assertStringContainsString("'X-CSRF-TOKEN'", $html);

        $likedCard = $this->itemCard($html, $liked->id);
        $this->assertStringContainsString('aria-pressed="true"', $likedCard);
        $this->assertStringContainsString('❤️', $likedCard);
        $this->assertStringContainsString('Remove from favourites', $likedCard);

        $plainCard = $this->itemCard($html, $plain->id);
        $this->assertStringContainsString('aria-pressed="false"', $plainCard);
        $this->assertStringContainsString('🤍', $plainCard);
    }

    public function test_a_toggled_favourite_survives_reload(): void
    {
        $cat = $this->category('Shorteats');
        $item = $this->item($cat, 'Bajiya', 5);
        $customer = Customer::factory()->create();

        $this->actingAs($customer, 'customer');
        $this->get('/menu')->assertOk();
        $this->postJson('/api/customer/favorites/' . $item->id . '/toggle', [], [
            'X-CSRF-TOKEN' => csrf_token(),
        ])->assertOk()->assertJson(['favorited' => true]);

        $this->assertDatabaseHas('customer_favorites', [
            'customer_id' => $customer->id,
            'item_id' => $item->id,
        ]);

        $html = $this->get('/menu')->assertOk()->getContent();
        $this->assertStringContainsString('aria-pressed="true"', $this->itemCard($html, $item->id));
    }

    public function test_signed_out_heart_sends_you_to_sign_in(): void
    {
        $cat = $this->category('Shorteats');
        $item = $this->item($cat, 'Bajiya', 5);

        $card = $this->itemCard($this->get('/menu')->assertOk()->getContent(), $item->id);

        $this->assertStringContainsString('href="/customer/login"', $card);
        $this->assertStringContainsString('Sign in to save favourites', $card);
        $this->assertStringNotContainsString('aria-pressed="true"', $card);
        $this->assertStringNotContainsString('/api/customer/favorites', $card);
    }
}
