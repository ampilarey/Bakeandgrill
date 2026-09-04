<?php

declare(strict_types=1);

namespace App\Domains\Inventory\Services;

use App\Models\SiteSetting;

/**
 * How far back a purchase may be dated, and the fact that it may never be
 * dated forward.
 *
 * Backdating, 2026-09-04. A purchase order took `purchase_date` as
 * `required|date` with no bounds at all, so a typo in the year was accepted
 * silently and filed the delivery in 2027 — where no report would ever look
 * for it. The buying list had the opposite problem: it stamped `now()` and
 * offered no way to say otherwise, so a shop run entered on Monday for
 * Saturday's shopping was simply wrong.
 *
 * One window governs both, so the two doors cannot disagree about what counts
 * as a plausible date.
 */
final class BackdatePolicy
{
    public const DEFAULT_MAX_DAYS = 90;

    public const SETTING_KEY = 'purchase_backdate_max_days';

    /** How many days back a purchase may be dated. 0 means today only. */
    public static function maxDays(): int
    {
        $raw = SiteSetting::get(self::SETTING_KEY, (string) self::DEFAULT_MAX_DAYS);
        $days = (int) $raw;

        if ($days < 0 || $days > 3650) {
            return self::DEFAULT_MAX_DAYS;
        }

        return $days;
    }

    /** The oldest date that may be entered, as YYYY-MM-DD. */
    public static function earliestDate(): string
    {
        return now()->subDays(self::maxDays())->toDateString();
    }

    /**
     * Validation rules for a field holding the day a purchase happened.
     *
     * `before_or_equal:today` is the half that matters most — a future-dated
     * purchase is always a mistake, and it hides the stock from every report
     * until the date arrives.
     *
     * @return array<int, string>
     */
    public static function rules(bool $required = true): array
    {
        return [
            $required ? 'required' : 'nullable',
            'date',
            'after_or_equal:' . self::earliestDate(),
            'before_or_equal:' . now()->toDateString(),
        ];
    }

    /** Wording the admin and POS both show when the date is refused. */
    public static function messages(string $field): array
    {
        $days = self::maxDays();

        return [
            "{$field}.before_or_equal" => 'A purchase cannot be dated in the future.',
            "{$field}.after_or_equal" => $days === 0
                ? 'A purchase must be dated today.'
                : "A purchase cannot be dated more than {$days} days back.",
        ];
    }
}
