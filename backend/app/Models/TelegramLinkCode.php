<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A one-time code that links a person's Telegram to their account. Only its hash is stored. */
class TelegramLinkCode extends Model
{
    protected $fillable = [
        'telegram_bot_id',
        'user_id',
        'delivery_driver_id',
        'code_hash',
        'expires_at',
        'used_at',
        'created_by',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
        'used_at' => 'datetime',
    ];
}
