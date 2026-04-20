<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class SmsContact extends Model
{
    protected $fillable = [
        'name',
        'phone',
        'type',
        'user_id',
        'is_enabled',
        'tags',
        'active_days',
        'active_from',
        'active_until',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'is_enabled'  => 'boolean',
            'tags'        => 'array',
            'active_days' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function groups(): BelongsToMany
    {
        return $this->belongsToMany(
            SmsContactGroup::class,
            'sms_contact_group_members',
            'contact_id',
            'group_id'
        );
    }

    /**
     * Return true if this contact is active at the given moment:
     * enabled, correct day-of-week, and within the time window (if set).
     */
    public function isActiveAt(Carbon $at): bool
    {
        if (! $this->is_enabled) {
            return false;
        }

        if ($this->active_days !== null) {
            $dayName = strtolower($at->format('D')); // mon, tue, …
            if (! in_array($dayName, $this->active_days, true)) {
                return false;
            }
        }

        if ($this->active_from !== null && $this->active_until !== null) {
            $currentTime = $at->format('H:i');
            if ($currentTime < $this->active_from || $currentTime > $this->active_until) {
                return false;
            }
        }

        return true;
    }

    /** Resolve the best phone number to use (user's current phone takes precedence for staff contacts). */
    public function resolvedPhone(): string
    {
        if ($this->type === 'staff' && $this->user && $this->user->phone) {
            return $this->user->phone;
        }

        return $this->phone;
    }
}
