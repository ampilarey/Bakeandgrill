<?php

declare(strict_types=1);

namespace App\Domains\Gst\Services;

use App\Domains\Gst\Enums\GstAccountingBasis;
use App\Domains\Gst\Enums\GstSector;
use App\Domains\Gst\Enums\GstTaxablePeriod;
use App\Domains\Orders\Services\OrderFeeTaxCalculator;
use App\Models\GstSetting;
use App\Support\ResilientCache;

class GstSettingsService
{
    private const CACHE_KEY = 'gst_settings_singleton';

    public function get(): GstSetting
    {
        return ResilientCache::remember(self::CACHE_KEY, 300, function () {
            return GstSetting::query()->firstOrCreate(
                ['id' => 1],
                $this->defaultAttributes(),
            );
        });
    }

    public function bust(): void
    {
        ResilientCache::forget(self::CACHE_KEY);
    }

    /** @param array<string, mixed> $attributes */
    public function update(array $attributes): GstSetting
    {
        $settings = $this->get();
        $settings->fill($attributes);
        $settings->save();
        $this->bust();

        return $settings->fresh();
    }

    public function defaultTaxRateBp(): int
    {
        return (int) $this->get()->default_tax_rate_bp;
    }

    /**
     * Whether sales carry GST at all (owner, 2026-11-11: one switch to turn
     * every GST off). Off, nothing sold is taxed: dishes whatever their tax
     * code, the fees, the service charge and wholesale invoices. The stored
     * rate is kept, so switching back on charges it again.
     */
    public function chargesGst(): bool
    {
        return (bool) ($this->get()->charge_gst ?? true);
    }

    /** The rate sales are taxed at: the GST rate, or 0 while GST is switched off. */
    public function salesTaxRateBp(): int
    {
        return $this->chargesGst() ? $this->defaultTaxRateBp() : 0;
    }

    public function defaultTaxRatePercent(): float
    {
        return $this->defaultTaxRateBp() / 100;
    }

    public function taxInclusive(): bool
    {
        return (bool) $this->get()->tax_inclusive;
    }

    public function accountingBasis(): GstAccountingBasis
    {
        return GstAccountingBasis::from($this->get()->accounting_basis);
    }

    public function sector(): GstSector
    {
        return GstSector::from($this->get()->sector);
    }

    public function taxablePeriod(): GstTaxablePeriod
    {
        return GstTaxablePeriod::from($this->get()->taxable_period);
    }

    public function isRegistered(): bool
    {
        return (bool) $this->get()->gst_registered;
    }

    /** @return array<string, mixed> */
    public function bootstrapPayload(): array
    {
        $s = $this->get();
        // Built here rather than injected: the fee calculator holds a
        // GstTaxCalculator, which default-constructs a GstSettingsService — as
        // a constructor dependency that would recurse without end.
        $feeTax = new OrderFeeTaxCalculator;

        return [
            'gst_registered' => (bool) $s->gst_registered,
            'charge_gst' => $this->chargesGst(),
            // The till and the order app work their totals out from these: 0 while GST is off.
            'default_tax_rate_bp' => $this->salesTaxRateBp(),
            'tax_rate_percent' => round($this->salesTaxRateBp() / 100, 2),
            'tax_inclusive' => (bool) $s->tax_inclusive,
            'currency' => $s->currency,
            'sector' => $s->sector,
            'accounting_basis' => $s->accounting_basis,
            'packaging_fee_taxable' => $this->chargesGst() && $feeTax->packagingTaxable(),
            'small_order_fee_taxable' => $this->chargesGst() && $feeTax->smallOrderTaxable(),
            'delivery_fee_taxable' => $this->chargesGst() && $feeTax->deliveryTaxable(),
        ];
    }

    /** @return array<string, mixed> */
    public function adminPayload(): array
    {
        $s = $this->get();

        return [
            'gst_registered' => (bool) $s->gst_registered,
            'charge_gst' => (bool) ($s->charge_gst ?? true),
            'seller_name' => $s->seller_name,
            'seller_address' => $s->seller_address,
            'seller_tin' => $s->seller_tin,
            'taxable_activity_no' => $s->taxable_activity_no,
            'sector' => $s->sector,
            'default_tax_rate_bp' => (int) $s->default_tax_rate_bp,
            'tax_inclusive' => (bool) $s->tax_inclusive,
            'taxable_period' => $s->taxable_period,
            'accounting_basis' => $s->accounting_basis,
            'currency' => $s->currency,
            'invoice_prefix' => $s->invoice_prefix,
            'credit_note_prefix' => $s->credit_note_prefix,
            'invoice_sequence_mode' => $s->invoice_sequence_mode,
            'next_invoice_sequence' => (int) $s->next_invoice_sequence,
            'next_credit_note_sequence' => (int) $s->next_credit_note_sequence,
            'lock_after_export' => (bool) $s->lock_after_export,
            'filing_due_day' => (int) ($s->filing_due_day ?? 28),
            'filing_reminder_days' => (int) ($s->filing_reminder_days ?? 3),
            'legal_default_note' => 'Maldives GST Act treats invoice basis as the default accounting basis unless MIRA approves another method.',
            'hybrid_note' => 'Hybrid mode posts POS sales when payment is confirmed and B2B tax invoices on invoice issue date.',
        ];
    }

    /** @return array<string, mixed> */
    private function defaultAttributes(): array
    {
        return [
            'gst_registered' => false,
            'charge_gst' => true,
            'sector' => GstSector::General->value,
            'default_tax_rate_bp' => 800,
            'tax_inclusive' => false,
            'taxable_period' => GstTaxablePeriod::Monthly->value,
            'accounting_basis' => GstAccountingBasis::Hybrid->value,
            'currency' => 'MVR',
            'invoice_prefix' => 'BG-TI',
            'credit_note_prefix' => 'BG-CN',
            'invoice_sequence_mode' => 'yearly',
            'next_invoice_sequence' => 1,
            'next_credit_note_sequence' => 1,
            'lock_after_export' => false,
            'filing_due_day' => 28,
            'filing_reminder_days' => 3,
        ];
    }
}
