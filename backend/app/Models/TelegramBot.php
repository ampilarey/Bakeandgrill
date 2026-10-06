<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * A Telegram bot the business owns. It serves the roles listed in `roles`
 * (owner, manager, staff, kitchen_staff, driver); one bot can serve all of
 * them, or each role can have its own. The token is write-only: encrypted
 * at rest and never returned by the API.
 */
class TelegramBot extends Model
{
    public const ROLES = ['owner', 'manager', 'staff', 'kitchen_staff', 'driver'];

    protected $fillable = [
        'name',
        'token',
        'username',
        'bot_user_id',
        'roles',
        'webhook_secret',
        'is_enabled',
        'last_checked_at',
        'last_error',
    ];

    protected $hidden = ['token', 'webhook_secret'];

    protected $casts = [
        'token' => 'encrypted',
        'roles' => 'array',
        'is_enabled' => 'boolean',
        'last_checked_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (TelegramBot $bot): void {
            if (($bot->webhook_secret ?? '') === '') {
                $bot->webhook_secret = Str::random(48);
            }
        });
    }

    public function links(): HasMany
    {
        return $this->hasMany(TelegramLink::class);
    }

    public function serves(string $role): bool
    {
        return in_array($role, (array) $this->roles, true);
    }

    public function webhookUrl(): string
    {
        return rtrim((string) config('app.url'), '/') . '/api/telegram/webhook/' . $this->id;
    }
}
