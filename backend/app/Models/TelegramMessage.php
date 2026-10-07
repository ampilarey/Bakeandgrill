<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A card the bot sent about something that changes later, kept so it can be edited. */
class TelegramMessage extends Model
{
    public const SUBJECT_PURCHASE_REQUEST = 'purchase_request';

    protected $fillable = ['telegram_bot_id', 'chat_id', 'message_id', 'subject', 'subject_id', 'kind', 'user_id'];

    protected $casts = [
        'message_id' => 'integer',
        'subject_id' => 'integer',
    ];

    public function bot(): BelongsTo
    {
        return $this->belongsTo(TelegramBot::class, 'telegram_bot_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
