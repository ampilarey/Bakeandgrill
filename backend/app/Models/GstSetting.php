<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GstSetting extends Model
{
    protected $fillable = [
        'gst_registered',
        'seller_name',
        'seller_address',
        'seller_tin',
        'taxable_activity_no',
        'sector',
        'default_tax_rate_bp',
        'tax_inclusive',
        'taxable_period',
        'accounting_basis',
        'currency',
        'invoice_prefix',
        'credit_note_prefix',
        'invoice_sequence_mode',
        'next_invoice_sequence',
        'next_credit_note_sequence',
        'lock_after_export',
    ];

    protected $casts = [
        'gst_registered' => 'boolean',
        'default_tax_rate_bp' => 'integer',
        'tax_inclusive' => 'boolean',
        'next_invoice_sequence' => 'integer',
        'next_credit_note_sequence' => 'integer',
        'lock_after_export' => 'boolean',
    ];
}
