<?php

declare(strict_types=1);

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Traits\HasPermissions;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasApiTokens, HasFactory, HasPermissions, Notifiable;

    public const POS_IDLE_LOCK_DEFAULT_MINUTES = 5;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'phone',
        'password',
        'role_id',
        'pin_hash',
        'is_active',
        'last_login_at',
        'pos_idle_lock_minutes',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
        'pin_hash',
        // The second factor must never ride along in a serialized user — the
        // secret is the credential, and the recovery codes bypass it entirely.
        'two_factor_secret',
        'two_factor_recovery_codes',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'last_login_at' => 'datetime',
            'is_active' => 'boolean',
            'pos_idle_lock_minutes' => 'integer',
            // Encrypted at rest so a database dump is not a second factor.
            // Deliberately absent from $fillable: two-factor state is only ever
            // set through TwoFactorService, never by a mass-assigned update.
            'two_factor_secret' => 'encrypted',
            'two_factor_recovery_codes' => 'encrypted:array',
            'two_factor_confirmed_at' => 'datetime',
        ];
    }

    /**
     * True only once a code from the phone has been proved.
     *
     * A secret with no confirmation is an enrolment somebody started and
     * abandoned — gating login on that would lock out an account whose owner
     * closed the tab before scanning the QR code.
     */
    public function hasTwoFactorEnabled(): bool
    {
        return $this->two_factor_secret !== null && $this->two_factor_confirmed_at !== null;
    }

    /** Stored preference, or venue default when unset. */
    public function resolvedPosIdleLockMinutes(): int
    {
        if ($this->pos_idle_lock_minutes === null) {
            return self::POS_IDLE_LOCK_DEFAULT_MINUTES;
        }

        return max(0, min(60, (int) $this->pos_idle_lock_minutes));
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }
}
