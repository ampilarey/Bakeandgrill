<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Receipt extends Model
{
    protected $fillable = [
        'order_id',
        'customer_id',
        'token',
        'channel',
        'recipient',
        'sent_at',
        'resend_count',
        'last_sent_at',
    ];

    protected $casts = [
        'sent_at' => 'datetime',
        'last_sent_at' => 'datetime',
    ];

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function feedback(): HasMany
    {
        return $this->hasMany(ReceiptFeedback::class);
    }
}
