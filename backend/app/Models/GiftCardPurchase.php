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
        'sender_name',
        'send_anonymously',
        'gift_card_id',
        'sms_ok',
        'email_ok',
        'resend_count',
        'last_resent_at',
        'code_delivery_expires_at',
        'delivery_code_encrypted',
        'delivery_recovery_count',
        'view_token',
    ];

    protected $hidden = [
        'delivery_code_encrypted',
        'view_token',
    ];

    protected $casts = [
        'order_id' => 'integer',
        'purchaser_customer_id' => 'integer',
        'gift_card_id' => 'integer',
        'amount' => 'decimal:2',
        'sms_ok' => 'boolean',
        'email_ok' => 'boolean',
        'send_anonymously' => 'boolean',
        'resend_count' => 'integer',
        'last_resent_at' => 'datetime',
        'code_delivery_expires_at' => 'datetime',
        'delivery_recovery_count' => 'integer',
    ];

    /**
     * Line shown to the recipient in SMS/email ("From: …"), or null to omit.
     */
    public function senderFromLine(): ?string
    {
        if ($this->send_anonymously) {
            return 'Anonymous gift';
        }

        $name = trim((string) ($this->sender_name ?? ''));
        if ($name === '') {
            return null;
        }

        return 'From: '.$name;
    }

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
