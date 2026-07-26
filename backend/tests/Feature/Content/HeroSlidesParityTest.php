<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\ContentResolver;
use App\Domains\Content\HeroSlides;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class HeroSlidesParityTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsOwner(): void
    {
        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();
        $user = User::create([
            'name' => 'Hero Content',
            'email' => 'hero-content@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);
    }

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
            // Missing hero_slides (null) — legacy fallback path.
            if ($key === 'hero_slides') {
                return null;
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

    public function test_empty_hero_slides_array_does_not_resurrect_legacy(): void
    {
        SiteSetting::query()->whereIn('key', ['hero_slides', 'hero_slide_1', 'hero_slide_2', 'hero_slide_3'])->delete();
        SiteSetting::bust();

        SiteSetting::set('hero_slide_1', json_encode(['title' => 'Legacy Ghost', 'image' => '/old.jpg']), 'shared');
        SiteSetting::set('hero_slides', '[]', 'website');

        $resolved = HeroSlides::resolve(static function (string $key, mixed $default) {
            return SiteSetting::getScoped($key, 'website', 'en')
                ?? SiteSetting::getScoped($key, 'shared', 'en')
                ?? $default;
        });

        $this->assertSame([], $resolved);
    }

    public function test_image_only_hero_slide_is_renderable(): void
    {
        $slides = [[
            'image' => '/storage/new-hero.jpg',
            'eyebrow' => '',
            'title' => '',
            'subtitle' => '',
            'cta_text' => '',
            'cta_url' => '/order/',
            'cta2_text' => '',
            'cta2_url' => '/menu',
        ]];
        SiteSetting::set('hero_slides', json_encode($slides), 'website');

        $html = $this->get('/')->assertOk()->getContent();
        $this->assertStringContainsString('/storage/new-hero.jpg', $html);
        $this->assertStringNotContainsString('Fresh daily from 5am', $html);
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

    public function test_publishing_hero_slides_clears_legacy_slots(): void
    {
        $this->actingAsOwner();

        SiteSetting::set('hero_slide_1', json_encode(['title' => 'Legacy Ghost']), 'shared');
        SiteSetting::set('hero_slide_1', json_encode(['title' => 'Legacy Ghost']), 'website');

        $this->putJson('/api/admin/content', [
            'locale' => 'en',
            'changes' => [[
                'key' => 'hero_slides',
                'scope' => 'website',
                'value' => json_encode([[
                    'image' => '/storage/fresh.jpg',
                    'title' => 'Fresh Slide',
                    'eyebrow' => '',
                    'subtitle' => '',
                    'cta_text' => 'Order',
                    'cta_url' => '/order/',
                    'cta2_text' => 'Menu',
                    'cta2_url' => '/menu',
                ]]),
            ]],
        ])->assertOk();

        $this->assertSame('{}', SiteSetting::getScoped('hero_slide_1', 'website', 'en'));
        $this->assertSame('{}', SiteSetting::getScoped('hero_slide_1', 'shared', 'en'));

        $html = $this->get('/')->assertOk()->getContent();
        $this->assertStringContainsString('Fresh Slide', $html);
        $this->assertStringNotContainsString('Legacy Ghost', $html);
    }
}
