<?php

declare(strict_types=1);

namespace App\Domains\Gst\Services;

use App\Domains\Gst\Enums\GstTaxCode;

class GstItemTaxNormalizer
{
    public function __construct(
        private readonly GstSettingsService $settings = new GstSettingsService,
    ) {}

    /**
     * Normalize item tax fields before save.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public function normalize(array $data): array
    {
        $taxCode = $data['tax_code'] ?? GstTaxCode::Standard8->value;
        $code = GstTaxCode::tryFrom((string) $taxCode) ?? GstTaxCode::Standard8;
        $data['tax_code'] = $code->value;

        if ($code->chargesGst()) {
            $data['tax_rate'] = $this->settings->defaultTaxRatePercent();
        } else {
            $data['tax_rate'] = 0;
        }

        return $data;
    }
}
