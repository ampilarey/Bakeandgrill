<?php

declare(strict_types=1);

namespace App\Domains\Deposits\Support;

use App\Models\Customer;
use App\Models\CustomerDepositAccount;
use App\Models\SiteSetting;
use App\Models\WalletTopUp;
use App\Support\BusinessDay;

/**
 * What a card top-up of the wallet may be (owner, 2026-10-21). The owner sets
 * the numbers on Settings → Credit & wallet; the order app reads them through
 * forCustomer() and shows only what this customer may do.
 *
 * Only a checked number may add money: a guest account on a number nobody
 * checked is set aside the day the number's owner signs in (GuestNumbers),
 * and card money on it would be stranded.
 */
final class WalletTopUpRules
{
    public const ENABLED = 'wallet_topup_enabled';

    public const PRESETS = 'wallet_topup_presets';

    public const MIN = 'wallet_topup_min_mvr';

    public const MAX = 'wallet_topup_max_mvr';

    public const DAILY_CAP = 'wallet_topup_daily_cap_mvr';

    public const MAX_BALANCE = 'wallet_balance_max_mvr';

    /** A card top-up at or above this texts the owners (the "When it sends" of owner_deposit_large_topup). */
    public const OWNER_ALERT = 'wallet_topup_owner_alert_mvr';

    /** A bonus on every top-up (phase 4): this many percent extra, on top-ups of at least BONUS_MIN. 0 is off. */
    public const BONUS_PERCENT = 'wallet_topup_bonus_percent';

    public const BONUS_MIN = 'wallet_topup_bonus_min_mvr';

    public const DEFAULTS = [
        self::ENABLED => '1',
        self::PRESETS => '100,200,500,1000',
        self::MIN => '50',
        self::MAX => '5000',
        self::DAILY_CAP => '10000',
        self::MAX_BALANCE => '20000',
        self::OWNER_ALERT => '2000',
        self::BONUS_PERCENT => '0',
        self::BONUS_MIN => '0',
    ];

    /** Every key, for the settings write list and the admin screen. */
    public const KEYS = [
        self::ENABLED,
        self::PRESETS,
        self::MIN,
        self::MAX,
        self::DAILY_CAP,
        self::MAX_BALANCE,
        self::OWNER_ALERT,
        self::BONUS_PERCENT,
        self::BONUS_MIN,
    ];

    /** The bonus percent the owner set, 0 to 100. */
    public static function bonusPercent(): float
    {
        $raw = SiteSetting::get(self::BONUS_PERCENT, self::DEFAULTS[self::BONUS_PERCENT]);
        $pct = is_numeric($raw) ? (float) $raw : 0.0;

        return $pct > 0 && $pct <= 100 ? round($pct, 2) : 0.0;
    }

    /** Top-ups of at least this much earn the bonus; 0 means every top-up. */
    public static function bonusMinLaar(): int
    {
        return max(0, self::laar(self::BONUS_MIN));
    }

    /**
     * What a top-up of this size earns on top (phase 4, owner 2026-10-21):
     * the owner's percent, rounded down to the laari, once the top-up reaches
     * the minimum. Nothing when the percent is 0.
     */
    public static function bonusLaar(int $amountLaar): int
    {
        $pct = self::bonusPercent();
        if ($pct <= 0 || $amountLaar <= 0 || $amountLaar < self::bonusMinLaar()) {
            return 0;
        }

        return (int) floor($amountLaar * $pct / 100);
    }

    /** Pending top-ups this young count against the daily cap, so a burst of starts cannot pass it. */
    private const PENDING_COUNTS_FOR_MINUTES = 30;

    public static function enabled(): bool
    {
        $v = strtolower(trim((string) SiteSetting::get(self::ENABLED, self::DEFAULTS[self::ENABLED])));

        return !in_array($v, ['0', 'false', 'off', ''], true);
    }

    /** @return list<int> laari, sorted, within the min and max */
    public static function presetsLaar(): array
    {
        $min = self::minLaar();
        $max = self::maxLaar();
        $out = [];
        foreach (preg_split('/[\s,;]+/', (string) SiteSetting::get(self::PRESETS, self::DEFAULTS[self::PRESETS])) ?: [] as $part) {
            if ($part === '' || !is_numeric($part)) {
                continue;
            }
            $laar = (int) round(((float) $part) * 100);
            if ($laar >= $min && ($max <= 0 || $laar <= $max)) {
                $out[] = $laar;
            }
        }
        $out = array_values(array_unique($out));
        sort($out);

        return $out;
    }

    public static function minLaar(): int
    {
        return max(100, self::laar(self::MIN));
    }

    /** 0 means no ceiling. */
    public static function maxLaar(): int
    {
        return self::laar(self::MAX);
    }

    /** 0 means no cap. */
    public static function dailyCapLaar(): int
    {
        return self::laar(self::DAILY_CAP);
    }

    /** 0 means no ceiling. */
    public static function maxBalanceLaar(): int
    {
        return self::laar(self::MAX_BALANCE);
    }

    /** 0 means never. */
    public static function ownerAlertLaar(): int
    {
        return self::laar(self::OWNER_ALERT);
    }

    /**
     * Why this customer may not add money by card now, or null. A null
     * amount checks the account alone (the app's rules call, an open link).
     * Staff wording speaks of "this customer"; a staff link needs no phone,
     * since it can be copied and handed over another way.
     *
     * @return array{code: string, message: string}|null
     */
    public static function refusal(Customer $customer, ?int $amountLaar, bool $staff = false): ?array
    {
        if (!self::enabled()) {
            return ['code' => 'off', 'message' => 'Adding money by card is not available right now.'];
        }
        if (!$staff && trim((string) $customer->phone) === '') {
            return ['code' => 'no_phone', 'message' => 'Your account has no phone number.'];
        }
        if ($customer->phone_unverified) {
            return [
                'code' => 'verify_phone',
                'message' => $staff
                    ? "This customer's number is not verified yet. Ask them to verify it in the app first."
                    : 'Verify your number before adding money to your wallet.',
            ];
        }
        $account = CustomerDepositAccount::query()->where('customer_id', $customer->id)->first();
        $status = (string) ($account?->status ?? 'active');
        if ($status === 'frozen') {
            return ['code' => 'on_hold', 'message' => $staff ? 'This wallet is on hold.' : 'Your wallet is on hold. Please contact us.'];
        }
        if ($status === 'closed') {
            return ['code' => 'closed', 'message' => $staff ? 'This wallet is closed.' : 'Your wallet is closed. Please contact us.'];
        }
        if ($amountLaar === null) {
            return null;
        }

        $min = self::minLaar();
        if ($amountLaar < $min) {
            return ['code' => 'min', 'message' => 'The smallest top-up is MVR ' . self::mvr($min) . '.'];
        }
        $max = self::maxLaar();
        if ($max > 0 && $amountLaar > $max) {
            return ['code' => 'max', 'message' => 'The largest top-up is MVR ' . self::mvr($max) . '.'];
        }
        $ceiling = self::maxBalanceLaar();
        $balance = (int) ($account?->balance_laar ?? 0);
        if ($ceiling > 0 && $balance + $amountLaar > $ceiling) {
            return [
                'code' => 'max_balance',
                'message' => sprintf(
                    '%s wallet can hold up to MVR %s; it has MVR %s now.',
                    $staff ? 'The' : 'Your',
                    self::mvr($ceiling),
                    self::mvr($balance),
                ),
            ];
        }
        $cap = self::dailyCapLaar();
        if ($cap > 0) {
            $today = self::todayLaar($customer);
            if ($today + $amountLaar > $cap) {
                return [
                    'code' => 'daily_cap',
                    'message' => sprintf(
                        'Card top-ups are limited to MVR %s a day; MVR %s so far today.',
                        self::mvr($cap),
                        self::mvr($today),
                    ),
                ];
            }
        }

        return null;
    }

    /** Card top-ups paid today (Malé day), plus ones started in the last half hour and not settled. */
    public static function todayLaar(Customer $customer): int
    {
        [$start, $end] = BusinessDay::bounds(BusinessDay::todayYmd());
        $paid = (int) WalletTopUp::query()
            ->where('customer_id', $customer->id)
            ->where('status', WalletTopUp::STATUS_PAID)
            ->whereBetween('paid_at', [$start, $end])
            ->sum('amount_laar');
        $pending = (int) WalletTopUp::query()
            ->where('customer_id', $customer->id)
            ->where('status', WalletTopUp::STATUS_PENDING)
            ->whereNotNull('amount_laar')
            ->where('created_at', '>=', now()->subMinutes(self::PENDING_COUNTS_FOR_MINUTES))
            ->sum('amount_laar');

        return $paid + $pending;
    }

    /**
     * What the order app shows: whether this customer may add money, why
     * not, and the amounts to offer.
     *
     * @return array<string, mixed>
     */
    public static function forCustomer(Customer $customer): array
    {
        $why = self::refusal($customer, null);
        $balance = (int) (CustomerDepositAccount::query()->where('customer_id', $customer->id)->value('balance_laar') ?? 0);
        $cap = self::dailyCapLaar();
        $today = $cap > 0 ? self::todayLaar($customer) : 0;

        return [
            'enabled' => self::enabled(),
            'can_top_up' => $why === null,
            'reason' => $why['code'] ?? null,
            'message' => $why['message'] ?? null,
            'presets_mvr' => array_map(fn (int $l) => round($l / 100, 2), self::presetsLaar()),
            'min_mvr' => round(self::minLaar() / 100, 2),
            'max_mvr' => self::maxLaar() > 0 ? round(self::maxLaar() / 100, 2) : null,
            'daily_cap_mvr' => $cap > 0 ? round($cap / 100, 2) : null,
            'used_today_mvr' => round($today / 100, 2),
            'max_balance_mvr' => self::maxBalanceLaar() > 0 ? round(self::maxBalanceLaar() / 100, 2) : null,
            'balance_mvr' => round($balance / 100, 2),
            // The bonus on a top-up (phase 4): the app says what an amount earns.
            'bonus_percent' => self::bonusPercent(),
            'bonus_min_mvr' => round(self::bonusMinLaar() / 100, 2),
        ];
    }

    private static function laar(string $key): int
    {
        $raw = SiteSetting::get($key, self::DEFAULTS[$key]);

        return is_numeric($raw) ? (int) round(((float) $raw) * 100) : (int) round(((float) self::DEFAULTS[$key]) * 100);
    }

    public static function mvr(int $laar): string
    {
        return number_format($laar / 100, 2, '.', ',');
    }
}
