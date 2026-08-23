<?php

declare(strict_types=1);

namespace App\Domains\Shared\ValueObjects;

use Illuminate\Support\Facades\Log;
use InvalidArgumentException;

/**
 * Immutable money value object.
 *
 * All amounts are stored as integer laari (1 MVR = 100 laari).
 * This avoids floating-point precision errors in financial calculations.
 *
 * For MVR ↔ laari conversion on legacy decimals (including negative
 * discount amounts), use {@see \App\Support\LaariConverter} instead.
 *
 * Rounding policy:
 *   - Percentage discounts (PromotionEvaluator): floor() on laar
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

        if ($result < 0) {
            // Clamping to zero is right for money — a negative total is never
            // something to show anyone — but nothing here legitimately
            // subtracts more than it holds. Every call site either caps the
            // subtrahend first (EffectiveDiscount::allocate bounds discounts to
            // the subtotal) or subtracts a value derived from the minuend
            // (addTax(x) - x). So a clamp is an invariant violation, and
            // flooring it in silence turns a wrong total into a plausible zero
            // that nobody goes looking for.
            self::reportClamp($this->amountLaar, $other->amountLaar);
        }

        return new self(max(0, $result), $this->currency);
    }

    /**
     * Diagnostics must never break arithmetic: Money is a plain value object
     * and is constructed in contexts with no container bound.
     */
    private static function reportClamp(int $minuendLaar, int $subtrahendLaar): void
    {
        try {
            Log::warning('Money::subtract clamped a negative result to zero', [
                'minuend_laar' => $minuendLaar,
                'subtrahend_laar' => $subtrahendLaar,
                'overdraw_laar' => $subtrahendLaar - $minuendLaar,
            ]);
        } catch (\Throwable) {
            // No logger available — the clamp itself still stands.
        }
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
     * Same integer formula as GstTaxCalculator: amount * rate / (10000 + rate).
     * Avoids float drift from amount - amount/(1+r).
     *
     * @param int $rateBp e.g. 1200 = 12.00% GST
     */
    public function extractTax(int $rateBp): self
    {
        if ($rateBp <= 0 || $this->amountLaar <= 0) {
            return self::zero($this->currency);
        }
        $taxLaar = (int) round($this->amountLaar * $rateBp / (10000 + $rateBp));

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
