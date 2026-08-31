<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Category;
use App\Models\DailySpecial;
use App\Models\Item;
use App\Models\ItemPhoto;
use App\Models\Promotion;
use App\Models\PromotionTarget;
use App\Models\SiteSetting;
use App\Services\SpecialPricingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Phase 1 of docs/SOCIAL_SHARING_PLAN.md: durable public item/offer pages,
 * per-entity OG metadata, and share controls. No share counting.
 */
class SocialSharingPhase1Test extends TestCase
{
    use RefreshDatabase;

    private function category(): Category
    {
        return Category::create([
            'name' => 'Grill',
            'slug' => 'grill-share-' . uniqid(),
            'is_active' => true,
        ]);
    }

    private function item(Category $category, string $name, float $price = 80.0, array $attrs = []): Item
    {
        return Item::create(array_merge([
            'category_id' => $category->id,
            'name' => $name,
            'base_price' => $price,
            'sku' => 'SHARE-' . strtoupper(substr(md5($name . uniqid()), 0, 8)),
            'is_active' => true,
            'is_available' => true,
        ], $attrs));
    }

    private function meta(string $html, string $property): string
    {
        $escaped = preg_quote($property, '/');
        $patterns = [
            '/property="' . $escaped . '"\s+content="([^"]*)"/',
            '/name="' . $escaped . '"\s+content="([^"]*)"/',
            '/content="([^"]*)"\s+property="' . $escaped . '"/',
            '/content="([^"]*)"\s+name="' . $escaped . '"/',
        ];
        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $html, $m) === 1) {
                return html_entity_decode($m[1], ENT_QUOTES, 'UTF-8');
            }
        }

        $this->fail("missing meta {$property}");
    }

    public function test_item_with_photo_emits_its_own_og_image_alt_and_canonical(): void
    {
        $cat = $this->category();
        $item = $this->item($cat, 'Tuna Bajiya');
        ItemPhoto::create([
            'item_id' => $item->id,
            'url' => 'https://cdn.example.com/bajiya-full.jpg',
            'thumb_url' => 'https://cdn.example.com/bajiya-thumb.jpg',
            'alt_text' => 'Crispy tuna bajiya',
            'is_primary' => true,
            'sort_order' => 0,
            'media_type' => 'image',
        ]);

        $html = $this->get('/menu/' . $item->id)->assertOk()->getContent();
        $canonical = url('/menu/' . $item->id);

        $this->assertSame('https://cdn.example.com/bajiya-full.jpg', $this->meta($html, 'og:image'));
        $this->assertSame('https://cdn.example.com/bajiya-full.jpg', $this->meta($html, 'twitter:image'));
        $this->assertSame('Crispy tuna bajiya', $this->meta($html, 'og:image:alt'));
        $this->assertSame($canonical, $this->meta($html, 'og:url'));
        $this->assertStringContainsString('<link rel="canonical" href="' . $canonical . '">', $html);
        $this->assertStringNotContainsString('bajiya-thumb.jpg', $this->meta($html, 'og:image'));
        $this->assertStringContainsString('data-share-url="' . $canonical . '"', $html);
        $this->assertStringNotContainsString('data-share-url="' . url('/order/menu?item=' . $item->id) . '"', $html);
        $this->assertStringContainsString('wa.me/?text=', $html);
        $this->assertStringContainsString('t.me/share/url?url=', $html);
        $this->assertStringContainsString('viber://forward?text=', $html);
        $this->assertStringContainsString('facebook.com/sharer/sharer.php?u=', $html);
        $this->assertStringContainsString('twitter.com/intent/tweet?url=', $html);
        $this->assertStringContainsString('data-testid="share-fallback-input"', $html);
    }

    public function test_item_without_photo_falls_back_to_the_site_og_image(): void
    {
        SiteSetting::set('og_image', 'https://cdn.example.com/site-og.jpg', 'shared');
        $cat = $this->category();
        $item = $this->item($cat, 'Plain Rice');

        $html = $this->get('/menu/' . $item->id)->assertOk()->getContent();

        $this->assertSame('https://cdn.example.com/site-og.jpg', $this->meta($html, 'og:image'));
        $this->assertSame('Plain Rice', $this->meta($html, 'og:image:alt'));
        $this->assertSame(url('/menu/' . $item->id), $this->meta($html, 'og:url'));
    }

    public function test_item_without_photo_shares_the_logo_when_the_site_image_was_deleted(): void
    {
        // The production symptom (owner, 2026-09-01): og_image still named a
        // media file that had been deleted, so a photo-less item shared as a
        // bare link with no picture at all. A dead fallback must be skipped.
        SiteSetting::set('og_image', '/storage/menu/deleted-by-owner.png', 'shared');
        SiteSetting::bust();
        $item = $this->item($this->category(), 'Plain Rice');

        $html = $this->get('/menu/' . $item->id)->assertOk()->getContent();

        $this->assertSame(asset('logo.png'), $this->meta($html, 'og:image'));
        $this->assertStringNotContainsString('deleted-by-owner', $html);
    }

    public function test_every_page_emits_an_absolute_og_image_that_resolves(): void
    {
        // A stored relative path used to be emitted verbatim site-wide;
        // crawlers require an absolute URL, so home/menu/specials shared
        // with no picture even when the file existed.
        SiteSetting::set('og_image', '/storage/menu/deleted-by-owner.png', 'shared');
        SiteSetting::bust();

        foreach (['/', '/menu'] as $path) {
            $image = $this->meta($this->get($path)->assertOk()->getContent(), 'og:image');
            $this->assertStringStartsWith('http', $image, $path . ' og:image must be absolute');
            $this->assertSame(asset('logo.png'), $image, $path);
        }
    }

    public function test_webp_only_item_photo_falls_back_to_the_site_image(): void
    {
        SiteSetting::set('og_image', 'https://cdn.example.com/site-og.jpg', 'shared');
        $cat = $this->category();
        $item = $this->item($cat, 'Webp Only', 12, [
            'image_url' => 'https://cdn.example.com/dish.webp',
        ]);

        $html = $this->get('/menu/' . $item->id)->assertOk()->getContent();

        $this->assertSame('https://cdn.example.com/site-og.jpg', $this->meta($html, 'og:image'));
        $this->assertStringNotContainsString('dish.webp', $this->meta($html, 'og:image'));
    }

    public function test_offer_page_emits_its_own_metadata(): void
    {
        $cat = $this->category();
        $item = $this->item($cat, 'Grill Plate', 100);
        ItemPhoto::create([
            'item_id' => $item->id,
            'url' => 'https://cdn.example.com/grill-full.jpg',
            'thumb_url' => 'https://cdn.example.com/grill-thumb.jpg',
            'alt_text' => 'Tonight grill plate',
            'is_primary' => true,
            'sort_order' => 0,
            'media_type' => 'image',
        ]);
        $special = DailySpecial::create([
            'item_id' => $item->id,
            'is_active' => true,
            'start_date' => today()->toDateString(),
            'end_date' => today()->toDateString(),
            'special_price' => 70,
            'badge_label' => 'Tonight',
        ]);
        app(SpecialPricingService::class)->bustCache();

        $html = $this->get('/offers/special/' . $special->id)->assertOk()->getContent();
        $canonical = url('/offers/special/' . $special->id);

        $this->assertSame('https://cdn.example.com/grill-full.jpg', $this->meta($html, 'og:image'));
        $this->assertSame('Tonight grill plate', $this->meta($html, 'og:image:alt'));
        $this->assertSame($canonical, $this->meta($html, 'og:url'));
        $this->assertStringContainsString('data-testid="offer-page"', $html);
        $this->assertStringNotContainsString('data-testid="offer-ended"', $html);
        $this->assertStringContainsString('MVR 70.00', $html);
        $this->assertStringContainsString('data-share-url="' . $canonical . '"', $html);
    }

    public function test_ended_offer_shows_current_price_not_the_stale_special(): void
    {
        $cat = $this->category();
        $item = $this->item($cat, 'Grill Plate', 88);
        $special = DailySpecial::create([
            'item_id' => $item->id,
            'is_active' => true,
            'start_date' => today()->subDays(3)->toDateString(),
            'end_date' => today()->subDay()->toDateString(),
            'special_price' => 11,
            'badge_label' => 'Yesterday',
        ]);
        app(SpecialPricingService::class)->bustCache();

        $html = $this->get('/offers/special/' . $special->id)->assertOk()->getContent();

        $this->assertStringContainsString('data-testid="offer-ended"', $html);
        $this->assertStringContainsString('This offer has ended', $html);
        $this->assertStringContainsString('MVR 88.00', $html);
        $this->assertStringNotContainsString('MVR 11.00', $html);
    }

    public function test_promo_landing_page_exists_and_never_existed_ids_404(): void
    {
        $cat = $this->category();
        $item = $this->item($cat, 'Burger', 50);
        $promo = Promotion::create([
            'name' => 'Lunch 10%',
            'code' => null,
            'type' => 'percentage',
            'discount_value' => 10,
            'is_active' => true,
            'auto_apply' => true,
            'scope' => 'item',
        ]);
        PromotionTarget::create([
            'promotion_id' => $promo->id,
            'target_type' => 'item',
            'target_id' => $item->id,
            'is_exclusion' => false,
        ]);

        $this->get('/offers/promo/' . $promo->id)
            ->assertOk()
            ->assertSee('Lunch 10%', false)
            ->assertSee('MVR 45.00', false);

        $this->get('/offers/special/999999')->assertNotFound();
        $this->get('/offers/promo/999999')->assertNotFound();
        $this->get('/menu/999999')->assertNotFound();
    }

    public function test_soft_deleted_item_is_unavailable_not_404(): void
    {
        $cat = $this->category();
        $item = $this->item($cat, 'Retired Burger');
        $item->delete();

        $this->get('/menu/' . $item->id)
            ->assertOk()
            ->assertSee('Retired Burger', false)
            ->assertSee('Currently unavailable', false);
    }

    public function test_compact_menu_cards_do_not_carry_a_share_button(): void
    {
        $cat = $this->category();
        $this->item($cat, 'Tuna Bajiya');

        $html = $this->get('/menu')->assertOk()->getContent();

        $this->assertStringNotContainsString('data-testid="share-open"', $html);
    }

    public function test_the_item_page_is_laid_out_like_the_order_app_sheet(): void
    {
        // Owner, 2026-09-01: a customer arriving from a shared link should see
        // the dish presented the way the app presents it — Back and Share in
        // one top row, then hero, name, price, and the action stack.
        $item = $this->item($this->category(), 'Tuna Bajiya');

        $html = $this->get('/menu/' . $item->id)->assertOk()->getContent();

        // Match markup only — the same names appear earlier in the <style>
        // block, so bare class names would compare CSS against HTML.
        $order = [
            'class="menu-item-topbar"',
            'data-testid="share-open"',
            'class="menu-item-hero',
            'class="menu-item-name"',
            'class="menu-item-price"',
            'class="menu-item-actions"',
        ];
        $last = -1;
        foreach ($order as $needle) {
            $at = strpos($html, $needle);
            $this->assertNotFalse($at, $needle . ' must be on the item page');
            $this->assertGreaterThan($last, $at, $needle . ' is out of order');
            $last = $at;
        }

        // Share belongs in the top row now, not in the bottom action stack.
        $actionsAt = strpos($html, 'class="menu-item-actions"');
        $this->assertLessThan(
            $actionsAt,
            strpos($html, 'data-testid="share-open"'),
            'share moved to the top bar beside Back',
        );
    }
}
