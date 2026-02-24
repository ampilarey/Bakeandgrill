<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PrintJob extends Model
{
    protected $fillable = [
        'order_id',
        'printer_id',
        'type',
        'status',
        'payload',
        'attempts',
        'last_error',
    ];

    protected $casts = [
        'payload' => 'array',
    ];

    public function printer(): BelongsTo
    {
        return $this->belongsTo(Printer::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}
