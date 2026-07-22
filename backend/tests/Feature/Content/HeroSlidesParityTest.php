<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\ContentResolver;
use App\Domains\Content\HeroSlides;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HeroSlidesParityTest extends TestCase
{
    use RefreshDatabase;

    private function sampleSlides(): array
    {
        return [
            [
                'image' => '/images/a.jpg',
                'eyebrow' => 'Eyebrow A',
                'title' => 'Title A',
                'subtitle' => 'Sub A',
                'cta_text' => 'Order',
                'cta_url' => '/order/',
                'cta2_text' => 'Menu',
                'cta2_url' => '/menu',
            ],
            [
                'image' => '/images/b.jpg',
                'eyebrow' => 'Eyebrow B',
                'title' => 'Title B',
                'subtitle' => 'Sub B',
                'cta_text' => 'Order',
                'cta_url' => '/order/',
                'cta2_text' => 'Menu',
                'cta2_url' => '/menu',
            ],
        ];
    }

    public function test_legacy_keys_and_hero_slides_array_resolve_identically(): void
    {
        $slides = $this->sampleSlides();

        // Isolate: clear any seeded hero rows so legacy vs array compare cleanly.
        SiteSetting::query()->whereIn('key', ['hero_slides', 'hero_slide_1', 'hero_slide_2', 'hero_slide_3'])->delete();
        SiteSetting::bust();

        SiteSetting::set('hero_slide_1', json_encode($slides[0]), 'shared');
        SiteSetting::set('hero_slide_2', json_encode($slides[1]), 'shared');

        $fromLegacy = HeroSlides::resolve(static function (string $key, mixed $default) {
            if ($key === 'hero_slides') {
                return '[]';
            }

            return SiteSetting::getScoped($key, 'shared', 'en') ?? $default;
        });

        $this->assertSame(['Title A', 'Title B'], array_column($fromLegacy, 'title'));

        SiteSetting::set('hero_slides', json_encode($slides), 'shared');

        $fromArray = HeroSlides::resolve(static function (string $key, mixed $default) {
            return SiteSetting::getScoped($key, 'shared', 'en') ?? $default;
        });

        $this->assertSame(['Title A', 'Title B'], array_column($fromArray, 'title'));
        $this->assertCount(2, $fromArray);
    }

    public function test_website_and_order_app_public_content_emit_same_hero_slides(): void
    {
        $slides = $this->sampleSlides();
        SiteSetting::set('hero_slides', json_encode($slides), 'shared');

        $website = ContentResolver::for('website')->allPublic();
        $order = ContentResolver::for('order_app')->allPublic();

        $this->assertArrayHasKey('hero_slides', $website);
        $this->assertSame($website['hero_slides'], $order['hero_slides']);

        $parsed = json_decode((string) $website['hero_slides'], true);
        $this->assertIsArray($parsed);
        $this->assertCount(2, $parsed);
        $this->assertSame('Title A', $parsed[0]['title']);
    }

    public function test_migration_helper_packs_legacy_into_array(): void
    {
        $slides = $this->sampleSlides();
        $json = HeroSlides::fromLegacy([
            1 => json_encode($slides[0]),
            2 => json_encode($slides[1]),
            3 => null,
        ]);
        $parsed = json_decode($json, true);
        $this->assertCount(2, $parsed);
        $this->assertSame('Title B', $parsed[1]['title']);
    }

    public function test_home_view_renders_hero_slides_array(): void
    {
        SiteSetting::set('hero_slides', json_encode($this->sampleSlides()), 'shared');

        $html = $this->get('/')->assertOk()->getContent();
        $this->assertStringContainsString('Title A', $html);
        $this->assertStringContainsString('Title B', $html);
    }
}
