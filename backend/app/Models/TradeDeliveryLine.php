<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TradeDeliveryLine extends Model
{
    public const ACTION_ACCEPT_TO_STOCK = 'accept_to_stock';

    public const ACTION_REJECT_TO_WASTE = 'reject_to_waste';

    protected $fillable = [
        'trade_delivery_id',
        'item_id',
        'variant_id',
        'qty_sent',
        'unit_price_laar',
        'unit_cost_laar',
        'qty_sold',
        'qty_returned_good',
        'qty_returned_waste',
        'qty_missing',
        'reported_sold_qty',
        'counted_return_qty',
        'return_condition',
        'return_action',
        'return_idempotency_key',
    ];

    protected function casts(): array
    {
        return [
            'qty_sent' => 'integer',
            'unit_price_laar' => 'integer',
            'unit_cost_laar' => 'integer',
            'qty_sold' => 'integer',
            'qty_returned_good' => 'integer',
            'qty_returned_waste' => 'integer',
            'qty_missing' => 'integer',
            'reported_sold_qty' => 'integer',
            'counted_return_qty' => 'integer',
        ];
    }

    public function delivery(): BelongsTo
    {
        return $this->belongsTo(TradeDelivery::class, 'trade_delivery_id');
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(Variant::class);
    }

    public function allocations(): HasMany
    {
        return $this->hasMany(TradeInvoiceAllocation::class, 'trade_delivery_line_id');
    }

    public function balances(): bool
    {
        return $this->qty_sent
            === $this->qty_sold
            + $this->qty_returned_good
            + $this->qty_returned_waste
            + $this->qty_missing;
    }

    public function lineValueLaar(): int
    {
        return $this->qty_sent * $this->unit_price_laar;
    }
}
