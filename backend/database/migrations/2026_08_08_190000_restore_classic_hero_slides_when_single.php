<?php

declare(strict_types=1);

use App\Domains\Content\ContentResolver;
use App\Domains\Content\HeroSlides;
use App\Models\SiteSetting;
use Illuminate\Database\Migrations\Migration;

/**
 * TEST currently publishes a single video hero, so mobile looks like "one banner"
 * even though production has the classic 3-slide carousel. Restore the classic
 * slides only when a scope has fewer than 2 renderable slides — leave richer
 * CMS content (e.g. production) untouched.
 */
return new class extends Migration
{
    public function up(): void
    {
        $json = json_encode($this->classicSlides(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (! is_string($json) || $json === '') {
            return;
        }

        foreach (['website', 'order_app', 'shared'] as $scope) {
            if ($this->renderableCount($scope) >= 2) {
                continue;
            }

            SiteSetting::set('hero_slides', $json, $scope, 'en');
            foreach (['hero_slide_1', 'hero_slide_2', 'hero_slide_3'] as $legacyKey) {
                SiteSetting::set($legacyKey, '{}', $scope, 'en');
            }
        }

        ContentResolver::bust();
        SiteSetting::bust();
    }

    public function down(): void
    {
        // Non-destructive content restore — no automatic rollback.
    }

    private function renderableCount(string $scope): int
    {
        $raw = SiteSetting::getScoped('hero_slides', $scope, 'en');
        $slides = HeroSlides::resolve(static function (string $key, mixed $default) use ($raw) {
            if ($key === 'hero_slides') {
                return $raw;
            }

            return $default;
        });

        return count($slides);
    }

    /** @return list<array<string, mixed>> */
    private function classicSlides(): array
    {
        return [
            [
                'image' => '/images/cafe/WhatsApp_Image_2026-01-30_at_19.34.49-ffb9abd7-f645-48ef-a78b-f1b36191f0b3.png',
                'eyebrow' => "Malé's neighbourhood café",
                'title' => 'Where Dhivehi breakfast<br>meets <em>artisan baking</em>',
                'subtitle' => 'Real food. Proper char. Baked fresh every morning at 5am.',
                'cta_text' => 'Order Now →',
                'cta_url' => '/order/',
                'cta2_text' => 'View Menu',
                'cta2_url' => '/menu',
                'image_focal_x' => 50,
                'image_focal_y' => 50,
                'image_alt' => '',
                'dim' => 100,
            ],
            [
                'image' => '/images/cafe/WhatsApp_Image_2026-01-30_at_19.34.57-1d4f7fc3-8bca-4e81-bdb4-12a8dceb7dc0.png',
                'eyebrow' => 'Signature Hedhikaa',
                'title' => 'The breakfast your<br>grandmother <em>made</em>',
                'subtitle' => 'Bajiya, gulha, mas roshi — ready by 7am, made the right way.',
                'cta_text' => 'Order Hedhikaa →',
                'cta_url' => '/order/',
                'cta2_text' => 'Browse Menu',
                'cta2_url' => '/menu',
                'image_focal_x' => 50,
                'image_focal_y' => 50,
                'image_alt' => '',
                'dim' => 100,
            ],
            [
                'image' => '/images/cafe/WhatsApp_Image_2026-01-30_at_19.34.55__1_-a88c997c-ebaa-4efc-a50d-11b8b178fd36.png',
                'eyebrow' => 'Fresh Pastries & Bakes',
                'title' => 'Croissants that crackle.<br><em>Baked at dawn.</em>',
                'subtitle' => 'Free delivery on orders over MVR 200. Delivered hot across all of Malé.',
                'cta_text' => 'Start Your Order →',
                'cta_url' => '/order/',
                'cta2_text' => 'View Pastries',
                'cta2_url' => '/menu',
                'image_focal_x' => 50,
                'image_focal_y' => 50,
                'image_alt' => '',
                'dim' => 100,
            ],
        ];
    }
};
