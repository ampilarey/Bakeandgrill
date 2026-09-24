<?php

declare(strict_types=1);

namespace App\Domains\Social\Services;

use App\Models\DailySpecial;
use App\Models\SocialPost;
use Carbon\Carbon;

/**
 * The weekly menu card (owner's shortlist, 2026-09-24): on the chosen
 * weekday at the chosen time, one post with a generated picture listing
 * the specials running in the next seven days. Nothing posts in a week
 * with no specials. Dedupe: one per day ("auto_weekly:{date}:{channel}").
 *
 * Caption template variables: {specials} (one line per special),
 * {week} ("24–30 Sep"), {link}.
 */
class WeeklyMenuAutoPoster
{
    public const SOURCE = 'auto_weekly';

    private const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    public function __construct(
        private readonly SocialAutomationSettings $settings,
        private readonly AutoPostDrafter $drafter,
        private readonly WeeklyMenuCard $card,
    ) {}

    public function dedupePrefix(string $businessDate): string
    {
        return self::SOURCE . ':' . $businessDate;
    }

    public function run(): ?SocialPost
    {
        $config = $this->settings->forKind('weekly');
        if (!$config['enabled'] || $config['channel_ids'] === []) {
            return null;
        }
        $tz = config('app.timezone', 'Indian/Maldives');
        $today = now($tz);
        if (!in_array((int) $today->dayOfWeek, $config['days'], true)) {
            return null;
        }
        $businessDate = $today->toDateString();
        if ($this->drafter->alreadyDrafted($this->dedupePrefix($businessDate))) {
            return null;
        }

        $weekEnd = $today->copy()->addDays(6);
        $specials = DailySpecial::query()
            ->with('item')
            ->where('is_active', true)
            ->whereDate('start_date', '<=', $weekEnd->toDateString())
            ->whereDate('end_date', '>=', $today->toDateString())
            ->orderBy('start_date')
            ->get()
            ->filter(fn (DailySpecial $s) => $s->item !== null && $s->item->is_active)
            ->values();
        if ($specials->isEmpty()) {
            return null;
        }

        $lines = $specials->map(fn (DailySpecial $s) => [
            'name' => (string) $s->item->name,
            'name_dv' => trim((string) ($s->item->name_dv ?? '')) ?: null,
            'price' => 'MVR ' . number_format($s->getEffectivePriceFor((float) $s->item->base_price), 2),
            'when' => $this->whenLabel($s, $today, $weekEnd),
            'badge' => trim((string) ($s->badge_label ?? '')) ?: null,
        ])->all();

        $week = $today->format('j') . '–' . $weekEnd->format('j M');
        $image = $this->card->render(
            "This week's specials",
            'Bake & Grill · ' . $week,
            $lines,
            str_replace(['https://', 'http://'], '', url('/menu')),
            $businessDate,
        );

        $caption = strtr($config['template'], [
            '{specials}' => implode("\n", array_map(fn (array $l) => '• ' . $l['name'] . ' — ' . $l['price'] . ' (' . $l['when'] . ')', $lines)),
            '{week}' => $week,
            '{link}' => url('/menu'),
        ]);

        return $this->drafter->draftWith(
            $config,
            trim($caption),
            $image,
            url('/menu'),
            self::SOURCE,
            'week:' . $businessDate,
            $this->dedupePrefix($businessDate),
            $businessDate,
            ['special_ids' => $specials->pluck('id')->all()],
        );
    }

    /** "Mon–Thu", "Fri", "all week", or the date range when it starts later. */
    private function whenLabel(DailySpecial $s, Carbon $today, Carbon $weekEnd): string
    {
        $days = $s->days_of_week;
        $inWeekFrom = $s->start_date->gt($today) ? $s->start_date : $today;
        $inWeekTo = $s->end_date->lt($weekEnd) ? $s->end_date : $weekEnd;

        if (is_array($days) && $days !== [] && count($days) < 7) {
            sort($days);
            $names = array_map(fn ($d) => self::DAYS[(int) $d] ?? (string) $d, $days);

            return count($names) === 1 ? $names[0] : $names[0] . '–' . end($names);
        }
        if ($inWeekFrom->isSameDay($today) && $inWeekTo->gte($weekEnd)) {
            return 'all week';
        }

        return $inWeekFrom->format('D j') . '–' . $inWeekTo->format('D j');
    }
}
