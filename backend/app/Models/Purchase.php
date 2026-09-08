<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Purchase extends Model
{
    /*
     * A deleted purchase order leaves every screen and stays in the table.
     * The owner wants a mistake gone; an auditor wants to know a document
     * with that number once existed. Both are right (owner, 2026-09-06).
     */
    use SoftDeletes;

    protected $fillable = [
        'purchase_number',
        'supplier_id',
        // Free-typed shop, for a purchase from somewhere with no supplier record.
        'supplier_name_text',
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
        /*
         * Date-only on the wire. A plain `date` cast serialises midnight in
         * the app's timezone, so a purchase dated 2026-09-01 left here as
         * "2026-08-31T19:00:00.000000Z" — Maldives being UTC+5 — and the
         * admin, which prints the string, showed the owner the day before
         * the one they typed (2026-09-07).
         */
        'purchase_date' => 'date:Y-m-d',
        'expected_delivery_date' => 'date:Y-m-d',
        'actual_delivery_date' => 'date:Y-m-d',
        'approved_at' => 'datetime',
        'supplier_invoice_date' => 'date:Y-m-d',
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
