<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DiscountApproval extends Model
{
    protected $fillable = [
        'order_id',
        'requested_by',
        'subtotal_laar',
        'discount_laar',
        'discount_percent',
        'reason',
        'reason_note',
        'code_hash',
        'expires_at',
        'attempts',
        'status',
        'approved_by',
    ];

    protected $casts = [
        'subtotal_laar' => 'integer',
        'discount_laar' => 'integer',
        'discount_percent' => 'float',
        'attempts' => 'integer',
        'expires_at' => 'datetime',
    ];

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
