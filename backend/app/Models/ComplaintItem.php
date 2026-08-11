<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ComplaintItem extends Model
{
    protected $fillable = [
        'complaint_id',
        'order_item_id',
        'item_name',
        'quantity',
        'unit_price_laar',
        'line_total_laar',
    ];

    protected $casts = [
        'quantity' => 'float',
        'unit_price_laar' => 'integer',
        'line_total_laar' => 'integer',
    ];

    public function complaint(): BelongsTo
    {
        return $this->belongsTo(Complaint::class);
    }
}
