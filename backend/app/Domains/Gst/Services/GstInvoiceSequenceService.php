<?php

declare(strict_types=1);

namespace App\Domains\Gst\Services;

use App\Models\GstSetting;
use Illuminate\Support\Facades\DB;

class GstInvoiceSequenceService
{
    public function __construct(
        private readonly GstSettingsService $settings = new GstSettingsService,
    ) {}

    public function nextTaxInvoiceNumber(): string
    {
        return DB::transaction(function () {
            /** @var GstSetting $s */
            $s = GstSetting::query()->lockForUpdate()->firstOrFail();
            $seq = (int) $s->next_invoice_sequence;
            $s->next_invoice_sequence = $seq + 1;
            $s->save();
            $this->settings->bust();

            $year = now()->format('Y');
            $prefix = rtrim($s->invoice_prefix, '-');

            if ($s->invoice_sequence_mode === 'daily') {
                return sprintf('%s-%s-%05d', $prefix, now()->format('Ymd'), $seq);
            }

            return sprintf('%s-%s-%05d', $prefix, $year, $seq);
        });
    }

    public function nextCreditNoteNumber(): string
    {
        return DB::transaction(function () {
            /** @var GstSetting $s */
            $s = GstSetting::query()->lockForUpdate()->firstOrFail();
            $seq = (int) $s->next_credit_note_sequence;
            $s->next_credit_note_sequence = $seq + 1;
            $s->save();
            $this->settings->bust();

            $year = now()->format('Y');
            $prefix = rtrim($s->credit_note_prefix, '-');

            return sprintf('%s-%s-%05d', $prefix, $year, $seq);
        });
    }
}
