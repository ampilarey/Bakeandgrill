<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

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

    protected static function booted(): void
    {
        static::creating(function (Receipt $receipt): void {
            if (empty($receipt->token)) {
                $receipt->token = Str::random(48);
            }
        });
    }

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

    /**
     * Phone or email to deliver / resend this receipt.
     * Falls back to the linked customer when the row was created
     * without recipient (common for online orders + print QR links).
     */
    public function resolveRecipient(): ?string
    {
        if ($this->recipient) {
            return $this->recipient;
        }

        $this->loadMissing('order.customer', 'customer');

        return $this->order?->customer?->phone
            ?? $this->customer?->phone
            ?? $this->order?->customer?->email
            ?? $this->customer?->email;
    }

    public function resolveChannel(?string $recipient = null): string
    {
        if ($this->channel) {
            return $this->channel;
        }

        $recipient ??= $this->resolveRecipient();
        if ($recipient !== null && str_contains($recipient, '@')) {
            return 'email';
        }

        return 'sms';
    }
}
