<?php

declare(strict_types=1);

namespace App\Domains\Credit\Services;

use App\Models\SiteSetting;

/**
 * House policy for customer credit — the three settings that apply to every
 * account rather than to one customer.
 *
 * Audit, 2026-09-03 (F1, F4, F7): the ceiling on a manager's approval was the
 * only site-wide setting, and nothing in the admin app could change it. The
 * default payment terms were a constant, so the house policy lived in each
 * approver's memory. And credit could only be turned off by taking permissions
 * away, with no way to stop new accounts while the existing ones were paid off.
 * All three are settings now, and all three are editable in Settings → Credit
 * accounts.
 */
final class CreditPolicy
{
    /** Business as usual. */
    public const MODE_OPEN = 'open';

    /** Existing accounts keep working; nobody new is approved. */
    public const MODE_NO_NEW_ACCOUNTS = 'no_new_accounts';

    /** No new accounts and no new charges. Repayments always still work. */
    public const MODE_CLOSED = 'closed';

    public const MODES = [self::MODE_OPEN, self::MODE_NO_NEW_ACCOUNTS, self::MODE_CLOSED];

    public const DEFAULT_MAX_LIMIT_MVR = 50000.0;

    public static function maxLimitLaar(): int
    {
        $mvr = (float) SiteSetting::get('credit_limit_max_mvr', (string) self::DEFAULT_MAX_LIMIT_MVR);
        if (!is_finite($mvr) || $mvr < 0) {
            $mvr = self::DEFAULT_MAX_LIMIT_MVR;
        }

        return (int) round($mvr * 100);
    }

    /**
     * How long a new account gets to pay, unless the approver says otherwise.
     * Clamped to the same 7–90 days the per-customer field allows, so a bad
     * setting can never produce an account nobody could have approved by hand.
     */
    public static function defaultPaymentTermsDays(): int
    {
        $raw = SiteSetting::get(
            'credit_payment_terms_default_days',
            (string) CreditEligibilityService::DEFAULT_PAYMENT_TERMS_DAYS,
        );
        $days = (int) $raw;
        if ($days < CreditEligibilityService::MIN_PAYMENT_TERMS_DAYS) {
            return CreditEligibilityService::MIN_PAYMENT_TERMS_DAYS;
        }
        if ($days > CreditEligibilityService::MAX_PAYMENT_TERMS_DAYS) {
            return CreditEligibilityService::MAX_PAYMENT_TERMS_DAYS;
        }

        return $days;
    }

    public static function mode(): string
    {
        $mode = (string) SiteSetting::get('credit_accounts_mode', self::MODE_OPEN);

        return in_array($mode, self::MODES, true) ? $mode : self::MODE_OPEN;
    }

    /** A customer who has never been approved can be approved now. */
    public static function acceptsNewAccounts(): bool
    {
        return self::mode() === self::MODE_OPEN;
    }

    /** A sale can be charged to an approved account. */
    public static function acceptsNewCharges(): bool
    {
        return self::mode() !== self::MODE_CLOSED;
    }

    /** Why an action was refused, in words a cashier can act on. */
    public static function closedMessage(): string
    {
        return self::mode() === self::MODE_CLOSED
            ? 'Credit accounts are closed — no new charges. Take another tender.'
            : 'Credit accounts are not accepting new customers.';
    }
}
