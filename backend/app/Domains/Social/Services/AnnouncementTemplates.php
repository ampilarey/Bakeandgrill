<?php

declare(strict_types=1);

namespace App\Domains\Social\Services;

use App\Services\OpeningHoursService;
use Carbon\Carbon;

/**
 * Starter texts for an announcement that goes to the social channels and
 * the TV board at once (owner's shortlist, 2026-09-24: "opening hours and
 * holiday notices … cross-posted to all channels and to the TV notice at
 * the same time"). Each is filled from what the system already knows —
 * today's closure reason, tomorrow's opening time, the week's hours — so
 * the owner edits a sentence rather than writes one.
 */
class AnnouncementTemplates
{
    private const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    public function __construct(private readonly OpeningHoursService $hours) {}

    /**
     * @return list<array{key: string, label: string, text: string, look: string, minutes: int}>
     */
    public function all(?Carbon $now = null): array
    {
        $now = $now ?? now(config('opening_hours.timezone', config('app.timezone', 'Indian/Maldives')));
        $reason = trim((string) ($this->hours->getClosureReason() ?? ''));
        $tomorrow = $this->openingLine($now->copy()->addDay());
        $minutesToMidnight = max(30, (int) $now->diffInMinutes($now->copy()->endOfDay()));

        return [
            [
                'key' => 'closed_today',
                'label' => 'Closed today',
                'text' => "We're closed today" . ($reason !== '' ? " ({$reason})" : '') . '. ' . ($tomorrow !== '' ? "Back {$tomorrow}." : 'See you soon.'),
                'look' => 'warning',
                'minutes' => $minutesToMidnight,
            ],
            [
                'key' => 'closing_early',
                'label' => 'Closing early',
                'text' => 'We close early today at ' . $this->timeLabel($this->closeToday($now) ?? '18:00') . '. Last orders 30 minutes before.',
                'look' => 'warning',
                'minutes' => $minutesToMidnight,
            ],
            [
                'key' => 'holiday',
                'label' => 'Holiday closure',
                'text' => 'We will be closed on ' . $now->copy()->addDay()->format('l j F') . ' for the holiday. Back ' . ($this->openingLine($now->copy()->addDays(2)) ?: 'the day after') . '. Eid Mubarak from all of us at Bake & Grill!',
                'look' => 'celebrate',
                'minutes' => 2880,
            ],
            [
                'key' => 'hours',
                'label' => 'Opening hours',
                'text' => 'Our opening hours: ' . $this->hoursSummary() . '.',
                'look' => 'info',
                'minutes' => 10080,
            ],
            [
                'key' => 'ramadan',
                'label' => $this->hours->isRamadanHoursActive() ? 'Ramadan hours (active)' : 'Ramadan hours',
                'text' => 'Ramadan Kareem! During Ramadan we open ' . $this->hoursSummary() . '. Iftar orders welcome — order ahead to skip the queue.',
                'look' => 'celebrate',
                'minutes' => 10080,
            ],
            [
                'key' => 'custom',
                'label' => 'Write your own',
                'text' => '',
                'look' => 'info',
                'minutes' => 1440,
            ],
        ];
    }

    /** "tomorrow at 7:00 AM" / "Monday at 7:00 AM", or '' when that day is closed or unknown. */
    public function openingLine(Carbon $day): string
    {
        $row = $this->hours->getHoursForDisplay()[$day->dayOfWeek] ?? null;
        if (!is_array($row) || !empty($row['closed']) || empty($row['open'])) {
            return '';
        }
        if (isset($this->hours->closures()[$day->toDateString()])) {
            return '';
        }
        $when = $day->isTomorrow() ? 'tomorrow' : ($day->isToday() ? 'today' : self::DAYS[$day->dayOfWeek]);

        return $when . ' at ' . $this->timeLabel((string) $row['open']);
    }

    /** "Back Saturday at 7:00 AM." for the first open day within a week after $closedDay, or ''. */
    public function backLine(Carbon $closedDay): string
    {
        for ($i = 1; $i <= 7; $i++) {
            $line = $this->openingLine($closedDay->copy()->addDays($i));
            if ($line !== '') {
                return 'Back ' . $line . '.';
            }
        }

        return '';
    }

    /** "today" / "tomorrow" / "on Friday 26 September", relative to $now. */
    public function dayLabel(Carbon $day, Carbon $now): string
    {
        if ($day->isSameDay($now)) {
            return 'today';
        }
        if ($day->isSameDay($now->copy()->addDay())) {
            return 'tomorrow';
        }

        return 'on ' . $day->format('l j F');
    }

    private function closeToday(Carbon $now): ?string
    {
        $row = $this->hours->getHoursForDisplay()[$now->dayOfWeek] ?? null;

        return is_array($row) && !empty($row['close']) ? (string) $row['close'] : null;
    }

    /** Collapse identical consecutive days: "Sat–Thu 7:00 AM–10:00 PM, Fri 2:00 PM–10:00 PM". */
    public function hoursSummary(): string
    {
        $rows = $this->hours->getHoursForDisplay();
        $short = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        // Maldivian week starts Sunday; group runs of equal hours.
        $groups = [];
        for ($d = 0; $d < 7; $d++) {
            $row = $rows[$d] ?? null;
            $label = !is_array($row) || !empty($row['closed']) || empty($row['open']) || empty($row['close'])
                ? 'closed'
                : $this->timeLabel((string) $row['open']) . '–' . $this->timeLabel((string) $row['close']);
            $last = $groups === [] ? null : array_key_last($groups);
            if ($last !== null && $groups[$last]['label'] === $label) {
                $groups[$last]['to'] = $d;
            } else {
                $groups[] = ['from' => $d, 'to' => $d, 'label' => $label];
            }
        }

        return implode(', ', array_map(
            fn (array $g) => ($g['from'] === $g['to'] ? $short[$g['from']] : $short[$g['from']] . '–' . $short[$g['to']]) . ' ' . $g['label'],
            $groups,
        ));
    }

    private function timeLabel(string $hhmm): string
    {
        try {
            return Carbon::createFromFormat('H:i', substr($hhmm, 0, 5))->format('g:i A');
        } catch (\Throwable) {
            return $hhmm;
        }
    }
}
