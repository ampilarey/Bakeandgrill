<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Draft promo association for an order.
 * Created when promo is applied, deleted/released on cancel,
 * converted to PromotionRedemption on OrderPaid.
 */
class OrderPromotion extends Model
{
    protected $fillable = [
        'idempotency_key',
        'order_id',
        'promotion_id',
        'discount_laar',
        'status',
    ];

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function promotion(): BelongsTo
    {
        return $this->belongsTo(Promotion::class);
    }
}
