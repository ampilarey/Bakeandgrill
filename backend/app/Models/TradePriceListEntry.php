<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TradePriceListEntry extends Model
{
    protected $fillable = [
        'trade_account_id',
        'item_id',
        'variant_id',
        'price_laar',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'price_laar' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    public function tradeAccount(): BelongsTo
    {
        return $this->belongsTo(TradeAccount::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(Variant::class);
    }
}
