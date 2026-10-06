<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One person's private chat with one bot: a staff member (user) or a driver. */
class TelegramLink extends Model
{
    protected $fillable = [
        'telegram_bot_id',
        'user_id',
        'delivery_driver_id',
        'chat_id',
        'telegram_username',
        'telegram_name',
        'linked_at',
        'last_seen_at',
        'blocked_at',
    ];

    protected $casts = [
        'linked_at' => 'datetime',
        'last_seen_at' => 'datetime',
        'blocked_at' => 'datetime',
    ];

    public function bot(): BelongsTo
    {
        return $this->belongsTo(TelegramBot::class, 'telegram_bot_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(DeliveryDriver::class, 'delivery_driver_id');
    }

    /** owner, manager, staff, kitchen_staff or driver; null when the person is gone. */
    public function role(): ?string
    {
        if ($this->delivery_driver_id !== null) {
            return 'driver';
        }
        $slug = $this->user?->role?->slug;

        return $slug === 'admin' ? 'owner' : $slug;
    }

    /** Still a person this bot should talk to: active, and a role the bot serves. */
    public function isUsable(): bool
    {
        $active = $this->delivery_driver_id !== null
            ? (bool) $this->driver?->is_active
            : (bool) $this->user?->is_active;
        $role = $this->role();

        return $active && $role !== null && $this->bot !== null && $this->bot->is_enabled && $this->bot->serves($role);
    }

    public function displayName(): string
    {
        return (string) ($this->delivery_driver_id !== null ? $this->driver?->name : $this->user?->name);
    }
}
