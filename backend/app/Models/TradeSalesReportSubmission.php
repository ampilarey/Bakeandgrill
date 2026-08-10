<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TradeSalesReportSubmission extends Model
{
    protected $fillable = [
        'trade_delivery_id',
        'customer_id',
        'idempotency_key',
        'lines_json',
    ];

    protected function casts(): array
    {
        return [
            'lines_json' => 'array',
        ];
    }

    public function delivery(): BelongsTo
    {
        return $this->belongsTo(TradeDelivery::class, 'trade_delivery_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
