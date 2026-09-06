<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CashHandover extends Model
{
    protected $fillable = ['business_date', 'amount_laar', 'float_kept_laar', 'received_by', 'notes'];

    protected $casts = [
        'business_date' => 'date',
        'amount_laar' => 'integer',
        'float_kept_laar' => 'integer',
    ];

    public function receiver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by');
    }
}
