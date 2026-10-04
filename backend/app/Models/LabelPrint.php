<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Every label sheet issued from the Label Hub: who, what, how many, which
 * dates and batch. Written when the print link is issued (the browser's print
 * dialog cannot report back); never edited or deleted from the app.
 */
class LabelPrint extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'kind', 'layout', 'label_w_mm', 'label_h_mm', 'item_id', 'kitchen_production_item_id',
        'trade_delivery_id', 'copies', 'mfg_date', 'exp_date', 'batch_code', 'pack_qty',
        'details', 'printed_by', 'output',
    ];

    protected $casts = [
        'details' => 'array',
        'mfg_date' => 'date',
        'exp_date' => 'date',
        'copies' => 'integer',
        'pack_qty' => 'integer',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function printer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'printed_by');
    }

    public function delivery(): BelongsTo
    {
        return $this->belongsTo(TradeDelivery::class, 'trade_delivery_id');
    }
}
