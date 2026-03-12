<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TimePunch extends Model
{
    protected $fillable = [
        'user_id', 'clocked_in_at', 'clocked_out_at',
        'break_minutes', 'total_hours', 'notes',
    ];

    protected $casts = [
        'clocked_in_at'  => 'datetime',
        'clocked_out_at' => 'datetime',
        'break_minutes'  => 'float',
        'total_hours'    => 'float',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function calculateHours(): float
    {
        if (!$this->clocked_out_at) {
            return 0.0;
        }
        $minutes = $this->clocked_in_at->diffInMinutes($this->clocked_out_at);
        return round(($minutes - $this->break_minutes) / 60, 4);
    }
}
