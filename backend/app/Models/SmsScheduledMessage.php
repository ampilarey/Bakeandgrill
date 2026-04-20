<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SmsScheduledMessage extends Model
{
    protected $fillable = [
        'name',
        'to_type',
        'to_contact_id',
        'to_group_id',
        'to_phone',
        'template_id',
        'body',
        'variables',
        'is_recurring',
        'recurrence_type',
        'recurrence_days',
        'recurrence_time',
        'recurrence_day_of_month',
        'send_at',
        'next_send_at',
        'last_sent_at',
        'status',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'is_recurring'             => 'boolean',
            'variables'                => 'array',
            'recurrence_days'          => 'array',
            'send_at'                  => 'datetime',
            'next_send_at'             => 'datetime',
            'last_sent_at'             => 'datetime',
            'recurrence_day_of_month'  => 'integer',
        ];
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(SmsContact::class, 'to_contact_id');
    }

    public function group(): BelongsTo
    {
        return $this->belongsTo(SmsContactGroup::class, 'to_group_id');
    }

    public function template(): BelongsTo
    {
        return $this->belongsTo(SmsTemplate::class, 'template_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    public function isPaused(): bool
    {
        return $this->status === 'paused';
    }

    /**
     * Compute the next send time after the given moment, based on recurrence settings.
     * Returns null for non-recurring (one-time) messages.
     */
    public function computeNextSendAt(Carbon $after): ?Carbon
    {
        if (! $this->is_recurring || ! $this->recurrence_type || ! $this->recurrence_time) {
            return null;
        }

        [$hour, $minute] = explode(':', $this->recurrence_time);
        $candidate = $after->copy()->setTime((int) $hour, (int) $minute, 0);

        // If candidate is in the past relative to $after, advance by the recurrence unit
        if ($candidate->lte($after)) {
            match ($this->recurrence_type) {
                'daily'   => $candidate->addDay(),
                'weekly'  => $candidate->addWeek(),
                'monthly' => $candidate->addMonth(),
            };
        }

        if ($this->recurrence_type === 'weekly' && ! empty($this->recurrence_days)) {
            // Find the next matching day of week
            $days = $this->recurrence_days; // ['mon','tue',...]
            for ($i = 0; $i < 7; $i++) {
                $dayName = strtolower($candidate->format('D'));
                if (in_array($dayName, $days, true)) {
                    break;
                }
                $candidate->addDay();
            }
        }

        if ($this->recurrence_type === 'monthly' && $this->recurrence_day_of_month) {
            $candidate->setDay(min($this->recurrence_day_of_month, $candidate->daysInMonth));
            if ($candidate->lte($after)) {
                $candidate->addMonth()->setDay(
                    min($this->recurrence_day_of_month, $candidate->daysInMonth)
                );
            }
        }

        return $candidate;
    }
}
