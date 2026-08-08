<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\ContentResolver;
use App\Domains\Content\HeroSlides;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RestoreClassicHeroSlidesMigrationTest extends TestCase
{
    use RefreshDatabase;

    private function runRestoreMigration(): void
    {
        $migration = require database_path('migrations/2026_08_08_190000_restore_classic_hero_slides_when_single.php');
        $migration->up();
    }

    public function test_migration_restores_three_slides_when_only_one_published(): void
    {
        SiteSetting::query()->whereIn('key', ['hero_slides', 'hero_slide_1', 'hero_slide_2', 'hero_slide_3'])->delete();
        SiteSetting::bust();

        SiteSetting::set('hero_slides', json_encode([[
            'image' => '/storage/site/website/one.jpg',
            'video' => '/storage/site/website/video/one.mov',
            'title' => '',
            'eyebrow' => '12',
            'subtitle' => '',
            'cta_text' => '11',
            'cta_url' => '/order/',
            'cta2_text' => '22',
            'cta2_url' => '/menu',
        ]], JSON_UNESCAPED_SLASHES), 'website');

        SiteSetting::set('hero_slides', json_encode([[
            'image' => '/storage/site/order_app/one.jpg',
            'title' => '',
        ]], JSON_UNESCAPED_SLASHES), 'order_app');

        $this->runRestoreMigration();

        $website = HeroSlides::resolve(static fn (string $key, mixed $default) => ContentResolver::for('website')->get($key, $default));
        $order = HeroSlides::resolve(static fn (string $key, mixed $default) => ContentResolver::for('order_app')->get($key, $default));

        $this->assertCount(3, $website);
        $this->assertCount(3, $order);
        $this->assertStringContainsString('Dhivehi breakfast', (string) ($website[0]['title'] ?? ''));
    }

    public function test_migration_does_not_overwrite_existing_multi_slide_heroes(): void
    {
        SiteSetting::query()->whereIn('key', ['hero_slides', 'hero_slide_1', 'hero_slide_2', 'hero_slide_3'])->delete();
        SiteSetting::bust();

        $custom = [
            ['image' => '/custom/a.jpg', 'title' => 'Custom A'],
            ['image' => '/custom/b.jpg', 'title' => 'Custom B'],
            ['image' => '/custom/c.jpg', 'title' => 'Custom C'],
        ];
        SiteSetting::set('hero_slides', json_encode($custom, JSON_UNESCAPED_SLASHES), 'website');
        SiteSetting::set('hero_slides', json_encode($custom, JSON_UNESCAPED_SLASHES), 'order_app');

        $this->runRestoreMigration();

        $website = json_decode((string) SiteSetting::getScoped('hero_slides', 'website'), true);
        $this->assertSame('Custom A', $website[0]['title'] ?? null);
        $this->assertCount(3, $website);
    }
};
