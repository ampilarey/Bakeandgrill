<?php

declare(strict_types=1);

namespace Tests\Unit\Content;

use App\Domains\Content\ModeEntryCardsPresenter;
use Carbon\Carbon;
use Tests\TestCase;

class ModeEntryCardsPresenterTest extends TestCase
{
    public function test_format_window_time_same_day_and_other_day(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-12 08:00:00', 'Indian/Maldives'));

        $sameDay = ModeEntryCardsPresenter::formatWindowTime('2026-08-12T11:00:00+05:00');
        $this->assertSame('11:00 AM', $sameDay);

        $otherDay = ModeEntryCardsPresenter::formatWindowTime('2026-08-13T10:00:00+05:00');
        $this->assertStringContainsString('10:00 AM', $otherDay);
        $this->assertStringContainsString('Thu', $otherDay);

        Carbon::setTestNow();
    }

    public function test_status_for_closed_until_uses_template(): void
    {
        $line = ModeEntryCardsPresenter::statusFor(
            [
                'available' => false,
                'owner_disabled' => false,
                'next_open_iso' => '2026-08-12T11:00:00+05:00',
            ],
            'Available now',
            'Unavailable right now',
            'Closed until {time}',
        );

        $this->assertStringStartsWith('Closed until ', $line);
    }
}
