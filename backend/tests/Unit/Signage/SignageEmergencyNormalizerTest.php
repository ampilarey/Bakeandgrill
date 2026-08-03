<?php

declare(strict_types=1);

namespace Tests\Unit\Signage;

use App\Domains\Signage\Services\SignageEmergencyNormalizer;
use App\Domains\Signage\Services\SignageTemplateFactory;
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
        $this->assertSame('notice', SignageEmergencyNormalizer::defaultLayoutForMode('closed'));
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
