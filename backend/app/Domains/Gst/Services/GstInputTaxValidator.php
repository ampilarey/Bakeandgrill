<?php

declare(strict_types=1);

namespace App\Domains\Gst\Services;

use Illuminate\Validation\ValidationException;

class GstInputTaxValidator
{
    public function __construct(
        private readonly GstTaxCalculator $tax = new GstTaxCalculator,
        private readonly GstSettingsService $settings = new GstSettingsService,
    ) {}

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public function normalizeExpense(array $data): array
    {
        if (isset($data['amount_excluding_gst_laar'])) {
            $data['amount_excluding_gst_laar'] = (int) $data['amount_excluding_gst_laar'];
        } elseif (isset($data['amount'])) {
            $gstLaar = (int) ($data['tax_laar'] ?? round((float) ($data['tax_amount'] ?? 0) * 100));
            $totalLaar = (int) round((float) $data['amount'] * 100);
            $data['amount_excluding_gst_laar'] = max(0, $totalLaar - $gstLaar);
        }

        if (isset($data['gst_rate_bp'])) {
            $data['gst_rate_bp'] = (int) $data['gst_rate_bp'];
        }

        if (isset($data['tax_laar']) && !isset($data['tax_amount'])) {
            $data['tax_laar'] = (int) $data['tax_laar'];
        }

        return $data;
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public function normalizePurchase(array $data): array
    {
        foreach (['amount_excluding_gst_laar', 'gst_laar', 'total_laar', 'gst_rate_bp'] as $field) {
            if (isset($data[$field])) {
                $data[$field] = (int) $data[$field];
            }
        }

        if (!isset($data['gst_rate_bp']) || (int) $data['gst_rate_bp'] === 0) {
            $data['gst_rate_bp'] = $this->settings->defaultTaxRateBp();
        }

        return $data;
    }

    /**
     * @param array<string, mixed> $data
     */
    public function assertClaimable(array $data, string $context = 'record'): void
    {
        if (empty($data['is_input_tax_claimable'])) {
            return;
        }

        $errors = [];

        if (empty($data['supplier_tin'])) {
            $errors['supplier_tin'] = ['Supplier TIN is required when claiming input GST.'];
        }
        if (empty($data['supplier_invoice_no'])) {
            $errors['supplier_invoice_no'] = ['Supplier invoice number is required when claiming input GST.'];
        }
        if (empty($data['supplier_invoice_date'])) {
            $errors['supplier_invoice_date'] = ['Supplier invoice date is required when claiming input GST.'];
        }

        $exGst = (int) ($data['amount_excluding_gst_laar'] ?? 0);
        $gstLaar = (int) ($data['gst_laar'] ?? $data['tax_laar'] ?? 0);
        $rateBp = (int) ($data['gst_rate_bp'] ?? $this->settings->defaultTaxRateBp());

        if ($gstLaar <= 0) {
            $errors['gst_laar'] = ['GST amount must be greater than zero to claim input tax.'];
        } elseif ($exGst > 0) {
            $expected = $this->tax->reconcileGstLaar($exGst, $rateBp);
            if (abs($expected - $gstLaar) > 1) {
                $errors['gst_laar'] = ["GST amount does not reconcile with {$rateBp} bp rate on excluding-GST amount."];
            }
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }
    }
}
