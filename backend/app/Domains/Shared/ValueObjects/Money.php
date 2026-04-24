<?php

declare(strict_types=1);

namespace App\Domains\Shared\ValueObjects;

use InvalidArgumentException;

/**
 * Immutable money value object.
 *
 * All amounts are stored as integer laari (1 MVR = 100 laari).
 * This avoids floating-point precision errors in financial calculations.
 *
 * Rounding policy (matches BML requirements):
 *   - Discounts: floor() — always round DOWN (customer-favorable)
 *   - Tax extraction: round() — standard rounding
 *   - Tax addition: round() — standard rounding
 */
final readonly class Money
{
    public function __construct(
        public int $amountLaar,
        public string $currency = 'MVR',
    ) {
        if ($amountLaar < 0) {
            throw new InvalidArgumentException("Money amount cannot be negative: {$amountLaar}");
        }
    }

    public static function fromMvr(float|int|string $mvr, string $currency = 'MVR'): self
    {
        return new self((int) round((float) $mvr * 100), $currency);
    }

    public static function zero(string $currency = 'MVR'): self
    {
        return new self(0, $currency);
    }

    public function toMvr(): float
    {
        return $this->amountLaar / 100;
    }

    public function toMvrString(): string
    {
        return number_format($this->amountLaar / 100, 2, '.', '');
    }

    public function add(self $other): self
    {
        $this->assertSameCurrency($other);

        return new self($this->amountLaar + $other->amountLaar, $this->currency);
    }

    public function subtract(self $other): self
    {
        $this->assertSameCurrency($other);
        $result = $this->amountLaar - $other->amountLaar;

        return new self(max(0, $result), $this->currency);
    }

    public function multiply(float|int $factor): self
    {
        return new self((int) round($this->amountLaar * $factor), $this->currency);
    }

    /**
     * Calculate a percentage discount.
     * Uses floor() — always rounds DOWN to favour the merchant.
     *
     * @param int $basisPoints e.g. 1000 = 10.00%, 500 = 5.00%
     */
    public function percentageDiscount(int $basisPoints): self
    {
        if ($basisPoints <= 0) {
            return self::zero($this->currency);
        }
        $discountLaar = (int) floor($this->amountLaar * $basisPoints / 10000);

        return new self($discountLaar, $this->currency);
    }

    /**
     * Extract included tax from a tax-inclusive price.
     * Tax = amount - (amount / (1 + rate))
     * Uses round() per standard accounting.
     *
     * @param int $rateBp e.g. 1200 = 12.00% GST
     */
    public function extractTax(int $rateBp): self
    {
        if ($rateBp <= 0) {
            return self::zero($this->currency);
        }
        $taxLaar = (int) round($this->amountLaar - $this->amountLaar / (1 + $rateBp / 10000));

        return new self($taxLaar, $this->currency);
    }

    /**
     * Add tax on top of a tax-exclusive price.
     * Uses round() per standard accounting.
     *
     * @param int $rateBp e.g. 1200 = 12.00%
     */
    public function addTax(int $rateBp): self
    {
        if ($rateBp <= 0) {
            return $this;
        }
        $taxLaar = (int) round($this->amountLaar * $rateBp / 10000);

        return new self($this->amountLaar + $taxLaar, $this->currency);
    }

    public function isZero(): bool
    {
        return $this->amountLaar === 0;
    }

    public function isGreaterThan(self $other): bool
    {
        $this->assertSameCurrency($other);

        return $this->amountLaar > $other->amountLaar;
    }

    public function isLessThan(self $other): bool
    {
        $this->assertSameCurrency($other);

        return $this->amountLaar < $other->amountLaar;
    }

    public function isGreaterThanOrEqual(self $other): bool
    {
        $this->assertSameCurrency($other);

        return $this->amountLaar >= $other->amountLaar;
    }

    public function min(self $other): self
    {
        $this->assertSameCurrency($other);

        return $this->amountLaar <= $other->amountLaar ? $this : $other;
    }

    public function max(self $other): self
    {
        $this->assertSameCurrency($other);

        return $this->amountLaar >= $other->amountLaar ? $this : $other;
    }

    private function assertSameCurrency(self $other): void
    {
        if ($this->currency !== $other->currency) {
            throw new InvalidArgumentException(
                "Currency mismatch: {$this->currency} vs {$other->currency}",
            );
        }
    }
}
