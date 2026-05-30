<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GstPeriodLock extends Model
{
    protected $fillable = [
        'period_key',
        'locked_at',
        'locked_by',
        'carry_forward_input_laar',
    ];

    protected $casts = [
        'locked_at' => 'datetime',
        'carry_forward_input_laar' => 'integer',
        'locked_by' => 'integer',
    ];

    public function lockedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'locked_by');
    }
}
