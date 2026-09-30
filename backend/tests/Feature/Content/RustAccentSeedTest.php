<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Models\SignagePlaylist;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Owner, 2026-09-30: "Update the docs and change throughout the website."
 * The accent is the logo's rust; on dark surfaces it is the lighter shade
 * the palette derives. A colour the owner chose is not overridden.
 */
class RustAccentSeedTest extends TestCase
{
    use RefreshDatabase;

    private function migrate(): void
    {
        $migration = require base_path('database/migrations/2026_09_30_230000_rust_accent.php');
        $migration->up();
    }

    public function test_the_site_accent_is_the_rust_and_the_website_emits_it(): void
    {
        $this->assertSame('#B74B0C', content('primary_color'));

        $html = $this->get('/')->assertOk()->getContent();
        $this->assertStringContainsString('--amber: #B74B0C;', $html);
        $this->assertStringContainsString('--amber-contrast: #FFFDF9;', $html, 'cream text on the rust button');
        $this->assertStringContainsString('--amber-on-dark: #C56F3D;', $html, 'the footer tag on the dark strip uses the lighter shade');
    }

    public function test_signage_keeps_the_lighter_shade_on_black(): void
    {
        $playlist = SignagePlaylist::query()->firstOrFail();
        $this->assertSame('#C56F3D', $playlist->theme['primary']);

        $json = json_encode($playlist->slides);
        $this->assertStringNotContainsStringIgnoringCase('#D4813A', (string) $json, 'seeded slide styles moved too');
        $this->assertStringContainsStringIgnoringCase('#C56F3D', (string) $json);
    }

    public function test_a_colour_the_owner_chose_is_left_alone(): void
    {
        SiteSetting::set('primary_color', '#123456', 'shared');
        $playlist = SignagePlaylist::query()->firstOrFail();
        $playlist->forceFill(['theme' => array_merge($playlist->theme, ['primary' => '#336699'])])->save();

        $this->migrate();

        $this->assertSame('#123456', SiteSetting::getScoped('primary_color', 'shared'));
        $this->assertSame('#336699', SignagePlaylist::query()->findOrFail($playlist->id)->theme['primary']);
    }

    public function test_the_old_amber_moves_wherever_it_is_still_set(): void
    {
        SiteSetting::set('primary_color', '#d4813a', 'shared');
        SiteSetting::set('primary_color', '', 'order_app');
        $playlist = SignagePlaylist::query()->firstOrFail();
        $playlist->forceFill(['theme' => array_merge($playlist->theme, ['primary' => '#d4813a'])])->save();

        $this->migrate();

        $this->assertSame('#B74B0C', SiteSetting::getScoped('primary_color', 'shared'));
        $this->assertSame('#B74B0C', SiteSetting::getScoped('primary_color', 'order_app'));
        $this->assertSame('#C56F3D', SignagePlaylist::query()->findOrFail($playlist->id)->theme['primary']);
    }
}
