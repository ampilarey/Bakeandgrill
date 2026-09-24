<?php

declare(strict_types=1);

namespace App\Domains\Social\Services;

use App\Models\SiteSetting;
use App\Models\SocialPost;
use Carbon\Carbon;

/**
 * Spacing between posts (owner's shortlist, 2026-09-24: "at most one post
 * a day, never within four hours of another"). Two knobs, both off by
 * default: a minimum gap in minutes and a maximum per business day.
 *
 * Applied to what would otherwise post at once — an unattended automation
 * and "Post now" in the composer — by offering the next free slot instead.
 * A human may still say "post anyway"; an automation is moved. Scheduled
 * posts are placed by a person and are not second-guessed.
 */
class SocialPostingRules
{
    public const GAP_KEY = 'social_rules_min_gap_minutes';

    public const PER_DAY_KEY = 'social_rules_max_per_day';

    /** SMS the business phone with a signed approve/reject link when an automation drafts a post. */
    public const APPROVAL_SMS_KEY = 'social_approval_sms';

    /** Monday morning SMS: what went out, what worked, what is waiting. */
    public const WEEKLY_DIGEST_KEY = 'social_weekly_digest';

    /** Statuses that count as "a post went (or will go) out". */
    private const COUNTED = [
        SocialPost::STATUS_SCHEDULED,
        SocialPost::STATUS_QUEUED,
        SocialPost::STATUS_PROCESSING,
        SocialPost::STATUS_PUBLISHED,
        SocialPost::STATUS_PARTIAL_FAILURE,
    ];

    /** @return array{min_gap_minutes: int, max_per_day: int, approval_sms: bool, weekly_digest: bool} */
    public function all(): array
    {
        return [
            'min_gap_minutes' => max(0, min(1440, (int) SiteSetting::get(self::GAP_KEY, '0'))),
            'max_per_day' => max(0, min(20, (int) SiteSetting::get(self::PER_DAY_KEY, '0'))),
            'approval_sms' => filter_var(SiteSetting::get(self::APPROVAL_SMS_KEY, '1'), FILTER_VALIDATE_BOOLEAN),
            'weekly_digest' => filter_var(SiteSetting::get(self::WEEKLY_DIGEST_KEY, '1'), FILTER_VALIDATE_BOOLEAN),
        ];
    }

    /** @param array<string, mixed> $input */
    public function update(array $input): array
    {
        if (array_key_exists('min_gap_minutes', $input)) {
            SiteSetting::set(self::GAP_KEY, (string) max(0, min(1440, (int) $input['min_gap_minutes'])));
        }
        if (array_key_exists('max_per_day', $input)) {
            SiteSetting::set(self::PER_DAY_KEY, (string) max(0, min(20, (int) $input['max_per_day'])));
        }
        if (array_key_exists('approval_sms', $input)) {
            SiteSetting::set(self::APPROVAL_SMS_KEY, filter_var($input['approval_sms'], FILTER_VALIDATE_BOOLEAN) ? '1' : '0');
        }
        if (array_key_exists('weekly_digest', $input)) {
            SiteSetting::set(self::WEEKLY_DIGEST_KEY, filter_var($input['weekly_digest'], FILTER_VALIDATE_BOOLEAN) ? '1' : '0');
        }
        SiteSetting::bust();

        return $this->all();
    }

    public function enabled(): bool
    {
        $r = $this->all();

        return $r['min_gap_minutes'] > 0 || $r['max_per_day'] > 0;
    }

    /**
     * Why posting at $at would break the rules, or null when it is fine.
     * `$ignorePostId` leaves the post being placed out of the count.
     */
    public function conflict(Carbon $at, ?int $ignorePostId = null): ?string
    {
        $rules = $this->all();
        $tz = config('app.timezone', 'Indian/Maldives');
        $at = $at->copy()->setTimezone($tz);

        if ($rules['min_gap_minutes'] > 0) {
            $gap = $rules['min_gap_minutes'];
            $nearest = $this->postsBetween($at->copy()->subMinutes($gap), $at->copy()->addMinutes($gap), $ignorePostId)
                ->sortBy(fn (array $p) => abs($p['at']->diffInMinutes($at)))
                ->first();
            $minutes = $nearest !== null ? (int) abs($nearest['at']->diffInMinutes($at)) : null;
            if ($nearest !== null && $minutes < $gap) {
                $when = $nearest['at']->lte($at) ? "{$minutes} min before" : "{$minutes} min after";
                $what = $nearest['at']->lte(now()) ? 'went out' : 'is due';

                return "Post #{$nearest['id']} {$what} {$when} this one; the rule is at least {$gap} min apart.";
            }
        }

        if ($rules['max_per_day'] > 0) {
            $count = $this->postsBetween($at->copy()->startOfDay(), $at->copy()->endOfDay(), $ignorePostId)->count();
            if ($count >= $rules['max_per_day']) {
                return "Already {$count} post" . ($count === 1 ? '' : 's') . ' on ' . $at->format('D j M') . "; the rule is at most {$rules['max_per_day']} a day.";
            }
        }

        return null;
    }

    /**
     * The earliest time at or after $from that breaks no rule, searching in
     * 15-minute steps up to two weeks out. Null when nothing is free (only
     * with an absurd rule set).
     */
    public function nextFreeSlot(Carbon $from, ?int $ignorePostId = null): ?Carbon
    {
        $tz = config('app.timezone', 'Indian/Maldives');
        $candidate = $from->copy()->setTimezone($tz);
        $candidate->minute((int) (ceil($candidate->minute / 15) * 15) % 60)->second(0);
        if ($candidate->lt($from)) {
            $candidate->addMinutes(15);
        }
        $limit = $from->copy()->addDays(14);
        while ($candidate->lte($limit)) {
            if ($this->conflict($candidate, $ignorePostId) === null) {
                return $candidate;
            }
            $candidate->addMinutes(15);
        }

        return null;
    }

    /**
     * @return \Illuminate\Support\Collection<int, array{id: int, at: Carbon}>
     */
    private function postsBetween(Carbon $from, Carbon $to, ?int $ignorePostId): \Illuminate\Support\Collection
    {
        return SocialPost::query()
            ->whereIn('status', self::COUNTED)
            ->where('source', '!=', 'channel_test')
            ->when($ignorePostId !== null, fn ($q) => $q->where('id', '!=', $ignorePostId))
            ->where(function ($q) use ($from, $to) {
                $q->whereBetween('scheduled_at', [$from, $to])
                    ->orWhereBetween('published_at', [$from, $to])
                    ->orWhere(fn ($qq) => $qq->whereNull('scheduled_at')->whereNull('published_at')->whereBetween('created_at', [$from, $to]));
            })
            ->get(['id', 'scheduled_at', 'published_at', 'created_at'])
            ->map(fn (SocialPost $p) => ['id' => $p->id, 'at' => ($p->published_at ?? $p->scheduled_at ?? $p->created_at)->copy()])
            ->values();
    }
}
