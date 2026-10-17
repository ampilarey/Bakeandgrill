<?php

declare(strict_types=1);

namespace App\Domains\Loyalty\Support;

use App\Models\LoyaltyAccount;
use App\Models\LoyaltyLedger;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Points that expire soon (iruali import plan, feature 13). Earned points carry
 * expires_at when Admin sets a points life (loyalty_points_expiry_days), and
 * app:expire-loyalty-points takes them off once it passes. This says how many
 * will go within a window, and from which day, never more than the balance.
 */
final class ExpiringPoints
{
    public const WARN_DAYS = 30;

    /** @return Collection<int, LoyaltyLedger> earned entries still to expire within $days */
    public static function entries(?int $customerId, int $days): Collection
    {
        return LoyaltyLedger::query()
            ->whereIn('type', ['earn', 'bonus', 'admin_credit'])
            ->where('points', '>', 0)
            ->whereNotNull('expires_at')
            ->where('expires_at', '>', now())
            ->where('expires_at', '<=', now()->addDays($days))
            ->where('expiry_processed', false)
            ->when($customerId !== null, fn ($q) => $q->where('customer_id', $customerId))
            ->orderBy('expires_at')
            ->get();
    }

    /** @return array{points: int, date: Carbon}|null */
    public static function forCustomer(int $customerId, int $days = self::WARN_DAYS): ?array
    {
        return self::summarise($customerId, self::entries($customerId, $days));
    }

    /**
     * @param Collection<int, LoyaltyLedger> $entries
     * @return array{points: int, date: Carbon}|null
     */
    public static function summarise(int $customerId, Collection $entries): ?array
    {
        if ($entries->isEmpty()) {
            return null;
        }
        $balance = (int) (LoyaltyAccount::query()->where('customer_id', $customerId)->value('points_balance') ?? 0);
        $points = min($balance, (int) $entries->sum('points'));

        return $points > 0 ? ['points' => $points, 'date' => Carbon::parse($entries->first()->expires_at)] : null;
    }
}
