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
}
