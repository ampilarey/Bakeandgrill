<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SmsPromotion extends Model
{
    protected $fillable = [
        'user_id',
        'name',
        'message',
        'status',
        'recipient_count',
        'sent_count',
        'failed_count',
        'sent_at',
        'filters',
    ];

    protected $casts = [
        'filters' => 'array',
        'sent_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function recipients(): HasMany
    {
        return $this->hasMany(SmsPromotionRecipient::class);
    }
}
