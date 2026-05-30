<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Purchase extends Model
{
    protected $fillable = [
        'purchase_number',
        'supplier_id',
        'supplier_tin',
        'supplier_invoice_no',
        'supplier_invoice_date',
        'user_id',
        'approved_by',
        'approved_at',
        'status',
        'subtotal',
        'tax_amount',
        'amount_excluding_gst_laar',
        'gst_rate_bp',
        'gst_laar',
        'total_laar',
        'total',
        'is_tax_invoice_received',
        'is_input_tax_claimable',
        'claim_block_reason',
        'revenue_or_capital',
        'taxable_activity_no',
        'receipt_path',
        'notes',
        'purchase_date',
        'expected_delivery_date',
        'actual_delivery_date',
    ];

    protected $casts = [
        'supplier_id' => 'integer',
        'user_id' => 'integer',
        'approved_by' => 'integer',
        'subtotal' => 'decimal:2',
        'tax_amount' => 'decimal:2',
        'total' => 'decimal:2',
        'purchase_date' => 'date',
        'expected_delivery_date' => 'date',
        'actual_delivery_date' => 'date',
        'approved_at' => 'datetime',
        'purchase_date' => 'date',
        'supplier_invoice_date' => 'date',
        'amount_excluding_gst_laar' => 'integer',
        'gst_rate_bp' => 'integer',
        'gst_laar' => 'integer',
        'total_laar' => 'integer',
        'is_tax_invoice_received' => 'boolean',
        'is_input_tax_claimable' => 'boolean',
    ];

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(PurchaseItem::class);
    }

    public function receipts(): HasMany
    {
        return $this->hasMany(PurchaseReceipt::class);
    }
}
