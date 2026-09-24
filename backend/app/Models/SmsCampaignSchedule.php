<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A campaign that runs itself on a schedule (see the migration). Each run
 * creates an SmsCampaign with `schedule_id`; the audience is the saved
 * criteria minus anyone this schedule texted in the last `cooldown_days`.
 */
class SmsCampaignSchedule extends Model
{
    public const FREQUENCIES = ['daily', 'weekly', 'monthly'];

    public const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    protected $fillable = [
        'name', 'message', 'target_criteria', 'recipe_key', 'frequency', 'days_of_week', 'day_of_month',
        'send_time', 'cooldown_days', 'is_active', 'next_run_at', 'last_run_at', 'runs_count', 'created_by',
    ];

    protected $casts = [
        'target_criteria' => 'array',
        'days_of_week' => 'array',
        'is_active' => 'boolean',
        'next_run_at' => 'datetime',
        'last_run_at' => 'datetime',
        'cooldown_days' => 'integer',
        'day_of_month' => 'integer',
        'runs_count' => 'integer',
    ];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function campaigns(): HasMany
    {
        return $this->hasMany(SmsCampaign::class, 'schedule_id');
    }

    /**
     * The first run strictly after $after, in the app timezone.
     */
    public function computeNextRunAt(Carbon $after): Carbon
    {
        $tz = config('app.timezone', 'Indian/Maldives');
        $local = $after->copy()->setTimezone($tz);
        [$hour, $minute] = array_map('intval', explode(':', (string) $this->send_time) + [0, 0]);
        $candidate = $local->copy()->setTime($hour, $minute, 0);
        if ($candidate->lte($local)) {
            $candidate->addDay();
        }

        if ($this->frequency === 'weekly') {
            $days = array_values(array_intersect(self::DAYS, array_map('strtolower', (array) ($this->days_of_week ?: ['mon']))));
            if ($days === []) {
                $days = ['mon'];
            }
            for ($i = 0; $i < 7; $i++) {
                if (in_array(strtolower($candidate->format('D')), $days, true)) {
                    break;
                }
                $candidate->addDay();
            }
        } elseif ($this->frequency === 'monthly') {
            $day = max(1, min(31, (int) ($this->day_of_month ?: 1)));
            $candidate->setDay(min($day, $candidate->daysInMonth));
            if ($candidate->lte($local)) {
                $candidate->addMonthNoOverflow()->setDay(min($day, $candidate->daysInMonth));
            }
        }

        return $candidate->setTimezone($after->getTimezone());
    }

    /** "Every Monday and Thursday at 10:00", for the table. */
    public function describeSchedule(): string
    {
        $time = substr((string) $this->send_time, 0, 5);

        return match ($this->frequency) {
            'daily' => "Every day at {$time}",
            'weekly' => 'Every ' . implode(' and ', array_map('ucfirst', (array) ($this->days_of_week ?: ['mon']))) . " at {$time}",
            'monthly' => 'Day ' . (int) ($this->day_of_month ?: 1) . " of every month at {$time}",
            default => $time,
        };
    }
}
