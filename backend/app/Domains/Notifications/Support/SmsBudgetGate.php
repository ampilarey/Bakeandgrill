<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Support;

use App\Models\SiteSetting;
use App\Models\SmsLog;
use Illuminate\Support\Facades\DB;

/**
 * Admin-configured SMS spend ceilings (segments).
 *
 * Null / 0 = unlimited. always_on types are never blocked but still count
 * toward usage figures shown in the Control Center.
 */
final class SmsBudgetGate
{
    public const MONTHLY_SEGMENTS_SETTING = 'sms_budget_monthly_segments';

    public const PER_CAMPAIGN_SEGMENTS_SETTING = 'sms_budget_per_campaign_segments';

    /**
     * @return array{
     *   monthly_segment_ceiling: int|null,
     *   per_campaign_segment_ceiling: int|null,
     *   period_start: string,
     *   period_segments_used: int,
     *   period_cost_mvr: float,
     *   period_blocked_count: int,
     *   monthly_remaining: int|null,
     *   monthly_exhausted: bool
     * }
     */
    public static function usageSnapshot(): array
    {
        $monthlyCeiling = self::readCeiling(self::MONTHLY_SEGMENTS_SETTING);
        $campaignCeiling = self::readCeiling(self::PER_CAMPAIGN_SEGMENTS_SETTING);
        $periodStart = now()->startOfMonth();

        $used = (int) SmsLog::query()
            ->where('created_at', '>=', $periodStart)
            ->whereIn('status', ['sent', 'demo', 'queued', 'failed'])
            ->sum('segments');

        $cost = (float) SmsLog::query()
            ->where('created_at', '>=', $periodStart)
            ->whereIn('status', ['sent', 'demo', 'queued', 'failed'])
            ->sum(DB::raw('COALESCE(cost_estimate_mvr, 0)'));

        $blocked = (int) SmsLog::query()
            ->where('created_at', '>=', $periodStart)
            ->where('status', 'disabled')
            ->where('error_message', 'like', 'SMS budget%')
            ->count();

        $remaining = $monthlyCeiling === null ? null : max(0, $monthlyCeiling - $used);

        return [
            'monthly_segment_ceiling' => $monthlyCeiling,
            'per_campaign_segment_ceiling' => $campaignCeiling,
            'period_start' => $periodStart->toDateString(),
            'period_segments_used' => $used,
            'period_cost_mvr' => round($cost, 2),
            'period_blocked_count' => $blocked,
            'monthly_remaining' => $remaining,
            'monthly_exhausted' => $monthlyCeiling !== null && $used >= $monthlyCeiling,
        ];
    }

    /**
     * @param  array{segments: int}  $estimate
     * @return string|null  Block reason, or null when the send may proceed
     */
    public static function blockReason(array $estimate, ?int $campaignId, bool $alwaysOn): ?string
    {
        if ($alwaysOn) {
            return null;
        }

        $segments = max(0, (int) ($estimate['segments'] ?? 0));
        if ($segments <= 0) {
            return null;
        }

        $monthlyCeiling = self::readCeiling(self::MONTHLY_SEGMENTS_SETTING);
        if ($monthlyCeiling !== null) {
            $used = (int) SmsLog::query()
                ->where('created_at', '>=', now()->startOfMonth())
                ->whereIn('status', ['sent', 'demo', 'queued', 'failed'])
                ->sum('segments');

            if (($used + $segments) > $monthlyCeiling) {
                return 'SMS budget exceeded: monthly segment ceiling reached.';
            }
        }

        if ($campaignId !== null) {
            $campaignCeiling = self::readCeiling(self::PER_CAMPAIGN_SEGMENTS_SETTING);
            if ($campaignCeiling !== null) {
                $campaignUsed = (int) SmsLog::query()
                    ->where('campaign_id', $campaignId)
                    ->whereIn('status', ['sent', 'demo', 'queued', 'failed'])
                    ->sum('segments');

                if (($campaignUsed + $segments) > $campaignCeiling) {
                    return 'SMS budget exceeded: per-campaign segment ceiling reached.';
                }
            }
        }

        return null;
    }

    /**
     * Estimate whether a bulk campaign of N recipients × message segments would fit.
     */
    public static function wouldExceedForBulk(int $totalSegments, ?int $campaignId = null): ?string
    {
        $fakeEstimate = ['segments' => $totalSegments];

        return self::blockReason($fakeEstimate, $campaignId, alwaysOn: false);
    }

    public static function readCeiling(string $settingKey): ?int
    {
        $raw = SiteSetting::get($settingKey, null);
        if ($raw === null || $raw === '') {
            return null;
        }

        $n = (int) $raw;

        return $n > 0 ? $n : null;
    }
}
