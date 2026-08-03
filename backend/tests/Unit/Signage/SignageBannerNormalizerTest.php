<?php

declare(strict_types=1);

namespace Tests\Unit\Signage;

use App\Domains\Signage\Services\SignageBannerNormalizer;
use PHPUnit\Framework\TestCase;

final class SignageBannerNormalizerTest extends TestCase
{
    public function test_legacy_single_object_becomes_banners_list(): void
    {
        $cfg = SignageBannerNormalizer::normalize([
            'enabled' => true,
            'position' => 'top',
            'fields' => ['date', 'time'],
            'speed_seconds' => 55,
        ]);

        $this->assertTrue($cfg['enabled']);
        $this->assertCount(1, $cfg['banners']);
        $this->assertSame('top', $cfg['banners'][0]['position']);
        $this->assertSame(55, $cfg['banners'][0]['speed_seconds']);
        $this->assertSame(['date', 'time'], $cfg['banners'][0]['fields']);
    }

    public function test_multi_banner_preserves_custom_text_and_duration(): void
    {
        $cfg = SignageBannerNormalizer::normalize([
            'enabled' => true,
            'banners' => [
                [
                    'id' => 'wifi',
                    'label' => 'Wi-Fi',
                    'enabled' => true,
                    'position' => 'bottom',
                    'custom_text' => 'Wi-Fi: {{wifi_name}}',
                    'fields' => ['date'],
                    'speed_seconds' => 40,
                    'duration_seconds' => 20,
                ],
            ],
        ]);

        $this->assertSame('Wi-Fi: {{wifi_name}}', $cfg['banners'][0]['custom_text']);
        $this->assertSame(20, $cfg['banners'][0]['duration_seconds']);
    }

    public function test_absent_appearance_fields_get_legacy_defaults(): void
    {
        $cfg = SignageBannerNormalizer::normalize([
            'enabled' => true,
            'position' => 'bottom',
            'fields' => ['date', 'time'],
            'speed_seconds' => 40,
        ]);

        $item = $cfg['banners'][0];
        $this->assertFalse($cfg['show_logo_between']);
        $this->assertSame(1.0, $item['font_scale']);
        $this->assertSame(1.0, $item['height_scale']);
        $this->assertSame('#fff8f0', $item['text_color']);
        $this->assertSame('rgba(12, 8, 4, 0.78)', $item['background_color']);
        $this->assertSame('left', $item['align']);
        $this->assertSame(SignageBannerNormalizer::DEFAULT_SCROLL_MODE, $item['scroll_mode']);
        $this->assertSame('ltr', $item['direction']);
        $this->assertSame(1, $item['repeat_count']);
        $this->assertSame('full', $item['date_format']);
        $this->assertSame(0.0, $item['inset_percent']);
        $this->assertNull($item['schedule']);
    }

    public function test_legacy_scroll_boolean_migrates_to_scroll_mode(): void
    {
        $seamless = SignageBannerNormalizer::normalizeItem(['scroll' => true], 0);
        $static = SignageBannerNormalizer::normalizeItem(['scroll' => false], 0);
        $defaultMode = SignageBannerNormalizer::normalizeItem(['scroll_mode' => SignageBannerNormalizer::DEFAULT_SCROLL_MODE], 0);
        $absent = SignageBannerNormalizer::normalizeItem(['id' => 'no-motion-key'], 0);

        $this->assertSame('seamless', $seamless['scroll_mode']);
        $this->assertSame('static', $static['scroll_mode']);
        $this->assertSame(SignageBannerNormalizer::DEFAULT_SCROLL_MODE, $defaultMode['scroll_mode']);
        $this->assertSame(SignageBannerNormalizer::DEFAULT_SCROLL_MODE, $absent['scroll_mode']);
        $this->assertSame('ticker', SignageBannerNormalizer::DEFAULT_SCROLL_MODE);
    }

    public function test_appearance_fields_round_trip_through_normalize(): void
    {
        $cfg = SignageBannerNormalizer::normalize([
            'enabled' => true,
            'banners' => [[
                'id' => 'styled',
                'label' => 'Styled',
                'enabled' => true,
                'position' => 'top',
                'fields' => ['date'],
                'speed_seconds' => 40,
                'duration_seconds' => 30,
                'font_scale' => 1.5,
                'height_scale' => 2,
                'text_color' => '#ffeeaa',
                'background_color' => 'rgba(0, 0, 0, 0.5)',
                'align' => 'center',
                'scroll_mode' => 'static',
                'date_format' => 'hijri',
                'inset_percent' => 2.5,
            ]],
        ]);

        $item = $cfg['banners'][0];
        $this->assertSame(1.5, $item['font_scale']);
        $this->assertSame(2.0, $item['height_scale']);
        $this->assertSame('#ffeeaa', $item['text_color']);
        $this->assertSame('rgba(0, 0, 0, 0.5)', $item['background_color']);
        $this->assertSame('center', $item['align']);
        $this->assertSame('static', $item['scroll_mode']);
        $this->assertSame('hijri', $item['date_format']);
        $this->assertSame(2.5, $item['inset_percent']);
    }

    public function test_appearance_values_are_clamped(): void
    {
        $item = SignageBannerNormalizer::normalizeItem([
            'font_scale' => 9,
            'height_scale' => 0.1,
            'inset_percent' => 12,
            'date_format' => 'bogus',
            'align' => 'middle',
            'text_color' => 'not a color!!!',
        ], 0);

        $this->assertSame(3.0, $item['font_scale']);
        $this->assertSame(0.5, $item['height_scale']);
        $this->assertSame(5.0, $item['inset_percent']);
        $this->assertSame('full', $item['date_format']);
        $this->assertSame('left', $item['align']);
        $this->assertSame('#fff8f0', $item['text_color']);
    }

    public function test_repeat_count_direction_show_logo_between_and_schedule(): void
    {
        $cfg = SignageBannerNormalizer::normalize([
            'enabled' => true,
            'show_logo_between' => true,
            'banners' => [[
                'id' => 'rtl',
                'label' => 'Dhivehi',
                'enabled' => true,
                'position' => 'bottom',
                'fields' => ['date'],
                'speed_seconds' => 40,
                'repeat_count' => 5,
                'direction' => 'rtl',
                'schedule' => [
                    'days' => [1, 3, 5],
                    'windows' => [['start' => '18:00', 'end' => '22:00']],
                ],
            ]],
        ]);

        $this->assertTrue($cfg['show_logo_between']);
        $item = $cfg['banners'][0];
        $this->assertSame(5, $item['repeat_count']);
        $this->assertSame('rtl', $item['direction']);
        $this->assertSame([1, 3, 5], $item['schedule']['days']);
        $this->assertSame('18:00', $item['schedule']['windows'][0]['start']);
    }

    public function test_repeat_count_is_clamped(): void
    {
        $low = SignageBannerNormalizer::normalizeItem(['repeat_count' => 0], 0);
        $high = SignageBannerNormalizer::normalizeItem(['repeat_count' => 99], 0);
        $this->assertSame(1, $low['repeat_count']);
        $this->assertSame(20, $high['repeat_count']);
    }
}
