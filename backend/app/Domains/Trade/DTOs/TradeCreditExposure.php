<?php

declare(strict_types=1);

namespace App\Domains\Trade\DTOs;

/**
 * credit_balance_laar + value of dispatched-but-not-yet-invoiced goods.
 * Shown as two numbers: "owes X, holding Y of our stock". A shop whose
 * paid invoice was credit-noted is in credit instead (wholesale audit,
 * 2026-09-26): `creditInHandLaar` is that amount and `balanceOwedLaar`
 * is zero; the exposure itself is the net figure.
 */
final readonly class TradeCreditExposure
{
    public function __construct(
        public int $balanceOwedLaar,
        public int $holdingUnbilledLaar,
        public int $exposureLaar,
        public int $creditLimitLaar,
        public bool $creditEnabled,
        public string $creditStatus,
        public int $creditInHandLaar = 0,
    ) {}

    public function availableLaar(): int
    {
        if (!$this->creditEnabled || $this->creditStatus !== 'active') {
            return 0;
        }

        return max(0, $this->creditLimitLaar - $this->exposureLaar);
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'balance_owed_laar' => $this->balanceOwedLaar,
            'credit_in_hand_laar' => $this->creditInHandLaar,
            'holding_unbilled_laar' => $this->holdingUnbilledLaar,
            'exposure_laar' => $this->exposureLaar,
            'credit_limit_laar' => $this->creditLimitLaar,
            'available_laar' => $this->availableLaar(),
            'credit_enabled' => $this->creditEnabled,
            'credit_status' => $this->creditStatus,
            'balance_owed_mvr' => number_format($this->balanceOwedLaar / 100, 2, '.', ''),
            'credit_in_hand_mvr' => number_format($this->creditInHandLaar / 100, 2, '.', ''),
            'holding_unbilled_mvr' => number_format($this->holdingUnbilledLaar / 100, 2, '.', ''),
            'exposure_mvr' => number_format($this->exposureLaar / 100, 2, '.', ''),
            'credit_limit_mvr' => number_format($this->creditLimitLaar / 100, 2, '.', ''),
        ];
    }
}
