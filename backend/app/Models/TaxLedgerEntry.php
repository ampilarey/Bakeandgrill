<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TaxLedgerEntry extends Model
{
    protected $fillable = [
        'period_key',
        'source_type',
        'source_id',
        'direction',
        'tax_code',
        'taxable_activity_no',
        'customer_id',
        'customer_tin',
        'supplier_id',
        'supplier_tin',
        'document_no',
        'document_date',
        'taxable_value_laar',
        'tax_laar',
        'total_laar',
        'rate_bp',
        'channel',
        'payment_basis_date',
        'invoice_basis_date',
        'is_tax_invoice',
        'is_claimable',
        'claim_block_reason',
        'revenue_or_capital',
        'metadata',
        'created_by',
    ];

    protected $casts = [
        'source_id' => 'integer',
        'customer_id' => 'integer',
        'supplier_id' => 'integer',
        'document_date' => 'date',
        'taxable_value_laar' => 'integer',
        'tax_laar' => 'integer',
        'total_laar' => 'integer',
        'rate_bp' => 'integer',
        'payment_basis_date' => 'date',
        'invoice_basis_date' => 'date',
        'is_tax_invoice' => 'boolean',
        'is_claimable' => 'boolean',
        'metadata' => 'array',
        'created_by' => 'integer',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
