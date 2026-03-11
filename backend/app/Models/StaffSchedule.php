<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StaffSchedule extends Model
{
    protected $fillable = ['user_id', 'date', 'shift_start', 'shift_end', 'role_override', 'notes', 'is_confirmed'];

    protected $casts = [
        'date'         => 'date',
        'is_confirmed' => 'boolean',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
