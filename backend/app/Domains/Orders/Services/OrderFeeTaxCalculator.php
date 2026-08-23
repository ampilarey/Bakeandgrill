<?php

declare(strict_types=1);

namespace App\Domains\Orders\Services;

use App\Domains\Gst\Enums\GstTaxCode;
use App\Domains\Gst\Services\GstTaxCalculator;
use App\Models\SiteSetting;

/**
 * GST on the order-level fees: packaging, small-order, delivery.
 *
 * These are consideration for the supply rather than lines of it, so they sit
 * outside the per-item tax pipeline and need their own pass. A delivery charge
 * is a taxable supply in the Maldives (owner decision, 2026-08-23) and the
 * small-order fee is extra consideration for the same food, so both default to
 * taxable — as packaging already did. A tip is deliberately absent: it is not
 * consideration for a supply and is never taxed here.
 *
 * One class rather than a block per call site. Order totals and the GST ledger
 * have to agree on the fee taxable base to the laari, or a return will not
 * reconcile against the orders it was built from — and they drifted before,
 * with the totals calculator taxing packaging and the ledger poster carrying
 * its own copy of the same rule.
 */
class OrderFeeTaxCalculator
{
    public function __construct(
        private readonly GstTaxCalculator $tax = new GstTaxCalculator,
    ) {}

    public function packagingTaxable(): bool
    {
        return $this->boolSetting('packaging_fee_taxable', true);
    }

    public function smallOrderTaxable(): bool
    {
        return $this->boolSetting('small_order_fee_taxable', true);
    }

    public function deliveryTaxable(): bool
    {
        return $this->boolSetting('delivery_fee_taxable', true);
    }

    /**
     * GST on the three fees.
     *
     * `taxable_laar` is the GST-exclusive value the fees add to the supply —
     * what the ledger declares. `tax_laar` is the GST on them, which the totals
     * calculator folds into the order's tax and (exclusive only) its total.
     *
     * @return array{taxable_laar: int, tax_laar: int}
     */
    public function calculate(
        int $packagingLaar,
        int $smallOrderLaar,
        int $deliveryLaar,
        bool $taxInclusive,
    ): array {
        $fees = [
            [$packagingLaar, $this->packagingTaxable()],
            [$smallOrderLaar, $this->smallOrderTaxable()],
            [$deliveryLaar, $this->deliveryTaxable()],
        ];

        $taxableLaar = 0;
        $taxLaar = 0;

        foreach ($fees as [$feeLaar, $taxable]) {
            if ($feeLaar <= 0 || !$taxable) {
                continue;
            }

            $feeTaxLaar = $this->tax->calculateLineTaxLaar(
                $feeLaar,
                GstTaxCode::Standard8->value,
                $taxInclusive,
            );

            $taxLaar += $feeTaxLaar;
            // Inclusive: the fee already contains its GST, so the taxable value
            // is the fee less that tax. Exclusive: GST rides on top and the
            // whole fee is the taxable value.
            $taxableLaar += $taxInclusive ? max(0, $feeLaar - $feeTaxLaar) : $feeLaar;
        }

        return ['taxable_laar' => $taxableLaar, 'tax_laar' => $taxLaar];
    }

    private function boolSetting(string $key, bool $default): bool
    {
        $value = SiteSetting::get($key, $default ? '1' : '0');

        return filter_var($value, FILTER_VALIDATE_BOOLEAN);
    }
}
