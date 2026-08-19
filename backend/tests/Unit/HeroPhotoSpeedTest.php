<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domains\Content\HeroSlides;
use Tests\TestCase;

/**
 * Owner, 2026-08-19, on the last remaining slide-wide dial: one "motion speed"
 * governed the copy arriving AND a slow background drift, so "snappy words over
 * a calm photo" could not be expressed — pushing the slider sped up both.
 *
 * The photo now has its own tempo. Unset, it follows the text speed, so every
 * slide saved before the split keeps moving at exactly one pace.
 */
class HeroPhotoSpeedTest extends TestCase
{
    public function test_the_photo_follows_the_text_speed_until_it_is_given_its_own(): void
    {
        $motion = HeroSlides::resolveMotion(['motion_speed' => 100]);

        $this->assertSame($motion['speed'], $motion['photo_speed']);
        // 100 on the slider is double speed.
        $this->assertSame('2', $motion['speed']);
    }

    public function test_the_photo_can_run_slower_than_the_words(): void
    {
        // The case that could not be expressed before.
        $motion = HeroSlides::resolveMotion([
            'motion_speed' => 100,
            'photo_motion_speed' => 0,
        ]);

        $this->assertSame('2', $motion['speed'], 'copy stays snappy');
        $this->assertSame('0.5', $motion['photo_speed'], 'photo stays calm');
    }

    public function test_a_slide_with_no_speed_set_at_all_runs_at_normal_pace(): void
    {
        $motion = HeroSlides::resolveMotion([]);

        $this->assertSame('1', $motion['speed']);
        $this->assertSame('1', $motion['photo_speed']);
    }

    public function test_an_empty_photo_speed_is_treated_as_unset_rather_than_zero(): void
    {
        // The editor clears a field to '' rather than removing it; treating
        // that as 0 would silently halve the photo's pace.
        $motion = HeroSlides::resolveMotion([
            'motion_speed' => 100,
            'photo_motion_speed' => '',
        ]);

        $this->assertSame('2', $motion['photo_speed']);
    }

    public function test_the_slide_emits_both_speeds_for_the_stylesheet(): void
    {
        // The website divides its durations by these; a missing photo speed
        // falls back in CSS too, but emitting both keeps the rule simple.
        $presentation = HeroSlides::presentation([
            'motion_speed' => 100,
            'photo_motion_speed' => 0,
            'photo_anim' => 'pan',
        ]);

        $this->assertSame('2', $presentation['motion']['speed']);
        $this->assertSame('0.5', $presentation['motion']['photo_speed']);
    }
}
