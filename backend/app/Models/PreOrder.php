<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PreOrder extends Model
{
    protected $fillable = [
        'order_number', 'customer_id', 'customer_name', 'customer_phone',
        'customer_email', 'fulfillment_date', 'preparation_start',
        'items', 'subtotal', 'total', 'status',
        'approved_by', 'approved_at',
        'customer_notes', 'staff_notes', 'cancellation_reason',
    ];

    protected $casts = [
        'items'             => 'array',
        'subtotal'          => 'decimal:2',
        'total'             => 'decimal:2',
        'fulfillment_date'  => 'datetime',
        'preparation_start' => 'datetime',
        'approved_at'       => 'datetime',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
