<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A Telegram group the bot posts a feed to (online orders). */
class TelegramGroup extends Model
{
    public const FEED_ONLINE_ORDERS = 'online_orders';

    public const FEEDS = [self::FEED_ONLINE_ORDERS];

    protected $fillable = [
        'telegram_bot_id',
        'chat_id',
        'title',
        'feeds',
        'is_enabled',
        'added_by',
        'last_error',
        'last_posted_at',
    ];

    protected $casts = [
        'feeds' => 'array',
        'is_enabled' => 'boolean',
        'last_posted_at' => 'datetime',
    ];

    public function bot(): BelongsTo
    {
        return $this->belongsTo(TelegramBot::class, 'telegram_bot_id');
    }

    public function addedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'added_by');
    }

    public function posts(): HasMany
    {
        return $this->hasMany(TelegramGroupPost::class);
    }

    public function wants(string $feed): bool
    {
        return in_array($feed, (array) $this->feeds, true);
    }

    /** Switched on, on a bot that is switched on, and taking this feed. */
    public function isLive(string $feed): bool
    {
        return $this->is_enabled && $this->bot !== null && $this->bot->is_enabled && $this->wants($feed);
    }
}
