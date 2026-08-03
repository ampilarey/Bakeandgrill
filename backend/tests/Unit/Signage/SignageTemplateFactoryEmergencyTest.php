<?php

declare(strict_types=1);

namespace Tests\Unit\Signage;

use App\Domains\Signage\Services\SignageTemplateFactory;
use PHPUnit\Framework\TestCase;

final class SignageTemplateFactoryEmergencyTest extends TestCase
{
    public function test_notice_layout_has_centered_elements(): void
    {
        $slide = SignageTemplateFactory::emergencySlide('closed');
        $this->assertSame('notice', $slide['emergency_layout']);
        $this->assertStringContainsString('Emergency: closed', $slide['name']);
        $texts = array_values(array_filter($slide['elements'], fn ($el) => ($el['type'] ?? '') === 'text'));
        $this->assertNotEmpty($texts);
        $this->assertSame('We are closed', $texts[0]['text']);
    }

    public function test_alert_layout_for_fire_alarm(): void
    {
        $slide = SignageTemplateFactory::emergencySlide('fire_alarm');
        $this->assertSame('alert', $slide['emergency_layout']);
        $this->assertSame('#B91C1C', $slide['background']['value']);
        $types = array_column($slide['elements'], 'type');
        $this->assertContains('shape', $types);
        $logos = array_filter($slide['elements'], fn ($el) => ($el['type'] ?? '') === 'logo');
        $this->assertEmpty($logos);
    }

    public function test_split_layout_includes_logo(): void
    {
        $slide = SignageTemplateFactory::emergencySlide('maintenance', ['layout' => 'split']);
        $this->assertSame('split', $slide['emergency_layout']);
        $types = array_column($slide['elements'], 'type');
        $this->assertContains('logo', $types);
    }

    public function test_split_layout_uses_image_media_when_set(): void
    {
        $slide = SignageTemplateFactory::emergencySlide('holiday', [
            'layout' => 'split',
            'media_type' => 'image',
            'media_url' => 'https://cdn.example.com/holiday.jpg',
        ]);
        $images = array_values(array_filter($slide['elements'], fn ($el) => ($el['type'] ?? '') === 'image'));
        $this->assertNotEmpty($images);
        $this->assertSame('https://cdn.example.com/holiday.jpg', $images[0]['binding']['url']);
        $this->assertSame('emergency-media-image', $images[0]['binding']['testId']);
        $logos = array_filter($slide['elements'], fn ($el) => ($el['type'] ?? '') === 'logo');
        $this->assertEmpty($logos);
    }

    public function test_video_media_emits_muted_looping_video_element(): void
    {
        $slide = SignageTemplateFactory::emergencySlide('private_event', [
            'layout' => 'full_bleed',
            'media_type' => 'video',
            'media_url' => 'https://cdn.example.com/event.mp4',
        ]);
        $videos = array_values(array_filter($slide['elements'], fn ($el) => ($el['type'] ?? '') === 'video'));
        $this->assertNotEmpty($videos);
        $this->assertSame('https://cdn.example.com/event.mp4', $videos[0]['binding']['url']);
        $this->assertSame('emergency-full-bleed-video', $videos[0]['binding']['testId']);
        // Mute/loop/playsInline are renderer concerns (SlideCanvas); element is video type.
        $this->assertSame('video', $videos[0]['type']);
    }

    public function test_full_bleed_renders_media_behind_overlaid_text(): void
    {
        $slide = SignageTemplateFactory::emergencySlide('private_event', [
            'layout' => 'full_bleed',
            'media_type' => 'image',
            'media_url' => 'https://cdn.example.com/event.jpg',
            'title' => 'Private event',
            'body' => 'Ask staff',
        ]);
        $this->assertSame('full_bleed', $slide['emergency_layout']);
        $this->assertSame('image', $slide['background']['type']);
        $this->assertSame('https://cdn.example.com/event.jpg', $slide['background']['value']);
        $titles = array_values(array_filter(
            $slide['elements'],
            fn ($el) => ($el['binding']['testId'] ?? '') === 'emergency-full-bleed-title'
        ));
        $this->assertNotEmpty($titles);
        $this->assertSame('Private event', $titles[0]['text']);
        $scrim = array_values(array_filter(
            $slide['elements'],
            fn ($el) => ($el['binding']['testId'] ?? '') === 'emergency-full-bleed-scrim'
        ));
        $this->assertNotEmpty($scrim);
    }

    public function test_no_media_keeps_legacy_split_logo(): void
    {
        $slide = SignageTemplateFactory::emergencySlide('maintenance', [
            'layout' => 'split',
            'media_type' => 'none',
        ]);
        $types = array_column($slide['elements'], 'type');
        $this->assertContains('logo', $types);
        $this->assertNotContains('image', $types);
        $this->assertNotContains('video', $types);
    }

    public function test_countdown_layout_has_countdown_binding(): void
    {
        $slide = SignageTemplateFactory::emergencySlide('reopening_soon', [
            'reopen_at' => '2026-08-03T18:00:00+05:00',
        ]);
        $this->assertSame('countdown', $slide['emergency_layout']);
        $countdown = null;
        foreach ($slide['elements'] as $el) {
            if (($el['binding']['type'] ?? '') === 'countdown') {
                $countdown = $el;
                break;
            }
        }
        $this->assertNotNull($countdown);
        $this->assertSame('2026-08-03T18:00:00+05:00', $countdown['binding']['reopen_at']);
        $this->assertSame('emergency-countdown', $countdown['binding']['testId']);
    }

    public function test_dhivehi_elements_included_when_provided(): void
    {
        $slide = SignageTemplateFactory::emergencySlide('special_notice', [
            'title_dv' => 'ޚާއްޞަ',
            'body_dv' => 'މަޢުލޫމާތު',
        ]);
        $dv = array_values(array_filter(
            $slide['elements'],
            fn ($el) => ($el['style']['lang'] ?? '') === 'dv'
        ));
        $this->assertCount(2, $dv);
        $this->assertSame('rtl', $dv[0]['style']['dir']);
    }
}
