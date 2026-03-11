<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GiftCardTransaction extends Model
{
    protected $fillable = ['gift_card_id', 'order_id', 'amount', 'type', 'balance_after'];
    protected $casts    = ['amount' => 'decimal:2', 'balance_after' => 'decimal:2'];

    public function giftCard(): BelongsTo { return $this->belongsTo(GiftCard::class); }
    public function order(): BelongsTo    { return $this->belongsTo(Order::class); }
}
