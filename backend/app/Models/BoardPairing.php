<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

/**
 * One in-flight attempt to pair a wall screen.
 *
 * See the migration for why there are two secrets. In short: `code` is public
 * the moment it appears on a television, `poll_token` is not, and only the
 * second one may be used to collect a key.
 */
class BoardPairing extends Model
{
    /** How long a screen has to be approved before its code dies. */
    public const TTL_MINUTES = 15;

    /**
     * No 0/O, no 1/I/L. Somebody reads these off a television and types them
     * on a phone; a code that is ambiguous at ten feet is a support call.
     */
    private const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

    protected $fillable = [
        'code',
        'poll_token_hash',
        'name',
        'board_token',
        'personal_access_token_id',
        'approved_by',
        'approved_at',
        'expires_at',
    ];

    protected $casts = [
        // The plaintext key lives here only between approval and collection.
        'board_token' => 'encrypted',
        'approved_at' => 'datetime',
        'expires_at' => 'datetime',
    ];

    /** @return array{pairing: self, poll_token: string} */
    public static function start(): array
    {
        self::purgeExpired();

        $pollToken = Str::random(48);

        $pairing = self::create([
            'code' => self::freshCode(),
            'poll_token_hash' => hash('sha256', $pollToken),
            'expires_at' => now()->addMinutes(self::TTL_MINUTES),
        ]);

        return ['pairing' => $pairing, 'poll_token' => $pollToken];
    }

    /**
     * A code nobody else is currently using.
     *
     * Only live rows matter — expired codes are free to reuse, which is what
     * keeps six characters enough.
     */
    private static function freshCode(): string
    {
        do {
            $code = '';
            for ($i = 0; $i < 6; $i++) {
                $code .= self::ALPHABET[random_int(0, strlen(self::ALPHABET) - 1)];
            }
        } while (self::query()->where('code', $code)->exists());

        return $code;
    }

    public static function purgeExpired(): void
    {
        self::query()->where('expires_at', '<', now())->delete();
    }

    public function scopeLive(Builder $query): Builder
    {
        return $query->where('expires_at', '>=', now());
    }

    /** Constant-time, so a wrong poll token leaks nothing by timing. */
    public function pollTokenMatches(string $candidate): bool
    {
        return hash_equals($this->poll_token_hash, hash('sha256', $candidate));
    }

    public function isApproved(): bool
    {
        return $this->approved_at !== null;
    }

    public function displayName(): string
    {
        return $this->name ?: 'Screen';
    }
}
