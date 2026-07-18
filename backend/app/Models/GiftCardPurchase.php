<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GiftCardPurchase extends Model
{
    protected $fillable = [
        'order_id',
        'purchaser_customer_id',
        'amount',
        'recipient_phone',
        'recipient_email',
        'personal_note',
        'gift_card_id',
        'sms_ok',
        'email_ok',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'sms_ok' => 'boolean',
        'email_ok' => 'boolean',
    ];

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function purchaser(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'purchaser_customer_id');
    }

    public function giftCard(): BelongsTo
    {
        return $this->belongsTo(GiftCard::class);
    }
}
