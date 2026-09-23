<?php

declare(strict_types=1);

namespace Tests\Feature\Signage;

use App\Models\SignagePlaylist;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Board layout pass, 2026-09-23. The seeded board used Georgia and the
 * system font, hid thumbnails and showcased twelve dishes a loop; the
 * migration brings a still-default playlist up to the new defaults and
 * leaves an owner's own choices alone.
 */
final class SignageBoardLayoutDefaultsMigrationTest extends TestCase
{
    use RefreshDatabase;

    private function migrate(): void
    {
        // RefreshDatabase has already recorded this migration as run, so
        // `migrate --path` would skip it; run the class itself.
        $migration = require base_path('database/migrations/2026_09_23_100000_signage_board_layout_defaults.php');
        $migration->up();
    }

    public function test_the_seeded_default_board_gets_brand_fonts_thumbnails_and_a_smaller_showcase(): void
    {
        // RefreshDatabase already ran the migration over the seeded row; put
        // the seeded values back and run it again to see what it does.
        $playlist = SignagePlaylist::query()->firstOrFail();
        $slides = $playlist->slides;
        foreach ($slides as &$slide) {
            if (($slide['template_origin'] ?? '') === 'auto_menu') {
                $slide['elements'][0]['binding']['show_thumbs'] = false;
                $slide['elements'][0]['binding']['showcase_cap'] = 12;
            }
        }
        unset($slide);
        $playlist->forceFill([
            'theme' => array_merge($playlist->theme ?? [], ['font_display' => 'Georgia, serif', 'font_body' => 'system-ui, sans-serif']),
            'slides' => $slides,
        ])->save();

        $this->migrate();

        $fresh = SignagePlaylist::query()->findOrFail($playlist->id);
        $this->assertSame('', $fresh->theme['font_display']);
        $this->assertSame('', $fresh->theme['font_body']);
        $this->assertSame('#D4813A', $fresh->theme['primary'], 'the rest of the theme is untouched');

        $auto = collect($fresh->slides)->firstWhere('template_origin', 'auto_menu');
        $this->assertNotNull($auto);
        $this->assertTrue($auto['elements'][0]['binding']['show_thumbs']);
        $this->assertSame(6, $auto['elements'][0]['binding']['showcase_cap']);
    }

    public function test_an_owner_s_own_choices_are_left_alone(): void
    {
        $playlist = SignagePlaylist::query()->firstOrFail();
        $slides = $playlist->slides;
        foreach ($slides as &$slide) {
            if (($slide['template_origin'] ?? '') === 'auto_menu') {
                $slide['elements'][0]['binding']['show_thumbs'] = false;
                $slide['elements'][0]['binding']['showcase_cap'] = 10;
            }
        }
        unset($slide);
        $playlist->forceFill([
            'theme' => array_merge($playlist->theme ?? [], ['font_display' => 'Playfair Display, serif', 'font_body' => 'system-ui, sans-serif']),
            'slides' => $slides,
        ])->save();

        $this->migrate();

        $fresh = SignagePlaylist::query()->findOrFail($playlist->id);
        $this->assertSame('Playfair Display, serif', $fresh->theme['font_display'], 'a chosen display face stays');
        $this->assertSame('', $fresh->theme['font_body'], 'the seeded body font still goes');
        $auto = collect($fresh->slides)->firstWhere('template_origin', 'auto_menu');
        $this->assertSame(10, $auto['elements'][0]['binding']['showcase_cap'], 'a cap the owner set stays');
        $this->assertTrue($auto['elements'][0]['binding']['show_thumbs'], 'off was the seeded default, so it turns on');
    }
}
