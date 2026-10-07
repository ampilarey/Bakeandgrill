<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One order card in one group, so the card can follow the order. */
class TelegramGroupPost extends Model
{
    protected $fillable = ['telegram_group_id', 'order_id', 'message_id', 'acted'];

    protected $casts = [
        'message_id' => 'integer',
        'acted' => 'array',
    ];

    public function group(): BelongsTo
    {
        return $this->belongsTo(TelegramGroup::class, 'telegram_group_id');
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}
