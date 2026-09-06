<?php

declare(strict_types=1);

namespace App\Domains\Finance\Support;

use App\Models\SiteSetting;

/**
 * Which bank account each payment method ends up in.
 *
 * Owner, 2026-09-07: "Card and QR are deposited to the same account. Cannot
 * be differentiated. For transfer there is a separate account." So card and
 * QR share one running balance; a deposit into that account clears the
 * oldest unsettled day of card-plus-QR takings, whichever of the two it was.
 */
final class SettlementChannels
{
    public const CARD_QR = 'card_qr';

    public const TRANSFER = 'transfer';

    public const CASH = 'cash';

    public const ACCOUNTS = [self::CARD_QR, self::TRANSFER];

    /** Methods whose money lands in the card/QR account. */
    public const CARD_QR_METHODS = ['card', 'card_pos', 'qr', 'bml_pay', 'bml', 'bml_connect', 'online'];

    public const TRANSFER_METHODS = ['bank_transfer'];

    public const SETTLED_STATUSES = ['paid', 'completed', 'confirmed'];

    // ── settings ─────────────────────────────────────────────────────────────

    /** Days before this are not tracked — the ledger starts where the owner started. */
    public static function startDate(): ?string
    {
        $v = SiteSetting::get('settlement_start_date');

        return is_string($v) && $v !== '' ? $v : null;
    }

    /** A difference this small is "settled" — rounding, not a missing deposit. */
    public static function toleranceLaar(): int
    {
        return max(0, (int) SiteSetting::get('settlement_tolerance_laar', '100'));
    }

    /** A day still owed after this many days is overdue. */
    public static function alertDays(): int
    {
        return max(1, (int) SiteSetting::get('settlement_alert_days', '3'));
    }

    public static function accountLabel(string $account): string
    {
        return match ($account) {
            self::CARD_QR => 'Card & QR account',
            self::TRANSFER => 'Transfer account',
            default => $account,
        };
    }
}
