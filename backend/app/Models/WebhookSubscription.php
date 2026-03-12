<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WebhookSubscription extends Model
{
    protected $fillable = [
        'name', 'url', 'secret', 'events',
        'active', 'failure_count', 'last_triggered_at', 'disabled_at',
    ];

    protected $casts = [
        'events'           => 'array',
        'active'           => 'boolean',
        'last_triggered_at'=> 'datetime',
        'disabled_at'      => 'datetime',
    ];

    public function logs(): HasMany
    {
        return $this->hasMany(WebhookLog::class);
    }

    public function scopeActive($query)
    {
        return $query->where('active', true)->whereNull('disabled_at');
    }

    public function scopeForEvent($query, string $event)
    {
        return $query->whereJsonContains('events', $event);
    }

    public function markFailed(): void
    {
        $this->increment('failure_count');
        if ($this->failure_count >= 10) {
            $this->update(['disabled_at' => now()]);
        }
    }

    public function markSuccess(): void
    {
        $this->update([
            'failure_count'      => 0,
            'last_triggered_at'  => now(),
        ]);
    }
}
