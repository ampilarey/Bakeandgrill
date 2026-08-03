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
}
