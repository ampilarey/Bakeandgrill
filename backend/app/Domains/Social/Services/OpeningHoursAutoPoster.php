<?php

declare(strict_types=1);

namespace App\Domains\Social\Services;

use App\Domains\Signage\Services\SignageNotices;
use App\Models\SiteSetting;
use App\Models\SocialPost;
use App\Services\OpeningHoursService;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Opening hours and closures (the last item of the original plan): when
 * the weekly hours change or a closure is added, a post saying so — and,
 * if wanted, the same line on the TV board's notice ticker. Hours and
 * closures are written through the generic site-settings endpoint, so
 * this watches for a change on the automations tick rather than hooking
 * one controller: a fingerprint of the hours and closures is kept in a
 * setting, and a tick that finds it different works out what moved.
 *
 * Only news is posted: a closure on a day that has already passed, or a
 * closure removed, changes the fingerprint quietly. The first tick after
 * install records what it sees and posts nothing.
 */
class OpeningHoursAutoPoster
{
    public const SOURCE = 'auto_hours';

    public const SEEN_KEY = 'social_auto_hours_seen';

    public function __construct(
        private readonly SocialAutomationSettings $settings,
        private readonly AutoPostDrafter $drafter,
        private readonly OpeningHoursService $hours,
        private readonly AnnouncementTemplates $templates,
    ) {}

    /** @return array{hours: array<int, mixed>, closures: array<string, string>} */
    private function snapshot(): array
    {
        $hours = $this->hours->getHoursForDisplay();
        ksort($hours);
        $closures = array_map('strval', $this->hours->closures());
        ksort($closures);

        return ['hours' => $hours, 'closures' => $closures];
    }

    /** Called every minute. Returns the drafted post, if any, for the command's log line. */
    public function run(): ?SocialPost
    {
        $now = now(config('opening_hours.timezone', config('app.timezone', 'Indian/Maldives')));
        $current = $this->snapshot();
        $encoded = json_encode($current);
        $seenRaw = SiteSetting::get(self::SEEN_KEY);
        $seen = is_string($seenRaw) && $seenRaw !== '' ? json_decode($seenRaw, true) : null;

        if ($encoded === $seenRaw) {
            return null;
        }
        SiteSetting::set(self::SEEN_KEY, (string) $encoded);
        SiteSetting::bust();
        if (!is_array($seen)) {
            return null; // first sight: remember, say nothing
        }

        $config = $this->settings->forKind('hours');
        if (!$config['enabled']) {
            return null;
        }

        // New closures on today or a future day, soonest first.
        $newClosures = [];
        foreach ($current['closures'] as $date => $reason) {
            if (!isset($seen['closures'][$date]) && $date >= $now->toDateString()) {
                $newClosures[$date] = $reason;
            }
        }
        $hoursChanged = json_encode($current['hours']) !== json_encode($seen['hours'] ?? null);

        $post = null;
        foreach ($newClosures as $date => $reason) {
            $post = $this->announceClosure(Carbon::parse($date, $now->getTimezone()), (string) $reason, $config, $now) ?? $post;
        }
        if ($hoursChanged) {
            $post = $this->announceHours($config, $now) ?? $post;
        }

        return $post;
    }

    /** @param array<string, mixed> $config */
    private function announceClosure(Carbon $day, string $reason, array $config, Carbon $now): ?SocialPost
    {
        $dayLabel = $this->templates->dayLabel($day, $now);
        $back = $this->templates->backLine($day);
        $caption = $this->render($config['template'], [
            '{day}' => $dayLabel,
            '{reason}' => $reason !== '' ? "({$reason})" : '',
            '{back}' => $back,
        ]);
        $line = trim("We're closed {$dayLabel}" . ($reason !== '' ? " ({$reason})" : '') . '. ' . $back);

        if ($config['signage']) {
            $this->notice($line, 'warning', $day->copy()->endOfDay());
        }

        return $this->draft($config, $caption, 'closure:' . $day->toDateString(), $now);
    }

    /** @param array<string, mixed> $config */
    private function announceHours(array $config, Carbon $now): ?SocialPost
    {
        $summary = $this->templates->hoursSummary();
        $ramadan = $this->hours->isRamadanHoursActive();
        $caption = $this->render($config['template_hours'], [
            '{hours}' => $summary,
            '{ramadan}' => $ramadan ? 'Ramadan Kareem! ' : '',
        ]);

        if ($config['signage']) {
            $this->notice(($ramadan ? 'Ramadan hours: ' : 'New opening hours: ') . $summary, $ramadan ? 'celebrate' : 'info', $now->copy()->addDays(7));
        }

        return $this->draft($config, $caption, 'hours:' . substr(sha1($summary), 0, 8), $now);
    }

    /** @param array<string, string> $vars */
    private function render(string $template, array $vars): string
    {
        $caption = strtr($template, $vars + ['{link}' => url('/hours')]);
        // Tidy what empty variables leave behind: doubled spaces, a space before a full stop.
        $caption = (string) preg_replace('/[ \t]{2,}/', ' ', $caption);
        $caption = (string) preg_replace('/ \./', '.', $caption);

        return trim((string) preg_replace("/\n{3,}/", "\n\n", (string) preg_replace('/^[ \t]+$/m', '', $caption)));
    }

    private function notice(string $text, string $look, Carbon $expires): void
    {
        try {
            SignageNotices::add([
                'text' => Str::limit($text, 157),
                'look' => $look,
                'show' => 'both',
                'seconds' => 10,
                'expires_at' => $expires->toIso8601String(),
            ]);
        } catch (\Throwable $e) {
            Log::warning('social: hours notice could not be put on the TV board', ['error' => $e->getMessage()]);
        }
    }

    /** @param array<string, mixed> $config */
    private function draft(array $config, string $caption, string $ref, Carbon $now): ?SocialPost
    {
        if ($config['channel_ids'] === []) {
            return null;
        }
        $businessDate = $this->drafter->businessDate();
        $prefix = self::SOURCE . ':' . $businessDate . ':' . $ref;
        if ($this->drafter->alreadyDrafted($prefix)) {
            return null;
        }

        return $this->drafter->draftWith($config, $caption, null, url('/hours'), self::SOURCE, $ref, $prefix, $businessDate);
    }
}
