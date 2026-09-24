<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A connected social account (Facebook Page, Instagram business account,
 * Telegram channel).
 *
 * Credentials are WRITE-ONLY: encrypted at rest, hidden from serialization,
 * and never returned by any API (controllers expose a masked summary at
 * most). is_test_channel marks accounts the fail-closed environment guard
 * may publish to outside production.
 */
class SocialChannel extends Model
{
    public const PLATFORMS = ['facebook', 'instagram', 'telegram', 'viber'];

    /** Which caption(s) this channel posts: English and Dhivehi, English only, or Dhivehi only. */
    public const LANGUAGES = ['both', 'en', 'dv'];

    protected $fillable = [
        'platform',
        'name',
        'credentials',
        'remote_account_id',
        'is_enabled',
        'is_test_channel',
        'language',
        'dry_run',
        'last_published_at',
        'health',
    ];

    protected $hidden = ['credentials'];

    protected $casts = [
        'credentials' => 'encrypted:array',
        'is_enabled' => 'boolean',
        'is_test_channel' => 'boolean',
        'dry_run' => 'boolean',
        'last_published_at' => 'datetime',
        'health' => 'array',
    ];

    /** When the stored token expires, if the last health check learned it. */
    public function tokenExpiresAt(): ?\Carbon\Carbon
    {
        $raw = ($this->health ?? [])['token_expires_at'] ?? null;
        if (!is_string($raw) || $raw === '') {
            return null;
        }
        try {
            return \Carbon\Carbon::parse($raw);
        } catch (\Throwable) {
            return null;
        }
    }

    /** Whole days until the token expires; null when it does not or is unknown. */
    public function tokenDaysLeft(?\Carbon\Carbon $now = null): ?int
    {
        $expires = $this->tokenExpiresAt();
        if ($expires === null) {
            return null;
        }

        return (int) floor(($now ?? now())->diffInDays($expires, false));
    }

    public function deliveries(): HasMany
    {
        return $this->hasMany(SocialPostDelivery::class);
    }

    /** One credential value, without exposing the whole blob. */
    public function credential(string $key): string
    {
        return trim((string) (($this->credentials ?? [])[$key] ?? ''));
    }

    /**
     * Masked, safe-to-display summary: which keys are set and the last 4
     * characters of each — never the values themselves.
     *
     * @return array<string, string>
     */
    public function credentialSummary(): array
    {
        $out = [];
        foreach (($this->credentials ?? []) as $key => $value) {
            $value = (string) $value;
            $out[$key] = strlen($value) > 4 ? '••••' . substr($value, -4) : '••••';
        }

        return $out;
    }
}
