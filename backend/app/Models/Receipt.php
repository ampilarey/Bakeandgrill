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

    /**
     * The receipt as its public page may show it.
     *
     * Whitelisted rather than serialising the row: the public endpoint is
     * reachable by anyone holding the token, and `customer_id` is an internal
     * identifier that page has no use for.
     *
     * @return array<string, mixed>
     */
    public function toPublicArray(): array
    {
        return [
            'id' => $this->id,
            'order_id' => $this->order_id,
            'channel' => $this->channel,
            'sent_at' => $this->sent_at,
            'resend_count' => $this->resend_count,
            'last_sent_at' => $this->last_sent_at,
        ];
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

    public function latestFeedback(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(ReceiptFeedback::class)->latestOfMany();
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
        $recipient ??= $this->resolveRecipient();

        // Always derive from the destination — stored channel defaults to
        // 'email' in the DB even when we only have a customer phone.
        if ($recipient !== null && str_contains($recipient, '@')) {
            return 'email';
        }

        return 'sms';
    }

    /**
     * Ensure a public receipt token exists for an order (POS pay links, SMS bills).
     */
    public static function ensureForOrder(Order $order): self
    {
        $order->loadMissing('customer');
        $receipt = self::firstOrNew(['order_id' => $order->id]);
        $receipt->customer_id = $order->customer_id;
        if ($phone = $order->customer?->phone) {
            $receipt->channel = $receipt->channel ?? 'sms';
            $receipt->recipient = $receipt->recipient ?? $phone;
        } elseif ($email = $order->customer?->email) {
            $receipt->channel = $receipt->channel ?? 'email';
            $receipt->recipient = $receipt->recipient ?? $email;
        }
        $receipt->save();

        return $receipt;
    }

    public function posPayPageUrl(): string
    {
        return rtrim((string) config('app.url'), '/') . '/pay/' . $this->token;
    }
}
