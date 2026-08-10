<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TradeInvoiceAllocation extends Model
{
    public const KIND_SOLD = 'sold';

    public const KIND_MISSING = 'missing';

    protected $fillable = [
        'invoice_id',
        'trade_delivery_line_id',
        'qty_invoiced',
        'amount_laar',
        'line_kind',
    ];

    protected function casts(): array
    {
        return [
            'qty_invoiced' => 'integer',
            'amount_laar' => 'integer',
        ];
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function deliveryLine(): BelongsTo
    {
        return $this->belongsTo(TradeDeliveryLine::class, 'trade_delivery_line_id');
    }
}
