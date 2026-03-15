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
        'user_id',
        'approved_by',
        'approved_at',
        'status',
        'subtotal',
        'tax_amount',
        'total',
        'notes',
        'purchase_date',
        'expected_delivery_date',
        'actual_delivery_date',
    ];

    protected $casts = [
        'supplier_id'            => 'integer',
        'user_id'                => 'integer',
        'approved_by'            => 'integer',
        'subtotal'               => 'decimal:2',
        'tax_amount'             => 'decimal:2',
        'total'                  => 'decimal:2',
        'purchase_date'          => 'date',
        'expected_delivery_date' => 'date',
        'actual_delivery_date'   => 'date',
        'approved_at'            => 'datetime',
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
