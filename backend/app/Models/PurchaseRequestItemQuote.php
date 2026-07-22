<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PurchaseRequestItemQuote extends Model
{
    protected $fillable = [
        'purchase_request_item_id',
        'supplier_id',
        'supplier_name_text',
        'unit_price_laar',
        'unit',
        'note',
        'quoted_by',
        'selected_at',
        'savings_laar',
    ];

    protected $casts = [
        'unit_price_laar' => 'integer',
        'savings_laar' => 'integer',
        'selected_at' => 'datetime',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(PurchaseRequestItem::class, 'purchase_request_item_id');
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function quoter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'quoted_by');
    }
}
