<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One kind of error on one day (App\Domains\System\ErrorTracker).
 */
class ErrorEvent extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'day', 'fingerprint', 'exception', 'message', 'file', 'line', 'url',
        'count', 'payment', 'first_seen_at', 'last_seen_at', 'alerted_at',
    ];

    protected $casts = [
        'day' => 'date',
        'line' => 'integer',
        'count' => 'integer',
        'payment' => 'boolean',
        'first_seen_at' => 'datetime',
        'last_seen_at' => 'datetime',
        'alerted_at' => 'datetime',
    ];
}
