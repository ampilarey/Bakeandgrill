<?php

declare(strict_types=1);

namespace Tests\Unit\Signage;

use App\Domains\Signage\Services\SignageEmergencyNormalizer;
use PHPUnit\Framework\TestCase;

final class SignageEmergencyNormalizerTest extends TestCase
{
    public function test_normalizes_manual_and_entries(): void
    {
        $cfg = SignageEmergencyNormalizer::normalize('closed', [
            'entries' => [[
                'id' => 'e1',
                'mode' => 'holiday',
                'priority' => 10,
                'is_active' => true,
                'title' => 'Custom holiday',
                'body' => 'Reduced hours',
            ]],
        ]);

        $this->assertSame('closed', $cfg['manual']);
        $this->assertCount(1, $cfg['entries']);
        $this->assertSame('holiday', $cfg['entries'][0]['mode']);
        $this->assertSame('notice', $cfg['entries'][0]['layout']);
        $this->assertSame('Custom holiday', $cfg['entries'][0]['title']);
        $this->assertSame('', $cfg['entries'][0]['title_dv']);
    }

    public function test_default_layouts_per_mode(): void
    {
        $this->assertSame('alert', SignageEmergencyNormalizer::defaultLayoutForMode('fire_alarm'));
        $this->assertSame('countdown', SignageEmergencyNormalizer::defaultLayoutForMode('reopening_soon'));
        $this->assertSame('full_bleed', SignageEmergencyNormalizer::defaultLayoutForMode('private_event'));
        $this->assertSame('notice', SignageEmergencyNormalizer::defaultLayoutForMode('closed'));
    }

    public function test_entry_normalizes_media_fields(): void
    {
        $entry = SignageEmergencyNormalizer::normalizeEntry([
            'mode' => 'closed',
            'layout' => 'split',
            'media_type' => 'image',
            'media_url' => 'https://cdn.example.com/closed.jpg',
            'icon' => 'closed',
        ], 0);

        $this->assertSame('image', $entry['media_type']);
        $this->assertSame('https://cdn.example.com/closed.jpg', $entry['media_url']);
        $this->assertSame('closed', $entry['icon']);
    }

    public function test_fire_alarm_strips_image_and_video_media(): void
    {
        $image = SignageEmergencyNormalizer::normalizeEntry([
            'mode' => 'fire_alarm',
            'media_type' => 'image',
            'media_url' => 'https://cdn.example.com/fire.jpg',
        ], 0);
        $this->assertSame('none', $image['media_type']);
        $this->assertSame('', $image['media_url']);

        $icon = SignageEmergencyNormalizer::normalizeEntry([
            'mode' => 'fire_alarm',
            'media_type' => 'icon',
            'icon' => 'fire',
        ], 0);
        $this->assertSame('icon', $icon['media_type']);
        $this->assertSame('fire', $icon['icon']);
    }

    public function test_legacy_entry_without_media_stays_none(): void
    {
        $entry = SignageEmergencyNormalizer::normalizeEntry([
            'mode' => 'closed',
            'title' => 'We are closed',
        ], 0);
        $this->assertSame('none', $entry['media_type']);
        $this->assertSame('', $entry['media_url']);
    }

    public function test_default_copy_matches_legacy_english(): void
    {
        $closed = SignageEmergencyNormalizer::defaultCopyForMode('closed');
        $this->assertSame('We are closed', $closed['title']);
        $this->assertSame('Thank you for visiting. See you soon.', $closed['body']);

        $fire = SignageEmergencyNormalizer::defaultCopyForMode('fire_alarm');
        $this->assertSame('Please evacuate', $fire['title']);
    }

    public function test_entry_normalizes_dhivehi_and_reopen_at(): void
    {
        $entry = SignageEmergencyNormalizer::normalizeEntry([
            'mode' => 'reopening_soon',
            'title_dv' => 'ދެން ބޭނުން',
            'body_dv' => 'ކުޑަ ވަގުތެއްދިން',
            'reopen_at' => '2026-08-03T18:00:00+05:00',
        ], 0);

        $this->assertSame('countdown', $entry['layout']);
        $this->assertSame('ދެން ބޭނުން', $entry['title_dv']);
        $this->assertSame('2026-08-03T18:00:00+05:00', $entry['reopen_at']);
    }
}
