<?php

declare(strict_types=1);

namespace App\Domains\Gst\Services;

use App\Domains\Gst\Enums\GstTaxCode;

/**
 * Authoritative GST tax math — integer laari only.
 */
class GstTaxCalculator
{
    public function __construct(
        private readonly GstSettingsService $settings = new GstSettingsService,
    ) {}

    public function resolveTaxCode(?string $taxCode): GstTaxCode
    {
        if ($taxCode === null || $taxCode === '') {
            return GstTaxCode::OutOfScope;
        }

        return GstTaxCode::tryFrom($taxCode) ?? GstTaxCode::OutOfScope;
    }

    /**
     * Resolve effective tax rate percent for an item/order line.
     * Standard-rated items always use the current GST settings rate.
     */
    public function resolveTaxRatePercent(?string $taxCode, ?float $legacyTaxRate = null): float
    {
        $code = $this->resolveTaxCode($taxCode);

        if (!$code->chargesGst()) {
            return 0.0;
        }

        return $this->settings->defaultTaxRatePercent();
    }

    public function resolveTaxRateBp(?string $taxCode): int
    {
        $code = $this->resolveTaxCode($taxCode);

        if (!$code->chargesGst()) {
            return 0;
        }

        return $this->settings->defaultTaxRateBp();
    }

    public function calculateLineTaxLaar(int $lineLaar, ?string $taxCode, ?bool $taxInclusive = null): int
    {
        if ($lineLaar <= 0) {
            return 0;
        }

        $code = $this->resolveTaxCode($taxCode);
        if (!$code->chargesGst()) {
            return 0;
        }

        $rateBp = $this->settings->defaultTaxRateBp();
        $taxInclusive ??= $this->settings->taxInclusive();

        if ($taxInclusive) {
            return (int) round($lineLaar * $rateBp / (10000 + $rateBp));
        }

        return (int) round($lineLaar * $rateBp / 10000);
    }

    /**
     * Split order totals into tax-code buckets (laar).
     *
     * @param iterable<object{total_price: mixed, tax_code?: ?string, tax_rate?: mixed}> $lines
     * @return array<string, array{taxable_laar: int, tax_laar: int}>
     */
    public function bucketLines(iterable $lines, float $discountRatio = 1.0): array
    {
        $buckets = [];
        foreach (GstTaxCode::cases() as $code) {
            $buckets[$code->value] = ['taxable_laar' => 0, 'tax_laar' => 0];
        }

        $ratio = max(0.0, min(1.0, $discountRatio));
        $taxInclusive = $this->settings->taxInclusive();

        foreach ($lines as $line) {
            $code = $this->resolveTaxCode($line->tax_code ?? null);
            $lineLaar = (int) round((float) $line->total_price * 100);
            $effectiveLaar = (int) round($lineLaar * $ratio);

            if ($effectiveLaar <= 0) {
                continue;
            }

            $taxLaar = $this->calculateLineTaxLaar($effectiveLaar, $code->value, $taxInclusive);

            if ($taxInclusive) {
                $buckets[$code->value]['taxable_laar'] += $effectiveLaar - $taxLaar;
            } else {
                $buckets[$code->value]['taxable_laar'] += $effectiveLaar;
            }
            $buckets[$code->value]['tax_laar'] += $taxLaar;
        }

        return $buckets;
    }

    public function reconcileGstLaar(int $amountExGstLaar, int $rateBp): int
    {
        if ($amountExGstLaar <= 0 || $rateBp <= 0) {
            return 0;
        }

        return (int) round($amountExGstLaar * $rateBp / 10000);
    }

    public function laarToMvr(int $laar): string
    {
        return number_format($laar / 100, 2, '.', '');
    }
}
