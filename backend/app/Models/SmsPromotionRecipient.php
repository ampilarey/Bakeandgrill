<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SmsPromotionRecipient extends Model
{
    protected $fillable = [
        'sms_promotion_id',
        'customer_id',
        'phone',
        'status',
        'error_message',
        'sent_at',
    ];

    protected $casts = [
        'sent_at' => 'datetime',
    ];

    public function promotion(): BelongsTo
    {
        return $this->belongsTo(SmsPromotion::class, 'sms_promotion_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
